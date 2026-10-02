'use client';
import { useMemo } from 'react';
import { T, mono } from './theme';
import { reviewScore } from '../src/lib/scoring';

/**
 * 심사평점표가 쓰는 **입력값**을 여기서 받는다.
 *
 * 「심사평점표에 있는 이 표는 결과만 보여주는 곳이야」(사용자 지적 2026-09-25) —
 * 맞다. 값을 넣는 자리와 결론을 읽는 자리가 한 표에 섞여 있으면
 * 「이 점수가 어디서 왔나」 를 화면이 스스로 흐린다. 넣는 것은 전부 [수기입력] 탭,
 * [심사평점표] 는 그 값으로 난 점수·등급·요율만 보여준다.
 *
 * 값은 그대로 `review` 상태에 쓴다 — 저장·엑셀·점수 계산이 모두 그것을 본다.
 */

const S = {
  box: { border: `1px solid ${T.line}`, borderRadius: T.radius, background: '#fff', marginBottom: 18, overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
          padding: '11px 16px', borderBottom: `1px solid ${T.line}`, background: '#fbfcfd', fontWeight: 700, fontSize: 13.5 },
  headNote: { marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: T.muted },
  body: { padding: '14px 16px 16px' },
  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 10px', fontWeight: 600, whiteSpace: 'nowrap' },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'left' },
  td: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'center', ...mono },
  tdWhy: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'left', fontSize: 11.5, color: T.ink2, lineHeight: 1.6 },
  input: { width: 96, padding: '5px 7px', fontSize: 12.5, textAlign: 'right', borderRadius: 4,
           border: `1px solid ${T.line}`, background: '#fffdf0', color: T.ink, fontFamily: 'inherit' },
  select: { width: 120, padding: '5px 5px', fontSize: 12.5, borderRadius: 4,
            border: `1px solid ${T.line}`, background: '#fffdf0', color: T.ink, fontFamily: 'inherit' },
  score: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'center', fontWeight: 800, background: '#fffdf0', ...mono },
  pend: { color: T.muted, fontStyle: 'italic' },
  auto: { display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
          background: T.okSoft, color: T.ok, marginLeft: 6 },
  note: { marginTop: 10, fontSize: 11.5, color: T.muted, lineHeight: 1.75 },
  group: { display: 'flex', gap: 14, alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px dashed ${T.line}` },
  gLab: { width: 112, flex: '0 0 112px', paddingTop: 2, fontSize: 12, fontWeight: 800, color: T.ink2 },
  grid: { display: 'flex', gap: 18, flexWrap: 'wrap', flex: 1 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, width: 210 },
  lab: { fontSize: 11.5, fontWeight: 700, color: T.ink2 },
  max: { marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: T.muted, whiteSpace: 'nowrap' },
  inRow: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  unit: { fontSize: 11.5, color: T.muted },
  out: { fontSize: 12, fontWeight: 800, color: T.ok, minHeight: 17, ...mono },
  tip: { fontSize: 10.5, color: T.muted, lineHeight: 1.45 },
  warn: { marginTop: 10, padding: '9px 13px', background: T.warnSoft, border: `1px solid #f0dcb4`,
          borderRadius: 6, fontSize: 12, color: T.ink2, lineHeight: 1.65 },
};

export default function ReviewInputs({ value, onChange, companyRank = null, company = null }) {
  const v = value ?? {};
  const put = (id, x) => onChange?.({ ...v, [id]: x });

  /*
    **시공능력평가순위는 칸을 두지 않는다**(사용자 지적 2026-10-02) — 맨 위에서 고른 시공사로 이미 정해진다.
    값은 page.js 가 시공사 순위를 따라 넣는다. 공시 명부에 없는 상호일 때만 칸을 세운다.
  */
  const rankId = '시공능력평가액순위';
  const r = useMemo(() => reviewScore({ manual: v, rate: NaN }), [v]);

  /*
    **넣는 칸은 폼으로, 표는 결과만**(사용자 지적 2026-10-01 「모든 수기입력사항은 별도폼으로 두고 표는 그 결과만 보는 곳」).
    전에는 「값」 열이 표 안에 있어 넣는 자리와 읽는 자리가 한 줄에 섞였다.
    칸마다 바로 아래에 「→ N점」 만 짧게 붙인다 — 점수표 자체는 [심사평점표] 탭이다.
  */
  /* 컴포넌트가 아니라 함수로 부른다 — 렌더마다 새 컴포넌트가 되면 입력칸이 글자마다 포커스를 잃는다 */
  const field = (it) => (
    <div key={it.id} style={S.field}>
      <span style={S.lab}>
        {it.id}
        <span style={S.max}>배점 {it.max}</span>
      </span>
      {it.select
        ? (
          <select style={S.select} value={v[it.id] ?? ''} onChange={e => put(it.id, e.target.value)}>
            <option value="">선택</option>
            {it.select.options.map(o => <option key={o.id} value={o.id}>{o.id}</option>)}
          </select>
        )
        : (
          <span style={S.inRow}>
            <input style={S.input} type="number" step="any" placeholder="입력"
              value={v[it.id] ?? ''} onChange={e => put(it.id, e.target.value)} />
            {it.unit && <span style={S.unit}>{it.unit}</span>}
          </span>
        )}
      <span style={S.out}>
        {it.score == null ? '' : `${typeof it.band === 'string' && it.band ? `${it.band} → ` : ''}${it.score}점`}
      </span>
      {it.id === rankId && <span style={S.tip}>위에서 고른 시공사{company ? `(${company})` : ''}가 공시 명부에 없어 직접 넣습니다</span>}
      {it.formula && <span style={S.tip}>{it.formula}</span>}
    </div>
  );

  return (
    <div style={S.box}>
      <div style={S.head}>
        <span>심사평점표에 들어가는 값</span>
        <span style={S.headNote}>사업수지표 · 신용평가에서 옮겨 적습니다 · 점수표는 [심사평점표] 탭</span>
      </div>
      <div style={S.body}>
        {r.groups.map(g => {
          const items = g.items.filter(it => !it.auto && !(it.id === rankId && companyRank != null));
          if (!items.length) return null;
          return (
            <div key={g.label} style={S.group}>
              <div style={S.gLab}>{g.label}</div>
              <div style={S.grid}>{items.map(field)}</div>
            </div>
          );
        })}
        <div style={S.group}>
          <div style={S.gLab}>감점</div>
          <div style={S.grid}>
            <div style={S.field}>
              <span style={S.lab}>사고사망만인율 감점</span>
              <span style={S.inRow}>
                <input style={S.input} type="number" step="any" placeholder="없음"
                  value={v.__deduct ?? ''} onChange={e => put('__deduct', e.target.value)} />
                <span style={S.unit}>점</span>
              </span>
              <span style={S.out}>{Number.isFinite(Number(v.__deduct)) && v.__deduct !== '' ? `−${Number(v.__deduct)}점` : ''}</span>
              <span style={S.tip}>0.5배 초과 ~ 1.0배 이하면 1점</span>
            </div>
          </div>
        </div>

        {r.zero && (
          <div style={S.warn}>
            <b>0점 처리 대상입니다</b> — {r.zero.text}
            {' '}({r.zero.items.join(' · ')} 평점을 모두 0점으로 봅니다)
          </div>
        )}

        <div style={S.note}>
          ※ 점수가 아니라 <b>원시값</b>을 넣습니다 — 사업수익률 10.64(%) · 누적DSCR 1.05. 구간표가 점수를 냅니다.
          {companyRank != null && <> 시공능력평가순위는 위에서 고른 시공사{company ? `(${company})` : ''}의 공시 순위 <b>{companyRank}위</b>가 그대로 들어갑니다.</>}
          <br />
          초기분양률(22)은 이 앱이 산정한 <b>초기예상분양률</b>에서 나므로 칸이 없습니다.
          사업수익률의 분양가는 <b>Min(적정분양가, 예정분양가)</b> — 적정분양가는 [비교사업장 · 분양가] 탭이 냅니다.
        </div>
      </div>
    </div>
  );
}
