import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';

/**
 * 국토교통부 아파트 매매 실거래가 — **기축 단지의 유일한 가격 원천**.
 *
 * 청약홈 적재는 2020-02 부터라 그 앞에 분양한 단지는 분양가가 어디에도 없다.
 * 그 단지들도 규정 제16조가 쓰는 "준공" 분류에 들어가므로 실무자가 숫자를 봐야 한다.
 *
 * **실거래가는 분양가가 아니다.** 이미 팔린 값이고 시점도 다르다.
 * 그래서 비교사업장 평균에 **넣지 않는다** — 화면에 참고치로만 적고, 그 사실을 같이 적는다.
 * 조용히 섞으면 분양가격지수가 통째로 틀어진다.
 *
 * 실측 2026-09-17 — 현재 `DATA_GO_KR_KEY` 로 **바로 된다**(별도 활용신청 없이 resultCode 000).
 *   O  apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade
 *   X  .../RTMSDataSvcAptTradeDev/...  → SERVICE_KEY_IS_NOT_REGISTERED (미신청)
 *
 * 응답 필드(실측)
 *   aptNm "건영" · umdNm "송정동" · jibun 90 · excluUseAr 59.21(**전용면적**)
 *   dealAmount "104,000"(**만원**) · dealYear/dealMonth/dealDay · floor · buildYear · sggCd
 *
 * **공급면적은 주지 않는다.** 심사기준은 공급면적이므로 단가를 그대로 비교하면 안 된다 —
 * 전용 기준임을 화면에 반드시 적는다(분양가 단가가 30% 틀어졌던 것과 같은 함정).
 */
const URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

const won = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) * 10000;   // "104,000" 만원 → 원
const key = (aptNm, umdNm) => `${String(umdNm ?? '').trim()}|${String(aptNm ?? '').replace(/\s/g, '')}`;

/** 최근 months 개월치 시군구 거래를 받는다 (월 단위 API 라 달마다 한 번씩) */
async function fetchMonths(lawdCd, months) {
  const now = new Date();
  const ymList = [];
  for (let i = 1; i <= months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    ymList.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const serviceKey = requireKey('DATA_GO_KR_KEY').trim();
  const rows = [];
  await Promise.all(ymList.map(async (ym) => {
    try {
      const p = new URLSearchParams({ serviceKey, _type: 'json', LAWD_CD: lawdCd, DEAL_YMD: ym, numOfRows: '1000' });
      const d = await getJson(`${URL}?${p}`, { retries: 1, timeout: 20000 });
      const it = d?.response?.body?.items?.item;
      if (Array.isArray(it)) rows.push(...it);
      else if (it) rows.push(it);
    } catch { /* 한 달 실패가 전체를 막으면 안 된다 */ }
  }));
  return rows;
}

/**
 * 단지별 전용면적 ㎡당 실거래 평균.
 * @param {string} lawdCd  법정동코드 앞 5자리 (시군구)
 * @returns {Map<string,{unit,deals,from,to,areaMin,areaMax}>}  key = "읍면동|단지명"
 */
export async function tradeIndex(lawdCd, { months = 12 } = {}) {
  const rows = await fetchMonths(lawdCd, months);
  const m = new Map();
  for (const r of rows) {
    const amount = won(r.dealAmount);
    const area = Number(r.excluUseAr);
    if (!amount || !Number.isFinite(area) || area <= 0) continue;
    const k = key(r.aptNm, r.umdNm);
    const cur = m.get(k) ?? { amount: 0, area: 0, deals: 0, from: null, to: null, areaMin: area, areaMax: area };
    cur.amount += amount; cur.area += area; cur.deals += 1;
    cur.areaMin = Math.min(cur.areaMin, area); cur.areaMax = Math.max(cur.areaMax, area);
    const ym = `${r.dealYear}-${String(r.dealMonth).padStart(2, '0')}`;
    cur.from = cur.from == null || ym < cur.from ? ym : cur.from;
    cur.to = cur.to == null || ym > cur.to ? ym : cur.to;
    m.set(k, cur);
  }
  const out = new Map();
  for (const [k, v] of m) {
    /* Σ금액 ÷ Σ전용면적 — 면적 가중이다. 거래 한 건씩 단가를 내어 평균하면 작은 평형에 끌린다 */
    out.set(k, { unit: Math.round(v.amount / v.area), deals: v.deals, from: v.from, to: v.to,
                 areaMin: v.areaMin, areaMax: v.areaMax });
  }
  return out;
}

/** 카카오 단지명·주소로 색인에서 찾는다 (동 표기·공백·"아파트" 꼬리가 제각각이다) */
export function lookupTrade(index, name, address) {
  const dong = String(address ?? '').split(/\s+/).find(w => /(?:동|리|가)$/.test(w) && w.length > 1);
  const bare = String(name ?? '')
    .replace(/\s*\d+\s*동\s*$/, '').replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/아파트$/, '').replace(/\s/g, '');
  if (!dong || !bare) return null;
  const exact = index.get(`${dong}|${bare}`);
  if (exact) return exact;
  /* 표기가 조금씩 다르다 — 한쪽이 다른 쪽을 품으면 같은 단지로 본다 (4자 이상일 때만) */
  for (const [k, v] of index) {
    const [d, n] = k.split('|');
    if (d !== dong) continue;
    if (n.length >= 4 && bare.includes(n)) return v;
    if (bare.length >= 4 && n.includes(bare)) return v;
  }
  return null;
}
