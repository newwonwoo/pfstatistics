import {
  scoreBand, scoreRank, scoreCount, scoreRegionDemand, gradeOf, scoreMatrix,
  scoreFacility, expectedSaleRate, scorePresaleRate, scoreNearbyPresale,
  reviewScore, reviewGrade, districtFloor, scoreAverage, scoreSheet,
} from './scoring.js';
import { nearbySpecial, isFirstInDistrict } from './manual.js';
import { compareSummary } from './compare.js';

/**
 * **구간표 골든 재현 검사.**
 *
 * 원천 수집만 감시하면 반쪽이다 — 값은 맞게 받아와도 **구간표가 틀리면** 점수가 조용히 틀린다.
 * 그래서 골든 표본(탄벌A지구)의 실제 평가표 캡쳐에 적힌 숫자를
 * **이 앱의 판정 함수로 다시 내어** 한 줄씩 대조한다.
 *
 * 정답지는 `docs/evidence-samples/` 의 캡쳐 11장이다(CLAUDE.md 「골든 데이터셋」).
 * 한 줄이라도 어긋나면 그 구간표를 건드린 커밋이 규정을 벗어난 것이다.
 */
export function checkScoringGolden() {
  const out = [];
  const chk = (name, got, want) =>
    out.push({ name, actual: String(got), expected: String(want), status: String(got) === String(want) ? 'pass' : 'MISMATCH' });

  /* 교통환경 — 지하철역 부재 1점 · 6차선 왕복도로 4점 → (1+4)/2 = 2.5 → 보통 → 3점 */
  chk('6차선 왕복도로 250m 왕복6차선', scoreFacility('6차선 왕복도로', { distance: 250, lanes: 6 })?.score, 4);
  chk('교통환경 평균 2.5 → 대표점수', gradeOf(2.5)?.score, 3);
  /* 주거편의 — (1+2)/2 = 1.5 → 열악 → 2점 */
  chk('주거편의 평균 1.5 → 대표점수', gradeOf(1.5)?.score, 2);

  chk('브랜드경쟁력 17위', scoreRank('브랜드경쟁력', 17)?.score, 4);
  chk('주택담보대출금리 CD 3.12%', scoreBand('주택담보대출금리', 3.12)?.score, 3);
  chk('지역경쟁력 0.341%', scoreBand('지역경쟁력', 0.341)?.score, 4);
  chk('소비심리지수 125.1', scoreBand('소비심리지수', 125.1)?.score, 12);
  chk('지역미분양 93 ÷ 178,187', scoreBand('지역미분양', (93 / 178187) * 100)?.score, 15);
  chk('지역수요 주택보급률 99.4%', scoreBand('지역수요:주택보급률', 99.4)?.score, 4);
  chk('지역수요 인구유입요인 0개', scoreCount('지역수요:인구유입요인', 0)?.score, 1);
  chk('지역수요 (4+1)/2 = 2.5', scoreRegionDemand(99.4, 0)?.score, 3);

  chk('분양가경쟁력 A 56 · 지수 104.4', scoreMatrix('분양가경쟁력', 104.4, 56)?.score, 9);
  chk('초기예상분양률 A 56 + 9 = 65점', expectedSaleRate(65, { series: '주택' })?.rate, 70);
  chk('초기분양률 배점 70%', scorePresaleRate(70)?.score, 16);

  /* 심사평점표 — 골든 재현(CLAUDE.md) : 합계 84 · 감점 1 → 83 → 2등급 0.697% */
  const rv = reviewScore({
    manual: {
      '사업수익률': 10.64,
      '누적DSCR분석값': 1.05,
      '자기자금 투입규모의 적정성': 4.51,
      '시공능력평가액순위': 17,
      '신용평가등급': 'AAA, AA',
      '자기자본대비 PF보증 잔액 비율': 45.6,
      __deduct: 1,
    },
    rate: 70,
  });
  const by = Object.fromEntries((rv?.groups ?? []).flatMap(g => g.items).map(i => [i.id, i.score]));
  chk('심사 사업수익률 10.64%', by['사업수익률'], 16);
  chk('심사 초기분양률 70%', by['초기분양률'], 16);
  chk('심사 누적DSCR 1.05', by['누적DSCR분석값'], 3);
  chk('심사 자기자금 4.51%', by['자기자금 투입규모의 적정성'], 14);
  chk('심사 시공순위 17위', by['시공능력평가액순위'], 15);
  chk('심사 신용등급 AAA·AA', by['신용평가등급'], 15);
  chk('심사 PF보증잔액비율 45.6%', by['자기자본대비 PF보증 잔액 비율'], 5);
  chk('심사 합계', rv?.total, 84);
  chk('심사 종합평점 (감점 1)', rv?.net, 83);
  chk('심사등급', reviewGrade(83)?.grade, '2등급');
  chk('보증료율', reviewGrade(83)?.fee, 0.697);

  /*
    ── 「초기분양률」 세 곳을 **경계값까지 전수로** 확인한다 ──────────────
    말이 같아 계속 헷갈리는 자리다(사용자 지적 2026-09-18). 한 점만 맞혀서는
    "규정대로 세팅됐다" 고 말할 수 없으므로 급간 경계를 하나씩 다 밟는다.
      ① 인근아파트 초기 분양률(10)  옆 단지를 조사해 넣는 값
      ② 초기예상분양률(%)           종합평가 점수 → 급간표
      ③ 초기분양률(22)              ②를 배점으로
  */
  for (const [rate, want] of [[95, 10], [90, 10], [85, 8], [80, 8], [75, 6], [70, 6],
    [65, 4], [60, 4], [55, 2], [0, 2]]) {
    chk(`① 인근 초기분양률 ${rate}%`, scoreNearbyPresale(rate)?.score, want);
  }
  chk('① 특례 수용·환지 최초분양', scoreNearbyPresale(null, 'firstInDistrict')?.score, 4);
  chk('① 특례 적용아파트 미존재', scoreNearbyPresale(null, 'none')?.score, 2);

  /* 수용·환지 사업지구 특례 — 지구면적별 등급 하한 (경계값 전수) */
  for (const [area, want] of [[5000000, 5], [4999999, 4], [1000000, 4], [999999, 3], [500000, 3], [499999, 2]]) {
    chk(`사업지구 특례 ${area.toLocaleString('ko-KR')}㎡`, districtFloor({ status: 'yes', area })?.score, want);
  }
  /* 인근아파트 초기분양률 특례 — 사업지구 안 **이고** 최초 분양일 때만 4점 */
  chk('최초분양 특례 — 지구 안 · 최초', nearbySpecial({ first: true }, { status: 'yes' }), 'firstInDistrict');
  chk('최초분양 특례 — 지구 안 · 최초 아님', nearbySpecial({ first: false }, { status: 'yes' }), null);
  chk('최초분양 특례 — 지구 밖이면 최초라 답했어도 없음', nearbySpecial({ first: true }, { status: 'no' }), null);
  chk('최초분양 특례 — 적용 아파트 없음은 그대로', nearbySpecial({ special: 'none' }, { status: 'no' }), 'none');
  chk('사업지구 특례 — 해당 없음이면 하한 없음', districtFloor({ status: 'no', area: 9000000 }), null);
  {
    /* 골든 교통환경(지하철역 부재 1 + 6차선 4 → 보통 3점) 을 500만㎡ 지구에 두면 매우양호 5점, 30만㎡ 면 그대로 3점 */
    const facilities = { facilities: { 지하철역: { sheet: '교통환경', items: [], nearest: null, count: 0 } } };
    const road = { '6차선 왕복도로': { name: '골든', distance: 250, lanes: 6 } };
    chk('사업지구 특례 교통환경 500만㎡ → 올림',
      scoreAverage('교통환경', { facilities, manual: { ...road, 사업지구: { status: 'yes', area: 5000000 } } })?.score, 5);
    chk('사업지구 특례 교통환경 30만㎡ → 그대로',
      scoreAverage('교통환경', { facilities, manual: { ...road, 사업지구: { status: 'yes', area: 300000 } } })?.score, 3);
  }

  {
    /* 교육환경에도 같은 단서가 있다(가이드북 p.47 원문 2026-09-29) — 1km 안 초등학교만 = 매우열악 1점 */
    const f = (d) => (d == null
      ? { sheet: '교육환경', items: [], nearest: null, count: 0 }
      : { sheet: '교육환경', items: [{ distance: d }], nearest: { distance: d }, count: 1 });
    const facilities = { facilities: { 초등학교: f(300), 중학교: f(null), 고등학교: f(null) } };
    chk('지구면적 교육환경 — 사업지구 밖 그대로', scoreSheet('교육환경', facilities, {})?.score, 1);
    chk('지구면적 교육환경 100만㎡ → 양호 4점으로 올림',
      scoreSheet('교육환경', facilities, { 사업지구: { status: 'yes', area: 1000000 } })?.score, 4);
    chk('지구면적 교육환경 30만㎡ → 열악 2점으로 올림',
      scoreSheet('교육환경', facilities, { 사업지구: { status: 'yes', area: 300000 } })?.score, 2);
  }
  {
    /*
      분양가경쟁력 원문(2026-09-29) — 「사업지구내 최초 분양사업인 경우에는 분양가격지수 100을 적용」.
      본건 9,000,000 ÷ 비교 6,000,000 = 150(110↑) → A 56 이면 3점. 최초 분양이면 100(100~105) → 9점.
    */
    const cmp = { site: { unitPrice: 9000000 }, picked: ['a'],
      data: { items: [{ manageNo: 'a', kind: '아파트', weightedSupply: 6000000 }] } };
    chk('분양가격지수 실측 150 → 3점', compareSummary(cmp, 56)?.sc?.score, 3);
    chk('분양가격지수 지구 내 최초 분양 → 100', compareSummary(cmp, 56, { firstInDistrict: true })?.index, 100);
    chk('분양가격지수 100 · A 56 → 9점', compareSummary(cmp, 56, { firstInDistrict: true })?.sc?.score, 9);
    chk('최초 분양 답 — 주소 아래 답이 우선', isFirstInDistrict({ status: 'yes', first: false }, { first: true }), false);
    chk('최초 분양 답 — 옛 보관본(초기분양률 칸) 물려 읽기', isFirstInDistrict({ status: 'yes' }, { first: true }), true);
    chk('최초 분양 답 — 지구 밖이면 없음', isFirstInDistrict({ status: 'no', first: true }, {}), false);
  }

  for (const [t2, want] of [[96, 100], [95, 100], [90, 90], [85, 90], [80, 80], [75, 80],
    [70, 70], [65, 70], [60, 60], [55, 60], [50, 50], [45, 50], [40, 40], [35, 40], [34, 30]]) {
    chk(`② 초기예상분양률 종합 ${t2}점`, expectedSaleRate(t2, { series: '주택' })?.rate, want);
  }
  /* 오피스텔·도시형은 같은 점수에서 한 칸(10%p) 낮다 — 맨 아랫줄은 파생값이라 여기서 뺀다 */
  for (const [t2, want] of [[95, 90], [85, 80], [75, 70], [65, 60], [55, 50], [45, 40], [35, 30]]) {
    chk(`② 오피스텔 종합 ${t2}점 (10%p 낮다)`, expectedSaleRate(t2, { series: '오피스텔' })?.rate, want);
  }
  chk('② 100세대 미만 60% 상한', expectedSaleRate(95, { series: '주택', households: 99 })?.rate, 60);
  chk('② 100세대면 상한 없음', expectedSaleRate(95, { series: '주택', households: 100 })?.rate, 100);

  for (const [pc, want] of [[100, 22], [95, 21], [90, 21], [85, 19], [80, 19], [75, 16],
    [70, 16], [65, 13], [60, 13], [55, 10], [50, 10], [49, 0], [30, 0]]) {
    chk(`③ 초기분양률 배점 ${pc}%`, scorePresaleRate(pc)?.score, want);
  }

  /* 0점 처리 연동 — 초기분양률 50% 미만 또는 누적DSCR 1.00 미만이면 두 항목 모두 0점 */
  const baseManual = {
    '사업수익률': 10.64, '자기자금 투입규모의 적정성': 4.51, '시공능력평가액순위': 17,
    '신용평가등급': 'AAA, AA', '자기자본대비 PF보증 잔액 비율': 45.6,
  };
  const pick = (rv2, id) => Object.fromEntries((rv2?.groups ?? []).flatMap(g => g.items).map(i => [i.id, i.score]))[id];
  const zRate = reviewScore({ manual: { ...baseManual, '누적DSCR분석값': 1.05 }, rate: 49 });
  chk('0점규칙 ② 49% → ③ 0점', pick(zRate, '초기분양률'), 0);
  chk('0점규칙 ② 49% → DSCR 0점', pick(zRate, '누적DSCR분석값'), 0);
  const zDscr = reviewScore({ manual: { ...baseManual, '누적DSCR분석값': 0.99 }, rate: 70 });
  chk('0점규칙 DSCR 0.99 → ③ 0점', pick(zDscr, '초기분양률'), 0);
  chk('0점규칙 DSCR 0.99 → DSCR 0점', pick(zDscr, '누적DSCR분석값'), 0);

  const failures = out.filter(c => c.status !== 'pass');
  return {
    healthy: failures.length === 0,
    summary: `구간표 ${out.length - failures.length}/${out.length} 재현`,
    failures, checks: out,
  };
}
