'use client';
import { useMemo } from 'react';
import { T, mono } from './theme';
import { reviewScore, tableOf } from '../src/lib/scoring';
import { expectedRateOf } from '../src/lib/compare';

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
  scroll: { overflowX: 'auto' },
  note: { marginTop: 12, fontSize: 11.5, color: T.muted, lineHeight: 1.8 },
  dscrBar: { display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', margin: '14px 0 4px', fontSize: 12, color: T.ink2 },
};

export default function ReviewView({ region, addr, data, facilities, compare, rate, excl = null, sheetInput = null, value, onChange }) {
  const v = value ?? {};
  const set = (patch) => onChange?.({ ...v, ...patch });
  const put = (id, x) => set({ [id]: x });

  /* 초기예상분양률은 그 탭과 **같은 함수**로 낸다 — 두 화면의 숫자가 갈리면 안 된다 */
  const { total: rateTotal, res } = useMemo(() => expectedRateOf(compare, rate, excl, sheetInput), [compare, rate, excl, sheetInput]);
  const pct = res && !res.pending ? res.rate : null;

  const r = useMemo(() => reviewScore({ manual: v, rate: pct ?? NaN }), [v, pct]);

  /* 이 앱이 이미 수집한 값은 근거 칸에 띄워준다 — "수집한다" 고만 적으면 어디 있는지 모른다 */
  const known = useMemo(() => {
    const g = (id) => (data?.results ?? []).find(x => x.indicatorId === id && x.ok)?.value ?? null;
    const rank = g('construction_capability_rank');
    return rank == null ? {} : { '시공능력평가액순위': `이 앱이 수집한 순위 : ${rank}위` };
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
          사업성·시공자 항목은 <b>값만 넣으면 점수가 납니다</b> (2026-09-16 전체 구간표 수령).
          그 값들은 사업수지표·신용평가에서 나오므로 이 앱이 수집하지는 않습니다.
        </span>
      </div>

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
              <FragmentRows key={g.label} g={g} v={v} put={put} pct={pct} presale={r.presale} known={known} />
            ))}
            <tr>
              <td style={S.gh} colSpan={2}>합 계</td>
              <td style={S.sum}>{r.max}</td>
              <td style={S.td} />
              <td style={S.sum}>
                {/* 하나도 안 넣었는데 0 이 뜨면 "0점 평가" 로 읽힌다 */}
                {r.missing.length === r.groups.flatMap(g => g.items).length
                  ? <span style={S.pend}>—</span>
                  : r.missing.length ? <span style={S.pend}>{r.total}</span> : r.total}
              </td>
              <td style={S.tdWhy}>
                {r.missing.length
                  ? <>수동입력 <b style={{ color: T.warn }}>{r.missing.length}개</b> 남음
                      {r.missing.length <= 3 && <> — {r.missing.join(' · ')}</>}</>
                  : '전 항목 입력됨'}
              </td>
            </tr>
            <tr>
              <td style={S.gh} colSpan={2}>감 점</td>
              <td style={S.td}>—</td>
              <td style={S.td}>
                <input style={S.input(false)} type="number" step="any" placeholder="없음"
                  value={v.__deduct ?? ''} onChange={e => put('__deduct', e.target.value)} />
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
function FragmentRows({ g, v, put, pct, presale, known = {} }) {
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
      <td style={S.td}>
        {it.auto
          ? <span style={S.pend}>{pct != null ? `${pct}%` : '—'}</span>
          : it.select
            ? (
              <select style={S.select} value={v[it.id] ?? ''} onChange={e => put(it.id, e.target.value)}>
                <option value="">선택</option>
                {it.select.options.map(o => <option key={o.id} value={o.id}>{o.id}</option>)}
              </select>
            )
            : (
              <input style={S.input(it.over)} type="number" step="any"
                placeholder={it.band ? (it.band.unit || '값') : '점수'}
                value={v[it.id] ?? ''} onChange={e => put(it.id, e.target.value)} />
            )}
      </td>
      <td style={it.score != null ? S.auto : S.td}>
        {it.score == null ? <span style={S.pend}>—</span> : it.score}
      </td>
      <td style={S.tdWhy}>
        {it.auto && pct != null && <><b style={{ color: T.ink2 }}>초기예상분양률 {pct}% · {presale?.label}</b><br /></>}
        {it.auto && pct == null && <><span style={{ color: T.warn }}>초기예상분양률 탭에서 산정되면 자동으로 찹니다</span><br /></>}
        {it.forced && it.from != null && <><b style={{ color: T.warn }}>{it.from}점 → 0점</b><br /></>}
        {it.formula && <>{it.formula}<br /></>}
        {!it.auto && it.score != null && typeof it.band === 'string' && it.band
          && <><b style={{ color: T.ok }}>{it.band} → {it.score}점</b><br /></>}
        {!it.auto && it.score == null && typeof it.band === 'string' && it.band
          && <><b style={{ color: T.warn }}>{it.band}</b><br /></>}
        {known[it.id] && <>{known[it.id]}<br /></>}
        {it.known && <>확인된 구간 : <b style={{ color: T.ink2 }}>{it.known}</b><br /></>}
        {it.note}
        {it.over && <><br /><b style={{ color: T.warn }}>배점 {it.max}점을 넘습니다</b></>}
      </td>
    </tr>
  ));
}
