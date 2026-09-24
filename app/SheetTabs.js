'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { T } from './theme';

/**
 * 시트 네비게이션 — **2단**(단계 → 그 단계의 시트).
 *
 * ## 왜 2단인가
 * 탭 13개를 한 줄에 늘어놓으니 1440px 에서도 오른쪽이 잘렸다(사용자 지적 2026-09-24).
 * 하필 잘리는 쪽이 **초기예상분양률·심사평점표 — 이 앱의 결론**이다.
 * 페이드·화살표를 붙여 넘어갈 수는 있게 해뒀지만, 「결론에 가려면 스크롤부터」 는
 * 동선이 아니라 장애물이다.
 *
 * 단계는 이미 `stage` 로 있다(자료수집 · 수기입력 · 분양률 산정 · 심사평점).
 * 그걸 **윗줄**로 올리면 윗줄은 4칸이라 언제나 다 보이고,
 * 아랫줄은 고른 단계의 시트만 **펼쳐진다**.
 *
 * ## 규칙
 * - 자식이 하나뿐인 단계는 **윗줄 버튼이 곧 그 시트**다 — 아랫줄을 헛되이 만들지 않는다.
 * - 단계를 누르면 **마지막에 보던 시트로 돌아간다**(처음이면 첫 시트).
 * - 윗줄 점은 그 단계 **전체**의 상태다 — 다 끝났으면 초록, 일부면 노랑.
 *   「끝났는데 끝난 것처럼 안 보임」 을 한 번 겪었으므로 묶음에서도 보이게 한다.
 * - 아랫줄은 성격별로 **묶음 이름표**를 세운다(반경시설 · 분양가 · 지역통계).
 *   전에는 구분선만 있어 무엇이 바뀌는지 읽히지 않았다.
 */
const CLUSTER = { poi: '반경시설', comp: '분양가', stat: '지역통계' };

/** 단계 전체의 상태 — 다 됐으면 ok, 하나라도 됐으면 partial */
const groupStatus = (items, status) => {
  const vals = items.map(s => status?.[s.id]);
  if (vals.length && vals.every(v => v === 'ok')) return 'ok';
  if (vals.some(v => v === 'ok' || v === 'partial')) return 'partial';
  return undefined;
};

/**
 * **「다음은 여기」 를 탭 줄에서 말한다**(사용자 요청 2026-09-24).
 * 초기예상분양률이 나오면 그 다음 할 일은 심사평점표 하나뿐인데,
 * 지금까지는 그 탭이 다른 탭과 똑같이 생겨 「끝났으니 넘어가라」 는 신호가 없었다.
 * 값이 나온 것(초록 점)과 **다음 차례인 것**은 다른 말이므로 배지를 따로 둔다.
 */
const NextBadge = ({ note }) => (
  <span data-next-badge title={note ?? undefined} style={{
    marginLeft: 7, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
    fontSize: 10.5, fontWeight: 800, letterSpacing: '.02em',
    background: T.accent, color: '#fff',
    animation: 'sheetNextPulse 1.8s ease-in-out infinite',
  }}>다음 →</span>
);

const Dot = ({ st, size = 6 }) => (st ? (
  <span aria-hidden style={{
    display: 'inline-block', marginLeft: 6, width: size, height: size, borderRadius: size,
    background: st === 'ok' ? T.ok : st === 'partial' ? '#d9a207' : '#c4c9d0',
  }} />
) : null);

export default function SheetTabs({ sheets, active, onSelect, status, next = null, nextNote = null }) {
  /* 단계별로 묶는다 — 등장 순서를 그대로 쓴다(그것이 심사 진행 순서다) */
  const groups = useMemo(() => {
    const out = [];
    for (const s of sheets) {
      const key = s.stage ?? '기타';
      let g = out.find(x => x.key === key);
      if (!g) out.push(g = { key, items: [] });
      g.items.push(s);
    }
    return out;
  }, [sheets]);

  const activeGroup = groups.find(g => g.items.some(s => s.id === active)) ?? groups[0];

  /* 단계로 돌아왔을 때 **마지막에 보던 시트**로 — 늘 첫 시트로 튕기면 하던 일을 잃는다 */
  const lastSeen = useRef({});
  lastSeen.current[activeGroup.key] = active;

  /*
    아랫줄이 **쑤욱** 펼쳐지게 한다(사용자 요청).
    인라인 스타일이라 @keyframes 를 못 쓰므로, 단계가 바뀌면 접힌 상태로 한 번 그린 뒤
    다음 프레임에 펴서 transition 을 태운다.
  */
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(false);
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(() => setOpen(true)); });
    return () => cancelAnimationFrame(a);
  }, [activeGroup.key]);

  /* 아랫줄이 좁은 화면에서 넘칠 수 있다 — 페이드·화살표·가로휠은 그대로 둔다 */
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

  const kids = activeGroup.items;
  const showRow2 = kids.length > 1;

  return (
    <div>
      {/* 인라인 스타일로는 @keyframes 를 못 쓴다. 움직임을 꺼둔 사용자는 그대로 둔다 */}
      <style>{`
        @keyframes sheetNextPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(27,79,216,.45); }
          50%      { box-shadow: 0 0 0 5px rgba(27,79,216,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-next-badge] { animation: none !important; }
        }
      `}</style>
      {/* ── 윗줄 : 단계 ── */}
      <div role="tablist" aria-label="심사 단계" style={S.top}>
        {groups.map((g) => {
          const on = g.key === activeGroup.key;
          const solo = g.items.length === 1 ? g.items[0] : null;
          const st = groupStatus(g.items, status);
          /* 결론 시트(초기예상분양률·심사평점표)는 색으로도 구분한다 */
          const tone = solo?.tone === 'summary' ? T.err : null;
          return (
            <button key={g.key} role="tab" aria-selected={on}
              data-step={g.key}
              onClick={() => onSelect(lastSeen.current[g.key] ?? g.items[0].id)}
              style={S.topBtn(on, tone)}>
              {solo ? solo.label : g.key}
              {!solo && <span style={S.count}>{g.items.length}</span>}
              <Dot st={st} size={7} />
              {g.items.some(x => x.id === next) && <NextBadge note={nextNote} />}
            </button>
          );
        })}
      </div>

      {/* ── 아랫줄 : 그 단계의 시트 (한 장뿐이면 아예 안 편다) ── */}
      {/* 감싸개는 늘 둔다 — 자식이 하나뿐인 단계로 갈 때 아랫줄이 통째로 사라지며 화면이 튄다 */}
      <div style={S.wrap(open && showRow2)}>
        {showRow2 && (
          <div style={{ position: 'relative' }}>
            <div ref={ref} onWheel={onWheel} role="tablist" aria-label={`${activeGroup.key} 시트`} style={S.row}>
              {kids.map((s, i) => {
                const on = s.id === active;
                const cluster = CLUSTER[s.kind];
                const newCluster = cluster && CLUSTER[kids[i - 1]?.kind] !== cluster;
                return (
                  <Fragment key={s.id}>
                    {newCluster && (
                      <span aria-hidden style={S.clusterLabel(i === 0)}>{cluster}</span>
                    )}
                    <button data-on={on ? '1' : '0'} role="tab" aria-selected={on}
                      onClick={() => onSelect(s.id)} style={S.tab(on, s.tone === 'cover' ? '#6b7280' : null)}>
                      {s.label}
                      <Dot st={status?.[s.id]} />
                      {s.id === next && <NextBadge note={nextNote} />}
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
        )}
      </div>
    </div>
  );
}

const S = {
  top: {
    display: 'flex', alignItems: 'stretch', gap: 4, padding: 4,
    background: '#e8eaee', borderRadius: 9, border: `1px solid ${T.line}`,
  },
  topBtn: (on, tone) => ({
    display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', cursor: 'pointer',
    padding: '9px 15px', fontSize: 12.5, fontWeight: on ? 800 : 600, borderRadius: 7,
    color: on ? (tone ?? T.ink) : (tone ? '#c08079' : T.muted),
    background: on ? T.panel : 'transparent',
    border: `1px solid ${on ? T.line : 'transparent'}`,
    boxShadow: on ? `inset 0 -2px 0 ${tone ?? T.accent}, ${T.shadow}` : 'none',
    transition: 'background .15s ease, color .15s ease',
  }),
  /*
    **번호는 달지 않는다.** 바로 위 STEP 줄이 이미 1~5 로 순서를 말하는데
    탭에 1~4 를 또 달면 번호가 두 벌이 되어 「지금 STEP 2 인데 탭은 1?」 이 된다.
    순서는 STEP 줄이, 묶음은 이 줄이 맡는다.
  */
  count: {
    marginLeft: 6, padding: '1px 6px', borderRadius: 9, fontSize: 10.5, fontWeight: 700,
    background: '#dfe3e9', color: T.ink2,
  },

  /* 「쑤욱」 — 접힌 높이에서 펴진다 */
  wrap: (open) => ({
    marginTop: open ? 8 : 0,
    maxHeight: open ? 60 : 0,
    opacity: open ? 1 : 0,
    transform: open ? 'none' : 'translateY(-6px)',
    overflow: 'hidden',
    transition: 'max-height .22s ease, opacity .18s ease, transform .22s ease, margin-top .22s ease',
  }),
  row: {
    display: 'flex', alignItems: 'flex-end', gap: 2, overflowX: 'auto',
    padding: '0 2px', borderBottom: `1px solid ${T.lineStrong}`, scrollbarWidth: 'none',
  },
  /* 성격이 바뀌는 자리에 이름표 — 전에는 구분선만 있어 무엇이 바뀌는지 안 읽혔다 */
  clusterLabel: (first) => ({
    alignSelf: 'center', whiteSpace: 'nowrap',
    margin: first ? '0 8px 6px 4px' : '0 8px 6px 14px',
    fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: T.muted,
  }),
  tab: (on, tone) => ({
    position: 'relative', whiteSpace: 'nowrap', cursor: 'pointer',
    padding: '8px 14px 9px', fontSize: 12.5,
    fontWeight: on ? 700 : 500,
    color: on ? T.ink : (tone ?? T.muted),
    background: on ? T.panel : '#eaecf0',
    border: `1px solid ${on ? T.lineStrong : 'transparent'}`,
    borderBottom: on ? `1px solid ${T.panel}` : `1px solid ${T.lineStrong}`,
    borderRadius: '7px 7px 0 0',
    marginBottom: -1,
  }),
};
