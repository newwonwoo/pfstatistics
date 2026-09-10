'use client';
import { T, mono } from './theme';

/** 수집 현황 한 줄 요약 — 어느 시트가 비었는지 바로 보이게. */
const S = {
  wrap: { background: T.panel, border: `1px solid ${T.line}`, borderRadius: T.radius, boxShadow: T.shadow, overflow: 'hidden' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: `1px solid ${T.line}` },
  title: { fontSize: 13, fontWeight: 700 },
  meta: { fontSize: 11.5, color: T.muted, ...mono },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 0 },
  item: (ok) => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderRight: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}`,
    cursor: 'pointer', background: ok ? '#fff' : '#fcfcfd',
  }),
  name: { fontSize: 12, color: T.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  val: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', ...mono },
  dash: { fontSize: 12, color: T.muted },
  chip: (bg, fg) => ({ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: bg, color: fg }),
  bar: { height: 4, background: '#eef0f3' },
  fill: (p) => ({ height: 4, width: `${p}%`, background: T.ok, transition: 'width .3s' }),
};

const fmt = (v, u) => v == null ? null
  : `${typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : v}${u ? ' ' + u : ''}`;

export default function Overview({ data, onJump }) {
  const pct = Math.round((data.okCount / data.total) * 100);
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>{data.region} · {data.period}</span>
        <span style={S.meta}>{data.okCount}/{data.total} 수집 · {new Date(data.collectedAt).toLocaleString('ko-KR')}</span>
      </div>
      <div style={S.bar}><div style={S.fill(pct)} /></div>
      <div style={S.list}>
        {data.results.map(r => (
          <div key={r.indicatorId} style={S.item(r.ok)} onClick={() => onJump(r.sheet)} title={r.ok ? r.source?.citation : r.reason}>
            <span style={S.name}>{r.name}</span>
            {r.ok
              ? <span style={S.val}>
                  {fmt(r.value, r.unit)}
                  {r.golden && <span style={{ marginLeft: 6, ...S.chip(r.golden.match ? T.okSoft : T.warnSoft, r.golden.match ? T.ok : T.warn) }}>
                    {r.golden.match ? '검증' : '불일치'}
                  </span>}
                </span>
              : <span style={S.dash}>—</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
