import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 이 환경엔 Chromium 이 미리 깔려있고(PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
 * playwright 패키지가 기대하는 빌드번호와 다를 수 있다. 있으면 그걸 직접 쓴다.
 */
const LOCAL_CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find(p => fs.existsSync(p));
const launchOpts = LOCAL_CHROME ? { executablePath: LOCAL_CHROME } : {};

/**
 * 증빙 캡쳐 엔진.
 *
 * 실무자가 지금 손으로 하는 일 = 원천 화면 띄우고 → 해당 값 빨간박스 치고 → 스크린샷 → 엑셀 붙여넣기.
 * 이걸 헤드리스 Chromium 으로 대체한다. 두 가지 방식을 쓴다.
 *
 *  (A) 렌더형 — 수집한 로데이터로 원천 화면과 같은 표를 그려 캡쳐. 결정적이고 항상 성공.
 *  (B) 실화면형 — 원천 사이트를 실제로 띄워 조회하고 그 화면을 캡쳐. 원본 그대로지만 사이트 개편에 취약.
 *
 * 기본은 (A). 감사 대응이 필요한 항목만 (B)를 병행한다.
 */

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;background:#fff;color:#111}
.wrap{padding:18px 20px}
h2{margin:0 0 4px;font-size:17px}
.sub{font-size:12px;color:#555;margin-bottom:12px}
table{border-collapse:collapse;font-size:13px}
th,td{border:1px solid #9aa;padding:5px 10px;text-align:center;white-space:nowrap}
th{background:#dce6f1;font-weight:600}
td.label{background:#f4f6f8;text-align:left}
tr.hl td{background:#fffde7}
td.mark{border:2px solid #e53935;font-weight:700}
.cite{margin-top:10px;font-size:11.5px;color:#333}
.meta{margin-top:3px;font-size:10.5px;color:#777}
`;

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = v => typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : esc(v);

/**
 * 표 형태 증빙 HTML 생성.
 * @param {object} o
 * @param {string} o.title       예: "시·군·구별 미분양현황"
 * @param {string[]} o.columns
 * @param {Array<Array>} o.rows
 * @param {number} o.markRow     빨간박스 칠 행 index
 * @param {number} o.markCol     빨간박스 칠 열 index
 * @param {string} o.citation    "* 출처 : ..." 문구
 * @param {object} o.meta        { url, queryParams, dataUpdatedAt, collectedAt }
 */
export function buildEvidenceHtml({ title, subtitle, columns, rows, markRow, markCol, citation, meta }) {
  const head = columns.map(c => `<th>${esc(c)}</th>`).join('');
  const body = rows.map((r, ri) => {
    const tds = r.map((c, ci) => {
      const cls = [ci === 0 ? 'label' : '', ri === markRow && ci === markCol ? 'mark' : ''].filter(Boolean).join(' ');
      return `<td${cls ? ` class="${cls}"` : ''}>${fmt(c)}</td>`;
    }).join('');
    return `<tr${ri === markRow ? ' class="hl"' : ''}>${tds}</tr>`;
  }).join('');

  return `<style>${CSS}</style><div class="wrap">
<h2>${esc(title)}</h2>
${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<div class="cite">* 출처 : ${esc(citation)}</div>
<div class="meta">조회조건 ${esc(JSON.stringify(meta.queryParams ?? {}))} · 자료갱신일 ${esc(meta.dataUpdatedAt ?? '-')} · 수집 ${esc((meta.collectedAt ?? '').slice(0, 19))}</div>
<div class="meta">${esc(meta.url ?? '')}</div>
</div>`;
}

/** HTML → PNG. 엑셀에 그대로 붙여넣을 수 있게 2배 해상도로 뽑는다. */
export async function htmlToPng(html, outPath, { width = 1000, scale = 2 } = {}) {
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const el = await page.$('.wrap');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await (el ?? page).screenshot({ path: outPath });
    return outPath;
  } finally {
    await browser.close();
  }
}

/** 수집 봉투(envelope) 1건 → 증빙 PNG */
export async function captureFromEnvelope(env, { title, columns, rows, markRow, markCol, outPath }) {
  const html = buildEvidenceHtml({
    title,
    subtitle: `▶ ${env.region} · ${env.period}`,
    columns, rows, markRow, markCol,
    citation: env.source.citation,
    meta: { ...env.source, collectedAt: env.collectedAt },
  });
  return htmlToPng(html, outPath);
}
