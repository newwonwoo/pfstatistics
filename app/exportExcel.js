'use client';

/**
 * 심사 평가표 엑셀 내보내기.
 *
 * 실무자가 지금 손으로 하는 일 = 시트마다 수치 적고 원천화면 캡쳐 붙여넣기.
 * 그걸 한 파일로 뽑는다. 시트 구성은 기존 평가표와 같게 유지해서
 * 실무자가 기존 양식에 옮기거나 그대로 쓸 수 있게 한다.
 *
 * 이미지 삽입이 필요해 SheetJS 가 아니라 ExcelJS 를 쓴다(SheetJS 무료판은 이미지 미지원).
 * 캡쳐는 화면에 이미 그려져 있으므로 브라우저에서 PNG 로 떠서 넣는다.
 */

const HEAD_FILL = 'FFDCE6F1';
const MARK_FILL = 'FFFFFDF0';
const BORDER = { style: 'thin', color: { argb: 'FF9AA5B1' } };
const box = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

const fmt = (v) =>
  typeof v === 'number' ? v : (v == null || v === '' ? '' : String(v));

/** 화면의 증빙 카드 DOM → PNG dataURL */
async function shot(el) {
  if (!el) return null;
  const { toPng } = await import('html-to-image');
  try {
    return await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' });
  } catch {
    return null;   // 캡쳐 실패해도 표는 나가야 한다
  }
}

function writeTable(ws, startRow, { title, subtitle, columns, rows, markCell }) {
  let r = startRow;
  if (title) {
    const c = ws.getCell(r, 2);
    c.value = title;
    c.font = { bold: true, size: 13 };
    r += 1;
  }
  if (subtitle) {
    const c = ws.getCell(r, 2);
    c.value = subtitle;
    c.font = { size: 10, color: { argb: 'FF666666' } };
    r += 1;
  }
  r += 1;

  const headRow = r;
  columns.forEach((name, i) => {
    const c = ws.getCell(r, 2 + i);
    c.value = name;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    c.border = box;
  });
  r += 1;

  rows.forEach((row, ri) => {
    row.forEach((v, ci) => {
      const c = ws.getCell(r, 2 + ci);
      c.value = fmt(v);
      c.alignment = { horizontal: ci === 0 ? 'left' : 'center', vertical: 'middle' };
      c.border = box;
      c.font = { size: 10 };
      if (markCell && markCell[0] === ri && markCell[1] === ci) {
        c.font = { size: 10, bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARK_FILL } };
        c.border = {
          top: { style: 'medium', color: { argb: 'FFD93025' } },
          left: { style: 'medium', color: { argb: 'FFD93025' } },
          bottom: { style: 'medium', color: { argb: 'FFD93025' } },
          right: { style: 'medium', color: { argb: 'FFD93025' } },
        };
      }
    });
    r += 1;
  });

  // 열 너비: 헤더/값 중 긴 쪽에 맞춘다
  columns.forEach((name, i) => {
    const col = ws.getColumn(2 + i);
    const widest = Math.max(
      String(name).length,
      ...rows.map(rw => String(rw[i] ?? '').length),
    );
    col.width = Math.min(38, Math.max(11, widest * 1.9));
  });

  return { nextRow: r + 1, headRow };
}

/**
 * @param {object} p
 * @param {object} p.data       /api/collect 응답
 * @param {object} p.facilities /api/facilities 응답 (없어도 됨)
 * @param {Function} p.buildSheet  sheets.js 의 buildSheet
 * @param {Array} p.sheets      SHEETS
 * @param {Function} p.getCardEl  (indicatorId) => HTMLElement  증빙 카드 DOM
 */
export async function exportWorkbook({ data, facilities, sheets, buildSheet, getCardEl, onProgress }) {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PF 보증심사 통계 자동수집';
  wb.created = new Date();

  const byId = Object.fromEntries((data?.results ?? []).map(r => [r.indicatorId, r]));

  // ── 요약 시트 ────────────────────────────────────────────
  const sum = wb.addWorksheet('수집요약', { views: [{ showGridLines: false }] });
  writeTable(sum, 2, {
    title: 'PF 보증심사 통계 수집 결과',
    subtitle: `▶ ${data.region} · ${data.period}`
      + `${data.company ? ` · 시공사 ${data.company}` : ''}`
      + ` · 수집 ${new Date(data.collectedAt).toLocaleString('ko-KR')}`,
    columns: ['시트', '지표', '값', '단위', '출처', '자료갱신일', '원문'],
    rows: (data.results ?? []).map(r => [
      r.sheet, r.name,
      r.ok ? (typeof r.value === 'number' ? r.value : r.value ?? '') : '수집실패',
      r.ok ? (r.unit ?? '') : '',
      r.ok ? (r.source?.citation ?? '') : (r.reason ?? ''),
      r.ok ? (r.source?.dataUpdatedAt ?? '') : '',
      r.ok ? (r.source?.viewUrl ?? '') : '',
    ]),
  });

  // ── 시트별 ──────────────────────────────────────────────
  for (const s of sheets) {
    const spec = buildSheet(s.id, {
      byId, region: data.region, period: data.period, company: data.company,
    });
    if (!spec) continue;
    onProgress?.(s.id);

    const ws = wb.addWorksheet(s.id, { views: [{ showGridLines: false }] });
    let cursor;

    if (spec.poi) {
      const rows = spec.facilities.map(f => {
        const hit = facilities?.facilities?.[f.label];
        const near = hit?.nearest;
        if (f.manual) return [f.label, f.criteria, '(수기입력)', '', '', ''];
        return [
          f.label, f.criteria,
          near ? near.name : (facilities ? '부재' : ''),
          near ? `${near.distance}m` : '',
          '', '',
        ];
      });
      cursor = writeTable(ws, 2, {
        title: spec.title,
        subtitle: `▶ 사업지 : ${facilities?.address ?? spec.subject}`,
        columns: spec.columns,
        rows,
      });
    } else {
      cursor = writeTable(ws, 2, {
        title: spec.title,
        subtitle: `▶ 사업지 : ${spec.subject} · ${data.period}`,
        columns: spec.columns,
        rows: spec.rows.map(r => r.map(c => c ?? '')),
        markCell: [0, 2],
      });
      if (spec.formula) {
        ws.getCell(cursor.nextRow, 2).value = `산식 : ${spec.formula}`;
        ws.getCell(cursor.nextRow, 2).font = { size: 9, color: { argb: 'FF666666' } };
        cursor.nextRow += 1;
      }
      if (spec.footnote) {
        ws.getCell(cursor.nextRow, 2).value = spec.footnote;
        ws.getCell(cursor.nextRow, 2).font = { size: 9, color: { argb: 'FF444444' } };
        cursor.nextRow += 1;
      }
    }

    // ── 증빙 캡쳐 삽입 ──
    let row = cursor.nextRow + 1;
    for (const id of spec.evidence ?? []) {
      const r = byId[id];
      if (!r?.ok) continue;
      const el = getCardEl?.(id);
      const png = await shot(el);

      const label = ws.getCell(row, 2);
      label.value = `[증빙] ${r.name}`;
      label.font = { bold: true, size: 10 };
      row += 1;

      if (png) {
        const imgId = wb.addImage({ base64: png.split(',')[1], extension: 'png' });
        // 캡쳐 비율을 유지하되 시트 폭을 넘지 않게
        ws.addImage(imgId, {
          tl: { col: 1, row: row - 1 },
          ext: { width: 620, height: Math.round(620 * (el.offsetHeight / el.offsetWidth)) },
        });
        row += Math.ceil((620 * (el.offsetHeight / el.offsetWidth)) / 19) + 2;
      }

      ws.getCell(row, 2).value = `* 출처 : ${r.source?.citation ?? ''}`;
      ws.getCell(row, 2).font = { size: 9 };
      row += 1;
      ws.getCell(row, 2).value =
        `조회조건 ${JSON.stringify(r.source?.queryParams ?? {})}`
        + ` · 자료갱신일 ${r.source?.dataUpdatedAt ?? '-'}`;
      ws.getCell(row, 2).font = { size: 8, color: { argb: 'FF888888' } };
      row += 1;
      if (r.source?.viewUrl) {
        const c = ws.getCell(row, 2);
        c.value = { text: '원문 화면 열기', hyperlink: r.source.viewUrl };
        c.font = { size: 9, color: { argb: 'FF1B4FD8' }, underline: true };
        row += 2;
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PF심사_${String(data.region).replace(/\s/g, '')}_${data.period}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
