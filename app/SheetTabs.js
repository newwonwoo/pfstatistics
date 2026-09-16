'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { T } from './theme';

/**
 * 엑셀 하단 시트탭을 그대로 옮긴 네비게이션. 순서는 캡쳐와 동일하다.
 *
 * **단계가 다른 탭을 평평하게 늘어놓지 않는다**(사용자 지적 2026-09-16) —
 * 자료수집(원천에서 긁는 것) · 분양률 산정(그 결과로 계산하는 것) ·
 * 심사평점(사람이 판단을 얹는 것) 은 성격이 다르다.
 * 묶음이 바뀌는 자리에 이름표를 세워 어디서 성격이 바뀌는지 보이게 한다.
 */
export default function SheetTabs({ sheets, active, onSelect, status }) {
  /*
    탭이 12개라 한 줄에 안 들어간다. 잘린 채로 두면 **왼쪽에 탭이 더 있는 줄 모른다** —
    양끝에 페이드를 걸어 "더 있다" 를 보이게 하고, 고른 탭은 보이는 자리로 끌어온다.
  */
  const ref = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    measure();
    const el = ref.current;
    el?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el?.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    ref.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
  }, [active]);

  /*
    **페이드만으로는 못 넘어간다.** 가로 스크롤바를 숨겨 둔 데다 휠은 세로로만 굴러서,
    마우스만 쓰는 실무자는 오른쪽 끝의 [심사평점표] — 최종 산출물 — 에 갈 방법이 없었다.
    페이드를 누를 수 있게 만들고 휠도 가로로 받는다.
  */
  const nudge = (dir) => ref.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });
  const onWheel = (e) => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };

  const fade = (side, on) => ({
    position: 'absolute', top: 0, bottom: 1, [side]: 0, width: 30,
    display: on ? 'flex' : 'none', alignItems: 'center',
    justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
    border: 0, padding: 0, cursor: 'pointer', color: T.ink2, fontSize: 15, fontWeight: 700,
    background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${T.bg} 55%, transparent)`,
  });

  return (
    <div style={{ position: 'relative' }}>
    <div ref={ref} onWheel={onWheel} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, overflowX: 'auto', padding: '0 2px', borderBottom: `1px solid ${T.lineStrong}`, scrollbarWidth: 'none' }}>
      {sheets.map((s, i) => {
        const newStage = s.stage && sheets[i - 1]?.stage !== s.stage;
        const on = s.id === active;
        const st = status?.[s.id];
        const tone = s.tone === 'cover' ? '#6b7280' : s.tone === 'summary' ? '#b3261e' : null;
        return (
          <Fragment key={s.id}>
          {/*
            단계 이름을 여기 적었더니 **탭처럼 보이고** 탭 이름과 겹쳤다
            ("수기입력 | 수기입력"). 단계는 위 STEP 줄이 이미 말해주므로
            여기서는 **구분선만** 세워 성격이 바뀌는 자리를 표시한다.
          */}
          {newStage && i > 0 && (
            <span aria-hidden style={{
              alignSelf: 'stretch', width: 1, margin: '6px 7px 0',
              background: T.lineStrong,
            }} />
          )}
          <button
            data-on={on ? '1' : '0'}
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
          </Fragment>
        );
      })}
    </div>
      <button type="button" aria-label="이전 시트" title="이전 시트"
        style={fade('left', edge.left)} onClick={() => nudge(-1)}>‹</button>
      <button type="button" aria-label="다음 시트" title="다음 시트"
        style={fade('right', edge.right)} onClick={() => nudge(1)}>›</button>
    </div>
  );
}
