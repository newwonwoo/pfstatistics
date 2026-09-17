import { fetchData } from './kosis.js';
import { statSido } from '../lib/sido.js';

/**
 * 주택도시보증공사(HUG) 민간아파트 분양가격·초기분양률 — **KOSIS 로 받는다**(orgId=414).
 *
 * 사용자 제안(2026-09-17): "분양가 정보를 얻지 못할 때는 분양보증 현황에서 가져올 수 있을 것 같다".
 * 공공데이터포털의 HUG 오픈API(분양이력정보·분양보증현황)는 **이 키로 안 열린다**
 * (odcloud `code -3 등록되지 않은 서비스`). 그런데 **같은 통계가 KOSIS 에 올라와 있고
 * 우리는 KOSIS 키를 이미 갖고 있다** — 그래서 이쪽으로 받는다.
 *
 *   DT_41401N_005  지역별 규모별 ㎡당 평균 분양가격   월   2015.10 ~ 2026.07   천원/㎡
 *                  itmId=00 · objL1=지역(AA) · **objL2=규모(AB005)**
 *                  objL2 를 빠뜨리면 "해당 자료가 없습니다" 가 난다(실측).
 *   DT_41401N_008  지역별 민간아파트 평균 초기분양률  분기 2015 3/4 ~ 2026 2/4   %
 *                  itmId=B · objL1=지역(AA)
 *                  **단일 시점(start=end)은 err 30, 범위조회는 된다**(실측) —
 *                  주택보급률 통계표와 정반대라 표마다 확인해야 한다.
 *
 * **시도 단위다.** 시군구 값이 아니므로 비교사업장을 대체하지 못한다 —
 * 반경 안에 비교할 단지가 없을 때 **지역 기준선**으로만 쓴다.
 */
const ORG = '414';
const T_PRICE = 'DT_41401N_005';
const T_RATE = 'DT_41401N_008';

/** HUG 지역코드(AA). 통합 시도는 아직 광주/전남을 따로 집계한다 — `statSido()` 와 같은 규칙 */
const AREA = {
  전국: '00', 서울: '01', 인천: '02', 경기: '03', 부산: '05', 대구: '06', 광주: '07',
  대전: '08', 울산: '09', 세종: '10', 강원: '12', 충북: '13', 충남: '14',
  전북: '15', 전남: '16', 경북: '17', 경남: '18', 제주: '19',
};

/** 규모(AB005) — 구분은 **전용면적** 기준이다(원문 항목명) */
export const SIZE = {
  T1: '전체', T2: '전용 60㎡ 이하', T3: '전용 60~85㎡', T4: '전용 85~102㎡', T5: '전용 102㎡ 초과',
};

const areaOf = (region) => {
  const short = statSido(region);
  return short ? (AREA[short] ?? null) : null;
};

/** 최근 n개월 시점 문자열 (YYYYMM) */
const ymBack = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * 지역 평균 분양가 — 규모별 전부.
 * @returns {{area,areaName,period,unit,bySize:{[code]:number}, all:number|null}}
 */
export async function avgPrice(region, { months = 14 } = {}) {
  const area = areaOf(region);
  if (!area) {
    const e = new Error('통합 시도는 시군구까지 골라야 지역 평균 분양가를 가릅니다');
    e.code = 'NEED_SGG';
    throw e;
  }
  const start = ymBack(months);
  const end = ymBack(0);
  const out = {};
  await Promise.all(Object.keys(SIZE).map(async (size) => {
    try {
      const rows = await fetchData({
        orgId: ORG, tblId: T_PRICE, prdSe: 'M',
        startPrdDe: start, endPrdDe: end, itmId: '00', objL1: area, objL2: size,
      });
      /* 최신 시점 한 건 — 원천이 과거를 같이 주므로 가장 큰 PRD_DE 를 고른다 */
      const last = rows.filter(r => r.DT != null && r.DT !== '')
        .sort((a, b) => String(a.PRD_DE).localeCompare(String(b.PRD_DE))).at(-1);
      if (last) out[size] = { period: last.PRD_DE, won: Math.round(Number(last.DT) * 1000) };
    } catch { /* 한 규모가 비어도 나머지는 준다 */ }
  }));
  const all = out.T1?.won ?? null;
  return {
    org: 'HUG 주택도시보증공사',
    tblId: T_PRICE,
    area, areaName: statSido(region),
    period: out.T1?.period ?? Object.values(out)[0]?.period ?? null,
    unit: '원/㎡',
    all, bySize: out,
    /* **면적 기준을 원천이 적어주지 않는다** — 단정하지 말고 화면에 그대로 옮긴다 */
    areaBasisNote: '원천이 ㎡의 기준(공급/전용)을 명시하지 않습니다',
    citation: '* 출처 : 주택도시보증공사(HUG) 「지역별 규모별 ㎡당 평균 분양가격」 (KOSIS 414/DT_41401N_005)',
    viewUrl: 'https://kosis.kr/statHtml/statHtml.do?orgId=414&tblId=DT_41401N_005',
  };
}

/**
 * 지역 민간아파트 평균 초기분양률 (분기).
 * **규정이 말하는 「인근 단지」 초기분양률이 아니다** — 지역 평균이다.
 * 참고치로만 보여주고 자동으로 채우지 않는다.
 */
export async function initialSaleRate(region, { quarters = 6 } = {}) {
  const area = areaOf(region);
  if (!area) {
    const e = new Error('통합 시도는 시군구까지 골라야 초기분양률을 가릅니다');
    e.code = 'NEED_SGG';
    throw e;
  }
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const endY = now.getFullYear();
  const startY = endY - Math.ceil(quarters / 4) - 1;
  /* 단일 시점은 err 30 을 준다 — **범위로만 조회된다**(실측) */
  const rows = await fetchData({
    orgId: ORG, tblId: T_RATE, prdSe: 'Q',
    startPrdDe: `${startY}1`, endPrdDe: `${endY}${q}`, itmId: 'B', objL1: area,
  });
  const series = rows.filter(r => r.DT != null && r.DT !== '')
    .map(r => ({ period: r.PRD_DE, rate: Number(r.DT) }))
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const last = series.at(-1) ?? null;
  return {
    org: 'HUG 주택도시보증공사',
    tblId: T_RATE,
    area, areaName: statSido(region),
    latest: last, series: series.slice(-8),
    unit: '%',
    note: '지역 평균입니다 — 규정이 말하는 「인근 단지」 초기분양률과는 다릅니다',
    citation: '* 출처 : 주택도시보증공사(HUG) 「지역별 민간아파트 평균 초기분양률」 (KOSIS 414/DT_41401N_008)',
    viewUrl: 'https://kosis.kr/statHtml/statHtml.do?orgId=414&tblId=DT_41401N_008',
  };
}
