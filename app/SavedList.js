'use client';
import { useEffect, useState } from 'react';
import { T, mono } from './theme';
import * as store from './storage';

const S = {
  wrap: { background: T.panel, border: `1px solid ${T.line}`, borderRadius: T.radius, boxShadow: T.shadow, marginBottom: 20, overflow: 'hidden' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', cursor: 'pointer' },
  title: { fontSize: 12.5, fontWeight: 700, color: T.ink2 },
  count: { fontSize: 11, color: T.muted, ...mono },
  body: { borderTop: `1px solid ${T.line}` },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 },
  main: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: 11, color: T.muted, ...mono, whiteSpace: 'nowrap' },
  btn: { padding: '4px 11px', fontSize: 11.5, fontWeight: 700, border: `1px solid ${T.line}`, background: '#fff', borderRadius: 5, cursor: 'pointer', color: T.ink2 },
  del: { padding: '4px 9px', fontSize: 11.5, border: `1px solid ${T.line}`, background: '#fff', borderRadius: 5, cursor: 'pointer', color: T.muted },
  empty: { padding: '18px 16px', fontSize: 12, color: T.muted },
  note: { padding: '8px 16px', fontSize: 10.5, color: T.muted, background: '#fafbfc' },
};

export default function SavedList({ onOpen, refreshKey }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { setItems(store.list()); }, [refreshKey]);

  return (
    <div style={S.wrap}>
      <div style={S.head} onClick={() => setOpen(!open)}>
        <span style={S.title}>저장된 조회 {open ? '▾' : '▸'}</span>
        <span style={S.count}>{items.length}건</span>
      </div>
      {open && (
        <div style={S.body}>
          {items.length === 0 && <div style={S.empty}>아직 저장된 조회가 없습니다. 수집 후 [저장]을 누르세요.</div>}
          {items.map(it => (
            <div key={it.id} style={S.row}>
              <span style={S.main}>
                <b>{it.region}</b> · {it.period}
                {it.company ? ` · ${it.company}` : ''}
              </span>
              <span style={S.meta}>
                {it.okCount}/{it.total}
                {it.hasFacilities ? ' · 시설' : ''}
                {' · '}{new Date(it.savedAt).toLocaleDateString('ko-KR')}
              </span>
              <button style={S.btn} onClick={() => onOpen(store.load(it.id))}>열기</button>
              <button style={S.del} onClick={() => { store.remove(it.id); setItems(store.list()); }}>삭제</button>
            </div>
          ))}
          <div style={S.note}>
            이 브라우저에만 저장됩니다. 다른 PC나 시크릿 모드에서는 보이지 않습니다.
          </div>
        </div>
      )}
    </div>
  );
}
