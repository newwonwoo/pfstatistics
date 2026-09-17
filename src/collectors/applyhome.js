import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';
import { distanceToPolygon, haversine } from '../lib/geo.js';
import { sidoShort } from '../lib/sido.js';
import { lookup as rankLookup } from './constructor.js';

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
/*
 * 오피스텔·도시형생활주택·민간임대는 **다른 API 에 있다**(전국 619건 — 실측).
 * APT 쪽만 보면 통째로 안 보인다. 필드 이름도 다르다:
 *   EXCLUSE_AR(전용면적) · SUPLY_AMOUNT(금액, 만원) · SUPLY_HSHLDCO(세대) · TP(타입)
 */
const P_URBTY = `${HOST}/ApplyhomeInfoDetailSvc/v1/getUrbtyOfctlLttotPblancDetail`;
const P_URBTY_MODEL = `${HOST}/ApplyhomeInfoDetailSvc/v1/getUrbtyOfctlLttotPblancMdl`;

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
async function fetchAll(path, sido, from) {
  const cond = { 'cond[SUBSCRPT_AREA_CODE_NM::EQ]': sido };
  if (from) cond['cond[RCRIT_PBLANC_DE::GTE]'] = from;
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const d = await odcloud(path, cond, { page });
    const rows = d?.data ?? [];
    out.push(...rows);
    if (out.length >= (d?.matchCount ?? 0) || rows.length === 0) break;
  }
  return out;
}

/**
 * 시도 단위 APT 분양공고.
 *
 * **임대를 여기서 버리지 않는다.** 예전엔 `RENT_SECD_NM='분양주택'` 만 남겼는데,
 * 그러면 "반경 안에 임대단지가 있었는데 왜 안 보이나" 를 화면에서 설명할 수 없다.
 * 거리를 잰 다음 반경 안의 임대만 따로 세어 사유와 함께 돌려준다
 * (의료시설에서 의원급을 `excludedClinics` 로 남긴 것과 같은 이유).
 */
export const fetchNotices = (sido, { from = null } = {}) => fetchAll(P_DETAIL, sido, from);

/** 오피스텔·도시형생활주택·민간임대 공고 */
export const fetchUrbty = (sido, { from = null } = {}) => fetchAll(P_URBTY, sido, from);

/**
 * 한 공고의 주택형별 상세.
 *
 * **심사 평가표는 공급면적 기준으로 ㎡당 분양가를 낸다**(실제 평가표 검산으로 확인).
 *   Σ(공급세대수 × 세대당분양가) ÷ Σ(공급세대수 × 공급면적)
 * 전용면적 기준으로 내면 같은 단지가 약 30% 높게 나온다 — 그래서 둘 다 낸다.
 */
export async function fetchModels(manageNo) {
  const d = await odcloud(P_MODEL, { 'cond[HOUSE_MANAGE_NO::EQ]': String(manageNo) }, { rows: 100 });
  return (d?.data ?? []).map(m => {
    const area = areaOf(m.HOUSE_TY);                 // 전용면적 (HOUSE_TY "084.7459A")
    const supply = Number(m.SUPLY_AR);               // 공급면적 (분양면적)
    const manwon = Number(m.LTTOT_TOP_AMOUNT);
    const households = Number(m.SPSPLY_HSHLDCO ?? 0) + Number(m.SUPLY_HSHLDCO ?? 0);
    const won = Number.isFinite(manwon) ? manwon * 10000 : null;
    return {
      type: m.HOUSE_TY,
      area,                                   // 전용면적 ㎡
      supplyArea: Number.isFinite(supply) && supply > 0 ? supply : null,
      households,
      amount: won,                                                        // 원
      unitPrice: area && won != null ? won / area : null,                 // 원/㎡ (전용)
      unitPriceSupply: supply > 0 && won != null ? won / supply : null,   // 원/㎡ (공급) ← 심사 기준
    };
  }).filter(t => t.area);
}

/**
 * 오피스텔·도시형·민간임대의 주택형별 상세.
 * 필드 이름이 APT 쪽과 다르다 — 전용면적이 `EXCLUSE_AR` 로 아예 명시돼 있다.
 */
export async function fetchUrbtyModels(manageNo) {
  const d = await odcloud(P_URBTY_MODEL, { 'cond[HOUSE_MANAGE_NO::EQ]': String(manageNo) }, { rows: 100 });
  return (d?.data ?? []).map(m => {
    const area = Number(m.EXCLUSE_AR);
    const manwon = Number(m.SUPLY_AMOUNT);
    const households = Number(m.SUPLY_HSHLDCO ?? 0);
    return {
      type: m.TP ?? String(m.MODEL_NO ?? ''),
      area: Number.isFinite(area) && area > 0 ? area : null,
      // 이 원천은 전용면적(EXCLUSE_AR)만 준다 — 공급면적이 없어 심사기준 단가를 못 낸다
      supplyArea: null,
      households,
      amount: Number.isFinite(manwon) ? manwon * 10000 : null,
      unitPrice: Number.isFinite(area) && area > 0 && Number.isFinite(manwon) ? (manwon * 10000) / area : null,
      unitPriceSupply: null,
    };
  }).filter(t => t.area);
}

/*
 * 민간임대의 금액은 **분양가가 아니라 임대보증금**이다 (실측으로 확인).
 *   힐스테이트 용인포레(기업형민간임대) 59.96㎡ → 1.35억 → 2,251,520원/㎡ (평당 744만원)
 *   안성 공도 센트럴카운티             84.93㎡ → 2.65억 → 3,120,323원/㎡ (평당 1,031만원)
 * 같은 데이터셋의 도시형생활주택(분양)은 14,463,258원/㎡ 이다 — 자릿수가 다르다.
 * 그대로 섞으면 분양가 평균이 반토막 난다. 값은 보여주되 **분양가로 쓰지 못하게** 표시한다.
 */
const DEPOSIT_KINDS = new Set(['민간임대']);
const RENTAL_APT = new Set(['분양전환 가능임대', '분양전환 불가임대']);

/**
 * 단지 대표 ㎡당 분양가.
 *
 * **심사 평가표의 산식을 그대로 쓴다**(실제 평가표 검산으로 확정):
 *   가중평균 ㎡당 분양가 = Σ(공급세대수 × 세대당분양가) ÷ Σ(공급세대수 × 공급면적)
 *   탄벌A지구 : 388,234,677,655 ÷ 64,171.02 = 6,050,000 원/㎡ = 평당 20,000,000
 *
 * 전용면적 기준도 같이 낸다 — 같은 단지가 약 30% 높게 나오므로
 * 어느 기준인지 화면·엑셀에 반드시 같이 적는다.
 */
export function summarize(types) {
  const ok = types.filter(t => t.unitPrice != null);
  if (!ok.length) {
    return { weighted: null, simple: null, weightedSupply: null, simpleSupply: null,
             households: 0, areaMin: null, areaMax: null, supplyMin: null, supplyMax: null };
  }
  const hh = ok.reduce((s, t) => s + t.households, 0);
  const sup = ok.filter(t => t.supplyArea != null && t.amount != null);
  const supHhArea = sup.reduce((s, t) => s + t.households * t.supplyArea, 0);
  const supHhAmt = sup.reduce((s, t) => s + t.households * t.amount, 0);
  return {
    // 전용면적 기준
    weighted: hh ? ok.reduce((s, t) => s + t.unitPrice * t.households, 0) / hh : null,
    simple: ok.reduce((s, t) => s + t.unitPrice, 0) / ok.length,
    // 공급면적 기준 — 심사 평가표가 쓰는 값
    weightedSupply: supHhArea > 0 ? supHhAmt / supHhArea : null,
    simpleSupply: sup.length ? sup.reduce((s, t) => s + t.unitPriceSupply, 0) / sup.length : null,
    households: types.reduce((s, t) => s + t.households, 0),
    areaMin: Math.min(...ok.map(t => t.area)),
    areaMax: Math.max(...ok.map(t => t.area)),
    supplyMin: sup.length ? Math.min(...sup.map(t => t.supplyArea)) : null,
    supplyMax: sup.length ? Math.max(...sup.map(t => t.supplyArea)) : null,
  };
}

/* ─────────────────────────────────────────────────────────────
 * 인근 유사사업장 요건 (보증심사 실무기준)
 *   ① 거리   단위사업장으로부터 2km(수도권·광역시는 1km) 이내
 *   ② 시기   최근 1년 이내 **분양 개시**한 사업장 (없으면 분양중 + 준공)
 *   ③ 유사도 아래 4개 중 2개 이상 일치 (3개 이상이면 우선 선정)
 *            가.주택유형 나.단지규모 다.시공능력평가순위 라.택지유형
 * ───────────────────────────────────────────────────────────── */

/** 나. 단지규모 — 500세대 미만 / 500~999세대 / 1,000세대 이상 */
export function sizeBand(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 500) return '500세대 미만';
  if (n < 1000) return '500~999세대';
  return '1,000세대 이상';
}

/** 다. 시공능력평가순위 — 50위 이내 / 51~100 / 101~200 / 201~300 / 300위 밖 */
export function rankBand(rank) {
  if (!Number.isFinite(rank) || rank <= 0) return null;
  if (rank <= 50) return '50위 이내';
  if (rank <= 100) return '51~100위';
  if (rank <= 200) return '101~200위';
  if (rank <= 300) return '201~300위';
  return '300위 밖';
}

/* 시공사 이름이 같으면 명부를 다시 뒤질 이유가 없다 */
const rankCache = new Map();
function builderRankOf(name) {
  const key = String(name ?? '').trim();
  if (!key) return null;
  if (rankCache.has(key)) return rankCache.get(key);
  let rank = null;
  try {
    // 컨소시엄은 쉼표로 이어 붙어 온다("(주)태영건설,(주)동원개발,…") — 첫 시공사를 대표로 본다
    const head = key.split(/[,/·]/)[0].trim();
    rank = rankLookup(head)?.hit?.순위 ?? null;
  } catch { /* 명부 미적재 — 순위 없이 진행한다 */ }
  rankCache.set(key, rank);
  return rank;
}

/**
 * ② 시기 구분.
 *
 * **"분양 개시일"은 관례상 공급계약시작일이다**(실무 Q&A 확인) —
 * 모집공고일(RCRIT_PBLANC_DE)이 아니다. 청약홈은 `CNTRCT_CNCLS_BGNDE` 로 준다.
 * 입주예정월이 지났으면 준공으로 본다.
 */
export function timingOf({ saleStart, moveIn }, now = new Date()) {
  const d = saleStart ? new Date(saleStart) : null;
  if (!d || Number.isNaN(+d)) return { timing: null, years: null };
  const years = (now - d) / (365.25 * 24 * 3600 * 1000);
  const ym = String(moveIn ?? '');
  const moved = /^\d{6}$/.test(ym)
    && (Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4, 6)))
       <= (now.getFullYear() * 12 + now.getMonth() + 1);
  if (years < 0) return { timing: '분양예정', years };
  if (years <= 1) return { timing: '1년 이내 분양개시', years };
  return { timing: moved ? '준공' : '분양 진행중', years };
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

/**
 * 재공고 묶음 키.
 *
 * 같은 단지가 원공고 · 조합원 취소분 · 잔여세대로 여러 번 올라오는데
 * 표기가 조금씩 다르다(실측):
 *   "광주탄벌 서희스타힐스2단지" / "광주 탄벌 서희스타힐스 2단지"
 *   "광주시 탄벌동 532-2번지 일원" / "경기도 광주시 탄벌동 532-2번지 일원"
 * 이름 그대로 묶으면 같은 단지가 표에 세 줄로 앉아 평균을 왜곡한다.
 * 그래서 **공백을 지운 단지명 + 읍면동** 으로 묶고 최신 공고만 남긴다.
 */
const dongOf = (addr) => (String(addr ?? '').match(/\S+?[동리가](?=\s|$)/) ?? [''])[0];
const dedupeKey = (r) =>
  // 괄호 **안의 내용까지** 지운다 — "역북 서희스타힐스 프라임시티(조합원 취소분)" 이
  // 원공고와 따로 앉아 같은 단지가 두 줄로 나왔다(실측).
  // 종류는 키에 따로 들어가므로 "○○(오피스텔)" 이 아파트와 합쳐지지는 않는다.
  `${String(r.HOUSE_NM ?? '').replace(/\([^)]*\)/g, '').replace(/\s/g, '')}|${dongOf(r.HSSPLY_ADRES)}`;

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
export async function collectComparables({ site, region, radius = 2000, polygon = null, from = null, probe = null, census = false }) {
  const sido = noticeSido(region);
  if (!sido) {
    const e = new Error('통합 시도는 시군구까지 골라야 분양정보를 가릅니다 (청약홈이 아직 광주/전남을 따로 집계합니다)');
    e.code = 'NEED_SGG';
    throw e;
  }

  /*
   * 두 원천을 같이 본다.
   *   APT   분양·임대 아파트
   *   URBTY 오피스텔 · 도시형생활주택 · 민간임대 · 생활형숙박시설
   * 종류를 끝까지 들고 다녀야 화면에서 무엇을 평균에 넣을지 고를 수 있다.
   */
  const [aptRows, urbtyRows] = await Promise.all([
    fetchNotices(sido, { from }),
    fetchUrbty(sido, { from }),
  ]);
  const notices = [
    ...aptRows.map(r => ({ r, src: 'apt', kind: RENTAL_APT.has(r.RENT_SECD_NM) ? r.RENT_SECD_NM : '아파트' })),
    ...urbtyRows.map(r => ({ r, src: 'urbty', kind: r.HOUSE_DTL_SECD_NM ?? '오피스텔' })),
  ];

  // 같은 단지가 재공고로 여러 건 들어온다 — 최신 공고만 남긴다 (종류가 다르면 다른 줄이다)
  const latest = new Map();
  for (const n of notices) {
    const key = `${n.kind}|${dedupeKey(n.r)}`;
    const prev = latest.get(key);
    if (!prev || String(n.r.RCRIT_PBLANC_DE) > String(prev.r.RCRIT_PBLANC_DE)) latest.set(key, n);
  }
  const uniq = [...latest.values()];

  // 1차 — 시군구 중심으로 거른다
  const sggs = [...new Set(uniq.map(n => sggOf(n.r.HSSPLY_ADRES)))].filter(Boolean);
  const centers = await mapLimit(sggs, 8, geocodeOne);
  const near = new Set();
  sggs.forEach((s, i) => {
    const c = centers[i];
    if (!c) { near.add(s); return; }   // 중심을 못 찾으면 버리지 않는다 (놓치는 것보다 낫다)
    if (haversine({ lat: Number(site.y), lng: Number(site.x) }, { lat: c.y, lng: c.x }) <= radius + 25000) near.add(s);
  });
  const shortlist = uniq.filter(n => near.has(sggOf(n.r.HSSPLY_ADRES)));

  // 2차 — 남은 공고의 실제 지번을 지오코딩해 거리를 잰다
  const dist = (p) => (polygon?.length >= 3
    ? distanceToPolygon({ lat: p.y, lng: p.x }, polygon)
    : haversine({ lat: Number(site.y), lng: Number(site.x) }, { lat: p.y, lng: p.x }));

  const located = await mapLimit(shortlist, 10, async (n) => {
    const q = normalizeSupplyAddress(n.r.HSSPLY_ADRES);
    const p = await geocodeOne(q);
    if (!p) return null;
    return { ...n, q, p, d: Math.round(dist(p)) };
  });

  const within = located.filter(v => v && v.d <= radius).sort((a, b) => a.d - b.d);

  /*
   * 분양전환 임대 아파트는 분양가가 없다 — 평균에 넣을 수 없다.
   * 다만 **반경 안에 있었다는 사실은 남긴다.** 안 그러면
   * "옆에 단지가 있는데 왜 안 나오나" 에 화면이 답을 못 한다.
   */
  const excludedRental = within.filter(v => RENTAL_APT.has(v.kind))
    .map(v => ({ name: v.r.HOUSE_NM, address: v.r.HSSPLY_ADRES, distance: v.d, kind: v.kind }));
  const inside = within.filter(v => !RENTAL_APT.has(v.kind));

  /*
   * 지오코딩 실패 전수조사 — **무엇이 왜 실패하는지 세어보지 않고는 고칠 수 없다.**
   * 시도 전체 공고의 공급위치 주소를 정제해 카카오 주소검색에 넣고, 실패한 것만 돌려준다.
   * 거리·상세는 건너뛴다(이 창구의 관심사가 아니다).
   */
  if (census) {
    const uniqAddr = [...new Map(uniq.map(n => [normalizeSupplyAddress(n.r.HSSPLY_ADRES), n])).values()];
    const rows = await mapLimit(uniqAddr, 10, async (n) => {
      const q = normalizeSupplyAddress(n.r.HSSPLY_ADRES);
      const p = await geocodeOne(q);
      return p ? null : { name: n.r.HOUSE_NM, raw: n.r.HSSPLY_ADRES, query: q, kind: n.kind, src: n.src };
    });
    const failed = rows.filter(Boolean);
    return {
      sido, census: true,
      notices: uniq.length, uniqueAddresses: uniqAddr.length,
      failed: failed.length,
      rate: `${((failed.length / Math.max(1, uniqAddr.length)) * 100).toFixed(1)}%`,
      items: failed,
    };
  }

  /*
   * 진단창구 — "가까운 단지가 왜 안 나오나" 를 화면 밖에서 따질 수 있어야 한다.
   * 이름·주소에 걸리는 공고를 반경과 무관하게 전부 보여준다(지오코딩 결과와 거리까지).
   */
  if (probe) {
    const re = new RegExp(probe);
    const hits = uniq.filter(n => re.test(n.r.HOUSE_NM ?? '') || re.test(n.r.HSSPLY_ADRES ?? ''));
    const traced = await mapLimit(hits, 6, async (n) => {
      const q = normalizeSupplyAddress(n.r.HSSPLY_ADRES);
      const p = await geocodeOne(q);
      return {
        name: n.r.HOUSE_NM, address: n.r.HSSPLY_ADRES, query: q,
        kind: n.kind, src: n.src, notice: n.r.RCRIT_PBLANC_DE,
        sggKept: near.has(sggOf(n.r.HSSPLY_ADRES)),
        geocoded: p, distance: p ? Math.round(dist(p)) : null,
      };
    });
    return { sido, radius, probe, matched: hits.length, traced };
  }

  // 3차 — 반경 안의 단지만 주택형별 상세를 받는다 (호출 수를 최소로)
  const items = await mapLimit(inside, 5, async ({ r, q, p, d, src, kind }) => {
    let types = [];
    try {
      types = src === 'urbty' ? await fetchUrbtyModels(r.HOUSE_MANAGE_NO) : await fetchModels(r.HOUSE_MANAGE_NO);
    } catch { /* 상세 실패해도 단지는 남긴다 */ }
    const s = summarize(types);
    const hh = Number(r.TOT_SUPLY_HSHLDCO) || null;
    const rank = builderRankOf(r.CNSTRCT_ENTRPS_NM);
    return {
      src, kind,
      // 민간임대 금액은 임대보증금이다 — 분양가로 평균내면 안 된다
      priceKind: DEPOSIT_KINDS.has(kind) ? 'deposit' : 'sale',
      manageNo: r.HOUSE_MANAGE_NO,
      name: r.HOUSE_NM,
      address: r.HSSPLY_ADRES,
      query: q,
      x: p.x, y: p.y,
      distance: d,
      noticeDate: r.RCRIT_PBLANC_DE,
      // 규정상 "분양 개시일" = 공급계약시작일 (모집공고일이 아니다)
      saleStart: r.CNTRCT_CNCLS_BGNDE ?? null,
      ...timingOf({ saleStart: r.CNTRCT_CNCLS_BGNDE, moveIn: r.MVN_PREARNGE_YM }),
      moveIn: r.MVN_PREARNGE_YM,
      builder: r.CNSTRCT_ENTRPS_NM,
      builderRank: rank,
      developer: r.BSNS_MBY_NM,
      totalHouseholds: hh,
      // ③ 유사도 4항목 중 자동으로 알 수 있는 것 (택지유형은 원천에 없어 수기다)
      sizeBand: sizeBand(hh),
      rankBand: rankBand(rank),
      houseType: kind === '아파트' ? '아파트' : '기타',
      // 비고2 — 공공분양은 평균가격을 왜곡하므로 제외 대상으로 표시한다
      publicSale: r.HOUSE_DTL_SECD_NM === '국민' || r.HOUSE_SECD_NM === '신혼희망타운',
      detailKind: r.HOUSE_DTL_SECD_NM ?? null,
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
    excludedRental,   // 반경 안에 있었으나 분양가가 없어 뺀 임대 아파트
    source: {
      org: '한국부동산원 청약홈',
      citation: `* 출처 : 한국부동산원 청약홈 분양정보 (APT / 오피스텔·도시형·민간임대, 공공데이터포털) · ${sido} 공고 ${uniq.length}건 중 반경 ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 이내`,
      url: 'https://www.applyhome.co.kr/',
    },
  };
}
