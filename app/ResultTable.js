'use client';

const S = {
  wrap: { marginTop: 22, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid var(--line)' },
  title: { fontSize: 14, fontWeight: 700 },
  meta: { fontSize: 12, color: 'var(--muted)' },
  scroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 },
  th: { textAlign: 'left', padding: '9px 14px', background: '#f3f5f7', borderBottom: '1px solid var(--line)', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)' },
  td: { padding: '10px 14px', borderBottom: '1px solid #eef1f4', verticalAlign: 'top' },
  val: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  cite: { color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.45 },
  reason: { color: 'var(--err)', fontSize: 12 },
  pill: (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: fg, whiteSpace: 'nowrap' }),
};

const fmt = (v, unit) =>
  v == null ? '-' : `${typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : v} ${unit ?? ''}`.trim();

export default function ResultTable({ data }) {
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>{data.region} · {data.period}</span>
        <span style={S.meta}>
          {data.okCount}/{data.total} 수집 · {new Date(data.collectedAt).toLocaleString('ko-KR')}
        </span>
      </div>
      <div style={S.scroll}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>시트</th>
              <th style={S.th}>지표</th>
              <th style={S.th}>값</th>
              <th style={S.th}>검증</th>
              <th style={S.th}>출처 · 자료갱신일</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.indicatorId}>
                <td style={{ ...S.td, color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{r.sheet}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{r.name}</td>
                <td style={{ ...S.td, ...S.val }}>
                  {r.ok ? fmt(r.value, r.unit) : <span style={S.reason}>—</span>}
                </td>
                <td style={S.td}>
                  {!r.ok ? <span style={S.pill('#fef2f2', '#b91c1c')}>실패</span>
                    : r.golden ? (r.golden.match
                        ? <span style={S.pill('#ecfdf5', '#15803d')}>골든일치</span>
                        : <span style={S.pill('#fffbeb', '#b45309')}>불일치 {r.golden.expected}</span>)
                    : <span style={S.pill('#f3f4f6', '#6b7280')}>수집</span>}
                </td>
                <td style={S.td}>
                  {r.ok ? (
                    <div style={S.cite}>
                      {r.source?.citation}
                      {r.source?.dataUpdatedAt && <> · 갱신 {r.source.dataUpdatedAt}</>}
                    </div>
                  ) : <div style={S.reason}>{r.reason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
