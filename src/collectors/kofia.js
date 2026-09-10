import { envelope } from '../lib/http.js';

/**
 * 금융투자협회 채권정보센터 — API 키 불필요.
 *
 * 사이트는 WebSquare + TmaxSoft ProFrame 이다.
 * /js/COMAjaxLibProframe.js 의 ajaxService() 에서 게이트웨이를 역산했다.
 *   POST /proframeWeb/XMLSERVICES/   (Content-Type: application/xml)
 * 본문은 pfm_makeMsgXmlAdvanced() 가 만드는 XML 그대로다.
 *
 * 화면 경로는 메뉴 서비스(BIS-COM/BISComMenuSO/selectMenuBIS, workGb=KOR)로 조회했다.
 *   CD수익률          → /xml/cdplus/BISCdpMain.xml      (BISCDPSrchSO/selectCdpMain)
 *   최종호가수익률     → /xml/bondint/lastrop/BISLastAskPrc.xml
 */
const GATEWAY = 'https://www.kofiabond.or.kr/proframeWeb/XMLSERVICES/';

function buildMessage(appName, svcName, fnName, dtoXml) {
  return `<?xml version="1.0" encoding="utf-8"?>
<message>
  <proframeHeader>
    <pfmAppName>${appName}</pfmAppName>
    <pfmSvcName>${svcName}</pfmSvcName>
    <pfmFnName>${fnName}</pfmFnName>
  </proframeHeader>
  <systemHeader></systemHeader>
  ${dtoXml}
</message>`;
}

export async function callProFrame(appName, svcName, fnName, dtoXml, { timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: buildMessage(appName, svcName, fnName, dtoXml),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`금투협 HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

const tag = (xml, name) => (xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)) ?? [])[1] ?? null;

/** 화면 메뉴 트리 — 새 지표를 붙일 때 화면 경로/서비스를 찾는 용도 */
export async function listMenu() {
  const xml = await callProFrame('BIS-COM', 'BISComMenuSO', 'selectMenuBIS',
    '<BISComMenuDTO><workGb>KOR</workGb></BISComMenuDTO>');
  return xml.split('<BISComMenuDTO>').slice(1).map(b => ({
    depth: tag(b, 'depth'), id: tag(b, 'divisionId'), name: tag(b, 'divisionNm'),
    path: (tag(b, 'programPath') ?? '') + (tag(b, 'runFilepageNm') ?? ''),
  })).filter(r => r.id);
}

/**
 * CD(91일) 수익률 — 최신 공시치.
 *
 * ⚠️ selectCdpMain 은 기준일자 파라미터를 무시하고 항상 최신 영업일을 준다.
 *    (val1=고시일, val2=오전, val3=오후)
 *    과거 일자 소급조회는 일자별 화면(/xml/cdplus/BISCdpinfo.xml) 서비스 추가분석 필요.
 *    심사 실무는 "조회 시점의 현재 금리"를 쓰므로 1차 요건은 충족한다.
 *
 * CD수익률은 2023.10.4 부터 「CD수익률 산출업무규정」에 따라
 * 매 영업일 16시 기준 1회 산출·공시된다. (캡쳐 09 각주)
 */
export async function fetchCdRate() {
  const xml = await callProFrame('BIS-KOFIABOND', 'BISCDPSrchSO', 'selectCdpMain',
    '<BISComDspDatDTO><val1></val1></BISComDspDatDTO>');
  const body = xml.split('<BISComDspDatListDTO>')[1] ?? '';
  const row = body.split('<BISComDspDatDTO>')[1] ?? '';
  const quotedDate = tag(row, 'val1');            // "2026.09.09"
  const am = tag(row, 'val2'), pm = tag(row, 'val3');
  const value = Number(pm ?? am);
  if (!Number.isFinite(value)) throw new Error(`금투협 CD수익률 파싱 실패: ${xml.slice(0, 300)}`);
  return { quotedDate, am: Number(am), pm: Number(pm), value };
}

/** 최종호가수익률 메인 지표 (국고채·통안증권 등) — 기준일자 지정 가능 */
export async function fetchMainQuotes(standardDt) {
  const xml = await callProFrame('BIS-KOFIABOND', 'BISMainSO', 'selectAnnItmList',
    `<BISMainComDTO><standardDt>${standardDt}</standardDt></BISMainComDTO>`);
  return [...xml.matchAll(
    /<val1>([^<]*)<\/val1>[\s\S]*?<val2>([^<]*)<\/val2>\s*<val3>([^<]*)<\/val3>[\s\S]*?<workGb>([^<]*)<\/workGb>/g
  )].map(m => ({ code: m[1], am: Number(m[2]), pm: Number(m[3]), name: m[4] }));
}

export async function collect(indicator, { period }) {
  const { quotedDate, am, pm, value } = await fetchCdRate();
  return envelope({
    indicatorId: indicator.id, name: indicator.name,
    region: '전국', period: quotedDate.replace(/\./g, ''),
    value, unit: indicator.unit,
    source: {
      org: '금융투자협회',
      citation: `금융투자협회 CD금리_${quotedDate}`,
      url: GATEWAY,
      queryParams: { pfmAppName: 'BIS-KOFIABOND', pfmSvcName: 'BISCDPSrchSO', pfmFnName: 'selectCdpMain' },
      dataUpdatedAt: quotedDate,
      viewUrl: 'https://www.kofiabond.or.kr/websquare/websquare.html?w2xPath=/xml/cdplus/BISCdpMain.xml',
    },
    raw: { 고시일: quotedDate, 오전: am, 오후: pm, 비고: '매 영업일 16시 기준 1회 산출·공시' },
  });
}
