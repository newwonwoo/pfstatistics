import { getJson, envelope } from '../lib/http.js';

/**
 * KB부동산 월간KB주택가격동향 — API 키 불필요.
 *
 * data.kbland.kr 번들에서 baseURL(data-api.kbland.kr)과 엔드포인트를 역산했다.
 *   GET /bfmstat/weekMnthlyHuseTrnd/priceIndex
 *       ?매매전세코드=01&월간주간구분코드=01&메뉴코드=1&지역코드={시도코드}
 *
 * 형제 엔드포인트 prcIndxFlxblRt(증감률 직접조회)는 서버측 SQL 오류
 * ("Unknown column '이전기준년월'")로 동작하지 않는다.
 * → 지수 원본을 받아 증감률을 직접 계산한다. 캡쳐값과 소수 3자리까지 일치 확인됨.
 */
const BASE = 'https://data-api.kbland.kr/bfmstat/weekMnthlyHuseTrnd/priceIndex';
const HEADERS = { Accept: 'application/json', Referer: 'https://data.kbland.kr/' };

export const MAE_JEONSE = { 매매: '01', 전세: '02' };
export const CYCLE = { 월간: '01', 주간: '02' };

/** 시도명 → KB 지역코드 (시군구 목록을 받기 위한 상위코드) */
export const SIDO_CODE = {
  서울: '1100000000', 부산: '2600000000', 대구: '2700000000', 인천: '2800000000',
  광주: '2900000000', 대전: '3000000000', 울산: '3100000000', 세종: '3600000000',
  경기: '4100000000', 강원: '4200000000', 충북: '4300000000', 충남: '4400000000',
  전북: '4500000000', 전남: '4600000000', 경북: '4700000000', 경남: '4800000000',
  제주: '5000000000',
};
const normSido = s => s.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');

/** 지수 원본 조회. 지역코드 미지정시 전국·시도 레벨, 지정시 그 시도의 시군구 레벨. */
export async function fetchPriceIndex({ sido = null, maeJeonse = '01', cycle = '01' } = {}) {
  const qs = new URLSearchParams({
    매매전세코드: maeJeonse, 월간주간구분코드: cycle, 메뉴코드: '1',
  });
  if (sido) {
    const code = SIDO_CODE[normSido(sido)];
    if (!code) throw new Error(`KB 지역코드 미매핑: ${sido}`);
    qs.set('지역코드', code);
  }
  const url = `${BASE}?${qs}`;
  const j = await getJson(url, { headers: HEADERS });
  if (j.dataHeader?.resultCode !== '10000') throw new Error(`KB 조회 실패: ${JSON.stringify(j.dataHeader)}`);
  const d = j.dataBody.data;
  return { url, updatedAt: d.업데이트일자, dates: d.날짜리스트, regions: d.데이터리스트 };
}

/** 지수 → 전월대비 증감률(%) 시계열 */
export function toMoMRates(dataList, dates) {
  const idx = dataList.slice(0, dates.length);   // 뒤쪽에 누적증감률 등이 붙어있어 잘라낸다
  return dates.map((ym, i) => ({
    period: ym,
    index: idx[i],
    momRate: i ? (idx[i] / idx[i - 1] - 1) * 100 : null,
  }));
}

export async function collect(indicator, { region, period }) {
  const [sido, ...rest] = region.trim().split(/\s+/);
  const sgg = rest.join(' ');
  const { url, updatedAt, dates, regions } = await fetchPriceIndex({ sido });

  const hit = regions.find(r => r.지역명 === sgg);
  if (!hit) throw new Error(`"${sgg}" 미발견. ${sido} 시군구: ${regions.map(r => r.지역명).join(', ').slice(0, 200)}`);

  const series = toMoMRates(hit.dataList, dates);
  const row = series.find(s => s.period === period) ?? series.at(-1);

  return envelope({
    indicatorId: indicator.id, name: indicator.name,
    region, period: row.period,
    value: row.momRate == null ? null : Number(row.momRate.toFixed(3)),
    unit: indicator.unit,
    source: {
      org: indicator.source.org, citation: indicator.source.citation, url,
      queryParams: { 매매전세코드: '01', 월간주간구분코드: '01', 메뉴코드: '1', 지역코드: SIDO_CODE[normSido(sido)] },
      dataUpdatedAt: updatedAt,
      viewUrl: indicator.source.viewUrl ?? null,
    },
    raw: { 지역코드: hit.지역코드, 지역명: hit.지역명, series: series.slice(-13) },
  });
}
