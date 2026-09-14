'use client';
import { useMemo, useRef, useState } from 'react';
import { T } from './theme';
import REGIONS from '../data/regions.json';

/**
 * 시도 · 시군구 선택.
 *
 * 주소를 한 칸에 통으로 받으면 카카오 검색 첫 결과를 말없이 채택하게 된다.
 * "광주시"만 쳐도 광주광역시로 갈 수 있고, "고성군"은 강원·경남 둘 다 있다.
 * 행정구역을 먼저 확정해두면 그 뒤 지번 매칭이 흔들릴 여지가 없다.
 *
 * 목록은 `data/regions.json` (통계누리 미분양 = 미분양 수집기와 같은 표기).
 * 전국 228개라 브라우저에서 즉시 걸러진다 — 자동완성에 네트워크가 필요 없다.
 */
const ALL = REGIONS.sido.flatMap(s =>
  (s.sgg.length ? s.sgg : [null]).map(g => ({
    sido: s.name, short: s.short, sgg: g,
    label: g ? `${s.name} ${g}` : s.name,
    // "서울 금천", "seoul" 같은 입력도 걸리게 검색용 문자열을 넉넉히 만든다
    hay: `${s.name} ${s.short} ${g ?? ''}`,
  })),
);

const S = {
  row: { display: 'grid', gridTemplateColumns: 'minmax(140px,0.8fr) minmax(200px,1.2fr)', gap: 11, alignItems: 'end' },
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
    background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink,
  }),
  dim: { color: T.muted },
  none: { padding: '9px 10px', fontSize: 12, color: T.muted },
};

export default function RegionPicker({ sido, sgg, onChange, disabled = false }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const blurTimer = useRef(null);

  const picked = Boolean(sido);

  /*
   * 시도를 고르면 **그 시도의 시군구만** 보여준다.
   * 시도가 정해졌는데 다른 시도가 섞이면 고를 때마다 다시 확인해야 한다.
   *
   * 시도를 안 고르면 전국에서 찾고, 동명 지역(고성군·광주)은 시도를 붙여 전부 보여준다 —
   * 하나만 보여주고 고르게 하면 틀린 줄도 모르고 넘어간다.
   */
  const hits = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean);
    const pool = sido ? ALL.filter(r => r.sido === sido) : ALL;
    if (!words.length) return pool.slice(0, 60);
    return pool.filter(r => words.every(w => r.hay.includes(w))).slice(0, 60);
  }, [q, sido]);

  const choose = (r) => {
    onChange({ sido: r.sido, sgg: r.sgg ?? '' });
    setQ(''); setOpen(false); setCur(0);
  };

  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur(i => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && hits[cur]) { e.preventDefault(); choose(hits[cur]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div style={S.row}>
      <div style={S.field}>
        <label style={S.label}>시도</label>
        <select
          style={{ ...S.input, ...(picked ? S.ok : null) }}
          value={sido}
          disabled={disabled}
          onChange={(e) => onChange({ sido: e.target.value, sgg: '' })}
        >
          <option value="">전국에서 찾기</option>
          {REGIONS.sido.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      <div style={S.field}>
        <label style={S.label}>
          시군구
          {sgg && <span style={{ color: T.accent }}> · {sido} {sgg}</span>}
          {picked && !sgg && <span style={S.dim}> · {sido} (하위 시군구 없음)</span>}
        </label>
        {/*
          열려 있을 때는 검색어(q), 닫혀 있을 때는 고른 시군구를 보여준다.
          둘을 한 값으로 섞으면 포커스 후 타이핑이 기존 글자 뒤에 붙는다.
        */}
        <input
          style={{ ...S.input, ...(picked ? S.ok : null) }}
          value={open ? q : (sgg ?? '')}
          disabled={disabled}
          placeholder={sido ? `${sido}의 시군구 검색` : '금천구 · 광주시 · 고성군 …'}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setCur(0); }}
          onFocus={() => { setQ(''); setCur(0); setOpen(true); }}
          onKeyDown={onKey}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        />
        {open && !disabled && (
          <div style={S.list} onMouseDown={() => clearTimeout(blurTimer.current)}>
            {hits.length === 0 && (
              <div style={S.none}>
                {sido
                  ? `「${sido}」에는 없습니다 — 시도를 [전국에서 찾기] 로 바꾸면 다른 시도에서 찾습니다`
                  : '해당하는 시군구가 없습니다'}
              </div>
            )}
            {hits.map((r, i) => (
              <div
                key={r.label}
                style={S.item(i === cur)}
                onMouseEnter={() => setCur(i)}
                onClick={() => choose(r)}
              >
                {/* 전국 검색일 때 동명 시군구를 구분하려면 시도가 같이 보여야 한다 */}
                {!sido && <span style={S.dim}>{r.sido} </span>}{r.sgg ?? r.sido}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
