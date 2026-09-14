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

/** 지도 DOM → PNG dataURL (타일 CORS 때문에 전용 캡쳐를 쓴다) */
async function shotMap(el) {
  if (!el) return null;
  try {
    const { captureMap } = await import('./captureMap');
    return await captureMap(el);
  } catch { return null; }
}

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
export async function exportWorkbook({ data, facilities, manual, sheets, buildSheet, getCardEl, onProgress }) {
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
  const failed = [];
  for (const s of sheets) {
    let spec;
    try {
      spec = buildSheet(s.id, { byId, region: data.region, period: data.period, company: data.company });
    } catch (e) { failed.push(`${s.id}: ${e.message}`); continue; }
    if (!spec) continue;
    onProgress?.(s.id);
    try {

    const ws = wb.addWorksheet(s.id, { views: [{ showGridLines: false }] });
    let cursor;

    if (spec.poi) {
      /*
       * POI 시트는 캡쳐대로 표 구조가 셋이다(화면과 동일하게 유지해야 한다).
       *   flat    교통환경   — 항목별 독립 판정 + 평균점수 행
       *   grouped 주거편의   — 그룹별 판정 + 묶음 라벨 행
       *   dual    교육환경   — 반경 500m / 1km 2단
       */
      const near = (label) => facilities?.facilities?.[label]?.nearest ?? null;
      const cell = (label) => {
        const n = near(label);
        return facilities ? (n ? n.name : '부재') : '';
      };
      const dist = (label) => {
        const n = near(label);
        return facilities ? (n ? `${n.distance}m` : '-') : '';
      };
      /** 6차선 왕복도로처럼 위성사진으로 육안 판정하는 항목 */
      const manualRow = (f) => {
        const m = manual?.[f.label];
        return [f.label, f.criteria, m?.name ?? '(위성사진 판정 전)', m?.note ?? '', '', ''];
      };

      let rows = [];
      if (spec.layout === 'grouped') {
        for (const g of spec.groups) {
          for (const f of g.facilities) {
            rows.push([f.label, cell(f.label), dist(f.label), g.condition, '', '']);
          }
          rows.push([g.label, '', '', '', '', '']);   // 묶음 라벨 행
        }
      } else if (spec.layout === 'dual') {
        for (const f of spec.facilities) {
          const n = near(f.label);
          const in500 = n && n.distance <= 500;
          const in1k = n && n.distance > 500 && n.distance <= 1000;
          rows.push([
            f.label,
            in500 ? `${n.name} (${n.distance}m)` : '',
            in1k ? `${n.name} (${n.distance}m)` : '',
            '', '',
          ]);
        }
        if (spec.summaryRow) rows.push([spec.summaryRow, '', '', '', '']);
      } else {
        for (const f of spec.facilities) {
          rows.push(f.manual
            ? manualRow(f)
            : [f.label, f.criteria, cell(f.label), dist(f.label), '', '']);
        }
        if (spec.summaryRow) rows.push([spec.summaryRow, '', '', '', '', '']);
      }

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

    /** 캡쳐 이미지 한 장을 시트에 넣고 다음 행 번호를 돌려준다 */
    const putImage = (png, el, atRow) => {
      if (!png || !el) return atRow;
      const h = Math.round(620 * (el.offsetHeight / el.offsetWidth));
      const imgId = wb.addImage({ base64: png.split(',')[1], extension: 'png' });
      ws.addImage(imgId, { tl: { col: 1, row: atRow - 1 }, ext: { width: 620, height: h } });
      return atRow + Math.ceil(h / 19) + 2;
    };

    // ── 증빙 캡쳐 삽입 ──
    let row = cursor.nextRow + 1;

    // 반경시설 시트: 반경원 지도를 증빙으로 넣는다 (6차선 판정용 위성지도 포함)
    if (spec.poi) {
      const list = spec.groups ? spec.groups.flatMap(g => g.facilities) : spec.facilities;
      for (const f of list) {
        const el = document.querySelector(`[data-map="${f.label}"]`);
        if (!el) continue;
        onProgress?.(`${s.id} · ${f.label} 지도`);
        const png = await shotMap(el);
        if (!png) continue;
        const label = ws.getCell(row, 2);
        label.value = `[증빙] ${f.label} · ${f.criteria ?? ''}`;
        label.font = { bold: true, size: 10 };
        row = putImage(png, el, row + 1);
        const hit = facilities?.facilities?.[f.label];
        ws.getCell(row, 2).value = f.manual
          ? `* 위성사진 육안 판정 · 반경 ${f.radius}m`
          : `* 출처 : 카카오맵 · 반경 ${hit?.radius ?? ''}m · 반경 내 ${hit?.count ?? 0}건`
            + (hit?.basis === 'polygon' ? ' · 사업지 경계 기준' : ' · 대표지번 기준');
        ws.getCell(row, 2).font = { size: 9 };
        row += 2;
      }
    }
    for (const id of spec.evidence ?? []) {
      const r = byId[id];
      if (!r?.ok) continue;
      const el = getCardEl?.(id);
      const png = await shot(el);

      const label = ws.getCell(row, 2);
      label.value = `[증빙] ${r.name}`;
      label.font = { bold: true, size: 10 };
      row += 1;

      row = putImage(png, el, row);

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
    } catch (e) {
      // 시트 하나가 터져도 나머지는 나가야 한다. 실패 사실은 파일 안에 남긴다.
      failed.push(`${s.id}: ${e.message}`);
      ws.getCell(2, 2).value = `이 시트를 만들지 못했습니다 — ${e.message}`;
      ws.getCell(2, 2).font = { size: 10, color: { argb: 'FFB3261E' } };
    }
  }

  if (failed.length) {
    const r0 = sum.rowCount + 3;
    sum.getCell(r0, 2).value = '생성 실패 시트';
    sum.getCell(r0, 2).font = { bold: true, size: 10, color: { argb: 'FFB3261E' } };
    failed.forEach((f, i) => {
      sum.getCell(r0 + 1 + i, 2).value = f;
      sum.getCell(r0 + 1 + i, 2).font = { size: 9, color: { argb: 'FF666666' } };
    });
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
