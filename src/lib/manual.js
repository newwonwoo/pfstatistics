import {
  scoreAverage, scoreSheet, scoreRank, scoreBand,
  scoreWeighted, scoreUnitMix, scoreNearbyPresale, tableOf,
} from './scoring.js';

/**
 * 분양가격지수 **제외** 항목 점수 (A) 를 한자리에서 만든다.
 *
 * A = 종합평가 점수 − 분양가경쟁력 점수. 전에는 내부망 평가표를 보고 손으로 옮겨 적었는데,
 * 항목 대부분을 이 앱이 이미 알고 있다 —
 *   · 자동 : 교통환경 · 주거편의 · 교육환경 · 브랜드경쟁력 · 주택담보대출금리   (원천 수집)
 *   · 수기+구간표 : 규모 및 배치 · 평형구성 · 인근아파트 초기 분양률          (값만 넣으면 점수가 난다)
 *   · 수기 : 구간표를 아직 못 받은 항목                                    (점수를 직접 넣는다)
 *
 * **한 항목이라도 비면 A 를 확정하지 않는다** — 부분 합계를 A 로 쓰면 분양률이 통째로 낮아진다.
 */

/** 구간표를 못 받아 점수를 직접 받는 항목. 배점을 아는 것만 적는다(모르면 null). */
export const PENDING_ITEMS = [
  { id: '지역미분양', max: null, note: '미분양비율 — 구간표 미수령' },
  { id: '지역수요', max: null, note: '주택보급률 · 인구유입요인 — 구간표 미수령' },
  { id: '지역경쟁력', max: null, note: '매매가격종합지수 증감률 — 상위 구간 미수령' },
  { id: '부동산시장 소비심리지수', max: 15, note: '주택매매시장 소비심리지수 — 구간표 미수령 (골든 125.1 → 110~130미만 → 12점)' },
];

/** 아직 안 된 항목이 어디서 채워지는지 — 화면에 갈 곳을 적어준다 */
const GOTO = {
  '교통환경': '[교통환경] 탭에서 시설을 수집하세요',
  '주거편의': '[주거편의] 탭에서 시설을 수집하세요',
  '교육환경': '[교육환경] 탭에서 시설을 수집하세요',
  '브랜드경쟁력': '[통계 수집] 을 누르세요 — 시공능력평가순위가 필요합니다',
  '주택담보대출금리': '[통계 수집] 을 누르세요 — CD(91일) 금리가 필요합니다',
};

export function manualSummary({ sheetInput = {}, data = null, facilities = null, manual = null } = {}) {
  const val = (id) => (data?.results ?? []).find(r => r.indicatorId === id && r.ok)?.value ?? null;
  const num = (sc) => (sc && !sc.pending && Number.isFinite(sc.score) ? sc.score : null);

  const rank = val('construction_capability_rank');
  const cd = val('cd_rate_91');
  const loan = cd == null ? null : scoreBand('주택담보대출금리', cd);

  /* ① 원천에서 자동으로 나는 것 */
  const auto = [
    { id: '교통환경', max: 5, sc: facilities ? scoreAverage('교통환경', { facilities, manual }) : null },
    { id: '주거편의', max: 5, sc: facilities ? scoreAverage('주거편의', { facilities, manual }) : null },
    { id: '교육환경', max: 5, sc: facilities ? scoreSheet('교육환경', facilities) : null },
    { id: '브랜드경쟁력', max: 5, sc: rank == null ? null : scoreRank('브랜드경쟁력', rank) },
    { id: '주택담보대출금리', max: 5, sc: loan },
  ].map(r => ({
    ...r, kind: 'auto', score: num(r.sc),
    /* "수집 대기" 만 적으면 어디서 수집해야 하는지 알 수 없다 — 갈 곳을 적는다 */
    why: r.sc?.pending ? r.sc.text : (r.sc?.text ?? GOTO[r.id] ?? '수집 대기'),
  }));

  /* ② 값을 넣으면 구간표가 점수를 내는 것 */
  const scale = scoreWeighted('규모및배치', sheetInput.규모및배치 ?? {});
  const mix = scoreUnitMix(sheetInput.평형구성 ?? {});
  const nearby = scoreNearbyPresale(sheetInput.인근초기분양률?.rate, sheetInput.인근초기분양률?.special || null);
  const formed = [
    { id: '규모 및 배치', max: 5, kind: 'form', sc: scale, score: num(scale), why: scale?.pending ? scale.text : `가중평균 ${scale?.avg} · ${scale?.label}` },
    { id: '평형구성', max: 5, kind: 'form', sc: mix, score: num(mix), why: mix?.pending ? mix.text : `가중평균 ${mix?.value} · ${mix?.label}` },
    { id: '인근아파트 초기 분양률', max: 10, kind: 'form', sc: nearby, score: num(nearby), why: nearby?.pending ? nearby.text : `${nearby?.text} · ${nearby?.label}` },
  ];

  /* ③ 구간표를 못 받아 점수를 직접 받는 것 */
  const typed = PENDING_ITEMS.map(it => {
    const raw = sheetInput.점수?.[it.id];
    const n = raw === '' || raw == null ? null : Number(raw);
    return { ...it, kind: 'typed', score: Number.isFinite(n) ? n : null, why: it.note };
  });

  const rows = [...auto, ...formed, ...typed];
  const missing = rows.filter(r => r.score == null).map(r => r.id);
  const sum = rows.reduce((s, r) => s + (r.score ?? 0), 0);

  /* 직접 넣은 A 가 있으면 그것을 쓴다 — 내부망 평가표 값을 그대로 넣고 싶을 때가 있다 */
  const ovRaw = sheetInput.exclOverride;
  const ov = Number(ovRaw);
  const override = Number.isFinite(ov) && String(ovRaw ?? '').trim() !== '' ? ov : null;

  return {
    rows, auto, formed, typed,
    sum, missing,
    override,
    excl: override ?? (missing.length ? null : sum),
    source: override != null ? 'override' : (missing.length ? null : 'computed'),
  };
}

export const unitMixTable = () => tableOf('평형구성');
export const scaleTable = () => tableOf('규모및배치');
export const nearbyTable = () => tableOf('인근초기분양률');
