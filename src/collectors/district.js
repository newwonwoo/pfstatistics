import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';
import { polygonArea, pointInRing } from '../lib/geo.js';

/**
 * **사업지구 탐지** — 사업지가 수용·환지 방식 사업지구 안에 있는가, 그 지구의 면적은 얼마인가.
 *
 * ## 왜 필요한가
 * 가이드북 교통환경·주거편의 단서 : 수용(또는 사용)·환지 방식으로 개발·조성되는 사업지구는
 * **지구면적**에 따라 등급의 하한이 정해진다
 * (500만㎡ 이상 매우양호 · 100만㎡ 이상 양호 이상 · 50만㎡ 이상 보통 이상 · 50만㎡ 미만 열악 이상).
 * 계획된 기반시설이 지구와 함께 들어오므로 지금 반경 안에 시설이 없어도 그만큼은 인정한다는 뜻이다.
 *
 * ## 원천 (실측 2026-09-28 · 브이월드 인증키 하나로 셋 다 된다)
 * ```
 * lt_c_lhzone     사업지구경계도     zonecode zonename cat_nam(준공/부분준공…)          ← 택지정보시스템과 같은 지구번호
 * lt_c_upisuq161  지구단위계획       dgm_nm dgm_ar(면적㎡ · 0 인 표가 있다) ntfc_sn(고시번호)
 * ned/getLandUseAttr  토지이용계획(필지)  prposAreaDstrcCodeNm — 택지개발지구·도시개발구역·지구단위계획구역 …
 * ```
 * - 사업지구경계의 `zonecode` 는 택지정보시스템(국토교통부·LX) 지구지정번호 체계다 —
 *   `법정동5 + 시행사2 + 등록연도4 + 일련3` (예 41590MX2008001). 시행사 코드표는 원천의 코드정의서 그대로다.
 * - 택지정보시스템 속성자료 CSV 에 면적·법령이 있지만 **해외 망에서 406** 을 준다(샌드박스 실측).
 *   경계가 있으므로 면적은 **경계에서 잰다**(`polygonArea`). 지구단위계획은 고시 도면면적이 0 이 아니면 그것을 쓴다.
 * - **개발방식(수용/환지)은 어느 원천에도 필드로 없다.** 지구 이름과 토지이용계획의 지역지구명으로
 *   추정만 하고, 확정은 실무자가 한다. 특히 **지구단위계획구역은 개발방식과 무관**하다
 *   (골든 표본 「탄벌A」 는 지구단위계획만 있다 — 수용·환지 사업지구가 아닐 수 있다).
 */
const HOST = 'https://api.vworld.kr/req/wfs';
const NED = 'https://api.vworld.kr/ned/data/getLandUseAttr';
const domain = () => process.env.VWORLD_DOMAIN
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://pfstatistics.vercel.app');

/** 택지정보시스템 코드정의서 v1.1 「시행사코드」 원문 */
export const OPERATORS = {
  MX: '공동시행(공공)', PP: '공동시행(민관)', LH: '한국토지주택공사', KH: '대한주택공사', KL: '한국토지공사',
  ME: '환경부', MW: '보건복지부', KE: '한국전력공사', KW: '한국수자원공사', MD: '국방부',
  DC: '지방공사', DA: '지방자치단체', PV: '민간업체', KR: '한국농어촌공사',
};

/**
 * 이름으로 개발 근거법을 추정한다 — **추정이다.** 법이 수용·환지 방식을 쓰는 사업만 적는다.
 * 도시개발법은 수용·환지·혼용 셋 다 되는데, 특례 원문이 「수용 또는 환지」 라 어느 쪽이든 해당한다.
 */
const KINDS = [
  { re: /택지개발/, kind: '택지개발사업', law: '택지개발촉진법', method: '수용' },
  { re: /공공주택|보금자리|국민임대/, kind: '공공주택지구', law: '공공주택 특별법', method: '수용' },
  { re: /도시개발/, kind: '도시개발구역', law: '도시개발법', method: '수용·환지·혼용 중 하나' },
  { re: /혁신도시/, kind: '혁신도시', law: '혁신도시법', method: '수용' },
  { re: /기업도시/, kind: '기업도시', law: '기업도시법', method: '수용' },
  { re: /행정중심|행복도시/, kind: '행정중심복합도시', law: '행복도시법', method: '수용' },
  { re: /경제자유구역/, kind: '경제자유구역', law: '경제자유구역법', method: '수용' },
  { re: /산업단지|산단/, kind: '산업단지', law: '산업입지법', method: '수용' },
];
export const kindOf = (name) => KINDS.find(k => k.re.test(String(name ?? ''))) ?? null;

/** MultiPolygon/Polygon → [[외곽, 구멍…], …] ({lat,lng}) */
function polys(geom) {
  const list = geom?.type === 'MultiPolygon' ? geom.coordinates : geom?.type === 'Polygon' ? [geom.coordinates] : [];
  return list.map(poly => poly.map(ring => ring.map(([lng, lat]) => ({ lat, lng }))));
}

async function wfs(layer, { x, y }, span = 0.0004) {
  const key = requireKey('VWORLD_API_KEY').trim();
  const bbox = [x - span, y - span, x + span, y + span].join(',');
  const url = `${HOST}?SERVICE=WFS&REQUEST=GetFeature&VERSION=1.1.0&TYPENAME=${layer}`
    + `&BBOX=${bbox}&SRSNAME=EPSG:4326&MAXFEATURES=20&output=application/json`
    + `&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(domain())}`;
  const data = await getJson(url, { retries: 1, timeout: 15000 });
  return data?.features ?? [];
}

/** 점을 품은 피처만 — bbox 는 가장자리를 스친 이웃 지구도 준다 */
function containing(features, pt) {
  return features.map(f => ({ f, parts: polys(f.geometry) }))
    .filter(({ parts }) => parts.some(p => p[0]?.length >= 3 && pointInRing(pt, p[0])
      && !p.slice(1).some(h => h.length >= 3 && pointInRing(pt, h))));
}
const areaOf = (parts) => Math.round(parts.reduce((s, p) => s + polygonArea(p), 0));

/**
 * @returns {{ candidates: object[], landUse: string[], suggestion: object|null, errors: string[], source: object }}
 */
export async function detectDistrict({ x, y }) {
  const pt = { lat: Number(y), lng: Number(x) };
  if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) throw new Error('좌표가 없습니다');
  const errors = [];
  const safe = (label, p) => p.catch(e => { errors.push(`${label}: ${e.message}`); return []; });

  const [zones, plans, parcels] = await Promise.all([
    safe('사업지구경계', wfs('lt_c_lhzone', { x: pt.lng, y: pt.lat })),
    safe('지구단위계획', wfs('lt_c_upisuq161', { x: pt.lng, y: pt.lat })),
    safe('연속지적도', wfs('lp_pa_cbnd_bubun', { x: pt.lng, y: pt.lat }, 0.00005)),
  ]);

  const candidates = [];
  for (const { f, parts } of containing(zones, pt)) {
    const p = f.properties ?? {};
    const code = String(p.zonecode ?? '');
    const k = kindOf(p.zonename);
    candidates.push({
      id: `zone:${code}`,
      layer: '사업지구',
      name: p.zonename ?? '(이름 없음)',
      code,
      operator: OPERATORS[code.slice(5, 7)] ?? null,
      status: p.cat_nam ?? null,
      kind: k?.kind ?? null, law: k?.law ?? null, method: k?.method ?? null,
      area: areaOf(parts),
      areaBasis: '사업지구 경계에서 계산',
      source: '택지정보시스템 사업지구경계(브이월드 lt_c_lhzone)',
    });
  }
  for (const { f, parts } of containing(plans, pt)) {
    const p = f.properties ?? {};
    const ar = Number(p.dgm_ar);
    const k = kindOf(p.dgm_nm);
    candidates.push({
      id: `plan:${p.present_sn ?? p.dgm_nm}`,
      layer: '지구단위계획',
      name: p.dgm_nm ?? '지구단위계획구역',
      code: p.ntfc_sn ?? null,
      kind: k?.kind ?? null, law: k?.law ?? null, method: k?.method ?? null,
      area: ar > 0 ? Math.round(ar) : areaOf(parts),
      areaBasis: ar > 0 ? '고시 도면면적' : '구역 경계에서 계산',
      source: '도시계획정보 지구단위계획(브이월드 lt_c_upisuq161)',
    });
  }

  /* 필지의 토지이용계획 — 지구 경계 레이어가 못 잡는 도시개발구역 등을 이름으로 알려 준다 */
  let landUse = [];
  const parcel = containing(parcels, pt)[0]?.f ?? parcels[0];
  const pnu = parcel?.properties?.pnu;
  if (pnu) {
    try {
      const key = requireKey('VWORLD_API_KEY').trim();
      const j = await getJson(`${NED}?pnu=${pnu}&format=json&numOfRows=200`
        + `&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(domain())}`, { retries: 1, timeout: 15000 });
      const rows = j?.landUses?.field ?? [];
      landUse = [...new Set(rows
        .filter(r => r.cnflcAtNm !== '접함')
        .map(r => r.prposAreaDstrcCodeNm)
        .filter(n => /택지|도시개발|공공주택|지구단위|산업단지|산업시설|혁신도시|기업도시|경제자유|정비구역|재개발|재건축/.test(n ?? '')))];
    } catch (e) { errors.push(`토지이용계획: ${e.message}`); }
  }

  /*
    **추천만 한다.** 수용·환지 사업지구로 볼 근거(이름이 택지개발·공공주택·도시개발…)가 있는 첫 후보.
    사업지구경계를 지구단위계획보다 앞에 둔다 — 지구단위계획은 개발방식과 무관하기 때문이다.
  */
  const byName = candidates.find(c => c.layer === '사업지구' && c.kind)
    ?? candidates.find(c => c.layer === '사업지구')
    ?? candidates.find(c => c.kind);
  const luKind = landUse.map(kindOf).find(Boolean);
  const suggestion = byName
    ? { id: byName.id, why: byName.kind ? `${byName.kind}(${byName.law}) — ${byName.method} 방식` : '택지정보시스템에 사업지구로 등록돼 있습니다' }
    : null;

  return {
    candidates,
    landUse,
    landUseKind: luKind ?? null,
    pnu: pnu ?? null,
    suggestion,
    /* 세 원천 모두 비었는가 — 그때만 「사업지구 밖」 을 권한다 */
    nothing: candidates.length === 0 && !luKind,
    errors,
    source: {
      name: '국토교통부 택지정보시스템 사업지구경계 · 도시계획정보 지구단위계획 · 토지이용계획 (브이월드)',
      note: '개발방식(수용/환지)은 원천에 필드가 없어 지구 이름으로 추정합니다 — 확정은 실무자가 합니다',
    },
  };
}
