import { requireKey } from '../lib/env.js';
import { getJson, envelope } from '../lib/http.js';
import { toSggCode, known } from '../lib/region.js';

const BASE = 'https://kosis.kr/openapi';

/** KOSIS 오류코드 해설 — "왜 안 되는지"를 화면에서 바로 읽을 수 있어야 한다 */
const ERR_HINT = {
  '10': '인증키가 전달되지 않았습니다',
  '11': '유효하지 않은 인증키입니다 (오탈자·공백 혼입이거나 아직 활성화 전)',
  '20': '해당 자료가 없습니다',
  '30': 'KOSIS에서 오픈API 활용신청을 하지 않았습니다',
  '31': '인증키 기간이 만료되었습니다',
  '32': '일일 호출 한도를 초과했습니다',
};

function check(r) {
  if (r && !Array.isArray(r) && r.err) {
    const e = new Error(`KOSIS(${r.err}): ${ERR_HINT[String(r.err)] ?? r.errMsg}`);
    e.kosisErr = String(r.err);
    throw e;
  }
  return r;
}

const key = () => requireKey('KOSIS_API_KEY').trim();   // 복붙 공백 방어

export async function searchTable(keyword) {
  const url = `${BASE}/statisticsSearch.do?method=getList&apiKey=${encodeURIComponent(key())}`
    + `&searchNm=${encodeURIComponent(keyword)}&format=json&jsonVD=Y`;
  const r = check(await getJson(url));
  return (Array.isArray(r) ? r : []).map(x => ({
    orgId: x.ORG_ID, tblId: x.TBL_ID, tblNm: x.TBL_NM ?? x.STAT_NM, prdSe: x.PRD_SE,
  })).filter(x => x.orgId && x.tblId);
}

export async function fetchData({ orgId, tblId, prdSe, startPrdDe, endPrdDe, objL1 = '', itmId = '' }) {
  const qs = new URLSearchParams({
    method: 'getList', apiKey: key(), orgId, tblId, prdSe,
    startPrdDe, endPrdDe, itmId, objL1, format: 'json', jsonVD: 'Y',
  });
  const url = `${BASE}/Param/statisticsParameterData.do?${qs}`;
  const r = check(await getJson(url));
  return { rows: Array.isArray(r) ? r : [], url };
}

const num = v => Number(String(v ?? '').replace(/,/g, ''));
const nameOf = row => [row.C1_NM, row.C2_NM, row.C3_NM].filter(Boolean).join(' ');

/**
 * tblId 자동 결선 — 캐시.
 *
 * 통계표 ID 를 사람이 눈으로 고르는 단계를 없앤다.
 * 지표명으로 후보를 찾고, 골든 시점에서 정답값이 나오는 통계표만 채택한다.
 * 서버리스 인스턴스 메모리에 캐시하므로 첫 호출만 느리다.
 */
const resolved = new Map();

async function resolveTable(indicator) {
  const cached = resolved.get(indicator.id);
  if (cached) return cached;

  const g = indicator.golden;
  const candidates = await searchTable(indicator.name);
  if (!candidates.length) throw new Error(`"${indicator.name}" 통계표를 찾지 못했습니다`);

  for (const c of candidates.slice(0, 8)) {
    try {
      const { rows } = await fetchData({
        orgId: c.orgId, tblId: c.tblId, prdSe: indicator.period,
        startPrdDe: g.period, endPrdDe: g.period,
      });
      const hit = rows.find(r => nameOf(r).includes(g.region) && Math.abs(num(r.DT) - Number(g.value)) < 0.05);
      if (hit) {
        const picked = { orgId: c.orgId, tblId: c.tblId, tblNm: c.tblNm };
        resolved.set(indicator.id, picked);
        return picked;
      }
    } catch { /* 다음 후보 */ }
  }
  throw new Error(`"${indicator.name}" 통계표 자동확정 실패 — 후보 ${candidates.length}건 중 정답값(${g.region} ${g.period}=${g.value}) 일치 없음`);
}

export async function collect(indicator, { region, period }) {
  const s = indicator.source;
  // config 에 박혀 있으면 그걸 쓰고, 없으면 그 자리에서 찾아낸다
  const t = s.tblId ? { orgId: s.orgId, tblId: s.tblId, tblNm: null } : await resolveTable(indicator);

  // 시군구 단위 통계표는 objL1(지역코드)이 없으면 err 20 을 준다.
  // 지역코드 규칙이 통계표마다 다르다.
  //  - 시군구 표(DT_1B040B3): 법정동코드 앞5자리
  //  - 시도 표(주택보급률·소비심리): 통계표 전용코드 → config 에 고정
  let objL1 = s.objL1 ?? '';
  if (!objL1 && indicator.regionLevel === 'sgg') {
    objL1 = known(region) ?? await toSggCode(region, { kakaoKey: process.env.KAKAO_REST_KEY });
  }

  /*
   * 연 단위 지표는 조회월(YYYYMM)을 그대로 넘기면 안 되고,
   * 아직 공표되지 않은 연도를 물으면 KOSIS 가 err 30("활용신청을 하지 않았습니다")을 준다.
   * 메시지와 달리 실제 뜻은 "그 시점 자료가 없다" 이다. 범위 조회도 이 통계표는 거부한다.
   * → 최근 연도부터 한 해씩 되짚으며 처음 잡히는 시점을 쓴다.
   *   (주택보급률은 공표가 2년 지연되어 2026년에도 최신치가 2024)
   */
  const annual = indicator.period === 'Y';
  const attempts = annual
    ? Array.from({ length: 5 }, (_, i) => String(Number(String(period).slice(0, 4)) - i))
    : [period];

  let rows = [], url = '', lastErr = null;
  for (const prd of attempts) {
    try {
      const res = await fetchData({
        orgId: t.orgId, tblId: t.tblId, prdSe: indicator.period,
        startPrdDe: prd, endPrdDe: prd,
        itmId: s.itmId ?? '', objL1,
      });
      if (res.rows.length) { rows = res.rows; url = res.url; break; }
    } catch (e) {
      lastErr = e;
      // err 20/30 은 "그 시점 자료 없음" 이므로 이전 연도로 계속 되짚는다
      if (!['20', '30'].includes(e.kosisErr)) throw e;
    }
  }
  if (!rows.length) throw lastErr ?? new Error(`${indicator.name}: 조회 결과 없음`);
  const short = region.trim().split(/\s+/).at(-1);   // "경기도 광주시" → "광주시"
  const matched = rows.filter(r => nameOf(r).includes(short));
  const pool = matched.length ? matched : (rows.length === 1 ? rows : []);
  // 연 단위는 조회범위 중 가장 최근 시점을 쓴다
  const hit = pool.sort((a, b) => String(a.PRD_DE).localeCompare(String(b.PRD_DE))).at(-1);
  if (!hit) throw new Error(`"${region}" 미발견 (${rows.length}행 조회됨)`);

  return envelope({
    indicatorId: indicator.id, name: indicator.name, region,
    period: hit.PRD_DE ?? period,
    value: num(hit.DT), unit: indicator.unit,
    source: {
      org: s.org, citation: s.citation, url,
      queryParams: { orgId: t.orgId, tblId: t.tblId, prdSe: indicator.period, period: hit.PRD_DE ?? period, itmId: s.itmId ?? null, objL1: objL1 || null },
      dataUpdatedAt: hit.LST_CHN_DE ?? null,
      viewUrl: s.viewUrl ?? null,
      autoResolved: !s.tblId ? t.tblNm ?? t.tblId : null,
    },
    raw: hit,
  });
}

/**
 * 통계표 메타 조회 — 항목코드(itmId)·분류코드(objL1).
 *
 * KOSIS 는 itmId 를 비워두면 통계표에 따라 err 20("해당 자료가 없습니다")을 준다.
 * 통계표 ID 가 맞아도 이것 때문에 빈손으로 돌아오므로, 메타를 먼저 읽어 채운다.
 */
export async function fetchMeta({ orgId, tblId, type = 'ITM' }) {
  // 메타는 통계자료(Param/…)가 아니라 statisticsData.do 로 가며 loadGubun 이 필요하다.
  // type: ITM(항목) / OBJ(분류) / PRD(수록시점)
  const loadGubun = { ITM: '1', OBJ: '2', PRD: '3' }[type] ?? '1';
  const qs = new URLSearchParams({
    method: 'getMeta', apiKey: key(), orgId, tblId, type, loadGubun,
    format: 'json', jsonVD: 'Y',
  });
  const r = check(await getJson(`${BASE}/statisticsData.do?${qs}`));
  return Array.isArray(r) ? r : [];
}
