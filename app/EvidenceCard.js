'use client';
import { useRef, useState } from 'react';

/**
 * 증빙 캡쳐 카드.
 *
 * 헤드리스 Chromium 은 베르셀 서버리스에서 못 돈다(용량·바이너리 제약).
 * 대신 이 카드를 브라우저에서 그대로 그리고, 다운로드 시점에 캔버스로 PNG 를 뽑는다.
 * 결과물은 동일하고, 오히려 실무자가 화면에서 눈으로 확인한 뒤 저장할 수 있어 낫다.
 */
const S = {
  card: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' },
  bar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--line)', background: '#fafbfc' },
  name: { fontSize: 13, fontWeight: 700 },
  btns: { display: 'flex', gap: 8 },
  btn: { padding: '6px 13px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', background: '#fff', borderRadius: 5, cursor: 'pointer', color: 'var(--ink)' },
  // ↓ 이 영역이 그대로 PNG 가 된다. 엑셀 붙여넣기용이라 흰 배경 고정.
  shot: { background: '#fff', padding: '16px 18px', color: '#111' },
  title: { fontSize: 15, fontWeight: 700, margin: '0 0 3px' },
  sub: { fontSize: 11.5, color: '#555', marginBottom: 11 },
  table: { borderCollapse: 'collapse', fontSize: 12.5 },
  th: { border: '1px solid #9aa', padding: '5px 11px', background: '#dce6f1', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { border: '1px solid #9aa', padding: '5px 11px', textAlign: 'center', whiteSpace: 'nowrap' },
  tdMark: { border: '2px solid var(--mark)', padding: '5px 11px', textAlign: 'center', fontWeight: 700, background: '#fffde7' },
  cite: { marginTop: 10, fontSize: 11.5, color: '#333' },
  meta: { marginTop: 3, fontSize: 10.5, color: '#777', wordBreak: 'break-all' },
};

const fmtNum = (v) => typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : String(v ?? '-');

/** 지표별로 원천 화면에 가까운 표를 만든다. raw 에 시계열이 있으면 그걸 펼친다. */
function buildTable(row) {
  const raw = row.raw ?? {};
  if (Array.isArray(raw.series)) {
    const s = raw.series.filter(x => x.momRate != null).slice(-8);
    return {
      columns: ['지역명', ...s.map(x => x.period)],
      rows: [[raw.지역명 ?? row.region, ...s.map(x => x.momRate.toFixed(3))]],
      markRow: 0, markCol: s.length,
    };
  }
  if (raw.고시일) {
    return {
      columns: ['구분', '고시일', '오전', '오후'],
      rows: [['CD수익률(91일)', raw.고시일, fmtNum(raw.오전), fmtNum(raw.오후)]],
      markRow: 0, markCol: 3,
    };
  }
  if (raw.상호) {
    return {
      columns: ['업종', '지역', '상호', '순위'],
      rows: [[raw.업종 ?? '-', raw.지역 ?? '-', raw.상호, raw.순위]],
      markRow: 0, markCol: 3,
    };
  }
  return {
    columns: ['지역', '기준시점', row.name],
    rows: [[row.region, row.period, fmtNum(row.value)]],
    markRow: 0, markCol: 2,
  };
}

export default function EvidenceCard({ row, region }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const t = buildTable(row);

  async function download() {
    setBusy(true);
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${row.sheet}_${region.replace(/\s/g, '')}_${row.period}.png`;
      a.click();
    } finally { setBusy(false); }
  }

  async function copyImage() {
    setBusy(true);
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('클립보드에 복사했습니다. 엑셀에 바로 붙여넣으세요.');
    } catch {
      alert('이 브라우저는 이미지 복사를 지원하지 않습니다. PNG 저장을 이용하세요.');
    } finally { setBusy(false); }
  }

  return (
    <div style={S.card}>
      <div style={S.bar}>
        <span style={S.name}>[{row.sheet}] {row.name}</span>
        <div style={S.btns}>
          <button style={S.btn} onClick={copyImage} disabled={busy}>엑셀로 복사</button>
          <button style={S.btn} onClick={download} disabled={busy}>PNG 저장</button>
        </div>
      </div>

      <div ref={ref} style={S.shot}>
        <div style={S.title}>{row.name}</div>
        <div style={S.sub}>▶ {row.region} · {row.period}</div>
        <table style={S.table}>
          <thead>
            <tr>{t.columns.map(c => <th key={c} style={S.th}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} style={ri === t.markRow && ci === t.markCol ? S.tdMark : S.td}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={S.cite}>* 출처 : {row.source?.citation}</div>
        <div style={S.meta}>
          조회조건 {JSON.stringify(row.source?.queryParams ?? {})}
          {' · '}자료갱신일 {row.source?.dataUpdatedAt ?? '-'}
          {' · '}수집 {String(row.collectedAt ?? '').slice(0, 19)}
        </div>
        {row.source?.url && (
          <div style={S.meta}>
            {decodeURIComponent(row.source.url).slice(0, 150)}
            {decodeURIComponent(row.source.url).length > 150 ? '…' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
