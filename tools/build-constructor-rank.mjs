/**
 * 시공능력평가순위 적재 — data/constructor-rank.json
 *
 * 출처: 대한건설협회 > 협회공시 > 공시자료
 *   목록 https://www.cak.or.kr/lay1/bbs/S1T10C14/A/4/list.do
 *   본문에 "종합건설사업자 시공능력평가액 공시" 글이 연 1회(8월) 올라오고
 *   첨부 엑셀(/download.do?uuid=...) 에 전 업체가 들어 있다.
 *
 * 시트는 업종별로 나뉜다(토건·토목·건축·산설·조경).
 * PF 보증심사에서 쓰는 것은 **토건(토목건축공사업)** 이라 그 시트만 적재한다.
 * 헤더가 3~5행에 병합돼 있고 데이터는 6행부터다.
 *
 * 사용자는 터미널을 쓰지 않는다 — 이 스크립트는 유지보수용이다.
 * 연 1회 공시가 갱신되면 다시 돌려 커밋한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const BASE = 'https://www.cak.or.kr';
const LIST = `${BASE}/lay1/bbs/S1T10C14/A/4/list.do`;
const SHEET = '토건';                 // 토목건축공사업
const KEEP_YEARS = 3;                 // 최근 3개 연도

const get = async (u) => {
  const r = await fetch(u, { headers: { Referer: LIST } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r;
};

/** 공시 목록에서 "YYYY년도 … 시공능력평가액 공시" 글들을 찾는다 */
async function findPosts() {
  const html = await (await get(LIST)).text();
  const out = new Map();
  for (const m of html.matchAll(/href="(view\.do\?article_seq=(\d+)[^"]*)"[^>]*>\s*([^<]{4,90})/g)) {
    const title = m[3].trim().replace(/\s+/g, ' ');
    const y = title.match(/(\d{4})년도/)?.[1];
    if (!y || !/시공능력평가액\s*공시/.test(title)) continue;
    if (!out.has(y)) out.set(y, { year: y, seq: m[2], title });   // 첫 글 = 최신(정정본 포함)
  }
  return [...out.values()].sort((a, b) => b.year.localeCompare(a.year)).slice(0, KEEP_YEARS);
}

/** 본문에서 첨부 엑셀 주소와 원본 파일명을 뽑는다 */
async function findAttachment(seq) {
  const html = await (await get(`${BASE}/lay1/bbs/S1T10C14/A/4/view.do?article_seq=${seq}`)).text();
  const uuid = html.match(/\/download\.do\?uuid=([^"']+\.xlsx?)/)?.[1];
  const name = html.match(/class="file">([^<]+)<\/a>/)?.[1]?.trim();
  if (!uuid) throw new Error(`첨부 엑셀을 찾지 못했습니다 (article_seq=${seq})`);
  return { url: `${BASE}/download.do?uuid=${uuid}`, name: name ?? uuid };
}

/** 토건 시트 → 행 배열. 헤더 위치는 "순위/상호"가 같이 있는 줄로 찾는다. */
async function parse(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(SHEET) ?? wb.worksheets[0];

  // 연도마다 머리글이 다르다 — 2024는 "연번/토건등록번호/토건시평", 2025~는 "순위/등록번호/시공능력평가액"
  const isRank = (k) => /^(순위|연번)/.test(k);
  const isName = (k) => /^상호/.test(k);

  let head = 0;
  for (let r = 1; r <= 20 && !head; r++) {
    const v = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (c) => v.push(String(c.value ?? '').replace(/\s/g, '')));
    if (v.some(isRank) && v.some(isName)) head = r;
  }
  if (!head) throw new Error(`헤더 행(순위·상호)을 찾지 못했습니다 — ${SHEET} 시트`);

  const col = {};
  ws.getRow(head).eachCell({ includeEmpty: true }, (c, i) => {
    const k = String(c.value ?? '').replace(/\s/g, '');
    if (isRank(k)) col.순위 ??= i;
    else if (isName(k)) col.상호 ??= i;
    else if (k.includes('소재지')) col.지역 ??= i;
    else if (k.includes('등록번호')) col.등록번호 ??= i;
    else if (k.includes('시공능력평가액') || k.includes('시평')) col.평가액 ??= i;
  });
  if (!col.순위 || !col.상호) throw new Error(`순위/상호 열을 찾지 못했습니다 (head=${head})`);

  const rows = [];
  const cell = (row, i) => (i ? row.getCell(i).value : null);
  for (let r = head + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rank = Number(String(cell(row, col.순위) ?? '').replace(/[^0-9]/g, ''));
    const name = String(cell(row, col.상호) ?? '').trim();
    if (!rank || !name) continue;
    rows.push({
      상호: name,
      순위: rank,
      지역: String(cell(row, col.지역) ?? '').trim() || null,
      업종: '토목건축공사업',
      업종코드: '03',
      등록번호: String(cell(row, col.등록번호) ?? '').trim() || null,
      평가액: Number(cell(row, col.평가액)) || null,     // 백만원
    });
  }
  return rows;
}

const posts = await findPosts();
if (!posts.length) throw new Error('공시 글을 찾지 못했습니다');

const store = {};
for (const p of posts) {
  const at = await findAttachment(p.seq);
  const buf = Buffer.from(await (await get(at.url)).arrayBuffer());
  const rows = await parse(buf);
  store[p.year] = {
    year: p.year,
    sourceFile: at.name,
    sourceUrl: `${BASE}/lay1/bbs/S1T10C14/A/4/view.do?article_seq=${p.seq}`,
    sourceTitle: p.title,
    sheet: SHEET,
    ingestedAt: new Date().toISOString(),
    count: rows.length,
    rows,
  };
  console.log(`${p.year}  ${rows.length}건  ${at.name}`);
}

const out = path.join(process.cwd(), 'data/constructor-rank.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(store, null, 1));
console.log(`→ ${out}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)}MB`);
