'use client';
import { useMemo } from 'react';
import { T, mono } from './theme';
import { reviewScore, tableOf } from '../src/lib/scoring';
import { expectedRateOf } from '../src/lib/compare';
import PresaleChain from './PresaleChain';

/**
 * 최종 심사평점표.
 *
 * **이 앱이 만든 초기예상분양률이 여기서 점수가 되어 최종 평점으로 들어간다.**
 *
 *   각 시트 항목 점수 → 종합평가 점수 → 초기예상분양률(%) → 초기분양률 배점(22) → 종합평점
 *
 * 사업성(사업수익률·누적DSCR·자기자금 투입규모)은 **수동입력**이다(사용자 결정).
 * 사업수지표에서 나오는 값이라 이 앱이 수집하는 원천에 없다.
 * 시공자 쪽도 구간표를 아직 다 못 받아 수동입력이되, 아는 구간은 근거 칸에 적어 둔다.
 */

const S = {
  page: { background: T.panel, border: `1px solid ${T.lineStrong}`, borderTop: 0, borderRadius: `0 0 ${T.radius}px ${T.radius}px`, padding: '22px 24px 26px' },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' },
  subject: { fontSize: 12.5, color: T.ink2, margin: '0 0 16px' },
  flow: { padding: '11px 16px', background: '#f7f9fb', border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, color: T.ink2, lineHeight: 1.9, marginBottom: 14 },
  chain: { ...mono, fontSize: 11.5, color: T.ink },

  warn: { padding: '11px 15px', background: T.warnSoft, border: '1px solid #f0dcb4', borderRadius: 7, fontSize: 12, color: T.warn, lineHeight: 1.7, marginBottom: 14 },
  gate: { margin: '0 0 14px', padding: '13px 16px 14px', background: T.warnSoft,
          border: `1px solid ${T.warn}55`, borderRadius: 8 },
  gateHead: { display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5, fontWeight: 700,
              color: T.ink, marginBottom: 9 },
  gateCount: { marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: T.warn },
  gateNote: { margin: '4px 0 9px', fontSize: 11.5, lineHeight: 1.65, color: T.ink2 },
  gateRow: { display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', fontSize: 12.5,
             borderTop: `1px solid ${T.warn}22`, flexWrap: 'wrap' },
  gateX: { color: T.warn, fontWeight: 800 },
  gateLabel: { fontWeight: 700, color: T.ink2, minWidth: 250 },
  gateWhy: { fontSize: 11.5, color: T.muted, flex: 1, minWidth: 180 },
  gateGo: { padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
            border: `1px solid ${T.accent}`, background: '#fff', color: T.accent, whiteSpace: 'nowrap' },
  gateDone: { marginTop: 9, paddingTop: 8, borderTop: `1px solid ${T.warn}22`,
              fontSize: 11.5, color: T.muted, lineHeight: 1.7 },

  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 720 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 12px', fontWeight: 600, whiteSpace: 'nowrap', color: T.ink },
  gh: { border: `1px solid ${T.sheetLine}`, background: '#eef2f7', padding: '7px 12px', fontWeight: 700, textAlign: 'left' },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'left', background: '#f7f9fb', fontWeight: 600 },
  td: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', textAlign: 'center', ...mono },
  tdWhy: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'left', fontSize: 11.5, color: T.muted, lineHeight: 1.65 },
  auto: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', textAlign: 'center', fontWeight: 700, background: '#fffdf0', ...mono },
  sum: { border: `1px solid ${T.sheetLine}`, padding: '8px 12px', textAlign: 'center', fontWeight: 700, background: '#f1f5f9', ...mono },
  final: { border: `2px solid ${T.lineStrong}`, padding: '10px 12px', textAlign: 'center', fontWeight: 800, background: '#fffdf0', fontSize: 16, ...mono },

  select: { width: 92, padding: '4px 5px', fontSize: 12, border: `1px solid ${T.line}`, borderRadius: 4, background: '#fffdf0', color: T.ink, fontFamily: 'inherit' },
  input: (bad) => ({
    width: 78, padding: '4px 7px', fontSize: 12.5, textAlign: 'right',
    border: `1px solid ${bad ? T.warn : T.line}`, borderRadius: 4,
    background: bad ? '#fff6e6' : '#fffdf0', color: T.ink, fontFamily: 'inherit', ...mono,
  }),
  badge: (tone) => ({
    display: 'inline-block', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, marginLeft: 6,
    background: tone === 'ok' ? T.okSoft : tone === 'warn' ? T.warnSoft : '#f1f3f5',
    color: tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : T.muted,
  }),
  pend: { color: T.muted, fontStyle: 'italic', fontWeight: 400, whiteSpace: 'nowrap' },
  /* 합계 자리의 진행도 — 점수로 안 읽히게 약하게 */
  progress: { color: T.muted, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' },
  partial: { color: T.muted, fontStyle: 'italic' },
  go: {
    marginLeft: 8, padding: '2px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${T.accent}`, borderRadius: 4, background: T.accentSoft, color: T.accent,
  },
  take: {
    marginLeft: 7, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${T.accent}`, borderRadius: 4, background: T.accentSoft, color: T.accent,
  },
  scroll: { overflowX: 'auto' },
  /* 표 바로 아래에 이어 붙는 마무리 줄 — 테두리를 맞물려 표의 일부로 읽히게 한다 */
  upBar: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
           marginTop: -1, padding: '12px 16px',
           border: `1px solid ${T.sheetLine}`, borderTop: `2px solid ${T.lineStrong}`,
           borderRadius: `0 0 ${T.radius}px ${T.radius}px`, background: '#f7f9fb' },
  upTxt: { fontSize: 12.5, color: T.ink2, lineHeight: 1.6 },
  upWhere: { display: 'block', fontSize: 11, color: T.muted },
  upBtn: { marginLeft: 'auto', padding: '10px 18px', borderRadius: 7, border: 0,
           background: T.accent, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
           boxShadow: '0 2px 8px rgba(27,79,216,.25)', whiteSpace: 'nowrap' },
  note: { marginTop: 12, fontSize: 11.5, color: T.muted, lineHeight: 1.8 },
  dscrBar: { display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', margin: '14px 0 4px', fontSize: 12, color: T.ink2 },
};

export default function ReviewView({ region, addr, data, facilities, compare, rate, excl = null, sheetInput = null, gate = null, value, onChange, onJump }) {
  const v = value ?? {};

  /* 초기예상분양률은 그 탭과 **같은 함수**로 낸다 — 두 화면의 숫자가 갈리면 안 된다 */
  const { total: rateTotal, res } = useMemo(() => expectedRateOf(compare, rate, excl, sheetInput), [compare, rate, excl, sheetInput]);
  const pct = res && !res.pending ? res.rate : null;

  const r = useMemo(() => reviewScore({ manual: v, rate: pct ?? NaN }), [v, pct]);
  const items = r.groups.flatMap(g => g.items).length;

  /*
    이 앱이 수집한 시공능력평가순위는 [수기입력] 탭이 **버튼 없이 바로 채운다**
    (사용자 지적 2026-09-25 — 「3위인데 넣어주면 되지 왜 버튼을 또 누르게 해」).
    여기서는 그 사실을 근거 칸에 적기만 한다.
  */
  const known = useMemo(() => {
    const g = (id) => (data?.results ?? []).find(x => x.indicatorId === id && x.ok)?.value ?? null;
    const rank = g('construction_capability_rank');
    return rank == null ? {} : {
      '시공능력평가액순위': { text: `이 앱이 수집한 순위 : ${rank}위 — [수기입력] 탭에서 자동으로 들어갑니다` },
    };
  }, [data]);
  const t = tableOf('심사평점표');

  return (
    <div style={S.page}>
      <h2 style={S.h2}>심사평점표</h2>
      <p style={S.subject}>▶ 사업지 : {facilities?.address ?? addr ?? region}</p>

      <div style={S.flow}>
        이 앱이 만든 <b>초기예상분양률</b>이 여기서 점수가 되어 최종 평점으로 들어갑니다.<br />
        <span style={S.chain}>
          시트별 항목 점수 → 종합평가 {rateTotal ?? '—'}점 → 초기예상분양률 {pct != null ? `${pct}%` : '—'}
          {' '}→ 초기분양률 배점 {r.presale?.pending ? '—' : `${r.presale.score}점`} → 종합평점
        </span><br />
        <span style={{ color: T.muted }}>
          <b>이 표는 결과만 보여줍니다</b> — 사업수익률·누적DSCR·자기자금·신용등급 같은 값은
          사업수지표·신용평가에서 나오므로 <b>[수기입력] 탭</b>에서 받습니다.
          시공능력평가순위는 이 앱이 수집한 값이 그 탭에 자동으로 들어갑니다.
        </span>
        {/* 「초기분양률」 이 세 곳에 나와 헷갈린다 — 세 탭에 같은 그림을 둔다 */}
        <PresaleChain
          here="score"
          values={{
            input: sheetInput?.인근초기분양률?.rate,
            pct,
            score: r.presale?.pending ? null : r.presale.score,
          }}
        />
      </div>

      {/*
        **관문** — 무엇이 비었는지 한자리에 모으고 그 탭으로 바로 보낸다.
        전에는 「초기예상분양률 탭으로 →」 하나뿐이라 거기 가면 「비교사업장 탭으로 →」,
        거기서 또 「수기입력 탭에서 완성하세요」 로 **세 번 튕겼다**.
        탭 자체는 막지 않는다: 사업수익률·자기자금·신용등급은 이 앱이 수집하지 않는 값이라
        사업수지표를 손에 든 실무자가 먼저 넣어둘 수 있어야 한다.
        다만 **결론은 안 난다** — 초기분양률(22) 이 안 차므로 합계·종합평점·등급·요율이 잠긴다.
      */}
      {gate?.blocked && (
        <div style={S.gate}>
          <div style={S.gateHead}>
            아래 심사사항을 먼저 수행해 주세요
            <span style={S.gateCount}>남은 항목 {gate.need.length}개</span>
          </div>
          {/*
            까닭은 제목이 아니라 한 줄 아래에 적는다 — 제목에 넣었더니
            「먼저 채워야 초기분양률(22) 이 차고 종합평점이 납니다」 처럼 읽히지 않는 문장이 됐다.
          */}
          <div style={S.gateNote}>
            이 항목들이 모여 <b>초기예상분양률</b>이 산정되고, 그 값이 아래 표의
            <b> 초기분양률(22)</b> 점수가 됩니다. 그래서 지금은 합계 · 종합평점 · 심사등급 · 보증료율이 나오지 않습니다.
          </div>
          {gate.need.map((n, i) => (
            <div key={i} style={S.gateRow}>
              <span style={S.gateX}>✗</span>
              <span style={S.gateLabel}>{n.label}</span>
              <span style={S.gateWhy}>{n.why}</span>
              {n.tab && (
                <button style={S.gateGo} onClick={() => onJump?.(n.tab)}>{n.go ?? `${n.tab} 탭으로 →`}</button>
              )}
            </div>
          ))}
          {gate.done.length > 0 && (
            <div style={S.gateDone}>
              <b>✓ 끝난 것</b> — {gate.done.map(d => d.label).join(' · ')}
            </div>
          )}
        </div>
      )}

      {r.zero && (
        <div style={S.warn}>
          <b>0점 처리 규칙이 걸렸습니다</b> — {r.zero.text}<br />
          {r.zero.lowRate && <>· 초기예상분양률 {pct}% 가 50% 미만입니다<br /></>}
          {r.zero.lowDscr && <>· 누적DSCR {v.__dscr} 이 1.00 미만입니다<br /></>}
          <span style={{ color: T.ink2 }}>초기분양률·누적DSCR 두 항목의 평점을 0점으로 내렸습니다.</span>
        </div>
      )}

      <div style={S.scroll}>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={S.th}>구분</th><th style={S.th}>평가항목</th>
              <th style={S.th}>배점</th><th style={S.th}>값</th>
              <th style={S.th}>평점</th><th style={S.th}>근거 · 산식</th>
            </tr>
          </thead>
          <tbody>
            {r.groups.map(g => (
              <FragmentRows key={g.label} g={g} v={v} pct={pct} presale={r.presale} known={known} onJump={onJump} gate={gate} />
            ))}
            <tr>
              <td style={S.gh} colSpan={2}>합 계</td>
              <td style={S.sum}>{r.max}</td>
              <td style={S.td} />
              {/*
                **배점 100 옆에 부분합 숫자가 있으면 "16/100" 으로 읽힌다.**
                실제로는 7개 중 1개만 평가한 값인데 낮은 평점처럼 보인다 — 실측으로 확인했다.
                미완성일 때는 합계 자리에 **진행도**를 놓고, 부분합은 근거 칸에서 괄호로 말한다.
                (숫자를 없애는 게 아니라 총점으로 **오독되지 않게** 자리를 바꾸는 것이다)
              */}
              <td style={r.missing.length ? { ...S.sum, background: '#fff' } : S.sum}>
                {r.missing.length
                  ? <span style={S.progress}>{items - r.missing.length} / {items}</span>
                  : r.total}
              </td>
              <td style={S.tdWhy}>
                {r.missing.length
                  ? <>값을 넣은 항목 <b>{items - r.missing.length}개</b> ·
                      남은 항목 <b style={{ color: T.warn }}>{r.missing.length}개</b>
                      {r.missing.length <= 3 && <> — {r.missing.join(' · ')}</>}<br />
                      <span>전 항목을 넣어야 합계가 납니다 <span style={S.partial}>(지금까지 넣은 것만 더하면 {r.total}점)</span></span></>
                  : '전 항목 입력됨'}
              </td>
            </tr>
            <tr>
              <td style={S.gh} colSpan={2}>감 점</td>
              <td style={S.td}>—</td>
              <td style={S.td}>
                {String(v.__deduct ?? '') !== ''
                  ? <b>{v.__deduct}</b>
                  : <span style={S.pend}>없음</span>}
              </td>
              <td style={S.td}>{r.deduct != null ? `−${r.deduct}` : <span style={S.pend}>—</span>}</td>
              <td style={S.tdWhy}>
                {t?.deduct?.known && <>확인된 구간 : <b style={{ color: T.ink2 }}>{t.deduct.known}</b><br /></>}
                {t?.deduct?.note}
              </td>
            </tr>
            <tr>
              <td style={S.gh} colSpan={2}>종합평점</td>
              <td style={S.final}>100</td>
              <td style={S.final} />
              <td style={S.final}>{r.net ?? <span style={S.pend}>—</span>}</td>
              <td style={S.tdWhy}>합계 − 감점</td>
            </tr>
            <tr>
              <td style={S.gh} colSpan={2}>심사등급</td>
              <td style={S.td}>—</td>
              <td style={S.td} />
              <td style={r.gradeOf?.pending ? S.td : S.final}>
                {r.gradeOf?.pending ? <span style={S.pend}>—</span>
                  : <span style={{ color: r.gradeOf.reject ? T.warn : T.ink }}>{r.gradeOf.grade}</span>}
              </td>
              <td style={S.tdWhy}>
                {r.gradeOf?.pending ? r.gradeOf.text : `종합평점 ${r.net}점 · ${r.gradeOf.label}`}
              </td>
            </tr>
            <tr>
              <td style={S.gh} colSpan={2}>보증료율</td>
              <td style={S.td}>—</td>
              <td style={S.td} />
              <td style={r.gradeOf?.pending ? S.td : S.final}>
                {r.gradeOf?.pending ? <span style={S.pend}>—</span>
                  : r.gradeOf.reject ? <span style={{ color: T.warn }}>—</span> : `${r.gradeOf.fee}%`}
              </td>
              <td style={S.tdWhy}>
                {r.gradeOf?.reject ? '60점 미만 — 보증거절' : '심사등급에 따른 요율'}
              </td>
            </tr>
          </tbody>
        </table>

        {/*
          **표 끝에서 다음 할 일은 엑셀 다운로드다.** 그 버튼은 화면 맨 위 요약 줄에 있어
          표가 길면 한참 올라가야 한다. 처음엔 화면 오른쪽 아래에 떠 있는 작은 버튼으로 뒀는데
          **안 보였다**(사용자 지적 2026-09-25 — 「이 버튼이 보일 거라고 생각하냐」).
          표 **바로 아래에 붙여** 표의 일부처럼 보이게 한다.
        */}
        <div style={S.upBar}>
          <span style={S.upTxt}>
            {r.gradeOf?.pending
              ? '값을 다 넣으면 여기서 심사등급·보증료율이 납니다.'
              : <>심사등급 <b>{r.gradeOf.grade}</b>{r.gradeOf.reject ? '' : <> · 보증료율 <b>{r.gradeOf.fee}%</b></>} —
                  확인했으면 <b>엑셀로 내보냅니다.</b></>}
            <span style={S.upWhere}>[엑셀 다운로드] 는 화면 맨 위 요약 줄에 있습니다</span>
          </span>
          <button type="button" style={S.upBtn}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            ↑ 맨 위로 — 엑셀 다운로드
          </button>
        </div>
      </div>


      <div style={S.note}>
        ※ 사업수익률의 분양가는 <b>Min(적정분양가, 예정분양가)</b> 입니다 —
        적정분양가는 이 앱의 [비교사업장 · 분양가] 탭이 심사지침 제16조로 냅니다.<br />
        ※ 배점 판독 주의 : 합계 100 · 사업수지분석 65 · 시공자 항목 15/15/5(=35) 입니다.
        캡쳐의 그룹 라벨 「시공자 사업수행능력 (30)」 은 항목 합·총계와 맞지 않아 <b>항목 합</b>을 씁니다.<br />
        ※ 공동시공(시공자의 모회사가 책임준공 약정하면 모회사를 공동시공자로 봅니다) 사업은
        <b>시공자별로 평점을 각각 내어 높은 쪽</b>을 적용합니다 — 이 앱은 한 번에 한 시공자만 계산합니다.
      </div>
    </div>
  );
}

/** 그룹 한 덩어리 — 첫 줄에 구분을 병합해 캡쳐의 모양을 그대로 낸다 */
function FragmentRows({ g, v, pct, presale, known = {}, onJump, gate = null }) {
  return g.items.map((it, i) => (
    <tr key={it.id}>
      {i === 0 && (
        <td style={{ ...S.tdL, textAlign: 'center' }} rowSpan={g.items.length}>
          {g.label}<br /><span style={{ fontWeight: 400, color: T.muted, fontSize: 11.5 }}>({g.max})</span>
        </td>
      )}
      <td style={S.tdL}>
        {it.id}
        {it.auto && <span style={S.badge('ok')}>자동</span>}
        {it.forced && <span style={S.badge('warn')}>0점 처리</span>}
      </td>
      <td style={S.td}>{it.max}</td>
      {/* 값 칸과 평점 칸을 나눈다 — 한 칸에 두면 넣은 값(10.64)이 점수처럼 보인다 */}
      {/*
        **이 표는 결과만 읽는 자리다**(사용자 확정 2026-09-25 —
        「여기서 입력하면 앞뒤가 안 맞잖아」). 값을 넣는 칸은 [수기입력] 탭에 모았다.
        빈 칸은 숨기지 않고 「미입력」 이라 적고 그 자리에서 넣으러 갈 수 있게 한다.
      */}
      <td style={S.td}>
        {it.auto
          ? <span style={S.pend}>{pct != null ? `${pct}%` : '—'}</span>
          : (String(it.value ?? '') !== ''
            ? <b>{it.value}{it.select ? '' : (it.unit ?? '')}</b>
            : (<>
                <span style={S.pend}>미입력</span>
                <button type="button" style={{ ...S.take, marginLeft: 0, marginTop: 5, display: 'block' }}
                  onClick={() => onJump?.('수기입력')}>수기입력 탭에서 넣기 →</button>
              </>))}
      </td>
      <td style={it.score != null ? S.auto : S.td}>
        {it.score == null ? <span style={S.pend}>—</span> : it.score}
      </td>
      <td style={S.tdWhy}>
        {it.auto && pct != null && <><b style={{ color: T.ink2 }}>초기예상분양률 {pct}% · {presale?.label}</b><br /></>}
        {it.auto && pct == null && (
          <>
            {/* 산정이 안 된 것과, 산정은 됐지만 판정 전 기본점수가 섞여 안 넘어온 것은 다르다 */}
            <span style={{ color: T.warn }}>
              {gate?.blocked
                ? `위에 적힌 ${gate.need.length}개를 먼저 수행하면 자동으로 채워집니다`
                : '초기예상분양률이 산정되면 자동으로 찹니다'}
            </span>
            {!gate?.blocked && (
              <button style={S.go} onClick={() => onJump?.('초기예상분양률')}>초기예상분양률 탭으로 →</button>
            )}
            <br />
          </>
        )}
        {it.forced && it.from != null && <><b style={{ color: T.warn }}>{it.from}점 → 0점</b><br /></>}
        {it.formula && <>{it.formula}<br /></>}
        {!it.auto && it.score != null && typeof it.band === 'string' && it.band
          && <><b style={{ color: T.ok }}>{it.band} → {it.score}점</b><br /></>}
        {!it.auto && it.score == null && typeof it.band === 'string' && it.band
          && <><b style={{ color: T.warn }}>{it.band}</b><br /></>}
        {known[it.id] && <>{known[it.id].text}<br /></>}
        {it.known && <>확인된 구간 : <b style={{ color: T.ink2 }}>{it.known}</b><br /></>}
        {it.note}
        {it.over && <><br /><b style={{ color: T.warn }}>배점 {it.max}점을 넘습니다</b></>}
      </td>
    </tr>
  ));
}
