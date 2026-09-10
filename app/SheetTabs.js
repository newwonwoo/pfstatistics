'use client';
import { T } from './theme';

/** 엑셀 하단 시트탭을 그대로 옮긴 네비게이션. 순서는 캡쳐와 동일하다. */
export default function SheetTabs({ sheets, active, onSelect, status }) {
  return (
    <div style={{ display: 'flex', gap: 2, overflowX: 'auto', padding: '0 2px', borderBottom: `1px solid ${T.lineStrong}` }}>
      {sheets.map((s) => {
        const on = s.id === active;
        const st = status?.[s.id];
        const tone = s.tone === 'cover' ? '#6b7280' : s.tone === 'summary' ? '#b3261e' : null;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              position: 'relative', whiteSpace: 'nowrap', cursor: 'pointer',
              padding: '9px 15px 10px', fontSize: 12.5,
              fontWeight: on ? 700 : 500,
              color: on ? T.ink : (tone ?? T.muted),
              background: on ? T.panel : '#eaecf0',
              border: `1px solid ${on ? T.lineStrong : 'transparent'}`,
              borderBottom: on ? `1px solid ${T.panel}` : `1px solid ${T.lineStrong}`,
              borderRadius: '7px 7px 0 0',
              marginBottom: -1,
            }}
          >
            {s.label}
            {st && (
              <span style={{
                display: 'inline-block', marginLeft: 6, width: 6, height: 6, borderRadius: 6,
                background: st === 'ok' ? T.ok : st === 'partial' ? '#d9a207' : '#c4c9d0',
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
