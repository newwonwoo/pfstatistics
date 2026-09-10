import { getJson, envelope } from '../lib/http.js';

/**
 * 국토교통통계누리 직결 수집기 — API 키 불필요.
 *
 * statView 페이지의 doSearch() 를 역산해 얻은 내부 엔드포인트를 그대로 호출한다.
 *   GET /portal/stat/data.do?formId=..&styleNum=128&apprYn=Y&startDate=YYYYMM&endDate=YYYYMM
 *
 * styleNum=128 은 캡쳐(양식128)와 동일한 값이며 페이지 JS 에 하드코딩되어 있다.
 * 응답 행 스키마(양식2082): { "0":기준월, "1":시도, "2":시군구, "3":미분양호수 }
 */
const DATA_URL = 'https://stat.molit.go.kr/portal/stat/data.do';
const VIEW_URL = 'https://stat.molit.go.kr/portal/cate/statView.do';

/** hRsId=32 미분양주택현황 산하 양식들 (statView option 에서 확인) */
export const FORMS = {
  시군구별미분양:   { formId: 2082, range: '200012~', cols: { sido: '1', sgg: '2', value: '3' } },
  규모별미분양:     { formId: 2080, range: '200701~' },
  공사완료후미분양: { formId: 5328, range: '200701~' },
  미분양종합:       { formId: 2086, range: '2001~' },
};

export async function fetchForm({ formId, period, styleNum = 128 }) {
  const qs = new URLSearchParams({
    formId: String(formId), styleNum: String(styleNum), apprYn: 'Y',
    startDate: period, endDate: period,
  });
  const url = `${DATA_URL}?${qs}`;
  const d = await getJson(url);
  if (!d.result) throw new Error(`통계누리 조회 실패(${formId}/${period}): ${d.msg ?? JSON.stringify(d)}`);
  return { rows: d.data ?? [], url };
}

/** 시군구별 미분양 전체를 {시도, 시군구, 값} 배열로 정규화 */
export async function fetchUnsoldBySgg(period) {
  const { rows, url } = await fetchForm({ formId: FORMS.시군구별미분양.formId, period });
  return {
    url,
    items: rows.map(r => ({
      period: r['0'], sido: r['1'], sgg: r['2'],
      value: r['3'] === '' || r['3'] == null ? null : Number(String(r['3']).replace(/,/g, '')),
    })),
  };
}

/**
 * "경기도 광주시" 같은 입력을 통계누리 표기("경기" + "광주시")로 맞춰 조회.
 * 통계누리는 시도를 축약형(서울/경기/강원…)으로 쓴다.
 */
const SIDO_ALIAS = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원특별자치도: '강원', 강원도: '강원', 충청북도: '충북', 충청남도: '충남',
  전북특별자치도: '전북', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북',
  경상남도: '경남', 제주특별자치도: '제주', 제주도: '제주',
};
export const toShortSido = s => SIDO_ALIAS[s] ?? s;

export async function collect(indicator, { region, period }) {
  const [sidoRaw, ...rest] = region.trim().split(/\s+/);
  const sido = toShortSido(sidoRaw);
  const sgg = rest.join(' ');
  const { items, url } = await fetchUnsoldBySgg(period);

  const hit = items.find(r => r.sido === sido && r.sgg === sgg);
  if (!hit) {
    const cand = items.filter(r => r.sido === sido).map(r => r.sgg).join(', ');
    throw new Error(`"${sido} ${sgg}" 미발견. ${sido} 시군구: ${cand.slice(0, 200)}`);
  }
  return envelope({
    indicatorId: indicator.id, name: indicator.name,
    region: `${sidoRaw} ${sgg}`, period,
    value: hit.value, unit: indicator.unit,
    source: {
      org: indicator.source.org,
      citation: indicator.source.citation,
      url,
      queryParams: { formId: FORMS.시군구별미분양.formId, styleNum: 128, startDate: period, endDate: period },
      dataUpdatedAt: null,
      viewUrl: `${VIEW_URL}?hRsId=32&hFormId=${FORMS.시군구별미분양.formId}`, // 실무자 원본화면 딥링크
    },
    raw: hit,
  });
}
