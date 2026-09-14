import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';
import { distanceToPolygon, haversine } from '../lib/geo.js';
import { sidoShort } from '../lib/sido.js';

/**
 * 청약홈(한국부동산원) 분양정보 — 비교사업장의 **분양가** 원천.
 *
 * 분양가를 전국 단위로 주는 공공 원천은 여기뿐이다.
 * 실거래(국토부)는 이미 팔린 값이고, 시세(KB)는 기축이라 분양가가 아니다.
 *
 *   공고    api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail
 *   주택형  api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl
 *
 * 실측으로 확인한 것(2026-09-14)
 *   HOUSE_TY          "084.7459A"  → **전용면적** 84.7459㎡ + 타입기호
 *   SUPLY_AR          "110.3043"   → 공급면적 (전용 아님 — 헷갈리면 단가가 25% 틀어진다)
 *   LTTOT_TOP_AMOUNT  "89800"      → 분양최고금액, **만원** 단위
 *   SPSPLY_HSHLDCO + SUPLY_HSHLDCO = 그 주택형의 총 공급세대수 (특별 + 일반)
 *   전국 2,875건 · 공고일 2023-10-25 ~ 2026-09-11 (약 3년치가 적재돼 있다)
 *
 * **시도 표기가 아직 옛 체계다** — 광주 36건 / 전남 24건이 따로 잡힌다(실측).
 * 전남광주통합특별시로는 조회가 안 되므로 KOSIS 와 똑같이 시군구로 가른다.
 */
const HOST = 'https://api.odcloud.kr/api';
const P_DETAIL = `${HOST}/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail`;
const P_MODEL = `${HOST}/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl`;

const KAKAO = 'https://dapi.kakao.com/v2/local';
const H = () => ({ Authorization: `KakaoAK ${requireKey('KAKAO_REST_KEY').trim()}` });

/** 옛 광주광역시 5개 구 — 청약홈이 아직 광주/전남을 나눠 집계한다 */
const OLD_GWANGJU = ['동구', '서구', '남구', '북구', '광산구'];

/**
 * 청약홈 SUBSCRPT_AREA_CODE_NM 로 쓸 시도 표기.
 * 통합 시도는 시군구를 봐야 가릴 수 있다 — 시도만으로는 못 정한다.
 */
export function noticeSido(region) {
  const short = sidoShort(region);
  if (short !== '전남광주') return short;
  const sgg = String(region ?? '').split(/\s+/)[1] ?? '';
  if (!sgg) return null;
  return OLD_GWANGJU.includes(sgg) ? '광주' : '전남';
}

/**
 * 공고 주소를 카카오 주소검색이 읽을 수 있게 다듬는다.
 *
 * 청약홈 주소는 실무 표기 그대로라 꼬리가 길다 — 실측 예:
 *   "경기도 광주시 탄벌동 532-2번지 일원(탄벌4지구 A2블럭)"
 *   "경기도 광주시 곤지암읍 곤지암리636번지(곤지암역세권  A1-1블록)"   ← 리와 번지 사이 공백 없음
 * 사용자 입력용 normalizeAddress 와 규칙이 달라 따로 둔다(그쪽은 골든으로 검증된 코드다).
 */
export function normalizeSupplyAddress(address) {
  return String(address ?? '')
    .replace(/\([^)]*\)/g, ' ')                 // (블록·지구 표기) 제거
    .replace(/(동|리|가)(\d)/g, '$1 $2')        // "곤지암리636" → "곤지암리 636"  ※ "산54-3" 은 건드리지 않는다
    .replace(/(\d)\s*번지/g, '$1')              // "532-2번지" → "532-2"
    .replace(/\s*(?:일원|일대|외\s*\d+\s*필지)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "084.7459A" → 84.7459 (전용면적). 숫자를 못 읽으면 null */
export const areaOf = (houseTy) => {
  const m = String(houseTy ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

/** odcloud 공통 호출 */
async function odcloud(base, params, { rows = 1000, page = 1 } = {}) {
  const qs = new URLSearchParams({
    serviceKey: requireKey('DATA_GO_KR_KEY').trim(),
    page: String(page), perPage: String(rows),
    ...params,
  });
  return getJson(`${base}?${qs}`, { retries: 2, timeout: 25000 });
}

/**
 * 시도 단위 분양공고 목록.
 * 임대는 분양가가 없으므로 분양주택만 남긴다.
 */
export async function fetchNotices(sido, { from = null } = {}) {
  const cond = { 'cond[SUBSCRPT_AREA_CODE_NM::EQ]': sido };
  if (from) cond['cond[RCRIT_PBLANC_DE::GTE]'] = from;

  const out = [];
  for (let page = 1; page <= 3; page++) {
    const d = await odcloud(P_DETAIL, cond, { page });
    const rows = d?.data ?? [];
    out.push(...rows);
    if (out.length >= (d?.matchCount ?? 0) || rows.length === 0) break;
  }
  return out.filter(r => r.RENT_SECD_NM === '분양주택');
}

/** 한 공고의 주택형별 상세 (전용면적 · 세대수 · 분양가) */
export async function fetchModels(manageNo) {
  const d = await odcloud(P_MODEL, { 'cond[HOUSE_MANAGE_NO::EQ]': String(manageNo) }, { rows: 100 });
  return (d?.data ?? []).map(m => {
    const area = areaOf(m.HOUSE_TY);
    const manwon = Number(m.LTTOT_TOP_AMOUNT);
    const households = Number(m.SPSPLY_HSHLDCO ?? 0) + Number(m.SUPLY_HSHLDCO ?? 0);
    return {
      type: m.HOUSE_TY,
      area,                                   // 전용면적 ㎡
      households,
      amount: Number.isFinite(manwon) ? manwon * 10000 : null,   // 원
      unitPrice: area && Number.isFinite(manwon) ? (manwon * 10000) / area : null,  // 원/㎡
    };
  }).filter(t => t.area);
}

/**
 * 단지 대표 ㎡당 분양가.
 *   weighted 세대수 가중평균 — 실제 분양수입에 가까운 값
 *   simple   주택형 단순평균 — 표에 적히는 평균
 * 어느 쪽을 쓰는지 화면에서 고르게 하려고 둘 다 낸다.
 */
export function summarize(types) {
  const ok = types.filter(t => t.unitPrice != null);
  if (!ok.length) return { weighted: null, simple: null, households: 0, areaMin: null, areaMax: null };
  const hh = ok.reduce((s, t) => s + t.households, 0);
  return {
    weighted: hh ? ok.reduce((s, t) => s + t.unitPrice * t.households, 0) / hh : null,
    simple: ok.reduce((s, t) => s + t.unitPrice, 0) / ok.length,
    households: types.reduce((s, t) => s + t.households, 0),
    areaMin: Math.min(...ok.map(t => t.area)),
    areaMax: Math.max(...ok.map(t => t.area)),
  };
}

/* 같은 주소를 여러 번 물어볼 이유가 없다 (같은 단지가 재공고로 여러 건 들어온다) */
const geoCache = new Map();

async function geocodeOne(query) {
  if (geoCache.has(query)) return geoCache.get(query);
  let hit = null;
  try {
    const d = await getJson(
      `${KAKAO}/search/address.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: H(), retries: 2, timeout: 12000 });
    const doc = d.documents?.[0];
    if (doc) hit = { x: Number(doc.x), y: Number(doc.y) };
  } catch { /* 한 건 실패가 전체를 막으면 안 된다 */ }
  geoCache.set(query, hit);
  return hit;
}

/** 동시 호출 수를 묶어 돌린다 (카카오 호출이 수백 건이 될 수 있다) */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

/** 주소 앞 두 토큰 = 시도 + 시군구 (광역시 자치구도 같은 모양) */
const sggOf = (addr) => String(addr ?? '').split(/\s+/).slice(0, 2).join(' ');

/**
 * 반경 안의 분양 단지.
 *
 * 전 시도 공고를 하나하나 지오코딩하면 수백 건이라 느리고 쿼터도 아깝다.
 * 그래서 **시군구 중심좌표로 1차로 거른다** — 중심이 반경+25km 밖이면
 * 그 시군구 안의 어떤 지번도 반경에 들어올 수 없다(우리나라 시군구 반지름 상한을 넉넉히 잡은 값).
 *
 * @param {{x:number,y:number}} site  사업지 대표지번 좌표
 * @param {Array<{lat,lng}>} polygon  사업지 경계(있으면 경계 최단거리로 잰다 — 다른 시트와 같은 규칙)
 */
export async function collectComparables({ site, region, radius = 2000, polygon = null, from = null }) {
  const sido = noticeSido(region);
  if (!sido) {
    const e = new Error('통합 시도는 시군구까지 골라야 분양정보를 가릅니다 (청약홈이 아직 광주/전남을 따로 집계합니다)');
    e.code = 'NEED_SGG';
    throw e;
  }

  const notices = await fetchNotices(sido, { from });

  // 같은 단지가 재공고로 여러 건 들어온다 — 최신 공고만 남긴다
  const latest = new Map();
  for (const r of notices) {
    const key = `${r.HOUSE_NM}|${r.HSSPLY_ADRES}`;
    const prev = latest.get(key);
    if (!prev || String(r.RCRIT_PBLANC_DE) > String(prev.RCRIT_PBLANC_DE)) latest.set(key, r);
  }
  const uniq = [...latest.values()];

  // 1차 — 시군구 중심으로 거른다
  const sggs = [...new Set(uniq.map(r => sggOf(r.HSSPLY_ADRES)))].filter(Boolean);
  const centers = await mapLimit(sggs, 8, geocodeOne);
  const near = new Set();
  sggs.forEach((s, i) => {
    const c = centers[i];
    if (!c) { near.add(s); return; }   // 중심을 못 찾으면 버리지 않는다 (놓치는 것보다 낫다)
    if (haversine({ lat: Number(site.y), lng: Number(site.x) }, { lat: c.y, lng: c.x }) <= radius + 25000) near.add(s);
  });
  const shortlist = uniq.filter(r => near.has(sggOf(r.HSSPLY_ADRES)));

  // 2차 — 남은 공고의 실제 지번을 지오코딩해 거리를 잰다
  const dist = (p) => (polygon?.length >= 3
    ? distanceToPolygon({ lat: p.y, lng: p.x }, polygon)
    : haversine({ lat: Number(site.y), lng: Number(site.x) }, { lat: p.y, lng: p.x }));

  const located = await mapLimit(shortlist, 10, async (r) => {
    const q = normalizeSupplyAddress(r.HSSPLY_ADRES);
    const p = await geocodeOne(q);
    if (!p) return null;
    return { r, q, p, d: Math.round(dist(p)) };
  });

  const inside = located.filter(v => v && v.d <= radius).sort((a, b) => a.d - b.d);

  // 3차 — 반경 안의 단지만 주택형별 상세를 받는다 (호출 수를 최소로)
  const items = await mapLimit(inside, 5, async ({ r, q, p, d }) => {
    let types = [];
    try { types = await fetchModels(r.HOUSE_MANAGE_NO); } catch { /* 상세 실패해도 단지는 남긴다 */ }
    const s = summarize(types);
    return {
      manageNo: r.HOUSE_MANAGE_NO,
      name: r.HOUSE_NM,
      address: r.HSSPLY_ADRES,
      query: q,
      x: p.x, y: p.y,
      distance: d,
      noticeDate: r.RCRIT_PBLANC_DE,
      moveIn: r.MVN_PREARNGE_YM,
      builder: r.CNSTRCT_ENTRPS_NM,
      developer: r.BSNS_MBY_NM,
      kind: r.HOUSE_DTL_SECD_NM,
      totalHouseholds: Number(r.TOT_SUPLY_HSHLDCO) || null,
      url: r.PBLANC_URL,
      types,
      ...s,
    };
  });

  return {
    sido,
    radius,
    basis: polygon?.length >= 3 ? 'polygon' : 'point',
    scanned: uniq.length,
    shortlisted: shortlist.length,
    count: items.length,
    items,
    source: {
      org: '한국부동산원 청약홈',
      citation: `* 출처 : 한국부동산원 청약홈 APT 분양정보 (공공데이터포털) · ${sido} 분양공고 ${uniq.length}건 중 반경 ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 이내`,
      url: 'https://www.applyhome.co.kr/',
    },
  };
}
