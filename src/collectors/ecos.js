import { requireKey } from '../lib/env.js';
import { getJson, envelope } from '../lib/http.js';

const BASE = 'https://ecos.bok.or.kr/api';

/** 통계표의 항목코드 목록 — 항목코드를 추측하지 말고 이걸로 확인할 것 */
export async function listItems(statCode, { start = 1, end = 100 } = {}) {
  const key = requireKey('ECOS_API_KEY');
  const d = await getJson(`${BASE}/StatisticItemList/${key}/json/kr/${start}/${end}/${statCode}`);
  if (d.RESULT) throw new Error(`ECOS: ${d.RESULT.MESSAGE}`);
  return (d.StatisticItemList?.row ?? []).map(r => ({
    itemCode: r.ITEM_CODE, itemName: r.ITEM_NAME,
    cycle: r.CYCLE, from: r.START_TIME, to: r.END_TIME,
  }));
}

export async function fetchData({ statCode, cycle, start, end, itemCode }) {
  const key = requireKey('ECOS_API_KEY');
  const url = `${BASE}/StatisticSearch/${key}/json/kr/1/1000/${statCode}/${cycle}/${start}/${end}/${itemCode}`;
  const d = await getJson(url);
  if (d.RESULT) throw new Error(`ECOS: ${d.RESULT.MESSAGE}`);
  return { rows: d.StatisticSearch?.row ?? [], url };
}

export async function collect(indicator, { period }) {
  const s = indicator.source;
  if (!s.itemCode) {
    const e = new Error(`${indicator.name}: itemCode 미확정 — 'npm run collect -- --items ${s.statCode}' 로 먼저 확인 필요`);
    e.code = 'NO_ITEMCODE';
    throw e;
  }
  const { rows, url } = await fetchData({
    statCode: s.statCode, cycle: s.cycle,
    start: period, end: period, itemCode: s.itemCode,
  });
  const hit = rows.at(-1);
  return envelope({
    indicatorId: indicator.id, name: indicator.name, region: '전국', period,
    value: hit ? Number(hit.DATA_VALUE) : null,
    unit: indicator.unit,
    source: {
      org: s.org, citation: s.citation, url,
      queryParams: { statCode: s.statCode, itemCode: s.itemCode, cycle: s.cycle, period },
      dataUpdatedAt: null,
    },
    raw: hit ?? rows.slice(0, 5),
  });
}
