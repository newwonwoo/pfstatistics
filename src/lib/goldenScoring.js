import {
  scoreBand, scoreRank, scoreCount, scoreRegionDemand, gradeOf, scoreMatrix,
  scoreFacility, expectedSaleRate, scorePresaleRate, reviewScore, reviewGrade,
} from './scoring.js';

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

  const failures = out.filter(c => c.status !== 'pass');
  return {
    healthy: failures.length === 0,
    summary: `구간표 ${out.length - failures.length}/${out.length} 재현`,
    failures, checks: out,
  };
}
