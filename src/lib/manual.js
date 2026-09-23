import {
  scoreAverage, scoreSheet, scoreRank, scoreBand, scoreRegionDemand,
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

/**
 * 구간표를 못 받아 점수를 직접 받는 항목.
 * **2026-09-17 로 비었다** — 지역미분양·지역수요 구간표를 받아 자동으로 넘겼다.
 * 새 항목이 생기면 여기에 넣고, 배점을 아는 것만 적는다(모르면 null).
 */
export const PENDING_ITEMS = [];

/** 아직 안 된 항목이 어디서 채워지는지 — 화면에 갈 곳을 적어준다 */
const GOTO = {
  '교통환경': '[교통환경] 탭에서 시설을 수집하세요',
  '주거편의': '[주거편의] 탭에서 시설을 수집하세요',
  '교육환경': '[교육환경] 탭에서 시설을 수집하세요',
  '브랜드경쟁력': '[통계 수집] 을 누르세요 — 시공능력평가순위가 필요합니다',
  '주택담보대출금리': '[통계 수집] 을 누르세요 — CD(91일) 금리가 필요합니다',
  '지역경쟁력': '[통계 수집] 을 누르세요 — KB 매매지수 증감률이 필요합니다',
  '부동산시장 소비심리지수': '[통계 수집] 을 누르세요 — 소비심리지수가 필요합니다',
  '지역미분양': '[통계 수집] 을 누르세요 — 미분양주택수·주민등록세대수가 필요합니다',
  '지역수요': '[통계 수집] 을 누르세요 — 주택보급률이 필요합니다',
};

export function manualSummary({ sheetInput = {}, data = null, facilities = null, manual = null } = {}) {
  const val = (id) => (data?.results ?? []).find(r => r.indicatorId === id && r.ok)?.value ?? null;
  const num = (sc) => (sc && !sc.pending && Number.isFinite(sc.score) ? sc.score : null);

  const rank = val('construction_capability_rank');
  const cd = val('cd_rate_91');
  const loan = cd == null ? null : scoreBand('주택담보대출금리', cd);
  /* 2026-09-16 구간표 수령 — 수집한 값에서 바로 점수가 난다(전에는 점수를 직접 받았다) */
  const kb = val('kb_apt_price_index');
  const cs = val('consumer_sentiment');
  /*
   * **지역미분양은 두 값의 비율이다**(2026-09-17 구간표 수령).
   * 원문 산식 : 해당지역 (미분양주택수 ÷ 주민등록세대수) × 100.
   * 둘 다 이 앱이 이미 수집하므로 점수를 손으로 넣지 않는다.
   * 골든 검산: 93 ÷ 178,187 × 100 = 0.052% → 0.1% 미만 → 15점.
   */
  const unsold = val('unsold_housing');
  const households = val('resident_households');
  /*
    **분자·분모의 기준시점이 같아야 한다**(사용자 확정 2026-09-18).
    두 원천은 공표 시차가 다르다 — 주민등록세대수(KOSIS)가 미분양(통계누리)보다 한 달쯤 앞선다.
    시점이 어긋난 채로 나눈 값은 검산이 안 되므로 **점수를 내지 않고 사유를 남긴다.**
  */
  const perOf = (id) => {
    const r = (data?.results ?? []).find(x => x.indicatorId === id && x.ok);
    return r ? String(r.period ?? '') : null;
  };
  const pUnsold = perOf('unsold_housing');
  const pHouseholds = perOf('resident_households');
  const periodMismatch = !!(pUnsold && pHouseholds && pUnsold !== pHouseholds);
  const unsoldRatio = (!periodMismatch && Number.isFinite(Number(unsold)) && Number(households) > 0)
    ? (Number(unsold) / Number(households)) * 100 : null;
  /* 인구유입요인(신도시·혁신도시·기업도시·산업단지 등)은 원천이 없다 — 실무자가 개수를 넣는다 */
  const supplyRatio = val('housing_supply_ratio');
  const inflow = sheetInput.지역수요?.inflow;

  /* ① 원천에서 자동으로 나는 것 */
  const auto = [
    { id: '교통환경', max: 5, sc: facilities ? scoreAverage('교통환경', { facilities, manual }) : null },
    { id: '주거편의', max: 5, sc: facilities ? scoreAverage('주거편의', { facilities, manual }) : null },
    { id: '교육환경', max: 5, sc: facilities ? scoreSheet('교육환경', facilities) : null },
    { id: '브랜드경쟁력', max: 5, sc: rank == null ? null : scoreRank('브랜드경쟁력', rank) },
    { id: '주택담보대출금리', max: 5, sc: loan },
    { id: '지역경쟁력', max: 5, sc: kb == null ? null : scoreBand('지역경쟁력', kb) },
    { id: '부동산시장 소비심리지수', max: 15, sc: cs == null ? null : scoreBand('소비심리지수', cs) },
    { id: '지역미분양', max: 15,
      sc: periodMismatch
        ? { pending: true, text: `기준시점이 다릅니다 — 미분양 ${pUnsold} · 주민등록세대수 ${pHouseholds}. 같은 달로 맞춰야 비율이 성립합니다` }
        : unsoldRatio == null ? null : scoreBand('지역미분양', unsoldRatio) },
    /* 지역수요만 반쪽이 수기다 — 주택보급률은 자동, 인구유입요인은 개수를 받는다 */
    { id: '지역수요', max: 5, sc: supplyRatio == null ? null : scoreRegionDemand(supplyRatio, inflow) },
  ].map(r => ({
    ...r, kind: 'auto', score: num(r.sc),
    /*
      교통환경·주거편의는 **항목마다 따로 판정하고 그 평균으로 등급을 낸다**(사용자 확인).
      그래서 한 항목이 아직 판정 전이면 평균도 아직 확정이 아니다 —
      `scoreAverage` 가 그 사실을 `caution` 으로 돌려주는데 여기서 버리고 있었다.
      A 합산표는 이 점수가 분양률·보증료율까지 흘러가는 **마지막 관문**이라 반드시 같이 적는다.
    */
    caution: r.sc?.caution ?? null,
    /* "수집 대기" 만 적으면 어디서 수집해야 하는지 알 수 없다 — 갈 곳을 적는다 */
    why: r.sc?.pending ? r.sc.text
      : r.sc == null ? (GOTO[r.id] ?? '수집 대기')
      : (r.sc.applied != null && r.sc.label
          ? `${r.sc.applied}${r.sc.unit === '%' ? '%' : ''} · ${r.sc.label}${r.sc.grade ? ` · ${r.sc.grade}` : ''}`
          /* 교육환경처럼 `text` 가 없는 구간표도 있다 — undefined 를 화면에 찍지 않는다 */
          : (r.sc.text ?? (r.sc.label ? `${r.sc.score}점 · ${r.sc.label}` : '판정 완료'))),
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
  /* 점수는 났지만 **판정 전 기본점수가 섞인** 항목 — A 는 나오되 확정으로 읽으면 안 된다 */
  const provisional = rows.filter(r => r.caution).map(r => ({ id: r.id, text: r.caution }));
  const sum = rows.reduce((s, r) => s + (r.score ?? 0), 0);

  /* 직접 넣은 A 가 있으면 그것을 쓴다 — 내부망 평가표 값을 그대로 넣고 싶을 때가 있다 */
  const ovRaw = sheetInput.exclOverride;
  const ov = Number(ovRaw);
  const override = Number.isFinite(ov) && String(ovRaw ?? '').trim() !== '' ? ov : null;

  return {
    rows, auto, formed, typed,
    sum, missing, provisional,
    override,
    excl: override ?? (missing.length ? null : sum),
    source: override != null ? 'override' : (missing.length ? null : 'computed'),
  };
}

export const unitMixTable = () => tableOf('평형구성');
export const scaleTable = () => tableOf('규모및배치');
export const nearbyTable = () => tableOf('인근초기분양률');
