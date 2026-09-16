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
    flex: '1 1 190px', minWidth: 178,
    padding: '9px 14px',
    borderTop: `2px solid ${state === 'done' ? T.ok : state === 'now' ? T.accent : T.line}`,
    background: state === 'now' ? T.accentSoft : 'transparent',
    opacity: state === 'todo' ? 0.55 : 1,
  }),
  no: (state) => ({
    fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em',
    color: state === 'done' ? T.ok : state === 'now' ? T.accent : T.muted,
  }),
  stage: { marginLeft: 7, padding: '1px 6px', borderRadius: 3, background: '#eef2f7',
           color: '#5a6472', fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em' },
  label: { fontSize: 12.5, fontWeight: 700, marginTop: 2 },
  hint: { fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.45 },
};

export default function Steps({ current, done }) {
  /*
   * 절차가 셋으로 갈린다 — **자료수집 → 분양률 산정 → 심사평점**.
   * 성격이 다른 일을 한 줄에 평평하게 놓으면 어디까지가 자동이고 어디부터
   * 사람이 판단하는지가 안 보인다(사용자 지적 2026-09-16).
   */
  const steps = [
    { id: 'input', label: '사업지 확정', stage: '자료수집', hint: '시도·시군구 선택 후 [주소 확정]' },
    { id: 'boundary', label: '수집 기준', stage: '자료수집', hint: '사업지 경계 또는 대표지번 중심' },
    { id: 'collect', label: '통계 · 시설 수집', stage: '자료수집', hint: '통계 → 시설 → 비교사업장' },
    { id: 'manual', label: '수기입력', stage: '수기입력', hint: '규모및배치 · 평형구성 · 인근초기분양률' },
    { id: 'rate', label: '분양률 산정', stage: '산정', hint: '종합평가 점수 → 초기예상분양률' },
    { id: 'review', label: '심사평점 · 내보내기', stage: '평점', hint: '초기분양률 배점 + 사업성 → 종합평점' },
  ];
  return (
    <div style={S.wrap}>
      {steps.map((s, i) => {
        const state = done.includes(s.id) ? 'done' : s.id === current ? 'now' : 'todo';
        return (
          <div key={s.id} style={S.step(state)}>
            <div style={S.no(state)}>
              {state === 'done' ? '완료' : `STEP ${i + 1}`}
              {/* 단계가 바뀌는 자리에만 묶음 이름을 적는다 — 매 칸에 적으면 읽히지 않는다 */}
              {steps[i - 1]?.stage !== s.stage && <span style={S.stage}>{s.stage}</span>}
            </div>
            <div style={S.label}>{s.label}</div>
            <div style={S.hint}>{s.hint}</div>
          </div>
        );
      })}
    </div>
  );
}
