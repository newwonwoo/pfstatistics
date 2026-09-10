#!/usr/bin/env node
/** 수집 전 사전점검: 키 상태 + 원천 도달성 + 지표별 준비도 */
import fs from 'node:fs';
import { loadEnv, KEY_NAMES, ISSUE_URL } from '../src/lib/env.js';

loadEnv();
const cat = JSON.parse(fs.readFileSync('config/indicators.json', 'utf8'));

console.log('\n━━━ 1. API 키 ━━━');
const keyOk = {};
for (const k of KEY_NAMES) {
  keyOk[k] = Boolean(process.env[k]);
  console.log(` ${keyOk[k] ? '✔' : '✗'} ${k.padEnd(18)} ${keyOk[k] ? '설정됨' : `미설정 → ${ISSUE_URL[k]}`}`);
}

console.log('\n━━━ 2. 원천 도달성 ━━━');
const HOSTS = [
  ['KOSIS',        'https://kosis.kr/openapi/'],
  ['공공데이터포털', 'https://api.odcloud.kr/api'],
  ['ECOS',         'https://ecos.bok.or.kr/api/'],
  ['카카오 Local',  'https://dapi.kakao.com/v2/local/search/address.json'],
  ['KB부동산',      'https://api.kbland.kr'],
  ['국토부 통계누리', 'https://stat.molit.go.kr'],
  ['대한건설협회',   'https://www.cak.or.kr'],
];
await Promise.all(HOSTS.map(async ([name, url]) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    console.log(` ✔ ${name.padEnd(14)} HTTP ${r.status}${r.status === 401 ? ' (키만 필요)' : ''}`);
  } catch {
    console.log(` ✗ ${name.padEnd(14)} 도달불가 (차단)`);
  } finally { clearTimeout(t); }
}));

console.log('\n━━━ 3. 지표별 수집 준비도 ━━━');
let ready = 0;
for (const ind of cat.indicators) {
  const s = ind.source;
  const blockers = [];
  if (s.keyRequired && !keyOk[s.keyRequired]) blockers.push(`${s.keyRequired} 없음`);
  if (s.adapter === 'kosis' && !s.tblId) blockers.push('tblId 미확정');
  if (s.adapter === 'ecos' && !s.itemCode) blockers.push('itemCode 미확정');
  if (s.adapter === 'molit' && !s.endpointUrl) blockers.push('엔드포인트 미설정');
  if (s.adapter === 'manual') blockers.push('수기입력 항목');
  if (s.adapter === 'kb') blockers.push('KB API 경로 탐색 필요');
  if (!blockers.length) ready++;
  console.log(` ${blockers.length ? '✗' : '✔'} ${ind.name.padEnd(34)} ${blockers.join(', ') || '수집가능'}`);
}
console.log(`\n → ${ready}/${cat.indicators.length} 지표 수집가능\n`);
