import { scoreMatrix, expectedSaleRate } from './scoring.js';

/**
 * 비교사업장 탭이 만든 상태(`compare`)에서 **분양가경쟁력 점수**까지 한 번에 낸다.
 *
 * 화면(CompareView)과 초기예상분양률 탭이 같은 숫자를 써야 하므로 여기 한 곳에만 둔다 —
 * 양쪽에 같은 식을 복사해 두면 한쪽만 고쳐져 조용히 갈린다.
 */

/** 민간임대 금액은 임대보증금이라 분양가와 자릿수가 다르다 — 평균에 절대 섞지 않는다 */
export const isSale = (a) => a.priceKind !== 'deposit';

/** 단지 대표단가 — 면적기준(공급/전용) × 산식(가중/단순) */
export const priceOf = (a, { areaBasis = 'supply', mode = 'weighted' } = {}) =>
  (areaBasis === 'supply'
    ? (mode === 'weighted' ? a.weightedSupply : a.simpleSupply)
    : (mode === 'weighted' ? a.weighted : a.simple));

/**
 * @param {object} v  page.js 가 들고 있는 `compare` 상태 그대로
 * @returns {{avg, sitePrice, index, sc, chosen}}
 */
export function compareSummary(v, excl = null) {
  const {
    data = null, picked = [], kinds = ['아파트'],
    mode = 'weighted', areaBasis = 'supply', site = {},
  } = v ?? {};

  const chosen = (data?.items ?? []).filter(
    a => kinds.includes(a.kind ?? '아파트') && picked.includes(a.manageNo));

  const vals = chosen.filter(isSale).map(a => priceOf(a, { areaBasis, mode })).filter(x => x != null);
  const avg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;

  const sitePrice = Number(site.unitPrice) || null;
  const index = sitePrice && avg ? (sitePrice / avg) * 100 : null;
  /* A(제외 항목 점수)는 **수기입력 탭**이 단일 지점으로 만든다 — 여기서 또 받지 않는다 */
  const sc = scoreMatrix('분양가경쟁력', index ?? NaN, excl == null ? NaN : Number(excl));

  return { avg, sitePrice, index, sc, chosen };
}

/**
 * 종합평가 점수 = 분양가격지수 제외 항목 점수(A) + 분양가경쟁력 점수.
 *
 * A 는 이 앱이 계산하지 않는다 — 자동수집 못 하는 항목(규모및배치·평형구성·인근초기분양률)이
 * 그 안에 들어 있어 비교사업장 탭의 [본건 제원] 에서 입력받는다.
 */
export function totalScoreOf(compare, excl = null) {
  const cmp = compareSummary(compare, excl);
  const compScore = cmp.sc && !cmp.sc.pending ? cmp.sc.score : null;
  return { cmp, compScore, excl, total: excl != null && compScore != null ? excl + compScore : null };
}

/**
 * 초기예상분양률 — 평가표의 결론.
 * 초기예상분양률 탭과 심사평점표 탭이 **같은 숫자**를 써야 하므로 여기 한 곳에서 낸다.
 */
export function expectedRateOf(compare, rate, excl = null) {
  const { total, ...rest } = totalScoreOf(compare, excl);
  const res = expectedSaleRate(total ?? NaN, {
    series: rate?.series ?? '주택',
    households: rate?.households ?? null,
  });
  return { ...rest, total, res };
}
