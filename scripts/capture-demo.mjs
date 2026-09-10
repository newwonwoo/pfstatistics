/** 캡쳐 03(미분양) 을 로데이터로 재현해 PNG 로 뽑는다 */
import { fetchUnsoldBySgg } from '../src/collectors/molit.js';
import { buildEvidenceHtml, htmlToPng } from '../tools/capture-headless.js';

const period = '202607';
const { items, url } = await fetchUnsoldBySgg(period);
const gg = items.filter(r => r.sido === '경기' && r.sgg !== '계');
const rows = gg.map(r => [r.period, r.sido, r.sgg, r.value]);
const markRow = gg.findIndex(r => r.sgg === '광주시');

const html = buildEvidenceHtml({
  title: '시·군·구별 미분양현황 (200012 ~ 202607)',
  subtitle: '기간 202607 ~ 202607 · 양식128 · 단위: 호',
  columns: ['월(Monthly)', '구분', '시군구', '미분양현황'],
  rows, markRow, markCol: 3,
  citation: '국토교통통계누리(정기통계) 中 미분양주택현황(종합)의 미분양주택수 (26.7 기준)',
  meta: { url, queryParams: { formId: 2082, styleNum: 128, startDate: period, endDate: period }, dataUpdatedAt: null, collectedAt: new Date().toISOString() },
});
const out = await htmlToPng(html, 'out/evidence/지역미분양_경기_202607.png', { width: 620 });
console.log('증빙 캡쳐 생성 →', out);
