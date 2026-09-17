'use client';
import { useMemo } from 'react';
import { T, mono } from './theme';
import { manualSummary, PENDING_ITEMS, scaleTable, unitMixTable, nearbyTable } from '../src/lib/manual';

/**
 * 수기입력 — **분양가격지수 제외 항목 점수(A)** 를 여기서 완성한다.
 *
 * 전에는 A 를 내부망 평가표에서 손으로 옮겨 적게 했다. 그런데 항목 대부분을
 * 이 앱이 이미 알고 있고, 나머지도 **구간표가 있으면 값만 받아 점수를 낼 수 있다.**
 * 그래서 남는 수기입력은 구간표를 아직 못 받은 항목의 점수뿐이다.
 *
 *   자동        교통환경 · 주거편의 · 교육환경 · 브랜드경쟁력 · 주택담보대출금리
 *   값 → 점수   규모 및 배치 · 평형구성 · 인근아파트 초기 분양률
 *   점수 직접   지역미분양 · 지역수요 · 지역경쟁력 · 소비심리지수   (구간표 미수령)
 */

const S = {
  page: { background: T.panel, border: `1px solid ${T.lineStrong}`, borderTop: 0, borderRadius: `0 0 ${T.radius}px ${T.radius}px`, padding: '22px 24px 26px' },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' },
  subject: { fontSize: 12.5, color: T.ink2, margin: '0 0 16px' },
  intro: { padding: '11px 16px', background: '#f7f9fb', border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, color: T.ink2, lineHeight: 1.8, marginBottom: 16 },

  box: { marginBottom: 14, borderRadius: 8, border: `1px solid ${T.lineStrong}`, overflow: 'hidden', background: '#fff' },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 16px', background: '#eef2f7', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 700, color: T.ink },
  headNote: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.muted },
  body: { padding: '13px 16px 15px' },
  formula: { fontSize: 11.5, color: T.muted, marginBottom: 11, ...mono },

  grid: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  lab: { fontSize: 11.5, fontWeight: 700, color: T.ink2 },
  input: { width: 110, padding: '5px 8px', fontSize: 12.5, textAlign: 'right', border: `1px solid ${T.line}`, borderRadius: 4, background: '#fffdf0', color: T.ink, fontFamily: 'inherit', ...mono },
  sub: { fontSize: 11, color: T.muted, minHeight: 15, ...mono },

  /*
    결과를 입력칸 **아래** 점선 밑에 두었더니, 값을 넣을 때마다 눈이 위↔아래로 움직였다.
    입력칸은 화면 왼쪽 1/3 만 쓰고 오른쪽 2/3 는 비어 있었다 — 그 자리에 결과를 붙인다.
    자리가 모자라면 flex 가 알아서 아랫줄로 내린다.
  */
  out: { marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 12.5,
         paddingLeft: 16, borderLeft: `1px dashed ${T.line}` },
  outNum: { fontSize: 21, fontWeight: 800, ...mono },
  pend: { color: T.muted, fontStyle: 'italic', fontSize: 12 },

  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 12px', fontWeight: 600, whiteSpace: 'nowrap', color: T.ink },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'left', background: '#f7f9fb', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', textAlign: 'center', ...mono },
  tdWhy: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'left', fontSize: 11.5, color: T.muted, lineHeight: 1.6 },
  filled: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', textAlign: 'center', fontWeight: 700, background: '#fffdf0', ...mono },
  blank: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', background: 'repeating-linear-gradient(45deg,#fafbfc,#fafbfc 5px,#f1f3f5 5px,#f1f3f5 10px)' },
  final: { border: `2px solid ${T.lineStrong}`, padding: '10px 12px', textAlign: 'center', fontWeight: 800, background: '#fffdf0', fontSize: 16, ...mono },
  kind: (k) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, marginLeft: 6,
    background: k === 'auto' ? T.okSoft : k === 'form' ? '#e8eefc' : '#f1f3f5',
    color: k === 'auto' ? T.ok : k === 'form' ? '#2d5bd7' : T.muted,
  }),
  chip: (on) => ({
    padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', borderRadius: 5,
    border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : '#fff',
    color: on ? T.accent : T.ink2,
  }),
  /* 상시 표시되는 설명을 경고색으로 두면 진짜 경고를 놓친다 — 정보 톤으로 */
  warn: { marginTop: 10, padding: '9px 13px', background: '#f7f9fb', border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 11.5, color: T.ink2, lineHeight: 1.65 },
  note: { marginTop: 12, fontSize: 11.5, color: T.muted, lineHeight: 1.8 },
};

const KIND_LABEL = { auto: '자동', form: '값→점수', typed: '점수 직접' };

export default function ManualView({ region, addr, data, facilities, manual, value, onChange }) {
  const v = value ?? {};
  const set = (patch) => onChange?.({ ...v, ...patch });
  const setScale = (k, x) => set({ 규모및배치: { ...(v.규모및배치 ?? {}), [k]: x } });
  const setMix = (k, x) => set({ 평형구성: { ...(v.평형구성 ?? {}), [k]: x } });
  const setNearby = (patch) => set({ 인근초기분양률: { ...(v.인근초기분양률 ?? {}), ...patch } });
  const setTyped = (k, x) => set({ 점수: { ...(v.점수 ?? {}), [k]: x } });

  const sum = useMemo(
    () => manualSummary({ sheetInput: v, data, facilities, manual }),
    [v, data, facilities, manual]);

  const scale = scaleTable();
  const mixT = unitMixTable();
  const nearbyT = nearbyTable();
  const nearby = v.인근초기분양률 ?? {};
  const scaleSc = sum.formed[0].sc;
  const mixSc = sum.formed[1].sc;
  const nearbySc = sum.formed[2].sc;

  return (
    <div style={S.page}>
      <h2 style={S.h2}>수기입력</h2>
      <p style={S.subject}>▶ 사업지 : {facilities?.address ?? addr ?? region}</p>

      <div style={S.intro}>
        여기서 <b>분양가격지수 제외 항목 점수(A)</b> 가 완성됩니다. A 는 종합평가 점수에서
        분양가경쟁력을 뺀 나머지 전부입니다.<br />
        <span style={{ color: T.muted }}>
          항목 대부분은 이 앱이 이미 냈고, 구간표가 있는 것은 <b>값만 넣으면 점수가 납니다</b>.{' '}
          남는 수기입력은 구간표를 아직 못 받은 항목의 점수뿐입니다.
        </span>
      </div>

      {/* ── 규모 및 배치 ───────────────────────────────── */}
      <div style={S.box}>
        <div style={S.head}><span>규모 및 배치</span><span style={S.headNote}>배점 5</span></div>
        <div style={S.body}>
          <div style={S.formula}>{scale?.formula}</div>
          <div style={S.grid}>
            {scaleSc?.parts?.map(p => (
              <div key={p.id} style={S.field}>
                <span style={S.lab}>{p.id} <span style={{ fontWeight: 400, color: T.muted }}>({p.unit})</span></span>
                <input style={S.input} type="number" min="0" step="any" placeholder="입력"
                  value={v.규모및배치?.[p.id] ?? ''} onChange={e => setScale(p.id, e.target.value)} />
                <span style={S.sub}>{p.score != null ? `${p.band} → ${p.score}점 ×${p.weight}` : ''}</span>
              </div>
            ))}
          <div style={S.out}>
              {scaleSc?.pending
                ? <span style={S.pend}>
                    {scaleSc.missing?.length === scaleSc.parts?.length
                      ? '세 값을 넣으면 점수가 납니다'
                      : scaleSc.text}
                  </span>
                : (<>
                    <span style={{ color: T.muted }}>가중평균</span>
                    <span style={{ ...S.outNum, fontSize: 17 }}>{scaleSc.avg}</span>
                    <span style={{ color: T.muted }}>→</span>
                    <b>{scaleSc.label} · 평가점수 {scaleSc.score}점</b>
                  </>)}
            </div>
          </div>
          <div style={S.note}>
            ※ 주상복합(오피스텔분양보증)은 아파트 + 오피스텔 세대수를 합산 ·
            오피스텔·도시형생활주택은 1세대를 0.5세대로 환산 ·
            용적률·건폐율은 사업계획승인서 또는 건축허가서 기준
          </div>
        </div>
      </div>

      {/* ── 평형구성 ───────────────────────────────────── */}
      <div style={S.box}>
        <div style={S.head}><span>평형구성</span><span style={S.headNote}>배점 5 · 작을수록 좋다</span></div>
        <div style={S.body}>
          <div style={S.formula}>{mixT?.formula}</div>
          <div style={S.grid}>
            {mixT?.weights?.map(w => (
              <div key={w.id} style={S.field}>
                <span style={S.lab}>{w.id} <span style={{ fontWeight: 400, color: T.muted }}>가중치 {w.weight}</span></span>
                <input style={S.input} type="number" min="0" placeholder="세대"
                  value={v.평형구성?.[w.id] ?? ''} onChange={e => setMix(w.id, e.target.value)} />
                <span style={S.sub}>{w.note ?? ''}</span>
              </div>
            ))}
          <div style={S.out}>
              {mixSc?.pending
                ? <span style={S.pend}>{mixSc.text}</span>
                : (<>
                    <span style={{ color: T.muted }}>총 {mixSc.total}세대 · 가중평균</span>
                    <span style={{ ...S.outNum, fontSize: 17 }}>{mixSc.value}</span>
                    <span style={{ color: T.muted }}>→</span>
                    <b>{mixSc.label} · 평가점수 {mixSc.score}점</b>
                  </>)}
            </div>
          </div>
          <div style={S.warn}>
            원문 산식 끝에 <b>×100</b> 이 붙어 있으나 급간(1.81 / 3.37 / 3.41 / 3.78)이
            가중치 범위(1.73 ~ 6.66) 안에 들어와 <b>×100 없이</b> 적용했습니다.
            ×100 을 하면 173~666 이 되어 어느 급간에도 안 걸립니다 — 원문 확인이 필요합니다.
          </div>
        </div>
      </div>

      {/* ── 인근아파트 초기 분양률 ─────────────────────── */}
      <div style={S.box}>
        <div style={S.head}>
          <span>인근아파트 초기 분양률</span>
          <span style={S.headNote}>배점 10 · 입력 항목</span>
        </div>
        <div style={S.body}>
          <div style={S.formula}>옆 단지의 실제 분양률(분양개시 후 6개월 이내)을 조사해 넣습니다</div>
          <div style={S.grid}>
            <div style={S.field}>
              <span style={S.lab}>인근 단지 초기분양률 (%)</span>
              <input style={S.input} type="number" min="0" max="100" step="any" placeholder="입력"
                disabled={!!nearby.special}
                value={nearby.rate ?? ''} onChange={e => setNearby({ rate: e.target.value })} />
              <span style={S.sub}>{nearby.special ? '특례가 선택되어 있습니다' : ''}</span>
            </div>
            <div style={{ ...S.field, gap: 6 }}>
              <span style={S.lab}>특례</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {nearbyT?.special?.map(sp => (
                  <button key={sp.id} style={S.chip(nearby.special === sp.id)}
                    onClick={() => setNearby({ special: nearby.special === sp.id ? null : sp.id })}>
                    {sp.label} = {sp.score}점
                  </button>
                ))}
              </div>
              <span style={S.sub}>해당하면 조사값 대신 이 점수를 씁니다</span>
            </div>
          <div style={S.out}>
              {nearbySc?.pending
                ? <span style={S.pend}>{nearbySc.text}</span>
                : <b>{nearbySc.label} · 평가점수 {nearbySc.score}점 <span style={{ fontWeight: 400, color: T.muted }}>({nearbySc.text})</span></b>}
            </div>
          </div>
          <div style={S.note}>
            ※ 본건의 <b>초기예상분양률(산정 결과)</b> 과 다른 값입니다 — 이건 옆 단지를 조사해 매기는 입력 항목입니다.<br />
            ※ 선정기준도 분양가 적정성과 다릅니다 (준공 단지를 안 쓰고, 유사도를 브랜드로 봅니다).
          </div>
        </div>
      </div>

      {/* ── 구간표 미수령 항목 ─────────────────────────── */}
      <div style={S.box}>
        <div style={S.head}>
          <span>구간표 미수령 항목</span>
          <span style={S.headNote}>점수를 직접 넣습니다</span>
        </div>
        <div style={S.body}>
          <div style={S.grid}>
            {PENDING_ITEMS.map(it => (
              <div key={it.id} style={S.field}>
                <span style={S.lab}>{it.id} {it.max && <span style={{ fontWeight: 400, color: T.muted }}>(배점 {it.max})</span>}</span>
                <input style={S.input} type="number" min="0" step="any" placeholder="점수"
                  value={v.점수?.[it.id] ?? ''} onChange={e => setTyped(it.id, e.target.value)} />
                <span style={S.sub} />
              </div>
            ))}
          </div>
          <div style={S.note}>
            ※ 구간표를 받으면 이 칸들도 값 입력만으로 점수가 나게 바뀝니다. 지금은 내부망 평가표의 점수를 옮겨 넣으세요.<br />
            ※ 수치 자체는 각 시트에서 이미 수집돼 있습니다 — 지역미분양 · 지역수요 · 지역경쟁력 · 부동산시장 탭에서 보세요.
          </div>
        </div>
      </div>

      {/* ── A 합산 ─────────────────────────────────────── */}
      <div style={S.box}>
        <div style={S.head}>
          <span>분양가격지수 제외 항목 점수 (A)</span>
          <span style={S.headNote}>초기예상분양률 · 분양가경쟁력이 이 값을 씁니다</span>
        </div>
        <table style={S.tbl}>
          <thead>
            <tr><th style={S.th}>평가항목</th><th style={S.th}>배점</th><th style={S.th}>점수</th><th style={S.th}>근거</th></tr>
          </thead>
          <tbody>
            {sum.rows.map(r => (
              <tr key={r.id}>
                <td style={S.tdL}>{r.id}<span style={S.kind(r.kind)}>{KIND_LABEL[r.kind]}</span></td>
                <td style={S.td}>{r.max ?? <span style={S.pend}>미상</span>}</td>
                {r.score != null ? <td style={S.filled}>{r.score}</td> : <td style={S.blank} />}
                <td style={S.tdWhy}>{r.why}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...S.tdL, ...S.final, textAlign: 'left' }}>합계 = A</td>
              <td style={S.final}>—</td>
              <td style={S.final}>
                {sum.excl != null ? sum.excl : <span style={S.pend}>—</span>}
              </td>
              <td style={S.tdWhy}>
                {sum.override != null
                  ? <b style={{ color: T.warn }}>직접 입력한 {sum.override} 을 씁니다 (자동 합계 {sum.missing.length ? '산출 불가' : sum.sum})</b>
                  : sum.missing.length
                    ? <>미입력 <b style={{ color: T.warn }}>{sum.missing.length}개</b> — {sum.missing.join(' · ')}<br />
                        <span>전 항목이 차야 A 를 확정합니다. 부분 합계({sum.sum})를 A 로 쓰면 분양률이 통째로 낮아집니다.</span></>
                    : sum.provisional.length
                      ? <>전 항목 입력됨 — 다만 <b style={{ color: T.warn }}>{sum.provisional.map(x => x.id).join(' · ')}</b> 에 판정 전 기본점수가 섞여 있습니다. 그 항목을 판정하면 A 가 바뀝니다.</>
                      : '전 항목 입력됨'}
              </td>
            </tr>
          </tbody>
        </table>
        <div style={S.body}>
          <div style={S.grid}>
            <div style={S.field}>
              <span style={S.lab}>A 직접 입력 <span style={{ fontWeight: 400, color: T.muted }}>(선택)</span></span>
              <input style={S.input} type="number" min="0" step="any" placeholder="자동"
                value={v.exclOverride ?? ''} onChange={e => set({ exclOverride: e.target.value })} />
              <span style={S.sub}>내부망 평가표 값을 그대로 쓰고 싶을 때</span>
            </div>
          </div>
          <div style={S.note}>
            ※ 비워두면 위 합계를 씁니다. 넣으면 그 값이 <b>초기예상분양률</b>과 <b>분양가경쟁력 행렬</b>에 함께 적용됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
