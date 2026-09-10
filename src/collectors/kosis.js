import { requireKey } from '../lib/env.js';
import { getJson, envelope } from '../lib/http.js';

const BASE = 'https://kosis.kr/openapi';

/**
 * 통계표 검색 — tblId 를 모를 때 이름으로 찾는다.
 * 캡쳐만 보고 tblId 를 추측하면 틀린다. 반드시 이걸로 확인하고 config 에 박을 것.
 */
export async function searchTable(keyword) {
  const key = requireKey('KOSIS_API_KEY');
  const url = `${BASE}/statisticsSearch.do?method=getList&apiKey=${key}`
    + `&searchNm=${encodeURIComponent(keyword)}&format=json&jsonVD=Y`;
  const rows = await getJson(url);
  if (!Array.isArray(rows)) throw new Error(`KOSIS 검색 실패: ${JSON.stringify(rows).slice(0, 300)}`);
  return rows.map(r => ({
    orgId: r.ORG_ID, tblId: r.TBL_ID, tblNm: r.TBL_NM,
    org: r.ORG_NM, prdSe: r.PRD_SE,
    from: r.PRD_DE_STRT, to: r.PRD_DE_END,
  }));
}

/**
 * 통계자료 조회.
 * @param {object} p
 * @param {string} p.orgId  기관코드 (예: 101 통계청)
 * @param {string} p.tblId  통계표ID
 * @param {'M'|'Y'|'Q'} p.prdSe  수록주기
 * @param {string} p.startPrdDe  시작시점 (202607 / 2024)
 * @param {string} p.endPrdDe
 * @param {string} [p.objL1]  분류1 (지역코드). 미지정시 전체
 * @param {string} [p.itmId]  항목코드
 */
export async function fetchData({ orgId, tblId, prdSe, startPrdDe, endPrdDe, objL1 = '', itmId = '' }) {
  const key = requireKey('KOSIS_API_KEY');
  const qs = new URLSearchParams({
    method: 'getList', apiKey: key, orgId, tblId, prdSe,
    startPrdDe, endPrdDe, itmId, objL1,
    format: 'json', jsonVD: 'Y',
  });
  const url = `${BASE}/Param/statisticsParameterData.do?${qs}`;
  const rows = await getJson(url);
  if (!Array.isArray(rows)) throw new Error(`KOSIS 조회 실패: ${JSON.stringify(rows).slice(0, 300)}`);
  return { rows, url };
}

/** 지표 카탈로그 1건을 수집해 표준 봉투로 반환 */
export async function collect(indicator, { region, period }) {
  const s = indicator.source;
  if (!s.tblId) {
    const e = new Error(`${indicator.name}: tblId 미확정 — 'npm run collect -- --discover "${indicator.name}"' 로 먼저 확인 필요`);
    e.code = 'NO_TBLID';
    throw e;
  }
  const { rows, url } = await fetchData({
    orgId: s.orgId, tblId: s.tblId, prdSe: indicator.period,
    startPrdDe: period, endPrdDe: period,
  });
  const hit = rows.find(r => (r.C1_NM ?? '').includes(region) || (r.C2_NM ?? '').includes(region));
  return envelope({
    indicatorId: indicator.id, name: indicator.name, region, period,
    value: hit ? Number(hit.DT) : null,
    unit: indicator.unit,
    source: {
      org: s.org, citation: s.citation, url,
      queryParams: { orgId: s.orgId, tblId: s.tblId, prdSe: indicator.period, period },
      dataUpdatedAt: rows[0]?.LST_CHN_DE ?? null,
    },
    raw: hit ?? rows.slice(0, 5),
  });
}
