#!/usr/bin/env node
/** 시공능력평가순위 엑셀 적재:  node scripts/ingest-rank.js <파일경로> <연도> */
import { ingest } from '../src/collectors/constructor.js';
const [file, year] = process.argv.slice(2);
if (!file || !year) { console.error('사용법: node scripts/ingest-rank.js <파일.xlsx> <연도>'); process.exit(1); }
const r = ingest(file, year);
console.log(`✔ ${r.year}년 ${r.count}건 적재 (제외 ${r.skipped}건)`);
console.table(r.sample);
