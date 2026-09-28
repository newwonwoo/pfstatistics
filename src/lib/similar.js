/**
 * **인근 단지를 고르는 규칙 세 가지** — 한 곳에만 둔다.
 *
 * 같은 「인근 단지」 라는 말을 쓰지만 원문이 세 개로 따로 있다(docs/규정-인근단지-선정기준.md).
 *
 *   A. 분양가경쟁력(15) 평가 시 「인근아파트 유사사업장」   → 분양가격지수 · 분양가경쟁력 점수
 *   B. 인근아파트 초기 분양률(10) 평가 시 「인근아파트」    → 초기분양률 조사 대상
 *   C. 분양보증 대상 사업장의 「인근 유사사업장」 조사       → 적정분양가(심사지침 제2조의2 1호 · 제16조)
 *
 * A 와 C 는 **한 줄만 다르다** — C 의 ③유사도 단서에 「5년 이내 분양 개시 사업장으로 우선 선정」 이 더 붙는다.
 * B 는 거리·시기는 비슷하지만 **나머지가 다르다** — 준공 단지를 안 쓰고, 주택유형 일치가 요건이고,
 * 여럿이면 4개 항목이 **가장 많이** 일치하는 곳(동률이면 평균)을 고르며, 없으면 최하위 배점이다.
 *
 * 화면(CompareView · NearbyPresale)과 엑셀과 자가진단이 모두 이 함수를 쓴다 —
 * 같은 규칙을 여러 곳에 복사해 두면 한쪽만 고쳐져 조용히 갈린다.
 */

/** ① 거리 — 세 기준 모두 같다: 2km (수도권·광역시는 1km) */
export const METRO = ['서울', '인천', '경기', '부산', '대구', '광주', '대전', '울산', '세종'];
export const baseRadius = (region) =>
  METRO.some(m => String(region ?? '').startsWith(m)) ? 1000 : 2000;

/** 가~라 네 항목의 구분 — 원문 그대로 */
export const HOUSE_TYPES = ['아파트', '주상복합', '기타'];
export const SIZE_BANDS = ['500세대 미만', '500~999세대', '1,000세대 이상'];
export const RANK_BANDS = ['50위 이내', '51~100위', '101~200위', '201~300위', '300위 밖'];
export const LAND_TYPES = ['민간택지', '공공택지', '신도시', '기타'];

/** C 의 추가 우선순위 — 5년 이내 분양개시 */
export const PRIORITY_YEARS = 5;

export const TIMING = { FRESH: '1년 이내 분양개시', ONGOING: '분양 진행중', DONE: '준공' };

/** 민간임대 금액은 임대보증금이라 분양가가 아니다 */
const isSale = (a) => a.priceKind !== 'deposit';

/**
 * 가~라 네 항목 중 몇 개가 일치하는가 — 세 기준이 **같은 네 항목**을 쓴다.
 *   가. 주택유형 아파트/주상복합/기타 · 나. 단지규모 500미만/500~999/1,000이상
 *   다. 시공능력평가순위 50위이내/51~100/101~200/201~300/300위밖 · 라. 택지유형 민간/공공/신도시/기타
 * 한쪽이라도 모르면 일치로 세지 않는다(「미상」) — 추정해서 맞추면 유사도가 부풀려진다.
 */
export function similarityOf(site = {}, a = {}) {
  const hit = [], miss = [];
  const cmp = (name, mine, theirs) => {
    if (!mine || !theirs) { miss.push(`${name}(미상)`); return; }
    if (mine === theirs) hit.push(name); else miss.push(`${name}(${theirs})`);
  };
  cmp('주택유형', site.houseType, a.houseType);
  cmp('단지규모', site.sizeBand, a.sizeBand);
  cmp('시공순위', site.rankBand, a.rankBand);
  cmp('택지유형', site.landType, a.landType);
  return { n: hit.length, hit, miss };
}

/**
 * A · C — 분양가 비교 유사사업장 자동선택.
 *
 *   ② 시기   1년 이내 분양개시 → 없으면 분양 진행중 **및 준공**
 *   ③ 유사도 2개 이상 일치 · 3개 이상이 있으면 그것을 우선
 *            (C 만) 그리고 5년 이내 분양개시를 우선
 *   비고2    공공분양 · 분양개시 후 10년 경과는 제외
 *
 * 단서 「심사 합리성을 위해 필요 시 우선순위 없이 2개 일치도 포함」 은 **사람의 판단**이다 —
 * 자동선택은 우선순위대로 좁히고, 더 넣고 싶으면 실무자가 체크로 더한다.
 *
 * @param {'price'|'guarantee'} rule  price = A(분양가경쟁력) · guarantee = C(분양보증 적정분양가)
 * @returns {{ ids: string[], steps: string[], excluded: number, reason?: string }}
 */
export function pickComparables(items = [], site = {}, rule = 'price') {
  const sale = items.filter(a => isSale(a) && !a.isSite);
  const excluded = sale.filter(a => a.publicSale || a.years > 10).length;
  let c = sale
    .filter(a => !a.publicSale && !(a.years > 10))
    .filter(a => [TIMING.FRESH, TIMING.ONGOING, TIMING.DONE].includes(a.timing))
    .filter(a => (a.sim ?? similarityOf(site, a)).n >= 2);
  if (!c.length) {
    return { ids: [], steps: [], excluded, reason: '유사도 2개 이상 일치하는 단지가 없습니다' };
  }
  const steps = [];
  const narrow = (pred, label) => {
    const next = c.filter(pred);
    if (next.length && next.length < c.length) { c = next; steps.push(label); }
    else if (next.length) steps.push(label);
  };
  const sim = (a) => (a.sim ?? similarityOf(site, a)).n;
  /* ② 시기 — 1년 이내 분양개시가 하나라도 있으면 그것만 (Q8) */
  narrow(a => a.timing === TIMING.FRESH, '1년 이내 분양개시 우선');
  if (!steps.length) steps.push('1년 이내 분양개시 없음 → 분양 진행중·준공');
  /* ③ 3개 이상 일치 우선 */
  narrow(a => sim(a) >= 3, '3개 이상 일치 우선');
  /* C 만 — 5년 이내 분양개시 우선 */
  if (rule === 'guarantee') narrow(a => a.years != null && a.years <= PRIORITY_YEARS, '5년 이내 분양개시 우선');
  return { ids: c.map(a => a.manageNo), steps, excluded };
}

/**
 * C 가 A 와 다른 곳은 「5년 이내 분양개시 우선」 한 줄이다.
 * 실무자가 A 기준으로 고른 단지(수동 추가 포함)에서 그 한 줄만 더 적용한다 —
 * 5년 이내가 하나라도 섞여 있으면 5년 넘은 곳을 뺀다. 모두 5년 넘었으면 그대로 둔다.
 *
 * @returns {{ set: object[], dropped: object[] }}
 */
export function guaranteeSetOf(chosen = []) {
  const recent = chosen.filter(a => a.years != null && a.years <= PRIORITY_YEARS);
  if (!recent.length || recent.length === chosen.length) return { set: chosen, dropped: [] };
  return { set: recent, dropped: chosen.filter(a => !recent.includes(a)) };
}

/**
 * B — 인근아파트 초기 분양률(10) 조사 대상.
 *
 *   ① 거리   2km (수도권·광역시 1km) — 수집 반경으로 건다
 *   ② 시기   1년 이내 분양개시 → 없으면 분양 진행중 (**준공은 쓰지 않는다**)
 *   ③ 유형   주택유형이 일치하는 사업장 — 아파트 분양보증이면 아파트, 오피스텔이면 오피스텔·도시형
 *   비고1   해당 사업장이 없으면 **최하위 배점** (반경을 넓히지 않는다)
 *   비고2   2개 이상이면 가~라 4개 항목이 **가장 많이** 일치하는 사업장. 동률이면 그 평균(EX3)
 *
 * 청약홈은 주상복합을 가리지 않는다 — ③은 아파트 계열로 보고, 가목(주택유형) 일치는 본건 값으로 따로 센다.
 */
export function presaleCandidates(items = [], site = {}, { officetel = false } = {}) {
  const kindOK = (a) => (officetel
    ? ['오피스텔', '도시형생활주택'].includes(a.kind)
    : (a.kind ?? '아파트') === '아파트');
  const siteRows = items.filter(a => a.isSite);
  const notSite = items.filter(a => !a.isSite);
  const typed = notSite.filter(kindOK);
  const sale = typed.filter(isSale);
  const fresh = sale.filter(a => a.timing === TIMING.FRESH);
  const ongoing = sale.filter(a => a.timing === TIMING.ONGOING);
  const done = sale.filter(a => a.timing === TIMING.DONE);
  const stage = fresh.length ? 'fresh' : ongoing.length ? 'ongoing' : 'none';
  const rows = (stage === 'fresh' ? fresh : stage === 'ongoing' ? ongoing : [])
    .map(a => ({ ...a, sim: similarityOf(site, a) }))
    .sort((x, y) => (y.sim.n - x.sim.n) || ((x.distance ?? 0) - (y.distance ?? 0)));
  return { site: siteRows, notSite, typed, sale, fresh, ongoing, done, stage, rows };
}

/**
 * B 비고2 — 가장 많이 일치하는 곳. 하나뿐이면 그 하나(EX1), 동률이면 전부(EX3 → 평균).
 * @returns {{ ids: string[], top: number|null }}
 */
export function pickPresale(rows = []) {
  if (!rows.length) return { ids: [], top: null };
  const top = Math.max(...rows.map(a => a.sim?.n ?? 0));
  return { ids: rows.filter(a => (a.sim?.n ?? 0) === top).map(a => a.manageNo), top };
}
