'use client';
import { useMemo, useState, useEffect } from 'react';
import { T, mono } from './theme';
import { INFLOW_CHOICES, inflowOn } from './inflow';
import { manualSummary, PENDING_ITEMS, scaleTable, unitMixTable, nearbyTable } from '../src/lib/manual';
import PresaleChain from './PresaleChain';

/**
 * 수기입력 — **분양가격지수 제외 항목 점수(A)** 를 여기서 완성한다.
 *
 * 전에는 A 를 내부망 평가표에서 손으로 옮겨 적게 했다. 그런데 항목 대부분을
 * 이 앱이 이미 알고 있고, 나머지도 **구간표가 있으면 값만 받아 점수를 낼 수 있다.**
 * 그래서 남는 수기입력은 구간표를 아직 못 받은 항목의 점수뿐이다.
 *
 *   자동        교통환경 · 주거편의 · 교육환경 · 브랜드경쟁력 · 주택담보대출금리
 *   값 → 점수   규모 및 배치 · 평형구성 · 인근아파트 초기 분양률
 *   점수 직접   없음 — 2026-09-17 지역미분양·지역수요 구간표를 받아 전부 자동/값입력으로 넘어갔다
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
  /*
    `marginLeft:'auto'` 로 밀었더니 입력칸(x≈180)과 결과(x≈1180)가 1000px 떨어졌다 —
    아래로 움직이던 눈이 옆으로 멀리 움직이게 됐을 뿐이다. **바로 옆**에 붙인다.
  */
  out: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 12.5,
         paddingLeft: 16, marginLeft: 4, borderLeft: `1px dashed ${T.line}`, alignSelf: 'center' },
  outNum: { fontSize: 21, fontWeight: 800, ...mono },
  pend: { color: T.muted, fontStyle: 'italic', fontSize: 12 },

  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 12px', fontWeight: 600, whiteSpace: 'nowrap', color: T.ink },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'left', background: '#f7f9fb', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', textAlign: 'center', ...mono },
  tdWhy: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'left', fontSize: 11.5, color: T.muted, lineHeight: 1.6 },
  filled: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', textAlign: 'center', fontWeight: 700, background: '#fffdf0', ...mono },
  blank: { border: `1px solid ${T.sheetLine}`, padding: '6px 10px', background: 'repeating-linear-gradient(45deg,#fafbfc,#fafbfc 5px,#f1f3f5 5px,#f1f3f5 10px)' },
  wait: { fontSize: 10.5, fontWeight: 700, color: T.muted, opacity: 0.85 },
  go: { marginLeft: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4,
        cursor: 'pointer', border: `1px solid ${T.accent}`, background: '#fff', color: T.accent,
        whiteSpace: 'nowrap' },
  running: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 },
  runNum: { fontSize: 16, fontWeight: 800, color: T.ink2, ...mono },
  runNote: { fontSize: 10, fontWeight: 700, color: T.muted },
  ovBanner: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '9px 14px', background: T.warnSoft, borderBottom: `1px solid ${T.warn}44`,
              fontSize: 12, color: T.ink2 },
  ovUndo: { marginLeft: 'auto', padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 5,
            cursor: 'pointer', border: `1px solid ${T.accent}`, background: '#fff', color: T.accent },
  dim: { opacity: 0.45 },
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
  /* 인구유입요인 — 점수가 읽히는 그 줄에서 바로 고른다 */
  inflow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 },
  inflowLab: { fontSize: 11, fontWeight: 700, color: T.ink2 },
  inflowSeg: { display: 'inline-flex', border: `1px solid ${T.lineStrong}`, borderRadius: 6, overflow: 'hidden' },
  inflowBtn: (on) => ({
    padding: '4px 10px', fontSize: 11, fontWeight: 700, border: 0, cursor: 'pointer',
    background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink2,
    boxShadow: on ? `inset 0 -2px 0 ${T.accent}` : 'none',
  }),
  inflowHint: { fontSize: 10.5, color: T.muted },
  /* 상시 표시되는 설명을 경고색으로 두면 진짜 경고를 놓친다 — 정보 톤으로 */
  warn: { marginTop: 10, padding: '9px 13px', background: '#f7f9fb', border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 11.5, color: T.ink2, lineHeight: 1.65 },
  note: { marginTop: 12, fontSize: 11.5, color: T.muted, lineHeight: 1.8 },
};

const KIND_LABEL = { auto: '자동', form: '값→점수', typed: '점수 직접' };

/** 아직 안 찬 항목을 어느 탭에서 채우는가 — 글로만 적지 말고 그 자리에서 보낸다 */
const GOTO_TAB = {
  '교통환경': '교통환경', '주거편의': '주거편의', '교육환경': '교육환경',
  '브랜드경쟁력': '교통환경', '주택담보대출금리': '교통환경', '지역경쟁력': '교통환경',
  '부동산시장 소비심리지수': '교통환경', '지역미분양': '교통환경',
};

export default function ManualView({ region, addr, data, facilities, manual, value, onChange, onJump }) {
  const v = value ?? {};
  const set = (patch) => onChange?.({ ...v, ...patch });
  const setScale = (k, x) => set({ 규모및배치: { ...(v.규모및배치 ?? {}), [k]: x } });
  const setMix = (k, x) => set({ 평형구성: { ...(v.평형구성 ?? {}), [k]: x } });
  const setNearby = (patch) => set({ 인근초기분양률: { ...(v.인근초기분양률 ?? {}), ...patch } });
  const setTyped = (k, x) => set({ 점수: { ...(v.점수 ?? {}), [k]: x } });
  /* 지역수요의 인구유입요인 — 원천이 없어 사람이 개수를 센다 */
  const setDemand = (patch) => set({ 지역수요: { ...(v.지역수요 ?? {}), ...patch } });

  const sum = useMemo(
    () => manualSummary({ sheetInput: v, data, facilities, manual }),
    [v, data, facilities, manual]);

  const scale = scaleTable();
  const mixT = unitMixTable();
  const nearbyT = nearbyTable();
  const nearby = v.인근초기분양률 ?? {};

  /*
   * **지역 평균 초기분양률은 참고치다**(HUG · KOSIS 414/DT_41401N_008, 2026-09-17 연결).
   * 규정이 말하는 것은 「인근 단지」 초기분양률이지 지역 평균이 아니다.
   * 처음엔 [이 값 넣기] 버튼을 뒀는데 **넣을 이유가 없다**(사용자 지적) —
   * 규정과 맞지 않는 값을 한 번의 클릭으로 칸에 앉힐 수 있게 두면 그게 실수의 통로가 된다.
   * **숫자만 회색으로 보여주고 끝낸다.** 이 칸은 본래 옆 단지를 조사해 넣는 수기입력이다.
   */
  const [hug, setHug] = useState(null);
  useEffect(() => {
    if (!region) return;
    let dead = false;
    fetch(`/api/hug?region=${encodeURIComponent(region)}`)
      .then(r => r.json()).then(j => !dead && setHug(j)).catch(() => {});
    return () => { dead = true; };
  }, [region]);
  const hugRate = hug?.rate?.latest ?? null;
  const qLabel = (p) => (p ? `${String(p).slice(0, 4)}년 ${Number(String(p).slice(4))}분기` : '');
  const scaleSc = sum.formed[0].sc;
  const mixSc = sum.formed[1].sc;
  const nearbySc = sum.formed[2].sc;

  return (
    <div style={S.page}>
      <h2 style={S.h2}>수기입력</h2>
      <p style={S.subject}>▶ 사업지 : {facilities?.address ?? addr ?? region}</p>

      {/*
        **머리 설명문을 뺐다**(사용자 지적 2026-09-25 — 「설명이 좀 이상해 그냥 빼」).
        「A 는 종합평가에서 분양가경쟁력을 뺀 나머지 전부」 같은 정의는 **읽는 사람이
        지금 할 일과 상관이 없다** — 여기서 할 일은 아래 칸을 채우는 것이고,
        각 칸은 이미 제 배점·근거를 달고 있다. 아래 합계표가 결과를 말한다.
      */}

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
          {/* 「초기분양률」 이 세 곳에 나와 헷갈린다 — 세 탭에 같은 그림을 둔다 */}
          <PresaleChain here="input" values={{ input: nearby.rate }} />
          <div style={S.formula}>옆 단지의 실제 분양률(분양개시 후 6개월 이내)을 조사해 넣습니다</div>
          <div style={S.grid}>
            <div style={S.field}>
              <span style={S.lab}>인근 단지 초기분양률 (%)</span>
              <input style={S.input} type="number" min="0" max="100" step="any" placeholder="입력"
                disabled={!!nearby.special}
                value={nearby.rate ?? ''} onChange={e => setNearby({ rate: e.target.value })} />
              <span style={S.sub}>{nearby.special ? '특례가 선택되어 있습니다' : ''}</span>
            </div>
            {hugRate && !nearby.special && (
              <div style={{ ...S.field, gap: 6 }}>
                <span style={S.lab}>참고 — {hug?.rate?.areaName} 지역 평균</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontSize: 15, color: T.muted, ...mono }}>{hugRate.rate}%</b>
                  <span style={{ fontSize: 11, color: T.muted }}>{qLabel(hugRate.period)}</span>
                </div>
                <span style={S.sub}>HUG 민간아파트 평균 — <b>넣는 값이 아닙니다</b></span>
              </div>
            )}
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
          {hugRate && (
            <div style={{ ...S.formula, marginTop: 10, marginBottom: 0 }}>
              {hug?.rate?.citation} · {hug?.rate?.note}
            </div>
          )}
          <div style={S.note}>
            ※ 선정기준은 분양가 적정성(제16조)과 다릅니다 — 준공 단지를 안 쓰고, 유사도를 브랜드로 봅니다.
            같은 목록을 돌려 쓰면 안 됩니다.
          </div>
        </div>
      </div>

      {/*
        구간표 미수령 항목 — **지금은 비어 있다**(2026-09-17 마지막 두 개를 받았다).
        `PENDING_ITEMS` 가 비면 이 칸 자체가 사라진다. 새 항목이 생기면 그때 다시 나온다.
      */}
      {PENDING_ITEMS.length > 0 && (
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
              ※ 구간표를 받으면 이 칸들도 값 입력만으로 점수가 나게 바뀝니다. 지금은 내부망 평가표의 점수를 옮겨 넣으세요.
            </div>
          </div>
        </div>
      )}

      {/* ── A 합산 ─────────────────────────────────────── */}
      <div style={S.box}>
        <div style={S.head}>
          <span>분양가격지수 제외 항목 점수 (A)</span>
          <span style={S.headNote}>초기예상분양률 · 분양가경쟁력이 이 값을 씁니다</span>
        </div>
        {/*
          **직접 입력한 A 가 있으면 위 표는 통째로 무시된다**(`excl = override ?? 자동합계`).
          그런데 표는 그대로 있어 「이 점수들이 쓰인다」 로 읽힌다(사용자 지적 2026-09-24) —
          표를 흐리게 하고 무엇이 실제로 쓰이는지 표 머리에서 말한다.
        */}
        {sum.override != null && (
          <div style={S.ovBanner}>
            <b>직접 입력한 A = {sum.override} 을 씁니다</b> — 아래 표는 <b>참고</b>입니다(계산에 쓰이지 않습니다).
            <button style={S.ovUndo} onClick={() => set({ exclOverride: '' })}>자동 합산으로 되돌리기</button>
          </div>
        )}
        <table style={{ ...S.tbl, ...(sum.override != null ? S.dim : null) }}>
          <thead>
            <tr><th style={S.th}>평가항목</th><th style={S.th}>배점</th><th style={S.th}>점수</th><th style={S.th}>근거</th></tr>
          </thead>
          <tbody>
            {sum.rows.map(r => (
              <tr key={r.id}>
                <td style={S.tdL}>{r.id}<span style={S.kind(r.kind)}>{KIND_LABEL[r.kind]}</span></td>
                <td style={S.td}>{r.max ?? <span style={S.pend}>미상</span>}</td>
                {/*
                  **「자동」 배지만 있고 점수 칸이 빗금이면 "자동인데 왜 안 채워지나" 로 읽힌다**
                  (사용자 지적 2026-09-24). 빗금은 "값이 들어갈 자리" 라는 뜻일 뿐 상태를 말하지 않아
                  아직 안 온 것인지 0점인지 구분이 안 된다. 「대기」 라고 적어 **모른다**는 것을 말한다.
                */}
                {r.score != null
                  ? <td style={S.filled}>{r.score}</td>
                  : <td style={S.blank}><span style={S.wait}>대기</span></td>}
                <td style={S.tdWhy}>
                  {r.why}
                  {/*
                    **인구유입요인은 어느 원천에도 없다** — 신도시·혁신도시·기업도시·산업단지 등
                    요인의 개수를 사람이 센다. 전에는 표 위에 별도 입력칸을 두었는데,
                    점수가 읽히는 줄과 넣는 칸이 떨어져 있었다(「넣는 버튼은 넣는 칸에」).
                    구간표가 세 단계뿐이라 칩으로 정확히 덮인다 — 3개·4개를 구분해 넣어도 점수는 같다.
                  */}
                  {r.id === '지역수요' && (
                    <div style={S.inflow}>
                      <span style={S.inflowLab}>인구유입요인</span>
                      <div style={S.inflowSeg}>
                        {INFLOW_CHOICES.map(([n, lab]) => (
                          <button key={n} style={S.inflowBtn(inflowOn(v.지역수요?.inflow, n))}
                            onClick={() => setDemand({ inflow: n })}>{lab}</button>
                        ))}
                      </div>
                      <span style={S.inflowHint}>
                        신도시 · 혁신도시 · 기업도시 · 산업단지 등 — 원천이 없어 직접 셉니다
                        (2개 이상 5점 · 1개 3점 · 없음 1점, <b>4점·2점 행은 원문에 없습니다</b>)
                      </span>
                    </div>
                  )}
                  {/* 갈 곳을 글로만 적으면 탭을 찾아 눌러야 한다 — 그 자리에서 바로 보낸다 */}
                  {r.score == null && GOTO_TAB[r.id] && (
                    <button style={S.go} onClick={() => onJump?.(GOTO_TAB[r.id])}>
                      {GOTO_TAB[r.id]} 탭으로 →
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...S.tdL, ...S.final, textAlign: 'left' }}>합계 = A</td>
              <td style={S.final}>—</td>
              {/*
                **「자동 합산」 이라면서 다 차기 전에는 「—」 만 보였다**(사용자 지적 2026-09-24).
                요소별 점수가 들어오는 대로 합이 보여야 「자동 합산」 이다.
                다만 부분합을 확정 A 로 읽으면 분양률이 통째로 낮아지므로(기록된 함정)
                **진행 중이라는 말을 숫자와 같은 칸에** 붙인다 — 「37 진행 5/12」.
              */}
              <td style={S.final}>
                {sum.excl != null ? sum.excl : (
                  <span style={S.running}>
                    <b style={S.runNum}>{sum.sum}</b>
                    <span style={S.runNote}>진행 {sum.rows.length - sum.missing.length} / {sum.rows.length}</span>
                  </span>
                )}
              </td>
              <td style={S.tdWhy}>
                {sum.override != null
                  ? <b style={{ color: T.warn }}>직접 입력한 {sum.override} 을 씁니다 (자동 합계 {sum.missing.length ? '산출 불가' : sum.sum})</b>
                  : sum.missing.length
                    ? <>미입력 <b style={{ color: T.warn }}>{sum.missing.length}개</b> — {sum.missing.join(' · ')}<br />
                        <span>전 항목이 차야 A 를 확정합니다. 부분 합계({sum.sum})를 A 로 쓰면 분양률이 통째로 낮아집니다.</span></>
                    : sum.provisional.length
                      ? <>전 항목 입력됨 — 다만 <b style={{ color: T.warn }}>{sum.provisional.map(x => x.id).join(' · ')}</b> 에 판정 전 기본점수가 섞여 있습니다. 그 항목을 판정하면 이 점수가 바뀝니다.</>
                      : '전 항목 입력됨'}
              </td>
            </tr>
          </tbody>
        </table>
        <div style={S.body}>
          <div style={S.grid}>
            <div style={S.field}>
              <span style={S.lab}>A 직접 입력 <span style={{ fontWeight: 400, color: T.muted }}>(선택)</span></span>
              <input style={S.input} type="number" min="0" step="any" placeholder="직접 입력"
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
