'use client';
import { T } from './theme';

/**
 * 진행 단계 표시.
 *
 * 버튼만 흩어져 있으면 "그리고 나서 뭘 하지?" 가 된다.
 * 지금 어디까지 왔고 다음에 뭘 눌러야 하는지를 항상 보이게 한다.
 */
const S = {
  wrap: { display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 16, flexWrap: 'wrap' },
  step: (state) => ({
    flex: '1 1 150px', minWidth: 150,
    padding: '9px 14px',
    borderTop: `2px solid ${state === 'done' ? T.ok : state === 'now' ? T.accent : T.line}`,
    background: state === 'now' ? T.accentSoft : 'transparent',
    opacity: state === 'todo' ? 0.55 : 1,
  }),
  no: (state) => ({
    fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em',
    color: state === 'done' ? T.ok : state === 'now' ? T.accent : T.muted,
  }),
  label: { fontSize: 12.5, fontWeight: 700, marginTop: 2 },
  hint: { fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.45 },
};

export default function Steps({ current, done }) {
  const steps = [
    { id: 'input', label: '사업지 확정', hint: '시도·시군구 선택 후 [주소 확정] — 바꾸려면 초기화' },
    { id: 'boundary', label: '수집 기준', hint: '경계 기준(지도에 경계 그리기) 또는 대표지번 중심 기준' },
    { id: 'collect', label: '통계 · 시설 수집', hint: '통계 → 주거편의 · 교통환경 · 교육환경' },
    { id: 'result', label: '확인 · 내보내기', hint: '시트별 검토 후 엑셀 다운로드' },
  ];
  return (
    <div style={S.wrap}>
      {steps.map((s, i) => {
        const state = done.includes(s.id) ? 'done' : s.id === current ? 'now' : 'todo';
        return (
          <div key={s.id} style={S.step(state)}>
            <div style={S.no(state)}>
              {state === 'done' ? '완료' : `STEP ${i + 1}`}
            </div>
            <div style={S.label}>{s.label}</div>
            <div style={S.hint}>{s.hint}</div>
          </div>
        );
      })}
    </div>
  );
}
