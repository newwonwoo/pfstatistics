/**
 * 심사 평가표 시트 정의.
 *
 * 캡쳐 11장에서 시트별 컬럼 구성을 그대로 옮겼다.
 * 엑셀 하단 탭 순서도 캡쳐와 동일하게 유지한다 — 실무자가 눈으로 찾는 순서이기 때문이다.
 *
 * 평가기준·평가점수 칸은 비워둔다. 구간표 전체를 아직 못 받았고,
 * 집계는 이번 범위가 아니다. 수집된 값과 증빙만 채운다.
 */

import { scoreRank, scoreBand } from '../src/lib/scoring';

/** 이 앱이 실제로 수집하는 시트만 남긴다. 수기입력 시트(표지·종합·규모및배치·평형구성)는 제외. */
export const SHEETS = [
  { id: '교통환경',     label: '교통환경',     kind: 'poi' },
  { id: '주거편의',     label: '주거편의',     kind: 'poi' },
  { id: '교육환경',     label: '교육환경',     kind: 'poi' },
  /* 탭 이름에 '분양가' 를 넣는다 — 실무자가 찾는 말은 '분양가 적정성' 이다. 시트명(id)은 그대로 둔다 */
  { id: '비교사업장',   label: '비교사업장 · 분양가', kind: 'comp' },
  { id: '지역미분양',   label: '지역미분양',   kind: 'stat' },
  { id: '지역수요',     label: '지역수요',     kind: 'stat' },
  { id: '지역경쟁력',   label: '지역경쟁력',   kind: 'stat' },
  { id: '브랜드경쟁력', label: '브랜드경쟁력', kind: 'stat' },
  { id: '부동산시장',   label: '부동산시장',   kind: 'stat' },
  /* 평가표의 결론 — 다른 시트의 항목 점수가 모여 여기서 분양률이 나온다. 맨 뒤에 둔다 */
  { id: '초기예상분양률', label: '초기예상분양률', kind: 'rate', tone: 'summary' },
];

const n = (v, d = 0) =>
  v == null || v === '' ? null : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * 시트별 평가표 스펙.
 * cells 는 캡쳐의 표를 그대로 재현한다. value 는 수집 결과에서 뽑고,
 * 미수집이면 null 을 돌려 화면에서 "수집 대기"로 보이게 한다.
 */
export function buildSheet(sheetId, { byId, region, period, company }) {
  const g = (id) => byId[id];
  const val = (id) => (g(id)?.ok ? g(id).value : null);

  switch (sheetId) {
    case '지역미분양': {
      const unsold = val('unsold_housing');
      const hh = val('resident_households');
      const ratio = unsold != null && hh ? (unsold / hh) * 100 : null;
      return {
        title: '지역미분양',
        subject: region,
        columns: ['평가항목', '지역', '미분양주택수', '주민등록세대수', '미분양비율', '평가기준', '평가점수', '평가'],
        rows: [[
          '지역 미분양비율', region,
          n(unsold), n(hh),
          ratio == null ? null : `${ratio.toFixed(2)}%`,
          '', '', '',
        ]],
        formula: '(미분양주택수 / 주민등록세대수) × 100',
        evidence: ['unsold_housing', 'resident_households'],
      };
    }
    case '지역수요':
      return {
        title: '지역수요', subject: region,
        columns: ['평가항목', '지역', '비율', '평가기준', '점수', '평가'],
        rows: [
          ['주택보급률', region.split(' ')[0], val('housing_supply_ratio') == null ? null : `${val('housing_supply_ratio')}%`, '', '', ''],
          ['인구유입요인', '', null, '', '', ''],
        ],
        evidence: ['housing_supply_ratio'],
      };
    case '지역경쟁력':
      return {
        title: '지역경쟁력 (월별 아파트 매매가격 종합지수)', subject: region,
        columns: ['평가항목', '지역', '전월대비 증감률', '평가기준', '평가점수', '평가'],
        rows: [[
          '매매가격 종합지수 전월대비 증감률', region,
          val('kb_apt_price_index') == null ? null : `${Number(val('kb_apt_price_index')).toFixed(2)}%`,
          '', '', '',
        ]],
        evidence: ['kb_apt_price_index'],
      };
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
        columns: ['평가항목', '지역', '수치', '평가기준', '평가점수', '평가'],
        rows: [
          [
            '주택담보대출금리', '전국',
            cd == null ? null : `CD ${cd}% + 1.57% = ${sc.applied.toFixed(2)}%`,
            sc && !sc.pending ? sc.text : '',
            sc && !sc.pending ? `${sc.score}점` : '',
            sc && !sc.pending ? sc.label : '',
          ],
          ['부동산시장 소비심리지수', region.split(' ')[0], val('consumer_sentiment'), '', '', ''],
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
