'use client';
import { useEffect, useState } from 'react';
import { T } from './theme';

/**
 * 맨 위로.
 *
 * 심사평점표에서 값을 다 확인하고 나면 다음 할 일은 **엑셀 다운로드**인데,
 * 그 버튼은 화면 맨 위 요약 줄에 있다(사용자 지적 2026-09-25 —
 * 「위로 올려주는 버튼 만들자, 그러면 엑셀 다운로드가 바로 보이니까」).
 * 표가 길어 스크롤이 한참이라 **한 번에 올린다.**
 *
 * 조금만 내려가도 뜨면 내내 거치적거리므로 **한 화면 넘게 내려갔을 때만** 나타난다.
 */
export default function ToTop() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(window.scrollY > 600);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  if (!on) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="맨 위로 — [엑셀 다운로드] 가 화면 위에 있습니다"
      style={{
        position: 'fixed', right: 22, bottom: 22, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '10px 15px', borderRadius: 22, cursor: 'pointer',
        border: `1px solid ${T.lineStrong}`, background: '#fff', color: T.ink2,
        fontSize: 12.5, fontWeight: 700, boxShadow: '0 3px 12px rgba(20,30,50,.16)',
      }}
    >
      ↑ 맨 위로
      <span style={{ fontWeight: 600, color: T.muted }}>엑셀 다운로드</span>
    </button>
  );
}
