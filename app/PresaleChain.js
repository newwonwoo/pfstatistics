'use client';
import { T, mono } from './theme';

/**
 * **「초기분양률」 이라는 말이 세 곳에 나온다.** 실무자가 계속 헷갈린다(사용자 지적 2026-09-18).
 *
 *   ① 인근아파트 초기 분양률(10)  — **옆 단지를 조사해 넣는 값**   (수기입력 탭)
 *   ② 초기예상분양률(%)           — **이 앱이 내는 결과**          (분양률 산정 탭)
 *   ③ 초기분양률(22)              — **②를 배점으로 환산**          (심사평점표 탭)
 *
 * 셋은 서로 다른 것이 아니라 **한 줄로 이어진다** — ①은 ②를 만드는 재료 중 하나이고,
 * ③은 ②를 점수로 바꾼 것이다. 글로 설명하면 읽을 때마다 다시 헷갈리므로
 * **세 탭에 같은 그림을 같은 모양으로** 두고, 지금 보고 있는 칸만 밝게 한다.
 *
 * 규정 용어를 바꿀 수는 없다(평가표에 그렇게 적힌다) — 대신 **어디서 와서 어디로 가는지**를 보인다.
 */
const S = {
  wrap: {
    display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap',
    border: `1px solid ${T.line}`, borderRadius: 8, overflow: 'hidden',
    background: '#fff', margin: '10px 0',
  },
  step: (on) => ({
    flex: '1 1 190px', minWidth: 190, padding: '8px 11px',
    background: on ? '#eef4ff' : '#fafbfc',
    borderLeft: `1px solid ${T.line}`,
    opacity: on ? 1 : 0.72,
  }),
  no: (on) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 16, height: 16, borderRadius: 8, marginRight: 6,
    background: on ? T.accent : T.muted, color: '#fff', fontSize: 10, fontWeight: 700,
  }),
  name: (on) => ({ fontSize: 12, fontWeight: 700, color: on ? T.accent : T.ink2 }),
  role: { display: 'block', fontSize: 11, color: T.muted, marginTop: 3 },
  val: { display: 'block', fontSize: 13, fontWeight: 700, color: T.ink2, marginTop: 3, ...mono },
  head: { fontSize: 11, color: T.muted, marginBottom: -4 },
};

/**
 * @param {'input'|'result'|'score'} here  지금 보고 있는 칸
 * @param {object} values  { input, pct, score } — 있으면 각 칸에 현재 값을 같이 적는다
 */
export default function PresaleChain({ here, values = {} }) {
  const steps = [
    {
      id: 'input', no: 1, name: '인근아파트 초기 분양률 (10)',
      role: '옆 단지를 조사해 넣는 값 · 수기입력',
      val: values.input == null || values.input === '' ? null : `${values.input}%`,
    },
    {
      id: 'result', no: 2, name: '초기예상분양률 (%)',
      role: '이 앱이 내는 결과 · ①을 포함한 전 항목에서 나온다',
      val: values.pct == null ? null : `${values.pct}%`,
    },
    {
      id: 'score', no: 3, name: '초기분양률 (22)',
      role: '②를 배점으로 환산 · 심사평점표',
      val: values.score == null ? null : `${values.score}점`,
    },
  ];
  return (
    <>
      <div style={S.head}>「초기분양률」 은 세 곳에 나옵니다 — 이 셋은 한 줄로 이어집니다</div>
      <div style={S.wrap}>
        {steps.map(s => {
          const on = s.id === here;
          return (
            <div key={s.id} style={S.step(on)}>
              <span style={S.no(on)}>{s.no}</span>
              <span style={S.name(on)}>{s.name}</span>
              <span style={S.role}>{s.role}</span>
              {s.val && <span style={S.val}>{s.val}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
