'use client';
import { useEffect, useRef, useState } from 'react';
import { T } from './theme';

/**
 * 시공사 선택.
 *
 * 상호는 표기가 제각각이다((주)/㈜/주식회사/공백) — 공시 원본조차
 * "현대건설(주)" 와 "주식회사 포스코이앤씨" 가 섞여 있다. 직접 치게 하면 순위 매칭이 어긋난다.
 * 대한건설협회 공시 명부에서 고르면 순위가 그 자리에서 확정된다.
 *
 * 명부가 연도별 2,800여 건이라 번들에 싣지 않고 /api/constructors 로 찾는다.
 */
const S = {
  field: { display: 'flex', flexDirection: 'column', gap: 5, position: 'relative' },
  label: { fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: '.02em' },
  input: { padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 13, background: '#fff', color: T.ink, width: '100%' },
  ok: { borderColor: T.accent, background: T.accentSoft },
  list: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 3,
    background: '#fff', border: `1px solid ${T.lineStrong}`, borderRadius: 6,
    boxShadow: '0 6px 18px rgba(16,24,40,.14)', maxHeight: 280, overflowY: 'auto',
  },
  item: (on) => ({
    padding: '7px 10px', fontSize: 12.5, cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', gap: 10,
    background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink,
  }),
  rank: { fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: T.muted },
  foot: { padding: '7px 10px', fontSize: 10.5, color: T.muted, background: '#fafbfc', borderTop: `1px solid ${T.line}`, lineHeight: 1.5 },
  none: { padding: '9px 10px', fontSize: 12, color: T.muted, lineHeight: 1.6 },
};

const norm = (s) => String(s ?? '').replace(/\(주\)|\(유\)|㈜|주식회사|\s+/g, '');

export default function CompanyPicker({ value, onChange, onMeta, disabled = false }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const blurTimer = useRef(null);
  const seq = useRef(0);

  // 입력마다 부르지 않고 잠깐 모았다 부른다
  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/constructors?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => { if (my === seq.current) { setRes(j); setCur(0); } })
        .catch(() => {})
        .finally(() => { if (my === seq.current) setBusy(false); });
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  // 고른 상호의 순위를 라벨에 보여주기 위해 한 번 조회한다
  const [matched, setMatched] = useState(null);
  useEffect(() => {
    if (!value) { setMatched(null); return; }
    let dead = false;
    fetch(`/api/constructors?q=${encodeURIComponent(value)}&limit=5`)
      .then(r => r.json())
      .then(j => {
        if (dead) return;
        const hit = (j.rows ?? []).find(r => norm(r.상호) === norm(value)) ?? null;
        setMatched(hit ? { ...hit, year: j.year } : null);
        onMeta?.({ year: j.year, latest: j.latest, source: j.source, count: j.count });
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps

  const hits = res?.rows ?? [];
  const choose = (r) => { onChange(r.상호); setQ(''); setOpen(false); setCur(0); };

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
          ? <span style={{ color: T.accent }}> · {matched.year}년 공시 {matched.순위}위</span>
          : value ? <span style={{ color: T.warn }}> · 명부에 없음 (순위 미산출)</span> : null}
      </label>
      <input
        style={{ ...S.input, ...(matched ? S.ok : null) }}
        value={open ? q : (value ?? '')}
        placeholder="상호 검색 — (주) 없이 쳐도 됩니다"
        disabled={disabled}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setCur(0); setOpen(true); }}
        onKeyDown={onKey}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
      />
      {open && !disabled && (
        <div style={S.list} onMouseDown={() => clearTimeout(blurTimer.current)}>
          {busy && !hits.length && <div style={S.none}>찾는 중…</div>}
          {!busy && !hits.length && (
            <div style={S.none}>
              명부에 없는 상호입니다.<br />
              그대로 두면 상호만 들어가고 순위는 빈칸으로 나갑니다.
            </div>
          )}
          {hits.map((r, i) => (
            <div key={`${r.상호}-${r.순위}`} style={S.item(i === cur)} onMouseEnter={() => setCur(i)} onClick={() => choose(r)}>
              <span>{r.상호}{r.지역 ? <span style={S.dim}> · {r.지역}</span> : null}</span>
              <span style={S.rank}>{r.순위}위</span>
            </div>
          ))}
          {res && (
            <div style={S.foot}>
              {res.year}년 공시 · 전체 {res.count.toLocaleString()}건
              {res.total > hits.length ? ` · 일치 ${res.total.toLocaleString()}건 중 ${hits.length}건 표시` : ''}
              <br />{res.source.title}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
