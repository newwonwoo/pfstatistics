'use client';
import { T } from './theme';

/**
 * 진행 단계 — **이 화면에서 가장 큰 레벨의 로드맵**이다.
 *
 * 처음에는 회색 글자 다섯 덩어리를 평평하게 늘어놓았는데, 정작 「지금 어디까지 왔나」 가
 * 눈에 안 들어왔다(사용자 지적 2026-09-25). 로드맵이 로드맵처럼 보여야 한다.
 *
 * 그래서 **이어진 트랙 위의 다섯 마디**로 그린다 —
 *   · 지나온 구간은 초록 선, 남은 구간은 회색 선. 선만 봐도 진도가 읽힌다.
 *   · 끝난 마디는 초록 ✓, 지금 마디는 파란 원 + 바깥 링, 남은 마디는 빈 원.
 *   · 지금 마디만 흰 카드로 띄워 **한 칸만 주장하게** 한다(주버튼 문법과 같다).
 *   · 마디를 누르면 그 단계의 탭으로 간다 — 로드맵인데 못 누르면 그림일 뿐이다.
 *
 * 단계 이름(`stage`)은 매 칸에 적지 않는다 — 바뀌는 자리에만 적어야 읽힌다.
 */
const STEPS = [
  { id: 'input',   label: '사업지 확정',      stage: '자료수집', tab: '교통환경',
    hint: '시도·시군구 선택 후 [지도에서 검색하기]' },
  /*
    「수집 기준」을 독립 단계로 뒀더니 실제와 어긋났다 — 기준은 **시설 수집 버튼을 누를 때**
    묻는 것이라, 통계 수집이 끝나도 단계 줄은 계속 2단계를 가리켰다. 수집 안으로 넣는다.
  */
  { id: 'collect', label: '통계 · 시설 수집',  stage: '자료수집', tab: '교통환경',
    hint: '사업지 경계 → 통계 → 반경시설 → 비교사업장' },
  { id: 'manual',  label: '수기입력',         stage: '수기입력', tab: '수기입력',
    hint: '규모및배치 · 평형구성 · 인근초기분양률' },
  { id: 'rate',    label: '분양률 산정',       stage: '산정',    tab: '초기예상분양률',
    hint: '종합평가 점수 → 초기예상분양률' },
  { id: 'review',  label: '심사평점 · 내보내기', stage: '평점',   tab: '심사평점표',
    hint: '초기분양률 배점 + 사업성 → 종합평점' },
];

const LINE = { done: T.ok, now: T.accent, todo: '#d6dae1' };

export default function Steps({ current, done = [], onJump = null }) {
  const stateOf = (s) => (done.includes(s.id) ? 'done' : s.id === current ? 'now' : 'todo');
  const doneCount = STEPS.filter(s => done.includes(s.id)).length;

  return (
    <div style={S.card}>
      <div style={S.head}>
        <span style={S.headT}>심사 진행</span>
        <span style={S.headN}>{doneCount} / {STEPS.length} 단계 완료</span>
      </div>

      <div style={S.row}>
        {STEPS.map((s, i) => {
          const st = stateOf(s);
          const prev = i > 0 ? stateOf(STEPS[i - 1]) : null;
          /* 왼쪽 선은 **앞 마디가 끝났는가**, 오른쪽 선은 **이 마디가 끝났는가** */
          const leftColor = prev === 'done' ? LINE.done : LINE.todo;
          const rightColor = st === 'done' ? LINE.done : LINE.todo;
          const newStage = STEPS[i - 1]?.stage !== s.stage && s.stage !== s.label;
          return (
            <button key={s.id} style={S.cell(st)}
              onClick={() => onJump?.(s.tab)}
              title={`${s.label} — ${s.hint}`}>
              <span style={S.track}>
                <span style={S.line(i === 0 ? 'transparent' : leftColor)} />
                <span style={S.node(st)}>{st === 'done' ? '✓' : i + 1}</span>
                <span style={S.line(i === STEPS.length - 1 ? 'transparent' : rightColor)} />
              </span>
              <span style={S.label(st)}>
                {s.label}
                {newStage && <span style={S.stage}>{s.stage}</span>}
              </span>
              <span style={S.hint(st)}>{s.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const S = {
  card: {
    marginBottom: 16, padding: '12px 10px 13px',
    background: T.panel, border: `1px solid ${T.line}`, borderRadius: T.radius,
    boxShadow: T.shadow,
  },
  head: { display: 'flex', alignItems: 'baseline', gap: 9, padding: '0 8px 9px' },
  headT: { fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', color: T.ink2 },
  headN: { marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: T.muted },

  row: { display: 'flex', alignItems: 'flex-start', gap: 0 },
  cell: (st) => ({
    flex: '1 1 0', minWidth: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    padding: '4px 6px 8px', border: 0, borderRadius: 8, cursor: 'pointer',
    background: st === 'now' ? T.accentSoft : 'transparent',
    fontFamily: 'inherit', textAlign: 'center',
    transition: 'background .15s ease',
  }),
  /* 마디와 선을 한 줄에 — 선이 마디를 꿰고 지나가야 「이어진 길」 로 읽힌다 */
  track: { display: 'flex', alignItems: 'center', height: 30 },
  line: (color) => ({ flex: 1, height: 2, background: color }),
  node: (st) => ({
    flex: '0 0 auto', width: 26, height: 26, borderRadius: 26,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: st === 'done' ? 13 : 12, fontWeight: 800, lineHeight: 1,
    background: st === 'done' ? T.ok : st === 'now' ? T.accent : T.panel,
    color: st === 'todo' ? '#9aa2ad' : '#fff',
    border: `2px solid ${st === 'done' ? T.ok : st === 'now' ? T.accent : '#d6dae1'}`,
    /* 지금 마디에만 바깥 링 — 한 칸만 주장하게 한다 */
    boxShadow: st === 'now' ? `0 0 0 4px ${T.accentSoft}, 0 0 0 5px #c8d5fb` : 'none',
  }),
  label: (st) => ({
    marginTop: 7, fontSize: 12.5, lineHeight: 1.35,
    fontWeight: st === 'todo' ? 600 : 800,
    color: st === 'done' ? T.ok : st === 'now' ? T.ink : T.muted,
  }),
  stage: {
    marginLeft: 6, padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap',
    background: '#eef2f7', color: '#5a6472', fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em',
  },
  hint: (st) => ({
    marginTop: 3, fontSize: 10.5, lineHeight: 1.45,
    color: st === 'todo' ? '#a2a9b4' : T.muted,
  }),
};
