'use client';
import { useMemo, useRef, useState } from 'react';
import { T } from './theme';
import RANK from '../data/constructor-rank.json';

/**
 * 시공사 선택.
 *
 * 상호는 표기가 제각각이다((주)/㈜/주식회사/공백). 직접 치게 하면 순위 매칭이 어긋난다.
 * 적재된 시공능력평가순위 표에서 고르게 하면 순위가 그 자리에서 확정된다.
 *
 * ⚠️ 지금 적재된 표는 **샘플**이다(data/constructor-rank.json).
 * 목록에 없는 상호는 직접 입력할 수 있게 두되, 순위가 안 나온다는 것을 화면에 밝힌다.
 */
const YEARS = Object.keys(RANK).sort().reverse();

const S = {
  field: { display: 'flex', flexDirection: 'column', gap: 5, position: 'relative' },
  label: { fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: '.02em' },
  input: { padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 13, background: '#fff', color: T.ink, width: '100%' },
  ok: { borderColor: T.accent, background: T.accentSoft },
  list: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 3,
    background: '#fff', border: `1px solid ${T.lineStrong}`, borderRadius: 6,
    boxShadow: '0 6px 18px rgba(16,24,40,.14)', maxHeight: 260, overflowY: 'auto',
  },
  item: (on) => ({
    padding: '7px 10px', fontSize: 12.5, cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', gap: 10,
    background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink,
  }),
  rank: { fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: T.muted },
  none: { padding: '9px 10px', fontSize: 12, color: T.muted, lineHeight: 1.6 },
};

/** (주)·㈜·주식회사·공백을 지워 표기차를 흡수한다 */
const norm = (s) => String(s ?? '').replace(/\(주\)|㈜|주식회사|\s+/g, '');

export default function CompanyPicker({ value, year, onChange, disabled = false }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const blurTimer = useRef(null);

  const rows = useMemo(() => {
    const y = RANK[year] ? year : YEARS[0];
    return (RANK[y]?.rows ?? []).map(r => ({ name: r.상호, rank: r.순위, area: r.지역, year: y }));
  }, [year]);

  const hits = useMemo(() => {
    const k = norm(q);
    if (!k) return rows.slice(0, 60);
    return rows.filter(r => norm(r.name).includes(k)).slice(0, 60);
  }, [q, rows]);

  const matched = useMemo(
    () => rows.find(r => norm(r.name) === norm(value)) ?? null,
    [rows, value],
  );

  const choose = (r) => { onChange(r.name); setQ(''); setOpen(false); setCur(0); };

  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur(i => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && hits[cur]) { e.preventDefault(); choose(hits[cur]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div style={S.field}>
      <label style={S.label}>
        시공사
        {matched
          ? <span style={{ color: T.accent }}> · {matched.year}년 시공능력 {matched.rank}위</span>
          : value ? <span style={{ color: T.warn }}> · 적재된 표에 없음 (순위 미산출)</span> : null}
      </label>
      <input
        style={{ ...S.input, ...(matched ? S.ok : null) }}
        value={open ? q : (value ?? '')}
        placeholder="상호 검색 — (주) 없이 쳐도 됩니다"
        disabled={disabled}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); setCur(0); }}
        onFocus={() => { setQ(''); setCur(0); setOpen(true); }}
        onKeyDown={onKey}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
      />
      {open && !disabled && (
        <div style={S.list} onMouseDown={() => clearTimeout(blurTimer.current)}>
          {hits.length === 0 && (
            <div style={S.none}>
              적재된 시공능력평가순위 표에 없습니다.<br />
              그대로 두면 상호만 들어가고 순위는 빈칸으로 나갑니다.
            </div>
          )}
          {hits.map((r, i) => (
            <div key={r.name} style={S.item(i === cur)} onMouseEnter={() => setCur(i)} onClick={() => choose(r)}>
              <span>{r.name} <span style={S.dim}>· {r.area}</span></span>
              <span style={S.rank}>{r.rank}위</span>
            </div>
          ))}
          <div style={{ ...S.none, borderTop: `1px solid ${T.line}` }}>
            적재본: {rows.length}건 ({RANK[year] ? year : YEARS[0]}년) — 전체 표를 올리면 모두 검색됩니다
          </div>
        </div>
      )}
    </div>
  );
}
