import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';
import { distanceToPolygon, haversine } from '../lib/geo.js';

/**
 * 브이월드 WFS — 도로 **선형(geometry)** 원천.
 *
 * ## 왜 필요했나
 * 카카오 `coord2address` 는 그 좌표가 속한 **필지**의 도로명주소를 준다.
 * 골프장·공장·학교처럼 큰 필지는 통째로 「○○대로 N」 이라, 필지 안 아무 데나 찍어도
 * 그 도로명이 나온다 — 그래서 핀이 도로가 아니라 **벌판 한가운데** 섰고
 * 거리도 「격자점까지」라 구간표(100/300/500/1000m)를 넘나들었다.
 * 근사로는 못 고친다(도로명으로 주소검색하면 「…번길」이 섞이고 오히려 더 멀어진다).
 *
 * **도로 자체의 좌표**가 있어야 풀리는 문제였고, 그것이 이 원천이다.
 *
 * ## 확인한 사실 (실측 2026-09-24, 부천 상동 540-1)
 * ```
 * lt_l_sprd      도로명주소도로  rn(도로명) road_bt(도로폭m) road_lt(연장) sig_cd  MultiLineString
 * lt_l_moctlink  교통링크        road_name  lanes(차로수) max_spd rd_rank_h    MultiLineString
 * lt_l_n3a0020000 도로중심선     rdnm(도로명) rvwd(폭) dvyn(분리대)            MultiLineString
 * ```
 * 도로명 체계가 화면·평가표와 같은 것은 **lt_l_sprd** 다(카카오가 주는 이름과 같은 도로명주소 체계).
 * 그래서 핀·거리는 이걸로 잡는다.
 *
 * `lt_l_moctlink` 의 `lanes` 는 6차선 자동판정의 재료지만 **편도/왕복 해석이 미확정**이라
 * 여기서는 쓰지 않는다 — 규정이 「왕복 6차선」이라 잘못 읽으면 점수가 통째로 어긋난다.
 *
 * ## 함정
 * - 인증키에 **「데이터 API」(WMS/WFS) 권한이 따로** 있어야 한다. 없으면 `INCORRECT_KEY` 인데,
 *   같은 키로 주소검색은 멀쩡히 된다 — 키를 재발급해도 안 풀린다(실측). 콘솔에서 권한을 켜면
 *   **약 1분 뒤** 통한다.
 * - 도메인 제한이 있다. 발급할 때 등록한 사용 URL 과 `domain` 파라미터가 맞아야 한다.
 * - 한 번에 주는 피처 수에 상한이 있다 → **격자로 쪼개 부르고 피처 id 로 중복을 지운다.**
 */
const HOST = 'https://api.vworld.kr/req/wfs';
const LAYER = 'lt_l_sprd';                 // 도로명주소도로
const PER_TILE = 1000;

/** 브이월드는 도메인 제한이 걸린다 — 배포 도메인을 그대로 실어 보낸다 */
const domain = () => process.env.VWORLD_DOMAIN
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://pfstatistics.vercel.app');

/**
 * 도로명 등급 — 도로명주소법 시행령 제3조제1항제1호나목.
 * **이름으로 차로수를 단정할 수 없다**(폭 OR 차로수 조건 · 제8조②1 단서의 교환사용 ·
 * 도로명은 설정 시점 기준). 후보를 추리는 신호로만 쓴다.
 */
const grade = (name) => {
  if (/번길$/.test(name)) return { rank: 3, grade: '번길', hint: '그 밖의 도로 — 6차선 가능성 낮음' };
  if (/대로\d*번?길$/.test(name)) return { rank: 3, grade: '번길', hint: '그 밖의 도로 — 6차선 가능성 낮음' };
  if (/대로$/.test(name)) return { rank: 0, grade: '대로', hint: '기준상 폭 40m↑ 또는 왕복 8차로↑' };
  if (/로$/.test(name)) return { rank: 1, grade: '로', hint: '기준상 폭 12~40m 또는 왕복 2~7차로' };
  if (/길$/.test(name)) return { rank: 3, grade: '길', hint: '그 밖의 도로 — 6차선 가능성 낮음' };
  return { rank: 2, grade: '기타', hint: null };
};

/**
 * 선분을 STEP m 이하로 잘게 나눈다.
 *
 * 거리는 **`distanceToPolygon` 으로만** 잰다 — 반경원(`bufferPolygon`)이 그 함수를
 * 역산해 그려지므로, 다른 식으로 재면 **그린 선과 판정선이 갈린다.**
 * 그래서 꼭짓점 사이를 채워 넣고 각 점을 그 함수에 넣는다(오차 ≤ STEP/2).
 */
const STEP = 5;
function densify(a, b) {
  const d = haversine(a, b);
  const n = Math.max(1, Math.ceil(d / STEP));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return out;
}

export async function roadLines({ x, y }, radius = 1000, { polygon = null } = {}) {
  const key = requireKey('VWORLD_API_KEY').trim();
  const ring = Array.isArray(polygon) && polygon.length >= 3 ? polygon : null;
  const center = { lat: Number(y), lng: Number(x) };
  const distOf = (p) => (ring ? distanceToPolygon(p, ring) : haversine(center, p));

  /* 반경 밖 도로도 조금 보여야 지도에서 走向이 읽힌다 — 다른 시트와 같은 1.2배 */
  const span = radius * 1.25;
  const dLat = (span / 6371008.8) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));

  /* 한 번에 주는 피처 수에 상한이 있어 격자로 쪼갠다 */
  const N = span > 900 ? 3 : 2;
  const jobs = [];
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    const x0 = center.lng - dLng + (2 * dLng * i) / N, x1 = center.lng - dLng + (2 * dLng * (i + 1)) / N;
    const y0 = center.lat - dLat + (2 * dLat * k) / N, y1 = center.lat - dLat + (2 * dLat * (k + 1)) / N;
    const url = `${HOST}?SERVICE=WFS&REQUEST=GetFeature&VERSION=1.1.0&TYPENAME=${LAYER}`
      + `&BBOX=${x0},${y0},${x1},${y1}&SRSNAME=EPSG:4326&MAXFEATURES=${PER_TILE}`
      + `&output=application/json&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(domain())}`;
    jobs.push(url);
  }

  const seen = new Set();
  const feats = [];
  let capped = false;
  const results = await Promise.all(jobs.map(async (url) => {
    try { return await getJson(url, { retries: 1, timeout: 20000 }); } catch { return null; }
  }));
  for (const d of results) {
    const fs = d?.features ?? [];
    if (fs.length >= PER_TILE) capped = true;
    for (const f of fs) {
      if (!f?.id || seen.has(f.id)) continue;
      seen.add(f.id);
      feats.push(f);
    }
  }

  /* 도로명으로 묶는다 — 한 도로가 여러 구간(링크)으로 쪼개져 온다 */
  const found = new Map();
  for (const f of feats) {
    const p = f.properties ?? {};
    const name = p.rn;
    if (!name) continue;
    const lines = (f.geometry?.coordinates ?? [])
      .map(line => line.map(([lng, lat]) => ({ lat, lng })))
      .filter(l => l.length >= 2);
    if (!lines.length) continue;

    let best = Infinity, at = null;
    /*
      **선을 반경 근처로 자른다.**
      한 도로는 시 전체를 가로지른다 — 선을 통째로 주면 지도가 그 끝까지 담느라
      3km 까지 줌아웃되고 반경원이 좁쌀만 해진다(실측 2026-09-24).
      「반경원이 화면의 93%」로 맞춰둔 것이 통째로 무너진다.
      거리는 원래 선 전체로 재고, **그리는 것만** 반경 근처 토막으로 남긴다.
    */
    const clipped = [];
    for (const line of lines) {
      let run = [];
      for (let i = 0; i < line.length; i++) {
        if (i > 0) {
          /* 먼 구간까지 잘게 나눌 필요는 없다 — 꼭짓점으로 먼저 걸러낸다 */
          const rough = Math.min(distOf(line[i - 1]), distOf(line[i]));
          if (rough <= span + 200) {
            for (const q of densify(line[i - 1], line[i])) {
              const d = distOf(q);
              if (d < best) { best = d; at = q; }
            }
          } else if (rough < best) { best = rough; at = line[i]; }
        }
        /* 화면 밖으로 한 점만 더 이어 그려야 선이 잘린 티가 안 난다 */
        const near = distOf(line[i]) <= span;
        if (near) { run.push(line[i]); continue; }
        if (run.length) { run.push(line[i]); if (run.length >= 2) clipped.push(run); run = []; }
        else if (i + 1 < line.length && distOf(line[i + 1]) <= span) run = [line[i]];
      }
      if (run.length >= 2) clipped.push(run);
    }
    if (at == null) continue;
    const drawLines = clipped.length ? clipped : [];

    const cur = found.get(name);
    if (!cur) {
      found.set(name, {
        name, distance: Math.round(best),
        /* 핀은 **도로 위 가장 가까운 점**이다 — 필지 대표점이 아니다 */
        x: at.lng, y: at.lat,
        lines: drawLines, width: Number.isFinite(p.road_bt) ? p.road_bt : null,
        length: Number.isFinite(p.road_lt) ? p.road_lt : null,
        sigCd: p.sig_cd ?? null, code: p.rn_cd ?? null,
        precision: STEP, basis: ring ? 'polygon' : 'point', geometry: true,
        ...grade(name),
      });
      continue;
    }
    cur.lines.push(...drawLines);
    if (best < cur.distance) { cur.distance = Math.round(best); cur.x = at.lng; cur.y = at.lat; }
  }

  const rows = [...found.values()]
    /* 반경 1.2배 밖은 버린다 — 격자 방식과 같은 범위 */
    .filter(r => r.distance <= span)
    .sort((a, b) => a.rank - b.rank || a.distance - b.distance);
  rows.__capped = capped;
  rows.__features = feats.length;
  return rows;
}
