/**
 * 심사 평가표 시트 정의.
 *
 * 캡쳐 11장에서 시트별 컬럼 구성을 그대로 옮겼다.
 * 엑셀 하단 탭 순서도 캡쳐와 동일하게 유지한다 — 실무자가 눈으로 찾는 순서이기 때문이다.
 *
 * 구간표를 받은 항목은 시트에도 평가기준·평가점수·평가를 찍는다 —
 * A 합산표(manual.js)에만 찍고 시트를 비워두면 실무자가 옮겨 적을 칸이 빈다.
 */

import { scoreRank, scoreBand, scoreCount, scoreRegionDemand } from '../src/lib/scoring';

/** 이 앱이 실제로 수집하는 시트만 남긴다. 수기입력 시트(표지·종합·규모및배치·평형구성)는 제외. */
export const SHEETS = [
  { id: '교통환경',     label: '교통환경',     kind: 'poi',  stage: '자료수집', map: true },
  { id: '주거편의',     label: '주거편의',     kind: 'poi',  stage: '자료수집', map: true },
  { id: '교육환경',     label: '교육환경',     kind: 'poi',  stage: '자료수집', map: true },
  /* 탭 이름에 '분양가' 를 넣는다 — 실무자가 찾는 말은 '분양가 적정성' 이다. 시트명(id)은 그대로 둔다 */
  { id: '비교사업장',   label: '비교사업장 · 분양가', kind: 'comp', stage: '자료수집', map: true },
  { id: '지역미분양',   label: '지역미분양',   kind: 'stat', stage: '자료수집' },
  { id: '지역수요',     label: '지역수요',     kind: 'stat', stage: '자료수집' },
  { id: '지역경쟁력',   label: '지역경쟁력',   kind: 'stat', stage: '자료수집' },
  { id: '브랜드경쟁력', label: '브랜드경쟁력', kind: 'stat', stage: '자료수집' },
  { id: '부동산시장',   label: '부동산시장',   kind: 'stat', stage: '자료수집' },
  /* 평가표의 결론 — 다른 시트의 항목 점수가 모여 여기서 분양률이 나온다. 맨 뒤에 둔다 */
  /* 구간표가 있는 항목은 값만 받아 점수를 낸다 — 남는 수기입력은 구간표 미수령분뿐 */
  { id: '수기입력', label: '수기입력', kind: 'manual', stage: '수기입력' },
  { id: '초기예상분양률', label: '초기예상분양률', kind: 'rate', tone: 'summary', stage: '분양률 산정' },
  /* 최종 산출물 — 초기예상분양률이 여기서 점수가 되어 종합평점으로 들어간다 */
  { id: '심사평점표', label: '심사평점표', kind: 'review', tone: 'summary', stage: '심사평점' },
];

const n = (v, d = 0) =>
  v == null || v === '' ? null : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * 시트별 평가표 스펙.
 * cells 는 캡쳐의 표를 그대로 재현한다. value 는 수집 결과에서 뽑고,
 * 미수집이면 null 을 돌려 화면에서 "수집 대기"로 보이게 한다.
 */
export function buildSheet(sheetId, { byId, region, period, company, sheetInput = {} }) {
  const g = (id) => byId[id];
  const val = (id) => (g(id)?.ok ? g(id).value : null);
  /*
    **지표마다 채택한 시점이 다르다**(2026-09-23). 전에는 전 지표가 조회월 하나에 묶여 있었는데,
    이제 각 원천의 최신을 쓰므로(미분양·주민등록세대수만 조회월 고정) 시트가 그 달을 직접 적어야 한다.
  */
  const per = (id) => (g(id)?.ok ? String(g(id).period ?? '') : '');

  switch (sheetId) {
    case '지역미분양': {
      const unsold = val('unsold_housing');
      const hh = val('resident_households');
      /*
        **두 값의 기준시점이 같아야 비율이 성립한다**(사용자 확정 2026-09-18).
        원문 산식은 「해당지역 (미분양주택수 ÷ 주민등록세대수) × 100」 인데
        두 원천은 공표 시차가 다르다 — 주민등록세대수(KOSIS)가 미분양(통계누리)보다 한 달쯤 앞선다.
        시점이 어긋난 분자·분모로 낸 비율은 검산이 안 되므로, **다르면 점수를 내지 않고 그 사실을 적는다.**
        (지금은 앱이 두 지표를 같은 조회월로 요청하므로 정상경로에서는 늘 같다 —
         원천이 그 달을 안 주기 시작하면 조용히 어긋나는 대신 여기서 드러난다)
      */
      const pOf = (id) => (g(id)?.ok ? String(g(id).period ?? '') : null);
      const pUnsold = pOf('unsold_housing');
      const pHh = pOf('resident_households');
      const samePeriod = !pUnsold || !pHh || pUnsold === pHh;
      const ratio = samePeriod && unsold != null && hh ? (unsold / hh) * 100 : null;
      /*
        **구간표를 받아놓고 시트에는 안 찍고 있었다**(2026-09-17 실측).
        A 합산표(manual.js)만 점수를 냈고 시트·엑셀 증빙의 평가기준·평가점수 칸은 빈 채였다 —
        실무자가 눈으로 옮겨 적는 곳이 정작 비어 있었던 셈이다.
      */
      const sc = ratio == null ? null : scoreBand('지역미분양', ratio);
      const filled = sc && !sc.pending;
      return {
        title: '지역미분양',
        subject: region,
        columns: ['평가항목', '지역', '기준시점', '미분양주택수', '주민등록세대수', '미분양비율', '평가기준', '평가점수', '평가'],
        rows: [[
          '지역 미분양비율', region,
          samePeriod ? (pUnsold ?? period) : `미분양 ${pUnsold} · 세대수 ${pHh}`,
          n(unsold), n(hh),
          ratio == null ? null : `${ratio.toFixed(2)}%`,
          filled ? sc.label : '',
          filled ? `${sc.score}점` : '',
          samePeriod ? (filled ? (sc.grade ?? '') : '')
            : '기준시점이 달라 비율을 내지 않았습니다',
        ]],
        formula: '(미분양주택수 / 주민등록세대수) × 100'
          + ' — 두 값은 같은 기준시점이어야 합니다(분자·분모 시점이 다르면 검산이 안 됩니다)',
        evidence: ['unsold_housing', 'resident_households'],
      };
    }
    case '지역수요': {
      /*
        **두 항목을 각각 5점 척도로 매겨 평균 → 등급 → 대표점수**(구간표 원문).
        지역미분양과 같은 이유로 시트에는 점수가 안 찍히고 있었다.
        인구유입요인은 원천이 없어 사람이 센다 — **이 표의 칩에서 바로 고른다**(2026-09-25).
      */
      const supply = val('housing_supply_ratio');
      const inflow = sheetInput?.지역수요?.inflow;
      const a = supply == null ? null : scoreBand('지역수요:주택보급률', supply);
      const b = scoreCount('지역수요:인구유입요인', inflow);
      const sum = supply == null ? null : scoreRegionDemand(supply, inflow);
      const cell = (sc, key) => (sc && !sc.pending ? (sc[key] ?? '') : '');
      return {
        title: '지역수요', subject: region,
        columns: ['평가항목', '지역', '기준시점', '비율', '평가기준', '점수', '평가'],
        rows: [
          ['주택보급률', region.split(' ')[0], per('housing_supply_ratio'),
            supply == null ? null : `${supply}%`,
            cell(a, 'label'), a && !a.pending ? `${a.score}점` : '', cell(a, 'grade')],
          ['인구유입요인', '', '', b && !b.pending ? `${Number(inflow)}개` : null,
            cell(b, 'label'), b && !b.pending ? `${b.score}점` : '', cell(b, 'grade')],
          ['평균점수', '', '', sum && !sum.pending ? String(sum.avg) : null, '',
            sum && !sum.pending ? `${sum.score}점` : '',
            sum && !sum.pending ? `${sum.label} (${sum.text})` : (sum?.text ?? '')],
        ],
        footnote: '※ 주택보급률은 낮을수록 높은 점수(집이 모자란 곳이 수요가 있다) ·'
          + ' 광역시 이상은 구, 시는 시, 시급 미만은 군 단위 · 미고시면 상급 행정구역 ·'
          + ' 인구유입요인(신도시·혁신도시·기업도시·산업단지 등)은 원천이 없어 실무자가 직접 셉니다'
          + ' — 화면에서는 이 표의 「없음 / 1개 / 2개 이상」 에서 고릅니다(2개 이상 5점 · 1개 3점 · 없음 1점)',
        evidence: ['housing_supply_ratio'],
      };
    }
    case '지역경쟁력': {
      /* 구간표 수령(2026-09-16) — 0.6↑5 / 0.3↑4 / 0.1↑3 / -0.06↑2 / 그 밖 1 */
      const kb = val('kb_apt_price_index');
      const sc = kb == null ? null : scoreBand('지역경쟁력', kb);
      return {
        title: '지역경쟁력 (월별 아파트 매매가격 종합지수)', subject: region,
        columns: ['평가항목', '지역', '기준시점', '전월대비 증감률', '평가기준', '평가점수', '평가'],
        rows: [[
          '매매가격 종합지수 전월대비 증감률', region,
          per('kb_apt_price_index'),
          kb == null ? null : `${Number(kb).toFixed(3)}%`,
          sc && !sc.pending ? sc.label : '',
          sc && !sc.pending ? `${sc.score}점` : '',
          sc && !sc.pending ? sc.grade : '',
        ]],
        footnote: '※ 해당지역 고시자료가 없는 경우에는 상급 행정구역(특별시·광역시·시도)의 증감률을 적용',
        evidence: ['kb_apt_price_index'],
      };
    }
    case '브랜드경쟁력': {
      /* 구간표 수령(2026-09-16) — 1~10/11~20/21~50/51~100/101위이하 = 5/4/3/2/1점 */
      const rank = val('construction_capability_rank');
      const sc = rank == null ? null : scoreRank('브랜드경쟁력', rank);
      return {
        title: '브랜드경쟁력 (시공능력평가순위)', subject: region,
        columns: ['상호', '시공능력평가순위', '평가기준', '평가점수', '평가'],
        rows: [[
          company ?? '',
          rank == null ? null : `${rank}위`,
          sc && !sc.pending ? sc.text : '',
          sc && !sc.pending ? `${sc.score}점` : '',
          sc && !sc.pending ? sc.label : '',
        ]],
        footnote: '※ 시공능력평가순위는 토목건축공사업 기준. 시행사와 시공자가 다른 경우 상위등급을 적용하며,'
          + ' 시공자의 모회사가 책임준공 약정하고 모회사 브랜드 사용시에는 모회사의 등급을 적용가능',
        evidence: ['construction_capability_rank'],
      };
    }
    case '부동산시장': {
      /*
       * 평가항목은 CD금리 자체가 아니라 **주택담보대출금리** 다 (가이드북 원문·골든 캡쳐 09 확인).
       *   주택담보대출금리 = CD(91일)금리 + 가산금리 1.57%
       * 골든 검산: 3.12 + 1.57 = 4.69% → 4.2%~4.8%미만 → 3점 보통.
       */
      const cd = val('cd_rate_91');
      const sc = cd == null ? null : scoreBand('주택담보대출금리', cd);
      return {
        title: '부동산시장', subject: region,
        columns: ['평가항목', '지역', '기준시점', '수치', '평가기준', '평가점수', '평가'],
        rows: [
          [
            '주택담보대출금리', '전국', per('cd_rate_91'),
            cd == null ? null : `CD ${cd}% + 1.57% = ${sc.applied.toFixed(2)}%`,
            sc && !sc.pending ? sc.text : '',
            sc && !sc.pending ? `${sc.score}점` : '',
            sc && !sc.pending ? sc.label : '',
          ],
          (() => {
            /* 구간표 수령(2026-09-16) — 130↑15 / 110↑12 / 90↑9 / 70↑6 / 그 밖 3 */
            const cs = val('consumer_sentiment');
            const s2 = cs == null ? null : scoreBand('소비심리지수', cs);
            return [
              '부동산시장 소비심리지수', region.split(' ')[0], per('consumer_sentiment'), cs,
              s2 && !s2.pending ? s2.label : '',
              s2 && !s2.pending ? `${s2.score}점` : '',
              s2 && !s2.pending ? s2.grade : '',
            ];
          })(),
        ],
        footnote: '※ 주택담보대출금리는 CD(91일)금리 + 가산금리 1.57% 를 적용하여 산정'
          + ' · 소비심리지수는 「주택매매시장 소비심리지수」 적용(임대사업장은 「주택전세시장 소비심리지수」)',
        evidence: ['cd_rate_91', 'consumer_sentiment'],
      };
    }
    /*
     * 교통환경 (캡쳐 01) — 항목마다 독립 판정, 하단에 평균점수 행.
     * 컬럼: 평가항목 | 평가기준 | 시설명 | 거리 | 점수 | 평가점수 및 평가
     */
    case '교통환경':
      return {
        title: '교통환경', subject: region, poi: true, layout: 'flat',
        columns: ['평가항목', '평가기준', '시설명', '거리', '점수', '평가점수 및 평가'],
        facilities: [
          { label: '지하철역', criteria: '사업지 반경 1km 이내' },
          /*
           * 6차선 왕복도로는 자동판정을 포기했다.
           * 차선수를 주는 전국 단일 데이터가 없다 — 지자체별로 흩어져 있고,
           * VDS·LCS 같은 교통량 데이터는 관측 지점만 덮거나 고속도로 전용이다.
           * 폭원으로 역산하는 방법이 있으나 추정이라 심사가 틀어질 위험이 있다.
           * 실무도 지도를 보고 판정하므로(사용자 확인), 반경원 지도를 띄워
           * 눈으로 확인한 도로명을 그 자리에서 입력받는다.
           */
          /*
           * 구간표를 받았다(2026-09-14): 100m/300m/500m/1km = 5/4/3/2점, 그 밖은 기본 1점.
           * 그래서 후보 탐색도 1km 까지 봐야 한다 — 300m 만 보면 2~3점 구간을 통째로 놓친다.
           */
          { label: '6차선 왕복도로', criteria: '반경 100m/300m/500m/1km', manual: true, radius: 1000 },
        ],
        summaryRow: '평균점수',
      };

    /*
     * 주거편의 (캡쳐 02) — 두 그룹으로 묶어 그룹별 판정.
     * 그룹1 상업/의료(1.5km), 그룹2 공원/문화/공공(1km).
     * 각 그룹 아래에 묶음 라벨 행이 들어간다.
     */
    case '주거편의':
      return {
        title: '주거편의', subject: region, poi: true, layout: 'grouped',
        columns: ['평가항목', '시설명', '거리', '평가조건', '점수', '평가점수 및 평가'],
        groups: [
          {
            label: '상업시설 및 의료시설',
            condition: '사업지 반경 1.5km이내 부재',
            facilities: [
              { label: '상업시설', radius: 1500 },
              { label: '의료시설', radius: 1500 },
            ],
          },
          {
            label: '공원, 문화, 공공시설',
            condition: '사업지 반경 1km이내 1개 존재',
            facilities: [
              { label: '공원', radius: 1000 },
              { label: '문화시설', radius: 1000 },
              { label: '공공시설', radius: 1000 },
            ],
          },
        ],
        /* 가이드북: 두 그룹을 평가한 뒤 **평균값**으로 등급을 낸다 */
        summaryRow: '평균점수',
      };

    /*
     * 교육환경 (캡쳐 05) — 반경 500m / 1km 를 열로 나눈 2단 구조.
     * 컬럼: 평가항목 | 반경 500m 이내 시설명 | 반경 1km 이내 시설명 | 점수 | 평가점수 및 평가
     */
    case '교육환경':
      return {
        title: '교육환경', subject: region, poi: true, layout: 'dual',
        columns: ['평가항목', '반경 500m 이내', '반경 1km 이내', '점수', '평가점수 및 평가'],
        facilities: [
          { label: '초등학교' }, { label: '중학교' }, { label: '고등학교' },
        ],
        summaryRow: '계',
      };

    default:
      return null;
  }
}
