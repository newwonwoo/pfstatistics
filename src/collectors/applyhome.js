import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';
import { distanceToPolygon, haversine, ringToRing } from '../lib/geo.js';
import { parcelRing } from './vworld.js';
import { getKey } from '../lib/env.js';
import { sidoShort } from '../lib/sido.js';
import { lookup as rankLookup } from './constructor.js';
import { loadSggIndex, matchByName } from './kapt.js';
import { tradeIndex, lookupTrade } from './rtms.js';
import { toSggCode } from '../lib/region.js';

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
 * **실측 2026-09-17 — 경기 고유주소 962건 중 449건(46.7%)이 지오코딩에 실패했다.**
 * 실패를 세어보고 나서야 원인이 갈린다는 걸 알았다. 두 종류다.
 *
 *   (A) 정제가 못 따라간 것 — 고칠 수 있다
 *       "김포 풍무역세권 B4블록 (경기도 김포시 사우동 458번지 일원)"
 *         → 괄호를 통째로 지워 **진짜 지번을 버렸다**
 *       "경기도 양주시 덕정동 일원 양주신도시 택지개발지구 내 A-26블록"
 *         → "일원" 만 지우고 뒤의 지구명·블록을 안 지워 그대로 검색에 넣었다
 *       "경기도 고양시 덕양구 도내동 외 8개동 일원 …"  → "외 N필지" 만 알고 "외 N개동" 을 몰랐다
 *       "경기도 양주시 옥정동 962-9, 962-8번지"        → 지번 나열
 *
 *   (B) 대장에 주소가 없는 것 — 어떤 주소 API 로도 못 찾는다
 *       "경기도 부천시 부천역곡 공공주택지구 내 A-2블록"
 *       "경기도 평택시 고덕국제화계획지구 A-67블록"
 *       신규 택지지구는 분양 시점에 지번이 아직 안 붙어 있다.
 *       → 읍면동까지만 남겨 **근사 좌표**라도 얻고, 근사라는 사실을 끝까지 들고 다닌다.
 *
 * 그래서 한 번 정제해 한 번 묻는 게 아니라 **점점 짧게 잘라 여러 번 묻는다**(`geocodeSupply`).
 */

/**
 * 괄호 안이 진짜 주소면 그걸 쓴다 — "…B4블록 (경기도 김포시 사우동 458번지)"
 * **읍면동 다음에 숫자**가 와야 주소로 본다. `\d+-\d+` 만 보면
 * "(곤지암역세권  A1-1블록)" 의 `A1-1` 이 걸려 멀쩡한 주소를 버린다(실측).
 */
const BRACKET_ADDR = /\(([^)]*[가-힣]+(?:동|리|가|읍|면)\s*(?:산\s*)?\d+[^)]*)\)/;

/** 지구·블록 꼬리 — 대장에 없는 표기라 검색에 넣으면 0건이 된다 */
const ZONE_TAIL = /\s*(?:[가-힣A-Za-z0-9·\s]*?(?:지구|단지|산업단지|신도시|역세권|계획지구)\s*)?(?:내\s*)?[A-Za-z]{0,3}[-\s]?\d{0,3}\s*(?:블록|블럭|BL|bl)\b.*$/;

/**
 * 괄호 안의 **법정동만** 뽑는다 — "서울특별시 강북구 도봉로 222 (미아동)"
 *
 * 도로명주소는 **건물에 붙는다.** 분양공고 주소는 준공 전 예정 주소라
 * 그 번지에 건물이 아직 없으면 카카오에도 juso 에도 없다(실측: 서울 실패 16건이 전부 이 경우).
 * 그런데 공고가 괄호 안에 법정동을 같이 적어준다 — 그걸 지우고 있었다.
 */
const BRACKET_DONG = /\(\s*([가-힣]+(?:동|리|가))\s*\)/;

/** "경기도 김포시" — 괄호 안 주소에 상위 행정구역이 없을 때 앞에 붙여준다 */
/*
 * **"신도시" 도 "시" 로 끝난다** — "경기도 양주회천신도시 공동주택용지 A-22BL" 을
 * 시도+시군구로 읽어 질의가 "경기도 양주회천신도시 양주회천신도시" 가 됐다(실측 0건).
 * 시군구 자리에 올 수 없는 꼬리를 먼저 막는다.
 */
/*
 * **"지구" 도 "구" 로 끝난다** — "장항지구 A-5블록" 의 `장항지구` 를 시군구로 읽어
 * 카카오가 준 "경기 고양시 일산동구 장항동" 을 다른 지역으로 보고 **버렸다**(실측).
 * 지구·단지·신도시 꼬리는 시군구 자리에 올 수 없다.
 */
const NOT_SGG = /(?:신도시|국제도시|하늘도시|도시|그린시티|시티|지구|단지|타운|블록|블럭)$/;
const headOf = (raw) => {
  const m = raw.match(/^\s*([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))\s+([가-힣]+(?:시|군|구))(\s+[가-힣]+구)?/);
  if (!m) return null;
  if (NOT_SGG.test(m[2])) return m[1];          // 시도까지만
  return [m[1], m[2], m[3]].filter(Boolean).join(' ').replace(/\s+/g, ' ');
};

export function normalizeSupplyAddress(address) {
  const raw = String(address ?? '');
  const inner = raw.match(BRACKET_ADDR)?.[1];
  let base = raw;
  if (inner) {
    const head = headOf(raw);
    /* 괄호 안이 "신동720" 처럼 시도·시군구 없이 오면 밖에서 가져와 붙인다 */
    base = headOf(inner) ? inner : [head, inner].filter(Boolean).join(' ');
  }

  return base
    .replace(/\([^)]*\)/g, ' ')                       // 남은 괄호 제거
    .replace(/(동|리|가)(\d)/g, '$1 $2')               // "곤지암리636" → "곤지암리 636"
    .replace(/(\d)\s*번지/g, '$1')                     // "532-2번지" → "532-2"
    .replace(/\s*외\s*\d+\s*(?:필지|개\s*동|개동|동)/g, ' ')  // "외 8개동" · "외 57필지"
    .replace(/\s*(?:일원|일대)/g, ' ')
    .replace(/,\s*[^,]*$/, (m) => (/\d/.test(m) ? '' : m))   // "962-9, 962-8" → 첫 지번만
    .replace(/\s+/g, ' ')
    .trim();
}

/*
  아래 둘은 **가장 말단의** 읍면동을 잡아야 한다.
  non-greedy 로 두면 "남양주시 진접읍 내각리" 에서 `진접읍` 에 멈춰 리를 버린다(실측).
*/
/** 지구·블록 꼬리를 떼어 "시도 시군구 읍면동 [지번]" 까지만 남긴다 */
export function trimToDong(q) {
  const cut = q.replace(ZONE_TAIL, '').trim();
  const m = cut.match(/^(.*(?:동|리|가|읍|면))\s*(산?\s*\d+(?:-\d+)?)?/);
  if (!m) return null;
  return [m[1], m[2]?.replace(/\s+/g, '')].filter(Boolean).join(' ').trim();
}

/**
 * 앞에서부터 **행정구역 토막만** 이어붙인다 — "인천광역시 서구 불로동".
 *
 * `ZONE_TAIL` 로 잘라내던 것을 버렸다. 그 정규식의 지구명 부분이
 * **문자열 앞부터 삼켜서** "인천광역시 서구 불로동 검단신도시 AA22BL" 이 통째로 지워졌다(실측).
 * 읍면동을 잃으면 개편 대조도 근사 좌표도 못 얻는다.
 * "신도시"·"지구" 도 시·구로 끝나므로 `NOT_SGG` 로 먼저 막는다.
 */
const ADMIN_TAIL = /(?:시|군|구|읍|면|동|리|가|도)$/;
export function adminPrefix(q) {
  const out = [];
  for (const w of String(q ?? '').split(/\s+/)) {
    if (!w || NOT_SGG.test(w) || !ADMIN_TAIL.test(w)) break;
    out.push(w);
    /* 동·리·가보다 더 아래는 없다 — "원흥동 동산동 용두동" 나열은 첫 동까지만 */
    if (/(?:동|리|가)$/.test(w)) break;
  }
  return out.length ? out.join(' ') : null;
}

/** 읍면동까지만 (지번 버림) — 대장에 지번이 없는 신규 택지의 마지막 수단 */
export function trimToDongOnly(q) {
  const p = adminPrefix(q);
  return p && /(?:동|리|가|읍|면)$/.test(p.split(' ').pop()) ? p : null;
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

async function geocodeOne(query, kind = 'address') {
  const key = `${kind}|${query}`;
  if (geoCache.has(key)) return geoCache.get(key);
  let hit = null;
  try {
    const d = await getJson(
      `${KAKAO}/search/${kind}.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: H(), retries: 2, timeout: 12000 });
    const doc = d.documents?.[0];
    if (doc) hit = { x: Number(doc.x), y: Number(doc.y) };
  } catch { /* 한 건 실패가 전체를 막으면 안 된다 */ }
  geoCache.set(key, hit);
  return hit;
}

/**
 * 공고 주소 → 좌표. **한 번 묻고 마는 게 아니라 점점 짧게 잘라 여러 번 묻는다.**
 *
 * 한 번만 물었을 때 경기 고유주소 962건 중 449건(46.7%)이 실패했다(실측 2026-09-17).
 * 실패 대부분은 "지구·블록 표기" 라 대장에 지번이 없는 경우인데,
 * 읍면동까지만 남기면 **근사 좌표**라도 나온다. 근사인지 아닌지를 끝까지 들고 다녀야
 * "이 거리가 정확한 값인가" 를 화면에서 답할 수 있다.
 *
 * @returns {{x,y,precision,query}|null}
 *   precision  exact  지번까지 맞은 좌표
 *              zone   택지지구 중심 — 구역 자체라 읍면동보다 낫다
 *              dong   읍면동 중심 — 거리가 수백 m 틀어질 수 있다
 *              place  장소검색(지구명)으로 잡은 좌표 — 가장 약하다
 */
/** 공고 단지명에서 지구·블록·공급유형 꼬리를 떼어 장소검색에 넣을 이름을 만든다 */
export function placeNameOf(houseNm) {
  return String(houseNm ?? '')
    .replace(/\([^)]*\)?/g, ' ')                                   // "(성남낙생지구 A-1BL)" · 안 닫힌 괄호도
    .replace(/\s*(?:신혼희망타운|공공분양주택|공공분양|행복주택|민간참여|국민임대|영구임대).*$/, ' ')
    .replace(/\s*\d+\s*블(?:록|럭)\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * **택지지구 이름으로 좌표를 얻는다** — 신규 택지의 마지막 수단.
 *
 * "경기도 성남시 성남낙생지구 내 A-1블록" 처럼 **읍면동조차 없는 주소**가 실패의 대부분이다
 * (실측 2026-09-17: 경기 실패 45건이 전부 지구·블록 표기).
 * 그런데 카카오 장소검색에 **`부동산 > 부지 > 개발지구`** 카테고리가 있어
 * "성남낙생 공공주택지구 @경기 성남시 분당구 동원동 산 47-13" 로 **지번까지** 나온다.
 *
 * **일반명사로는 절대 묻지 않는다.** "공공주택지구" 만 남겨 물었더니
 * 시흥장현을 찾는데 **시흥은계**를 줬다(실측). 당수1지구는 당수2지구가 왔다.
 * 틀린 좌표가 조용히 반경 판정에 들어가는 자리라, 고유명이 든 질의만 쓰고
 * 결과 이름에 그 고유명이 들어있는지 **대조한 뒤에** 채택한다.
 */
const ZONE_GENERIC = /^(?:택지개발사업지구|택지개발지구|공공주택지구|도시개발사업|일반산업단지|산업단지|택지지구|계획지구|국제도시|하늘도시|신도시|지구)$/;
const ZONE_KIND = '(?:택지개발사업지구|택지개발지구|공공주택지구|도시개발사업|일반산업단지|산업단지|택지지구|계획지구|그린시티|국제도시|하늘도시|신도시|지구)';
const ZONE_NAME = new RegExp(`([가-힣A-Za-z0-9·]+(?:\\s+[가-힣A-Za-z0-9·]+)?\\s*${ZONE_KIND})`);
const SIDO_HEAD = /^[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)\s+/;

/** 공고 주소에서 택지지구 이름 후보를 뽑는다 (긴 것 → 고유명 토막 순) */
export function zoneQueries(address) {
  const t = String(address ?? '')
    .replace(SIDO_HEAD, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[가-힣]+(?:동|리|가)\s*,/g, ' ')        // "장곡동, 장현동, …" 나열
    .replace(/\s*(?:일원|일대|내)\s*/g, ' ')
    .replace(/([가-힣])(공공주택지구|택지개발지구|도시개발사업)/g, '$1 $2')  // 붙여쓴 것을 띄운다
    .replace(/\s+/g, ' ').trim();
  const m = t.match(ZONE_NAME);
  if (!m) return [];
  /* 앞에 붙은 시군구·읍면동을 뗀다 — "군자동 시흥장현 공공주택지구" 로 물으면 0건이다 */
  const full = m[1].replace(/^[가-힣]+(?:시|군|구|동|리|읍|면|가)\s+/, '').replace(/\s+/g, ' ').trim();
  const words = full.split(' ');
  const out = [full, ...(words.length > 1 ? [words[0]] : [])];
  return [...new Set(out.filter(z => z.length >= 3 && !ZONE_GENERIC.test(z)))];
}

/** 지구 이름 대조용 — 종류말(공공주택지구 등)과 공백을 지운 고유명 */
const zoneCore = (s) => String(s).replace(new RegExp(ZONE_KIND, 'g'), '').replace(/[\s·]/g, '');

async function geocodeZone(raw, normalized) {
  const head = headOf(String(raw)) ?? headOf(normalized) ?? '';
  for (const z of zoneQueries(raw)) {
    /*
     * **시군구를 붙이면 오히려 0건이 되는 지구가 있다**(실측 2026-09-17):
     * "시흥장현"·"장항지구"·"평택 모산·영신지구" 는 지구명만 물어야 나온다.
     * 그래서 붙인 질의를 먼저(더 좁다) 물어보고, 안 되면 지구명만 다시 묻는다.
     * 엉뚱한 지역이 잡히는 것은 이름 대조와 시군구 대조가 막는다.
     */
    for (const q of [...new Set([`${head} ${z}`.trim(), z])]) {
      const docs = await geocodeDocs(q);
      const c = zoneCore(z);
      const hit = docs
        .filter(d => /개발지구|부지|아파트/.test(d.category ?? ''))
        .find(d => zoneCore(d.name).includes(c) || c.includes(zoneCore(d.name)));
      if (hit && await sameSggNow(hit.address, raw, normalized)) {
        return { x: hit.x, y: hit.y, query: q, precision: 'zone' };
      }
    }
  }
  return null;
}

/**
 * 장소검색 결과가 그 공고의 시군구 안인지 — 아니면 엉뚱한 동명 단지다.
 *
 * **시도도 "시" 로 끝난다.** `/(?:시|군|구)$/` 로 첫 단어를 잡으면
 * "서울특별시"·"부산광역시" 가 시군구로 잡히고, 카카오는 주소를 "서울 강북구 …" 로 줘서
 * 표기가 안 맞아 **결과를 전부 거부한다**(실측: 서울·부산에서 단지명 검색 성공 0건).
 * 시도 접미사를 먼저 걸러낸 뒤 시군구를 찾는다.
 */
const SIDO_SUFFIX = /(?:특별시|광역시|특별자치시|특별자치도|자치시|자치도|도)$/;
const sggOfWords = (text) => String(text ?? '').split(/\s+/)
  .find(w => w.length > 1 && !SIDO_SUFFIX.test(w) && !NOT_SGG.test(w) && /(?:시|군|구)$/.test(w)) ?? null;

const sameSgg = (addr, raw) => {
  const sgg = sggOfWords(raw);
  if (!sgg) return true;
  return String(addr ?? '').split(/\s+/).includes(sgg);
};

/*
 * **행정구역이 개편되면 공고의 시군구와 카카오의 시군구가 다르다.**
 * 실측 2026-09-17 — 인천 실패 17건 중 15건이 이것이었다:
 *   공고 "인천광역시 서구 불로동 검단신도시 AA22BL"
 *   카카오 "인천 검단구 불로동"        → 서구 ≠ 검단구 → 멀쩡한 매칭을 버렸다
 * 개편 매핑을 손으로 적지 않는다(추측 금지). 공고가 적은 **읍면동을 카카오에 물으면
 * 옛 표기로 물어도 현재 시군구를 돌려준다**(불로동→검단구 · 운서동→영종구 · 가정동→서해구 실측).
 */
const nowSggCache = new Map();
async function currentSgg(dongQuery) {
  if (nowSggCache.has(dongQuery)) return nowSggCache.get(dongQuery);
  let v = null;
  try {
    const d = await getJson(
      `${KAKAO}/search/address.json?query=${encodeURIComponent(dongQuery)}&size=1`,
      { headers: H(), retries: 2, timeout: 12000 });
    const doc = d.documents?.[0];
    v = doc?.address?.region_2depth_name ?? doc?.road_address?.region_2depth_name ?? null;
  } catch { /* 못 물어보면 옛 표기로 대조한다 */ }
  nowSggCache.set(dongQuery, v);
  return v;
}

/** 시군구 대조 — 표기가 안 맞으면 개편 때문인지 한 번 더 확인한다 */
async function sameSggNow(addr, raw, normalized) {
  if (sameSgg(addr, raw)) return true;
  /* 동이 있으면 동으로, 없으면 시군구까지라도 — 둘 다 개편 후 이름을 돌려준다 */
  const q = trimToDongOnly(normalized) ?? adminPrefix(normalized);
  if (!q) return false;
  const now = await currentSgg(q);
  return !!now && String(addr ?? '').split(/\s+/).includes(now);
}

async function geocodeSupply(normalized, raw = '', houseNm = '') {
  const dong = trimToDong(normalized);
  const dongOnly = trimToDongOnly(normalized);
  /* 도로명이 아직 없는 신축 부지 — 공고가 괄호에 적어준 법정동으로 떨어진다 */
  const bracketDong = (() => {
    const d = String(raw).match(BRACKET_DONG)?.[1];
    const head = headOf(String(raw)) ?? headOf(normalized);
    return d && head ? `${head} ${d}` : null;
  })();
  /* 지번까지 맞는 주소가 먼저 */
  for (const q of [normalized, dong].filter(Boolean)) {
    const p = await geocodeOne(q, 'address');
    if (p) return { ...p, query: q, precision: /\d/.test(q.replace(/^.*?(?:시|군|구)\s/, '')) ? 'exact' : 'dong' };
  }

  /*
   * **단지명으로 장소를 찾는다** — 읍면동 중심보다 정확하다.
   * 신규 택지는 주소가 대장에 없어도 카카오에는 단지가 등록돼 있다
   * (실측: "역곡지구하우스토리아파트(A2) (2029년06월예정)" 처럼 미준공도 있다).
   * 다만 **견본주택은 단지와 다른 자리에 짓는다** — 좌표를 쓰되 그 사실을 표시한다.
   * 동명이 단지를 잡지 않도록 시군구가 같은지 확인한다(장소검색은 시군구를 넘어간다).
   */
  const place = placeNameOf(houseNm);
  if (place.length >= 3) {
    const head = headOf(String(raw)) ?? headOf(normalized) ?? '';
    const d = await geocodeDoc(`${head} ${place}`.trim());
    if (d && await sameSggNow(d.address, raw, normalized)) {
      const sample = /견본주택|모델하우스|홍보관/.test(d.name ?? '');
      return { x: d.x, y: d.y, query: `${head} ${place}`.trim(), precision: sample ? 'sample' : 'name' };
    }
  }

  /*
   * **택지지구 이름으로** — 읍면동조차 없는 신규 택지가 여기서 살아난다.
   * 지구 중심은 읍면동 중심보다 사업지에 가깝다(공고가 가리키는 구역 자체다).
   */
  const zone = await geocodeZone(raw, normalized);
  if (zone) return zone;

  /*
   * 여기까지 왔으면 읍면동 중심이라도 — 근사임을 표시한다.
   * **동을 나열한 주소는 첫 동까지만** 잘라 묻는다 —
   * "고양시 일산동구 장항동, 일산서구 대화동 일원" 을 통째로 물으면 0건이다(실측).
   */
  const firstDong = (() => {
    const m = normalized.match(/^(.*?(?:동|리|가|읍|면))\s*,/);
    return m ? m[1].trim() : null;
  })();
  for (const q of [dongOnly, firstDong, bracketDong].filter(Boolean)) {
    const p = await geocodeOne(q, 'address');
    if (p) return { ...p, query: q, precision: 'dong' };
  }
  /* 마지막 — "부천역곡 공공주택지구" 같은 지구명 자체를 장소로 */
  const p = await geocodeOne(normalized, 'keyword');
  return p ? { ...p, query: normalized, precision: 'place' } : null;
}

/** 장소검색 여러 건 — 카테고리까지 봐야 개발지구를 가릴 수 있다 */
async function geocodeDocs(query, size = 15) {   /* 카카오 장소검색 한 번에 받을 수 있는 최대 */
  const key = `docs|${size}|${query}`;
  if (geoCache.has(key)) return geoCache.get(key);
  let hits = [];
  try {
    const d = await getJson(
      `${KAKAO}/search/keyword.json?query=${encodeURIComponent(query)}&size=${size}`,
      { headers: H(), retries: 2, timeout: 12000 });
    hits = (d.documents ?? []).map(x => ({
      x: Number(x.x), y: Number(x.y), name: x.place_name,
      address: x.address_name, category: x.category_name,
    }));
  } catch { /* 한 건 실패가 전체를 막으면 안 된다 */ }
  geoCache.set(key, hits);
  return hits;
}

/** 장소검색 1건 — 이름·주소까지 봐야 시군구 검증과 견본주택 판정을 할 수 있다 */
async function geocodeDoc(query) {
  const key = `doc|${query}`;
  if (geoCache.has(key)) return geoCache.get(key);
  let hit = null;
  try {
    const d = await getJson(
      `${KAKAO}/search/keyword.json?query=${encodeURIComponent(query)}&size=5`,
      { headers: H(), retries: 2, timeout: 12000 });
    /* 견본주택보다 단지 자체를 앞세운다 */
    const docs = d.documents ?? [];
    const best = docs.find(x => !/견본주택|모델하우스|홍보관/.test(x.place_name ?? '')) ?? docs[0];
    if (best) hit = { x: Number(best.x), y: Number(best.y), name: best.place_name, address: best.address_name };
  } catch { /* 한 건 실패가 전체를 막으면 안 된다 */ }
  geoCache.set(key, hit);
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
/*
  **도로명 주소에서는 읍면동을 못 뽑아 같은 단지가 두 줄로 앉았다**(실측 2026-09-25 ·
  「쌍용 더 플레티넘 부평(민간임대)」 이 2022-08 · 2022-11 두 줄).
  「부평대로 208(십정동)」 처럼 읍면동이 **괄호 안**에 있으면 공백 기준 매칭이 놓친다 —
  묶음키가 달라져 재공고 정리가 통째로 빗나간다. 괄호·쉼표를 공백으로 바꾸고 찾는다.
*/
const dongOf = (addr) => (String(addr ?? '').replace(/[(),]/g, ' ').match(/\S+?[동리가](?=\s|$)/) ?? [''])[0];
const nameKey = (r) =>
  // 괄호 **안의 내용까지** 지운다 — "역북 서희스타힐스 프라임시티(조합원 취소분)" 이
  // 원공고와 따로 앉아 같은 단지가 두 줄로 나왔다(실측).
  // 종류는 키에 따로 들어가므로 "○○(오피스텔)" 이 아파트와 합쳐지지는 않는다.
  String(r.HOUSE_NM ?? '').replace(/\([^)]*\)/g, '').replace(/\s/g, '');

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
/**
 * **본건(심사대상) 판별** — 사업지 자체가 비교사업장 목록에 앉는다(사용자 지적 2026-09-17).
 * 실측: 서울 성동구 용답동 108-1 로 조회하니 「청계리버뷰자이 · 0m」 가 1번 줄에 나왔다.
 * 자기 자신을 평균에 넣으면 분양가격지수가 1.00 쪽으로 끌려간다.
 * 지우지는 않는다 — **「본건」이라고 적고 선택만 막는다**(같은 자리에 다른 공고가 있을 수 있다).
 */
const jibunKey = (addr) => {
  const m = String(addr ?? '').match(/([가-힣]+(?:동|리|가))\s*(산\s*)?(\d+(?:-\d+)?)/);
  return m ? `${m[1]} ${m[2] ? '산' : ''}${m[3]}` : null;
};

export async function collectComparables({ site, region, radius = 2000, polygon = null, from = null, probe = null, census = false, sggCode = null, siteAddress = null }) {
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

  /*
    같은 단지가 재공고로 여러 건 들어온다 — 최신 공고만 남긴다 (종류가 다르면 다른 줄이다).

    묶음키에 읍면동을 넣는 이유는 **같은 이름 다른 지역**을 가르기 위해서다.
    그런데 도로명 주소는 읍면동을 안 줄 때가 있다 —
    실측(2026-09-25): 「부평 신일해피트리 더루츠」 가
      "인천광역시 부평구 산곡로 31 (산곡동, …)"  ← 읍면동 있음
      "인천광역시 부평구 산곡로 31"              ← 읍면동 없음
    으로 올라와 **같은 단지가 두 줄**로 앉았다.
    그래서 먼저 `종류|이름` 으로 **대표 읍면동**을 정해두고, 읍면동이 빈 공고는 그것을 빌려 쓴다.
    (이름이 같고 읍면동을 아는 공고가 하나라도 있으면 그 단지의 읍면동으로 본다)
  */
  const dongByName = new Map();
  for (const n of notices) {
    const k = `${n.kind}|${nameKey(n.r)}`;
    const d = dongOf(n.r.HSSPLY_ADRES);
    if (d && !dongByName.has(k)) dongByName.set(k, d);
  }
  const latest = new Map();
  for (const n of notices) {
    const base = `${n.kind}|${nameKey(n.r)}`;
    const key = `${base}|${dongOf(n.r.HSSPLY_ADRES) || dongByName.get(base) || ''}`;
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
  /*
    **본건 판정은 경계 거리로 하면 안 된다**(실측 2026-09-25 · 인천 도화동).
    `isSite` 의 「사실상 같은 자리(30m)」 규칙에 경계 최단거리를 쓰면,
    경계를 넉넉히 그린 순간 **그 안에 들어온 옆 단지가 전부 0m** 가 되어 본건으로 먹힌다 —
    실측: 경계 ~265m 로 그리자 85m 떨어진 「두산위브 더센트럴 도화」(1년 이내 분양개시)가
    0m·본건으로 판정돼 인근단지 후보에서 통째로 빠졌고, 화면은 「1년 이내 0건」 이라고만 했다.
    본건인지는 **대표지번 중심에서의 실제 거리**로 본다(경계와 무관하다).
  */
  const distCenter = (p) => haversine({ lat: Number(site.y), lng: Number(site.x) }, { lat: p.y, lng: p.x });

  const located = await mapLimit(shortlist, 10, async (n) => {
    const q = normalizeSupplyAddress(n.r.HSSPLY_ADRES);
    const p = await geocodeSupply(q, n.r.HSSPLY_ADRES, n.r.HOUSE_NM);
    if (!p) return { ...n, q, p: null };
    return { ...n, q: p.query, p, d: Math.round(dist(p)), dCenter: Math.round(distCenter(p)), precision: p.precision };
  });

  /*
   * **읍면동 근사로 잰 것만 K-apt 로 다시 잰다.**
   * 준공된 단지라면 K-apt 에 지번주소가 있어 정확히 잴 수 있다 —
   * 근사는 수백 m 틀어지고 그 거리가 반경 판정에 그대로 들어간다.
   * 이미 지번까지 맞은 것(exact)·단지명으로 찾은 것(name)은 건드리지 않는다.
   * K-apt 는 입주한 단지만 있으므로 미착공은 여기서도 안 나온다 — 그러면 근사를 그대로 쓴다.
   */
  const weak = located.filter(v => v?.p && (v.precision === 'dong' || v.precision === 'place'));
  if (weak.length && sggCode) {
    const index = await loadSggIndex(sggCode);
    await mapLimit(weak, 5, async (v) => {
      const b = await matchByName(v.r.HOUSE_NM, index);
      if (!b?.jibun) return;
      const p = await geocodeOne(b.jibun, 'address');
      if (!p) return;
      v.p = p; v.d = Math.round(dist(p)); v.precision = 'exact';
      v.q = b.jibun;
      v.kapt = b;                       // 세대수·시공사·사용승인일도 같이 들고 온다
    });
  }

  /*
   * **좌표를 못 찾은 공고**(사용자 지적 2026-09-17).
   * 처음엔 같은 시군구인 것을 전부 표 아래에 적었는데 **목록이 너무 길어진다** —
   * 좌표가 없으면 반경 안인지 밖인지도 모르니, 반경과 무관한 단지까지 늘어놓는 셈이다.
   * 그래서 순서를 뒤집었다: **먼저 좌표를 끝까지 찾아 반경 안이면 표에 넣고**(택지지구 단계),
   * 그래도 못 찾은 것만 **건수 한 줄**로 남긴다. 목록이 아니라 숫자다.
   */
  const siteSgg = sggOf(region);
  const unlocated = located
    .filter(v => v && !v.p && sggOf(v.r.HSSPLY_ADRES) === siteSgg)
    .map(v => ({ name: v.r.HOUSE_NM, address: v.r.HSSPLY_ADRES, kind: v.kind,
                 saleStart: v.r.CNTRCT_CNCLS_BGNDE ?? null, url: v.r.PBLANC_URL ?? null }));

  /*
    ── 거리를 **실제 지도상 최단거리**로 다시 잰다 (사용자 지적 2026-09-25) ──────
    여기까지의 `d` 는 상대 단지를 **대표지번 점**으로 보고 잰 값이다. 규정이 재는 거리는
    「단지 경계로부터」이므로, 상대 쪽도 면이 있으면 **경계끼리** 재야 지도에서 보이는
    최단거리와 같아진다. 브이월드 연속지적도가 그 필지 경계를 준다 —
    「상대 단지의 경계는 공개 원천에 없다」 고 적어두었던 기록이 틀렸다.

    · 반경의 **1.35배 안** 후보만 다시 잰다(밖은 어차피 떨어진다 · 호출 수를 줄인다).
    · 필지를 못 받으면 **점 거리 그대로** 두고 `distanceBasis` 에 그 사실을 남긴다.
    · 키가 없으면 통째로 건너뛴다 — 없다고 수집이 멈추면 안 된다.
  */
  const siteRing = polygon?.length >= 3 ? polygon : null;
  const siteCenter = { lat: Number(site.y), lng: Number(site.x) };
  if (getKey('VWORLD_API_KEY') && !census && !probe) {
    const near2 = located.filter(v => v?.p && Number.isFinite(v.d) && v.d <= radius * 1.35);
    await mapLimit(near2, 6, async (v) => {
      try {
        const pr = await parcelRing({ x: v.p.x, y: v.p.y }, { jibun: v.r.HSSPLY_ADRES });
        if (!pr?.ring) return;
        const dd = siteRing ? ringToRing(siteRing, pr.ring) : distanceToPolygon(siteCenter, pr.ring);
        if (!Number.isFinite(dd)) return;
        v.dPoint = v.d;
        v.d = Math.round(dd);
        v.parcel = pr;
      } catch { /* 못 받으면 점 거리 그대로 */ }
    });
  }

  const siteKey = jibunKey(siteAddress ?? region);
  const within = located.filter(v => v?.p && v.d <= radius).sort((a, b) => a.d - b.d);

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
      const p = await geocodeSupply(q, n.r.HSSPLY_ADRES, n.r.HOUSE_NM);
      return { ok: !!p, precision: p?.precision ?? null,
               name: n.r.HOUSE_NM, raw: n.r.HSSPLY_ADRES, query: p?.query ?? q, kind: n.kind, src: n.src };
    });
    const failed = rows.filter(r => !r.ok);
    const by = (p) => rows.filter(r => r.precision === p).length;
    return {
      sido, census: true,
      notices: uniq.length, uniqueAddresses: uniqAddr.length,
      exact: by('exact'), name: by('name'), zone: by('zone'), sample: by('sample'), dong: by('dong'), place: by('place'),
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
  const items = await mapLimit(inside, 5, async ({ r, q, p, d, dPoint, dCenter, parcel, src, kind, precision, kapt }) => {
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
      /* 무엇까지 잰 거리인가 — 필지 경계(면) 인지 대표지번 점인지 끝까지 들고 다닌다 */
      distanceBasis: parcel ? 'parcel' : 'point',
      distancePoint: dPoint ?? null,
      parcelAddr: parcel?.addr ?? null,
      parcelMatch: parcel?.matched ?? null,
      /* 본건(심사대상)인가 — 같은 지번이거나 사실상 같은 자리(30m 이내) */
      isSite: (siteKey != null && jibunKey(r.HSSPLY_ADRES) === siteKey) || (dCenter ?? d) <= 30,
      /* 좌표를 어디까지 맞춰서 잰 거리인지 — dong·place 는 근사다 */
      geocode: precision ?? 'exact',
      /* K-apt 로 지번을 찾아 다시 잰 것 — 사용승인일·세대수·시공사도 같이 왔다 */
      kapt: kapt ?? null,
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
    unlocated,        // 같은 시군구인데 좌표를 못 찾아 거리조차 못 잰 공고
    /*
     * **반경 안을 먼저 다 담고, 단계별로 거른다**(사용자 확정 2026-09-17).
     * 어느 단계에서 몇 건이 빠졌는지 화면이 말할 수 있어야
     * "옆에 단지가 있는데 왜 안 나오나" 에 답이 된다.
     */
    funnel: {
      scanned: uniq.length,
      shortlisted: shortlist.length,
      located: located.filter(v => v?.p).length,
      within: within.length,
      rental: excludedRental.length,
      listed: items.length,
      approx: within.filter(v => v.precision && v.precision !== 'exact').length,
      /* 거리를 필지 경계(면)까지 잰 건수 — 나머지는 대표지번 점까지다 */
      parcel: within.filter(v => v.parcel).length,
    },
    /*
      **무엇까지 잰 거리인가** — 화면·엑셀이 이 문구를 그대로 쓴다.
      섞여 있을 수 있으므로(필지를 못 받은 건은 점) 건수를 같이 준다.
    */
    distance: {
      from: polygon?.length >= 3 ? '사업지 경계' : '대표지번 중심',
      to: within.some(v => v.parcel) ? '상대 단지 필지 경계' : '상대 단지 대표지번',
      parcelCount: within.filter(v => v.parcel).length,
      pointCount: within.filter(v => !v.parcel).length,
      note: '상대 단지 경계는 국토교통부 연속지적도(브이월드 WFS)의 필지 경계입니다 —'
        + ' 필지 경계이지 단지 경계가 아니므로 도로·공원 편입분만큼 차이가 날 수 있습니다.',
    },
    source: {
      org: '한국부동산원 청약홈',
      citation: `* 출처 : 한국부동산원 청약홈 분양정보 (APT / 오피스텔·도시형·민간임대, 공공데이터포털) · ${sido} 공고 ${uniq.length}건 중 반경 ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 이내`,
      url: 'https://www.applyhome.co.kr/',
    },
  };
}

/**
 * **기축 단지 보강** — 청약홈에 공고가 없는 단지를 카카오·K-apt 로 목록에 올린다.
 *
 * 실측 2026-09-17 (서울 성동구 용답동 108-1, 반경 1km):
 *   청약홈 336건 중 반경 안 **4건** · 카카오 아파트 **16곳**.
 *   차이는 버그가 아니라 **원천 범위**다 — 청약홈 적재는 2020-02 부터라
 *   그 앞에 분양한 기축 단지(삼희·청계벽산메가트리움·답십리한화…)는 애초에 없다.
 *   규정 제16조는 준공 단지도 쓰므로 실무자가 **보기라도 해야** 한다.
 *
 * **분양가는 주지 않는다.** 카카오에도 K-apt 에도 분양가가 없다.
 * 그래서 이 목록은 평균에 들어가지 못하고, 그 사실을 화면이 말해야 한다 —
 * 조용히 0원으로 섞이면 분양가격지수가 통째로 틀어진다.
 *
 * 카카오 장소검색은 **한 번에 45건까지**만 준다(15×3페이지). 가까운 것부터 받는다.
 */
const APT_CAT = /주거시설\s*>\s*아파트/;
/** "래미안위브아파트 311동" · "마장세림아파트 1동" → 같은 단지로 묶는다 */
const aptKey = (name) => String(name ?? '')
  .replace(/\s*\d+\s*동\s*$/, '')
  .replace(/\s*\([^)]*\)\s*$/, '')
  .replace(/아파트$/, '')
  .replace(/\s/g, '');

export async function collectKnownApts({ site, radius = 2000, polygon = null, exclude = [] }) {
  const dist = (p) => (polygon?.length >= 3
    ? distanceToPolygon({ lat: p.y, lng: p.x }, polygon)
    : haversine({ lat: Number(site.y), lng: Number(site.x) }, { lat: p.y, lng: p.x }));

  const docs = [];
  let total = null;
  for (let page = 1; page <= 3; page++) {
    const p = new URLSearchParams({ query: '아파트', size: '15', page: String(page),
      x: String(site.x), y: String(site.y), radius: String(Math.min(20000, radius)), sort: 'distance' });
    let d;
    try { d = await getJson(`${KAKAO}/search/keyword.json?${p}`, { headers: H(), retries: 2, timeout: 12000 }); }
    catch { break; }
    total ??= d.meta?.total_count ?? null;
    docs.push(...(d.documents ?? []));
    if (d.meta?.is_end) break;
  }

  const seen = new Set(exclude.map(aptKey));
  const uniq = [];
  for (const d of docs) {
    if (!APT_CAT.test(d.category_name ?? '')) continue;
    const key = aptKey(d.place_name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniq.push({
      name: d.place_name, address: d.address_name, x: Number(d.x), y: Number(d.y),
      distance: Math.round(dist({ x: Number(d.x), y: Number(d.y) })),
      /* 카카오가 "(2029년02월예정)" 처럼 준공 예정을 이름에 달아 준다 — 미준공 신호다 */
      planned: /\d{4}년\s*\d{1,2}월\s*예정/.test(d.place_name),
    });
  }
  uniq.sort((a, b) => a.distance - b.distance);

  /*
   * **반경은 시군구를 넘는다**(실측 2026-09-17).
   * 사업지는 성동구인데 반경 1km 안 단지 14곳 중 8곳이 **동대문구**였다.
   * 사업지 시군구 색인 하나만 받으면 그 8곳은 실거래도 세대수도 못 채운다 —
   * 단지 **주소에 적힌 시군구별로** 색인을 받는다.
   */
  /*
    **일반구가 있는 시에서 보강이 통째로 죽었다**(실측 2026-09-24, 부천).
    K-apt 도 실거래가도 색인이 **구 단위**다 —
      경기 부천시 41190 → 0건 · 원미구 41192 → 135건 · 소사구 41194 → 83 · 오정구 41196 → 47
    주소 앞 **두 토막**만 떼어 "경기 부천시" 로 물으니 41190 이 나와 세대수·시공사·사용승인일·
    실거래 단가가 **전부 빈 채**로 표가 그려졌다. 화면은 그것을 "K-apt 에서 이름이 맞지 않은 것"
    이라고 설명하고 있었다 — **틀린 이유를 댄 것**이다.
    수원·성남·안양·안산·고양·용인·창원 등 일반구가 있는 시가 전부 같은 증상이다.

    구가 있으면 **세 토막**을 쓴다. 다만 「지구」도 「구」로 끝나므로 막는다(기록된 함정).
  */
  const sggOfAddr = (addr) => {
    const w = String(addr ?? '').split(/\s+/).filter(Boolean);
    if (w.length < 2) return w.join(' ');
    const third = w[2] ?? '';
    const isGu = /구$/.test(third) && !/(지구|신도시|국제도시)$/.test(third);
    return w.slice(0, isGu ? 3 : 2).join(' ');
  };
  const bySgg = new Map();
  for (const v of uniq) {
    const k = sggOfAddr(v.address);
    if (!k) continue;
    if (!bySgg.has(k)) bySgg.set(k, []);
    bySgg.get(k).push(v);
  }

  let indexed = 0;   // K-apt 색인을 실제로 몇 건 받았는가
  await mapLimit([...bySgg.entries()], 3, async ([name, members]) => {
    let code = null;
    try { code = await toSggCode(name, { kakaoKey: requireKey('KAKAO_REST_KEY') }); } catch { /* 못 구하면 보강만 건너뛴다 */ }
    if (!code) return;

    /* K-apt — 세대수·시공사·사용승인일 (관리비 의무단지, 즉 준공 단지만 있다) */
    try {
      const index = await loadSggIndex(code);
      /*
        **색인을 못 받은 것과 이름이 안 맞은 것은 다르다.** 화면은 빈 칸을 보고
        "이름이 맞지 않았다" 고 설명하는데, 원천이 잠깐 죽어 색인이 0건이면 그건 틀린 설명이다
        (실측 2026-09-24 — 같은 조회를 반복하니 K-apt 목록이 들쭉날쭉했다).
        받은 색인 크기를 그대로 들고 나가 화면이 사유를 가릴 수 있게 한다.
      */
      indexed += index?.size ?? 0;
      await mapLimit(members, 5, async (v) => {
        const b = await matchByName(v.name.replace(/\s*\([^)]*\)\s*$/, ''), index);
        if (b) v.kapt = b;
      });
    } catch { /* 보강 실패는 목록을 막지 않는다 */ }

    /*
     * **실거래가로 가격을 채운다**(사용자 요청 2026-09-17).
     * 기축 단지는 분양가가 어느 원천에도 없다 — 유일하게 숫자가 있는 곳이 국토부 실거래가다.
     * **분양가가 아니다.** 이미 팔린 값이고 **전용면적 기준**이라
     * 심사기준(공급면적) 단가와 그대로 비교하면 안 된다. 평균에는 넣지 않는다.
     */
    try {
      const trades = await tradeIndex(code);
      for (const v of members) {
        const t = lookupTrade(trades, v.name, v.address);
        if (t) v.trade = t;
      }
    } catch { /* 실거래가 실패도 목록을 막지 않는다 */ }
  });

  return {
    radius,
    scanned: total,
    count: uniq.length,
    truncated: total != null && total > docs.length,
    items: uniq.filter(v => v.distance <= radius),
    sggs: [...bySgg.keys()],
    kaptIndexed: indexed,
    source: {
      name: '카카오맵 장소검색 (분류: 부동산 > 주거시설 > 아파트)',
      detail: 'K-apt 공동주택 기본정보(세대수·시공사·사용승인일) · 국토교통부 아파트 매매 실거래가(최근 12개월) 보강',
      note: '실거래가는 분양가가 아닙니다 — 이미 팔린 값이고 전용면적 기준이라 비교사업장 평균에 넣을 수 없습니다',
    },
  };
}
