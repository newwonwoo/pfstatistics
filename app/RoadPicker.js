'use client';
import { useEffect, useState } from 'react';
import { T } from './theme';

/**
 * 6차선 왕복도로 — 주변 도로명 후보.
 *
 * 도로는 POI 가 아니라 장소검색으로 안 나온다. 그래서 도로명까지 손으로 쳐야 했다.
 * 사업지 둘레를 훑어 도로명을 뽑아주고, 고르면 지도의 로드뷰가 그 지점으로 간다.
 * 차선 수는 여기서 안 나온다 — 로드뷰로 세는 것까지가 판정이다.
 */
const S = {
  box: { border: `1px solid ${T.line}`, borderRadius: 8, background: '#fff', padding: '12px 14px', marginBottom: 10 },
  head: { fontSize: 12.5, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  note: { fontSize: 11, color: T.muted, fontWeight: 400, lineHeight: 1.5 },
  row: (on) => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
    padding: '8px 10px', marginBottom: 5, borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${on ? T.accent : T.line}`,
    background: on ? T.accentSoft : '#fff',
  }),
  name: { fontSize: 12.5, fontWeight: 700, color: T.ink },
  badge: (rank) => ({
    fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
    background: rank === 0 ? '#e7f0ff' : rank === 1 ? T.okSoft : '#f1f3f5',
    color: rank === 0 ? T.accent : rank === 1 ? T.ok : T.muted,
  }),
  hint: { fontSize: 11, color: T.muted, flex: 1, minWidth: 120 },
  dist: { fontSize: 11.5, fontWeight: 700, color: T.ink2, whiteSpace: 'nowrap' },
  msg: { fontSize: 11.5, color: T.muted, padding: '6px 0' },
};

export default function RoadPicker({ coord, radius = 300, value, onPick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!coord?.x || !coord?.y) return;
    let dead = false;
    setRows(null); setErr(null);
    fetch(`/api/roads?x=${coord.x}&y=${coord.y}&radius=${radius}`)
      .then(r => r.json())
      .then(j => { if (!dead) (j.error ? setErr(j.error) : setRows(j.roads ?? [])); })
      .catch(e => !dead && setErr(e.message));
    return () => { dead = true; };
  }, [coord?.x, coord?.y, radius]);

  return (
    <div style={S.box}>
      <div style={S.head}>
        <span>반경 {radius}m 도로명 후보</span>
        <span style={S.note}>
          접미사는 법으로 규모와 묶여 있습니다(도로명주소법) — 대로 = 왕복 8차로↑ · 로 = 왕복 2~7차로 · 길 = 이면도로.
          <b> 추정 근거일 뿐이니 차선 수는 아래 로드뷰로 세어 확정하세요.</b>
        </span>
      </div>

      {err && <div style={{ ...S.msg, color: T.warn }}>도로명 조회 실패: {err}</div>}
      {!rows && !err && <div style={S.msg}>주변 도로를 훑는 중…</div>}
      {rows?.length === 0 && <div style={S.msg}>반경 {radius}m 안에서 도로명을 찾지 못했습니다.</div>}

      {rows?.map(r => (
        <button key={r.name} style={S.row(value === r.name)} onClick={() => onPick?.(r)}>
          <span style={S.name}>{r.name}</span>
          <span style={S.badge(r.rank)}>{r.grade}</span>
          <span style={S.hint}>{r.hint ?? ''}</span>
          <span style={S.dist}>{r.distance}m</span>
        </button>
      ))}
    </div>
  );
}
