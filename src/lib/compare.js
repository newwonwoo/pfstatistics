import { scoreMatrix, expectedSaleRate } from './scoring.js';
import { isFirstInDistrict } from './manual.js';

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
export function compareSummary(v, excl = null, { firstInDistrict = false } = {}) {
  const {
    data = null, picked = [], kinds = ['아파트'],
    mode = 'weighted', areaBasis = 'supply', site = {},
  } = v ?? {};

  const chosen = (data?.items ?? []).filter(
    a => kinds.includes(a.kind ?? '아파트') && picked.includes(a.manageNo));

  const vals = chosen.filter(isSale).map(a => priceOf(a, { areaBasis, mode })).filter(x => x != null);
  const avg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;

  const sitePrice = Number(site.unitPrice) || null;
  /*
    가이드북 분양가경쟁력 원문(2026-09-29 수령) — 「다만, 수용(또는 사용)방식 또는 환지방식에 의해
    개발·조성되는 사업지구내 최초 분양사업인 경우에는 **분양가격지수 100을 적용**」.
    그때는 비교단지 평균과 무관하게 100 이다. 평균은 참고로 그대로 돌려준다(적정분양가는 여전히 비교단지로 낸다).
  */
  const measured = sitePrice && avg ? (sitePrice / avg) * 100 : null;
  const index = firstInDistrict ? 100 : measured;
  /* A(제외 항목 점수)는 **수기입력 탭**이 단일 지점으로 만든다 — 여기서 또 받지 않는다 */
  const sc = scoreMatrix('분양가경쟁력', index ?? NaN, excl == null ? NaN : Number(excl));

  return { avg, sitePrice, index, measured, indexBasis: firstInDistrict ? 'firstInDistrict' : 'measured', sc, chosen };
}

/** 사업지구 답(주소 아래) + 보관본의 옛 답(초기분양률 칸)으로 최초 분양 여부를 정해 넘긴다 */
export const firstOpts = (district, sheetInput) =>
  ({ firstInDistrict: isFirstInDistrict(district, sheetInput?.인근초기분양률) });

/**
 * 종합평가 점수 = 분양가격지수 제외 항목 점수(A) + 분양가경쟁력 점수.
 *
 * A 는 **수기입력 탭**이 단일 지점으로 만든다(`src/lib/manual.js`) — 자동수집분 7개 +
 * 값을 넣으면 구간표가 점수를 내는 3개 + 구간표 미수령 2개. 여기서 또 받지 않는다.
 */
export function totalScoreOf(compare, excl = null, opts = {}) {
  const cmp = compareSummary(compare, excl, opts);
  const compScore = cmp.sc && !cmp.sc.pending ? cmp.sc.score : null;
  return { cmp, compScore, excl, total: excl != null && compScore != null ? excl + compScore : null };
}

/**
 * 초기예상분양률 — 평가표의 결론.
 * 초기예상분양률 탭과 심사평점표 탭이 **같은 숫자**를 써야 하므로 여기 한 곳에서 낸다.
 */
export function expectedRateOf(compare, rate, excl = null, sheetInput = null, district = null) {
  const { total, ...rest } = totalScoreOf(compare, excl, firstOpts(district, sheetInput));
  const res = expectedSaleRate(total ?? NaN, {
    series: rate?.series ?? '주택',
    /*
      총 세대수는 **수기입력 탭의 [규모 및 배치]** 가 단일 지점이다.
      호출부마다 따로 넘기면 어떤 탭에서는 60% 상한이 걸리고 어떤 탭에서는 안 걸린다.
    */
    households: sheetInput?.규모및배치?.총세대수 ?? rate?.households ?? null,
  });
  return { ...rest, total, res };
}
