'use client';
import { useEffect, useMemo } from 'react';
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
  select: { width: 104, padding: '5px 5px', fontSize: 12.5, borderRadius: 4,
            border: `1px solid ${T.line}`, background: '#fffdf0', color: T.ink, fontFamily: 'inherit' },
  score: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'center', fontWeight: 800, background: '#fffdf0', ...mono },
  pend: { color: T.muted, fontStyle: 'italic' },
  auto: { display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
          background: T.okSoft, color: T.ok, marginLeft: 6 },
  note: { marginTop: 10, fontSize: 11.5, color: T.muted, lineHeight: 1.75 },
  warn: { marginTop: 10, padding: '9px 13px', background: T.warnSoft, border: `1px solid #f0dcb4`,
          borderRadius: 6, fontSize: 12, color: T.ink2, lineHeight: 1.65 },
};

export default function ReviewInputs({ value, onChange, companyRank = null, company = null }) {
  const v = value ?? {};
  const put = (id, x) => onChange?.({ ...v, [id]: x });

  /*
    **시공능력평가순위는 이 앱이 이미 수집한 값이다**(사용자 지적 2026-09-25 —
    「3위인데 넣어주면 되지 왜 버튼을 또 누르게 해」). 그래서 [N위 넣기] 버튼을 없애고
    **빈 칸일 때 바로 채운다.** 손댄 적이 있으면(빈 문자열 포함) 건드리지 않는다 —
    공동시공처럼 다른 시공자로 볼 때 지운 값을 되살리면 안 된다.
    어디서 온 값인지는 근거 칸에 적는다.
  */
  const rankId = '시공능력평가액순위';
  useEffect(() => {
    if (companyRank == null) return;
    if (v[rankId] !== undefined) return;
    onChange?.({ ...v, [rankId]: String(companyRank) });
  }, [companyRank, v, onChange]);

  const r = useMemo(() => reviewScore({ manual: v, rate: NaN }), [v]);
  const fromApp = companyRank != null && String(v[rankId] ?? '') === String(companyRank);

  return (
    <div style={S.box}>
      <div style={S.head}>
        <span>심사평점표 입력값</span>
        <span style={S.headNote}>사업수지표 · 신용평가에서 옮겨 적습니다 · 점수는 [심사평점표] 탭에서 읽습니다</span>
      </div>
      <div style={S.body}>
        <table style={S.tbl}>
          <thead>
            <tr>{['구분', '평가항목', '배점', '값', '점수', '근거'].map(c => <th key={c} style={S.th}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {r.groups.map(g => g.items.filter(it => !it.auto).map((it, i, arr) => (
              <tr key={it.id}>
                {i === 0 && (
                  <td style={{ ...S.tdL, textAlign: 'center' }} rowSpan={arr.length}>
                    {g.label}
                  </td>
                )}
                <td style={S.tdL}>
                  {it.id}
                  {it.id === rankId && fromApp && <span style={S.auto}>자동</span>}
                </td>
                <td style={S.td}>{it.max}</td>
                <td style={S.td}>
                  {it.select
                    ? (
                      <select style={S.select} value={v[it.id] ?? ''} onChange={e => put(it.id, e.target.value)}>
                        <option value="">선택</option>
                        {it.select.options.map(o => <option key={o.id} value={o.id}>{o.id}</option>)}
                      </select>
                    )
                    : (
                      <input style={S.input} type="number" step="any"
                        placeholder={it.unit || '값'}
                        value={v[it.id] ?? ''} onChange={e => put(it.id, e.target.value)} />
                    )}
                </td>
                <td style={it.score != null ? S.score : S.td}>
                  {it.score == null ? <span style={S.pend}>—</span> : it.score}
                </td>
                <td style={S.tdWhy}>
                  {it.id === rankId && companyRank != null && (
                    <><b style={{ color: T.ink2 }}>
                      {company ? `시공사 ${company} ` : ''}{companyRank}위 — 이 앱이 수집한 값입니다
                    </b>
                    {!fromApp && <span style={{ color: T.warn }}> (지금 칸의 값과 다릅니다)</span>}
                    <br /></>
                  )}
                  {typeof it.band === 'string' && it.band ? `${it.band}${it.score != null ? ` → ${it.score}점` : ''}` : ''}
                  {it.formula ? <><br />{it.formula}</> : null}
                  {it.known ? <><br />확인된 구간 : {it.known}</> : null}
                  {it.note ? <><br />{it.note}</> : null}
                </td>
              </tr>
            )))}
            <tr>
              <td style={{ ...S.tdL, textAlign: 'center' }}>감점</td>
              <td style={S.tdL}>사고사망만인율</td>
              <td style={S.td}>—</td>
              <td style={S.td}>
                <input style={S.input} type="number" step="any" placeholder="없음"
                  value={v.__deduct ?? ''} onChange={e => put('__deduct', e.target.value)} />
              </td>
              <td style={S.td}>{Number.isFinite(Number(v.__deduct)) && v.__deduct !== '' ? `−${Number(v.__deduct)}` : <span style={S.pend}>—</span>}</td>
              <td style={S.tdWhy}>0.5배 초과 ~ 1.0배 이하면 1점 감점합니다</td>
            </tr>
          </tbody>
        </table>

        {r.zero && (
          <div style={S.warn}>
            <b>0점 처리 대상입니다</b> — {r.zero.text}
            {' '}({r.zero.items.join(' · ')} 평점을 모두 0점으로 봅니다)
          </div>
        )}

        <div style={S.note}>
          ※ 이 칸들은 <b>점수가 아니라 원시값</b>입니다 — 사업수익률 10.64(%) · 누적DSCR 1.05 · 순위 3(위).
          구간표가 점수를 냅니다.<br />
          ※ 초기분양률(22)은 이 앱이 산정한 <b>초기예상분양률</b>에서 자동으로 나므로 여기에 칸이 없습니다.<br />
          ※ 사업수익률의 분양가는 <b>Min(적정분양가, 예정분양가)</b> 이고, 적정분양가는
          [비교사업장 · 분양가] 탭이 심사지침 제16조로 냅니다.
        </div>
      </div>
    </div>
  );
}
