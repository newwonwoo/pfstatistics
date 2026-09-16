'use client';
import { Fragment } from 'react';
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
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, overflowX: 'auto', padding: '0 2px', borderBottom: `1px solid ${T.lineStrong}` }}>
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
  );
}
