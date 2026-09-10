#!/usr/bin/env node
/**
 * 로데이터 수집기
 *   node scripts/collect.js --sgg "경기도 광주시" --ym 202607
 *   node scripts/collect.js --addr "경기도 광주시 탄벌동 203-4"     # 지도 시설수집
 *   node scripts/collect.js --discover "주민등록세대수"              # KOSIS tblId 찾기
 *   node scripts/collect.js --items 121Y002                        # ECOS 항목코드 찾기
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/lib/env.js';
import * as kosis from '../src/collectors/kosis.js';
import * as ecos from '../src/collectors/ecos.js';
import * as molit from '../src/collectors/molit.js';
import * as kakao from '../src/collectors/kakao.js';

loadEnv();
const argv = process.argv.slice(2);
const arg = n => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const cat = JSON.parse(fs.readFileSync('config/indicators.json', 'utf8'));

// ── 탐색 모드 ──────────────────────────────────────────────
if (arg('discover')) {
  const rows = await kosis.searchTable(arg('discover'));
  console.table(rows.slice(0, 20));
  process.exit(0);
}
if (arg('items')) {
  const rows = await ecos.listItems(arg('items'));
  console.table(rows.slice(0, 60));
  process.exit(0);
}

// ── 지도 시설 수집 ─────────────────────────────────────────
if (arg('addr')) {
  const coord = await kakao.geocode(arg('addr'));
  console.log(`좌표: ${coord.x}, ${coord.y}  (${coord.jibunAddress})`);
  const fac = await kakao.collectFacilities(coord);
  for (const [label, r] of Object.entries(fac)) {
    const n = r.nearest;
    console.log(` [${r.sheet}] ${label.padEnd(8)} 반경${String(r.radius).padStart(4)}m  ${r.count}건  ${n ? `최근접: ${n.name} (${n.distance}m)` : '부재'}`);
  }
  console.log(`\n⚠️ ${kakao.ROAD_NOTE}`);
  const out = path.join('out', `facilities_${Date.now()}.json`);
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ address: arg('addr'), coord, facilities: fac }, null, 2));
  console.log(`→ ${out}`);
  process.exit(0);
}

// ── 통계 수집 ──────────────────────────────────────────────
const region = arg('sgg') ?? arg('region');
const period = arg('ym') ?? arg('period');
if (!region || !period) {
  console.error('사용법: node scripts/collect.js --sgg "경기도 광주시" --ym 202607');
  process.exit(1);
}

const ADAPTERS = { kosis, ecos, molit };
const results = [], failures = [];

for (const ind of cat.indicators) {
  const a = ADAPTERS[ind.source.adapter];
  if (!a?.collect) { failures.push({ name: ind.name, reason: `${ind.source.adapter} 어댑터 미지원 (수기/탐색필요)` }); continue; }
  const p = ind.regionLevel === 'sido' ? region.split(' ')[0] : region;
  try {
    const r = await a.collect(ind, { region: p, period });
    results.push(r);
    const g = ind.golden;
    const match = g && g.period === period && Number(g.value) === Number(r.value);
    console.log(` ✔ ${ind.name.padEnd(30)} ${r.value ?? '-'} ${ind.unit}${g && g.period === period ? (match ? '  ✅골든일치' : `  ❌골든불일치(정답 ${g.value})`) : ''}`);
  } catch (e) {
    failures.push({ name: ind.name, reason: e.message.split('\n')[0] });
    console.log(` ✗ ${ind.name.padEnd(30)} ${e.message.split('\n')[0]}`);
  }
}

fs.mkdirSync('out', { recursive: true });
const outFile = path.join('out', `raw_${region.replace(/\s/g, '')}_${period}.json`);
fs.writeFileSync(outFile, JSON.stringify({ region, period, results, failures }, null, 2));
console.log(`\n수집 ${results.length}건 / 실패 ${failures.length}건 → ${outFile}`);
