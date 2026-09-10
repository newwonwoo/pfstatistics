#!/usr/bin/env node
/**
 * KOSIS 자동 결선기.
 *
 * 캡쳐만 보고 tblId 를 추측하면 틀린다. 그래서 키가 꽂히면 이 스크립트가
 *   ① 지표명으로 통계표 후보를 검색하고
 *   ② 후보마다 골든 시점 데이터를 실제로 뽑아보고
 *   ③ 캡쳐에서 확인된 정답값과 일치하는 통계표만 config 에 잠근다.
 *
 * 사람이 눈으로 tblId 를 고르는 단계를 없애는 게 목적이다.
 *   node scripts/resolve-kosis.js            # 전체 미확정 지표 결선
 *   node scripts/resolve-kosis.js --dry      # config 수정 없이 후보만 출력
 */
import fs from 'node:fs';
import { loadEnv, requireKey } from '../src/lib/env.js';
import { getJson } from '../src/lib/http.js';

loadEnv();
const DRY = process.argv.includes('--dry');
const CFG = 'config/indicators.json';
const cat = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const key = requireKey('KOSIS_API_KEY');

const BASE = 'https://kosis.kr/openapi';

/** 통계표 검색 — 엔드포인트가 여러 개라 되는 것을 찾아 쓴다 */
async function searchTables(keyword) {
  const attempts = [
    { name: 'statisticsSearch.do', url: `${BASE}/statisticsSearch.do?method=getList&apiKey=${key}&searchNm=${encodeURIComponent(keyword)}&format=json&jsonVD=Y` },
    { name: 'statisticsList.do',   url: `${BASE}/statisticsList.do?method=getList&apiKey=${key}&vwCd=MT_ZTITLE&parentListId=&format=json&jsonVD=Y` },
  ];
  for (const a of attempts) {
    try {
      const r = await getJson(a.url);
      if (Array.isArray(r) && r.length) {
        const rows = r
          .map(x => ({ orgId: x.ORG_ID, tblId: x.TBL_ID, tblNm: x.TBL_NM ?? x.LIST_NM, prdSe: x.PRD_SE }))
          .filter(x => x.tblId && (x.tblNm ?? '').includes(keyword.slice(0, 4)));
        if (rows.length) return { via: a.name, rows };
      }
      if (r?.err) console.log(`   (${a.name}: ${r.errMsg})`);
    } catch (e) { console.log(`   (${a.name}: ${e.message.slice(0, 80)})`); }
  }
  return { via: null, rows: [] };
}

/** 후보 통계표에서 골든 시점 값을 실제로 뽑아본다 */
async function probe({ orgId, tblId, prdSe, period }) {
  const qs = new URLSearchParams({
    method: 'getList', apiKey: key, orgId, tblId, prdSe,
    startPrdDe: period, endPrdDe: period, itmId: '', objL1: '',
    format: 'json', jsonVD: 'Y',
  });
  const r = await getJson(`${BASE}/Param/statisticsParameterData.do?${qs}`);
  return Array.isArray(r) ? r : [];
}

const num = v => Number(String(v ?? '').replace(/,/g, ''));

for (const ind of cat.indicators) {
  const s = ind.source;
  if (s.adapter !== 'kosis' || s.tblId) continue;
  const g = ind.golden;
  console.log(`\n■ ${ind.name}  (정답: ${g.region} ${g.period} = ${g.value})`);

  const { via, rows } = await searchTables(ind.name);
  if (!rows.length) { console.log('   후보 없음 — 검색어 조정 필요'); continue; }
  console.log(`   검색(${via}) 후보 ${rows.length}건`);

  let locked = null;
  for (const c of rows.slice(0, 8)) {
    try {
      const data = await probe({ ...c, prdSe: ind.period, period: g.period });
      const hit = data.find(r =>
        [r.C1_NM, r.C2_NM, r.C3_NM].some(v => v && String(v).includes(g.region)) &&
        Math.abs(num(r.DT) - Number(g.value)) < 0.05);
      console.log(`   ${hit ? '✅' : '  '} ${c.orgId}/${c.tblId}  ${(c.tblNm ?? '').slice(0, 40)}  (${data.length}행)`);
      if (hit && !locked) locked = { ...c, sample: hit };
    } catch (e) { console.log(`      ${c.tblId}: ${e.message.slice(0, 60)}`); }
  }

  if (!locked) { console.log('   ⚠️ 정답값과 일치하는 통계표 없음 — 수동확인 필요'); continue; }
  console.log(`   → 잠금: orgId=${locked.orgId} tblId=${locked.tblId}`);
  if (!DRY) {
    s.orgId = locked.orgId; s.tblId = locked.tblId; s.verified = true;
    s.note = `✅ resolve-kosis 자동결선. 골든검증 통과(${g.region} ${g.period}=${g.value})`;
  }
}

if (!DRY) { fs.writeFileSync(CFG, JSON.stringify(cat, null, 2)); console.log(`\nconfig 갱신 완료 → ${CFG}`); }
else console.log('\n(--dry: config 미변경)');
