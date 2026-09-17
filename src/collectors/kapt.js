import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';

/**
 * K-apt 공동주택 (국토교통부 공동주택관리정보시스템) — **좌표 보강용**.
 *
 * 비교사업장을 여기서 만들지 않는다. 두 가지 이유로 대체가 안 된다(실측 2026-09-17).
 *   · **분양가가 없다.** 비교사업장 표의 핵심이 분양가다.
 *   · **관리비 의무단지, 즉 입주한 단지만 있다.** 분양중·미착공은 없다.
 *
 * 쓰는 이유는 하나 — 청약홈 공고 주소에 지번이 없을 때(신규 택지의 블록 표기)
 * 읍면동 중심으로 거리를 재게 되는데 그러면 수백 m 틀어진다.
 * 그 단지가 이미 준공됐다면 K-apt 에 **지번주소(kaptAddr)** 가 있으므로 정확히 잴 수 있다.
 *
 *   단지목록  apis.data.go.kr/1613000/AptListService4/getSigunguAptList4?sigunguCode=41610
 *   기본정보  apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5?kaptCode=A10023961
 *
 * **버전 숫자를 찍지 말 것** — Service2/3, ServiceV2/V3 는 전부
 * `NO_OPENAPI_SERVICE_ERROR`(코드 12) 다. 키 문제로 오해하기 딱 좋은 메시지다.
 */
const HOST = 'https://apis.data.go.kr/1613000';
const LIST = `${HOST}/AptListService4/getSigunguAptList4`;
const BASIS = `${HOST}/AptBasisInfoServiceV5/getAphusBassInfoV5`;

const key = () => requireKey('DATA_GO_KR_KEY').trim();

/** 단지명 비교용 — 표기차(공백·아파트 꼬리·로마숫자)를 지운다 */
export const normName = (s) => String(s ?? '')
  .replace(/\(.*?\)/g, '')
  .replace(/아파트$|APT$/i, '')
  .replace(/[ⅠⅡⅢⅣⅤ]/g, (m) => String('ⅠⅡⅢⅣⅤ'.indexOf(m) + 1))
  .replace(/[\s·・\-_,]/g, '')
  .toLowerCase();

/* 시군구 단위 목록은 한 번만 받는다 — 요청마다 다시 받으면 일일 트래픽을 금방 쓴다 */
const listCache = new Map();

/** 시군구(법정동코드 앞 5자리)의 단지 목록 → 정규화 단지명 → kaptCode */
export async function loadSggIndex(sigunguCode) {
  const code = String(sigunguCode ?? '').slice(0, 5);
  if (!/^\d{5}$/.test(code)) return new Map();
  if (listCache.has(code)) return listCache.get(code);

  const index = new Map();
  try {
    for (let page = 1; page <= 10; page++) {
      const qs = new URLSearchParams({
        serviceKey: key(), _type: 'json', sigunguCode: code,
        pageNo: String(page), numOfRows: '100',
      });
      const d = await getJson(`${LIST}?${qs}`, { retries: 1, timeout: 20000 });
      const body = d?.response?.body;
      const rows = body?.items?.item ?? body?.items ?? [];
      for (const r of (Array.isArray(rows) ? rows : [rows]).filter(Boolean)) {
        const n = normName(r.kaptName);
        if (n && !index.has(n)) index.set(n, r.kaptCode);
      }
      if (index.size >= (body?.totalCount ?? 0) || !rows?.length) break;
    }
  } catch { /* 보강 실패가 수집 전체를 막으면 안 된다 */ }
  listCache.set(code, index);
  return index;
}

const basisCache = new Map();

/** 단지 기본정보 — 지번주소·사용승인일·세대수·시공사 */
export async function basisOf(kaptCode) {
  if (basisCache.has(kaptCode)) return basisCache.get(kaptCode);
  let out = null;
  try {
    const qs = new URLSearchParams({ serviceKey: key(), _type: 'json', kaptCode });
    const d = await getJson(`${BASIS}?${qs}`, { retries: 1, timeout: 20000 });
    const it = d?.response?.body?.item;
    if (it) {
      out = {
        kaptCode: it.kaptCode, name: it.kaptName,
        /* "경기도 광주시 경안동 447 경기광주역 금호리첸시아아파트" — 뒤의 단지명은 떼어낸다 */
        jibun: String(it.kaptAddr ?? '').replace(/\s+\S*아파트.*$/, '').trim() || null,
        road: it.doroJuso ?? null,
        usedate: it.kaptUsedate ?? null,     // 사용승인일 YYYYMMDD
        households: Number(it.hoCnt) || null,
        builder: it.kaptBcompany ?? null,
        developer: it.kaptAcompany ?? null,
      };
    }
  } catch { /* 한 건 실패가 전체를 막으면 안 된다 */ }
  basisCache.set(kaptCode, out);
  return out;
}

/** 공고 단지명으로 K-apt 단지를 찾아 기본정보를 준다. 못 찾으면 null */
export async function matchByName(houseNm, index) {
  const n = normName(houseNm);
  if (!n || !index?.size) return null;
  let code = index.get(n);
  if (!code) {
    /* 공고명이 더 긴 경우가 많다 — 포함관계로 한 번 더 본다(짧은 쪽이 3자 미만이면 위험해서 뺀다) */
    for (const [k, v] of index) {
      if (k.length >= 4 && (n.includes(k) || k.includes(n))) { code = v; break; }
    }
  }
  return code ? basisOf(code) : null;
}
