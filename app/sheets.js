/**
 * 심사 평가표 시트 정의.
 *
 * 캡쳐 11장에서 시트별 컬럼 구성을 그대로 옮겼다.
 * 엑셀 하단 탭 순서도 캡쳐와 동일하게 유지한다 — 실무자가 눈으로 찾는 순서이기 때문이다.
 *
 * 평가기준·평가점수 칸은 비워둔다. 구간표 전체를 아직 못 받았고,
 * 집계는 이번 범위가 아니다. 수집된 값과 증빙만 채운다.
 */

export const SHEETS = [
  { id: '표지',        label: '표지',        tone: 'cover' },
  { id: '종합',        label: '종합',        tone: 'summary' },
  { id: '교통환경',     label: '교통환경',     kind: 'poi' },
  { id: '주거편의',     label: '주거편의',     kind: 'poi' },
  { id: '교육환경',     label: '교육환경',     kind: 'poi' },
  { id: '규모 및 배치', label: '규모 및 배치', kind: 'manual' },
  { id: '평형구성',     label: '평형구성',     kind: 'manual' },
  { id: '지역미분양',   label: '지역미분양',   kind: 'stat' },
  { id: '지역수요',     label: '지역수요',     kind: 'stat' },
  { id: '지역경쟁력',   label: '지역경쟁력',   kind: 'stat' },
  { id: '브랜드경쟁력', label: '브랜드경쟁력', kind: 'stat' },
  { id: '부동산시장',   label: '부동산시장',   kind: 'stat' },
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
    case '브랜드경쟁력':
      return {
        title: '브랜드경쟁력 (시공능력평가순위)', subject: region,
        columns: ['상호', '시공능력평가순위', '평가기준', '평가점수', '평가'],
        rows: [[company ?? '', val('construction_capability_rank') == null ? null : `${val('construction_capability_rank')}위`, '', '', '']],
        footnote: '※ 시공자의 모회사가 책임준공 약정하고, 모회사 브랜드 사용시에는 모회사의 등급을 적용가능',
        evidence: ['construction_capability_rank'],
      };
    case '부동산시장':
      return {
        title: '부동산시장', subject: region,
        columns: ['평가항목', '지역', '수치', '평가기준', '평가점수', '평가'],
        rows: [
          ['CD(91일) 금리', '전국', val('cd_rate_91') == null ? null : `${val('cd_rate_91')}%`, '', '', ''],
          ['부동산시장 소비심리지수', region.split(' ')[0], val('consumer_sentiment'), '', '', ''],
        ],
        evidence: ['cd_rate_91', 'consumer_sentiment'],
      };
    case '교통환경':
      return {
        title: '교통환경', subject: region, poi: true,
        columns: ['평가항목', '평가기준', '시설명', '거리', '점수', '평가점수 및 평가'],
        facilities: [
          { label: '지하철역', criteria: '사업지 반경 1km 이내' },
          { label: '6차선 왕복도로', criteria: '사업지 반경 300m 이내', manual: true },
        ],
      };
    case '주거편의':
      return {
        title: '주거편의', subject: region, poi: true,
        columns: ['평가항목', '평가기준', '시설명', '거리', '점수', '평가점수 및 평가'],
        facilities: [
          { label: '상업시설', criteria: '반경 1.5km 이내' },
          { label: '의료시설', criteria: '반경 1.5km 이내' },
          { label: '공원', criteria: '반경 1km 이내' },
          { label: '문화시설', criteria: '반경 1km 이내' },
          { label: '공공시설', criteria: '반경 1km 이내' },
        ],
      };
    case '교육환경':
      return {
        title: '교육환경', subject: region, poi: true,
        columns: ['평가항목', '평가기준', '시설명', '거리', '점수', '평가점수 및 평가'],
        facilities: [
          { label: '초등학교', criteria: '반경 500m / 1km' },
          { label: '중학교', criteria: '반경 500m / 1km' },
          { label: '고등학교', criteria: '반경 500m / 1km' },
        ],
      };
    default:
      return null;
  }
}
