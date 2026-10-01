'use client';
import { useMemo } from 'react';
import { T, mono } from './theme';
import { tableOf, scorePresaleRate } from '../src/lib/scoring';
import { expectedRateOf } from '../src/lib/compare';
import PresaleChain from './PresaleChain';
import NearbyPresale from './NearbyPresale';

/**
 * 초기예상분양률 — **평가표 전체의 결론**.
 *
 * 이 앱이 채우는 모든 시트가 결국 이 한 숫자를 내기 위한 근거다
 * (가이드북 머리글 「분양률 산정을 위한 평가기준」, 실제 평가표 파일명 「초기분양률 산정근거」).
 *
 *   종합평가 점수 = 분양가격지수 제외 항목 점수(A) + 분양가경쟁력 점수
 *   종합평가 점수 → 급간표 → 초기예상분양률(%)
 *
 * **A 는 이 앱이 계산하지 않는다.** 이 앱이 자동수집하지 못하는 항목(규모및배치·평형구성·
 * 인근아파트 초기분양률 등)이 A 안에 들어 있기 때문이다. 내부망 평가표의 값을 그대로 받되,
 * 이 앱이 스스로 낸 항목 점수를 **대조표로 나란히 보여주어** 눈으로 맞춰볼 수 있게 한다.
 */

const S = {
  page: { background: T.panel, border: `1px solid ${T.lineStrong}`, borderTop: 0, borderRadius: `0 0 ${T.radius}px ${T.radius}px`, padding: '22px 24px 26px' },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' },
  subject: { fontSize: 12.5, color: T.ink2, margin: '0 0 16px' },
  intro: { padding: '11px 16px', background: '#f7f9fb', border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, color: T.ink2, lineHeight: 1.8, marginBottom: 16 },
  bar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  label: { fontSize: 11.5, color: T.muted, fontWeight: 700 },
  seg: { display: 'inline-flex', border: `1px solid ${T.lineStrong}`, borderRadius: 6, overflow: 'hidden' },
  /* 고른 상태는 옅게, 실행만 진하게 — 색 문법 */
  segBtn: (on) => ({ padding: '6px 13px', fontSize: 12, fontWeight: 700, border: 0, cursor: 'pointer',
    background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink2,
    boxShadow: on ? `inset 0 -2px 0 ${T.accent}` : 'none' }),

  box: { marginBottom: 14, borderRadius: 8, border: `1px solid ${T.lineStrong}`, overflow: 'hidden', background: '#fff' },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 16px', background: '#eef2f7', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 700, color: T.ink },
  headNote: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.muted },
  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  key: { padding: '7px 16px', color: T.ink2, whiteSpace: 'nowrap', width: 280 },
  num: { padding: '7px 8px', textAlign: 'right', fontWeight: 700, width: 120, ...mono },
  unit: { padding: '7px 4px', color: T.muted, fontSize: 11.5, width: 40 },
  memo: { padding: '7px 16px', color: T.muted, fontSize: 11.5 },
  prov: { marginTop: 5, padding: '6px 10px', background: T.warnSoft, border: `1px solid ${T.warn}44`,
          borderRadius: 5, fontSize: 11.5, color: T.ink2, lineHeight: 1.7 },
  final: { borderTop: `2px solid ${T.lineStrong}`, background: '#fffdf0', paddingTop: 10, paddingBottom: 10 },
  why: { padding: '9px 16px 12px', fontSize: 12, color: T.ink2, lineHeight: 1.7 },

  read: { display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 14, fontWeight: 700, ...mono },
  readNote: { fontSize: 10.5, fontWeight: 400, color: T.muted, fontFamily: 'inherit' },
  capOn: { fontSize: 12, fontWeight: 700, color: T.warn, background: T.warnSoft,
           border: `1px solid ${T.warn}44`, borderRadius: 5, padding: '4px 10px' },
  input: { width: 110, padding: '5px 8px', fontSize: 12.5, textAlign: 'right', border: `1px solid ${T.line}`, borderRadius: 4, background: '#fffdf0', color: T.ink, fontFamily: 'inherit', ...mono },

  rate: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '18px 20px', flexWrap: 'wrap' },
  rateNum: { fontSize: 42, fontWeight: 800, letterSpacing: '-.03em', ...mono },
  rateSub: { fontSize: 12.5, color: T.ink2, lineHeight: 1.7 },
  pend: { color: T.muted, fontStyle: 'italic', fontSize: 12.5 },
  go: {
    marginLeft: 8, padding: '2px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${T.accent}`, borderRadius: 4, background: T.accentSoft, color: T.accent,
  },
  cap: { marginTop: 8, padding: '9px 13px', background: T.warnSoft, border: '1px solid #f0dcb4', borderRadius: 6, fontSize: 12, color: T.warn, lineHeight: 1.6 },

  ref: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 12px', fontWeight: 600, whiteSpace: 'nowrap', color: T.ink },
  td: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'center', ...mono },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', textAlign: 'left', background: '#f7f9fb', fontWeight: 600, whiteSpace: 'nowrap' },
  blank: { border: `1px solid ${T.sheetLine}`, padding: '7px 12px', background: 'repeating-linear-gradient(45deg,#fafbfc,#fafbfc 5px,#f1f3f5 5px,#f1f3f5 10px)' },
  small: { fontSize: 11.5, color: T.muted, fontWeight: 400 },
  secTitle: { fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '.04em', margin: '24px 0 11px', paddingTop: 16, borderTop: `1px solid ${T.line}` },
  bands: { borderCollapse: 'collapse', fontSize: 12, marginTop: 4 },
  /* 결과의 근거 줄 — 종합평가 점수 = 두 점수의 합 */
  basis: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 16px',
           borderTop: `1px solid ${T.line}`, background: '#fafbfc', fontSize: 12.5, color: T.ink2 },
  basisKey: { fontWeight: 700, color: T.ink },
  basisNum: { ...mono, fontSize: 14, fontWeight: 800, color: T.ink },
  basisOp: { color: T.muted, fontWeight: 700 },
  next: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px',
          borderTop: `1px solid ${T.line}`, background: T.okSoft, fontSize: 12.5, color: T.ink2 },
  bandTd: (on) => ({ border: `1px solid ${T.sheetLine}`, padding: '5px 13px', textAlign: 'center', background: on ? '#fffdf0' : '#fff', fontWeight: on ? 700 : 400, ...mono }),
};

const SERIES = [
  { id: '주택', label: '아파트 등 주택' },
  { id: '오피스텔', label: '오피스텔 · 도시형생활주택' },
];

export default function RateView({ region, addr, coord, polygon, radiusBasis, company,
  facilities, compare, onCompare, excl: exclProp = null, manualSum = null,
  sheetInput = null, onSheetInput, value, onChange, onJump, district = null, onDistrict = null }) {
  const v = value ?? {};
  const series = v.series ?? '주택';
  /*
    총 세대수를 여기서 또 묻고 있었다 — 수기입력 탭의 [규모 및 배치] 가 이미 받는 값이다.
    같은 값을 두 번 물으면 서로 달라졌을 때 어느 쪽이 맞는지 알 수 없다.
  */
  const households = sheetInput?.규모및배치?.총세대수 ?? '';
  const set = (patch) => onChange?.({ ...v, series, ...patch });

  /* 산식은 src/lib/compare.js 한 곳에만 둔다 — 심사평점표 탭과 같은 숫자를 써야 한다 */
  const { cmp, compScore, excl, total, res } =
    useMemo(() => expectedRateOf(compare, { series }, exclProp, sheetInput, district), [compare, series, exclProp, sheetInput, district]);
  const hasExcl = excl != null;

  const t = tableOf('초기예상분양률');
  const bands = t?.series?.[series]?.bands ?? [];

  /* 「초기분양률」 세 곳의 현재 값 — 세 탭이 같은 그림을 같은 값으로 보여준다 */
  const pct = res?.pending || total == null ? null : res.rate;
  const presale = pct == null ? null : scorePresaleRate(pct);
  const nbRow = (manualSum?.rows ?? []).find(r => r.id === '인근아파트 초기 분양률');
  const nbScore = nbRow?.score ?? null;
  const chainValues = {
    input: sheetInput?.인근초기분양률?.rate,
    inputScore: nbScore,
    pct,
    score: presale && !presale.pending ? presale.score : null,
  };
  /*
    **로드맵의 강조는 진행을 따라간다**(사용자 지적 2026-10-01 — 「2번 초기예상분양률로 고정되어 있어」).
    ①이 비었으면 ①, ①이 찼는데 분양률이 아직이면 ②, 분양률이 나왔으면 ③(심사평점표로 갈 차례).
  */
  const here = nbScore == null ? 'input' : pct == null ? 'result' : 'score';
  const doneIds = [...(nbScore != null ? ['input'] : []), ...(pct != null ? ['result'] : []),
                   ...(chainValues.score != null ? ['score'] : [])];
  const goSec = (id) => {
    if (id === 'score') { onJump?.('심사평점표'); return; }
    document.querySelector(`[data-sheet="초기예상분양률"] [data-rate-sec="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const provisional = hasExcl && manualSum?.provisional?.length > 0;
  const provTab = provisional ? (manualSum.provisional[0].id === '지역수요' ? '수기입력' : manualSum.provisional[0].id) : null;

  return (
    <div style={S.page}>
      <h2 style={S.h2}>초기예상분양률</h2>
      <p style={S.subject}>▶ 사업지 : {facilities?.address ?? addr ?? region}</p>

      {/* 「초기분양률」 이 세 곳에 나와 헷갈린다 — 세 탭에 같은 그림을 두고, 여기서는 칸을 누르면 그 자리로 간다 */}
      <PresaleChain here={here} values={chainValues} done={doneIds} onPick={goSec} />

      <div style={S.bar}>
        <span style={S.label}>주택 종류</span>
        <span style={S.seg}>
          {SERIES.map(s => (
            <button key={s.id} style={S.segBtn(series === s.id)} onClick={() => set({ series: s.id })}>{s.label}</button>
          ))}
        </span>
        <span style={S.label}>총 세대수</span>
        <span style={S.read}>
          {households ? `${Number(households).toLocaleString('ko-KR')} 세대` : '—'}
          <span style={S.readNote}>
            {households ? '수기입력 탭 [규모 및 배치] 값' : '수기입력 탭 [규모 및 배치] 에서 받습니다'}
          </span>
        </span>
        {/*
          **상시 안내문과 실제 발동을 구분하지 않았다**(실측 2026-09-24).
          조건에 해당하면 **걸렸다고 말한다.**
        */}
        {Number(households) > 0 && Number(households) < 100 ? (
          <span style={S.capOn}>
            100세대 미만 — <b>60% 상한 적용 대상</b>
            {res?.capped ? ` (${res.capped.from}% → ${res.capped.to}%)` : ' (급간 값이 이미 60% 이하라 변동 없음)'}
          </span>
        ) : (
          <span style={{ ...S.label, fontWeight: 400 }}>100세대 미만이면 60% 상한이 걸립니다</span>
        )}
      </div>

      {/*
        **① 인근아파트 초기 분양률 — 먼저 한다.** 로드맵 ①→②→③ 순서대로 화면도 내려간다.
        **「종합평가 점수」 칸을 따로 두지 않는다**(사용자 검토 요청 2026-10-01 「분양가 점수가 여기 굳이 필요한가」).
        분양가경쟁력은 [비교사업장 · 분양가] 탭이, 분양가격지수 제외 항목은 [수기입력] 탭이 낸다 —
        여기서 같은 숫자를 칸으로 또 세우면 고칠 데가 여기인 것처럼 읽힌다.
        다만 **급간표에 대는 값이 종합평가 점수**라 그 합은 결과의 근거 줄로 남긴다(검산할 수 있어야 한다).
      */}
      <div data-rate-sec="input">
        <NearbyPresale
          region={region} addr={addr} coord={coord} polygon={polygon} radiusBasis={radiusBasis}
          series={series}
          /* 비고2 의 4개 항목 = 비교사업장 탭 [본건 제원] 과 같은 값(한 곳에서 들고 있는다) */
          site={compare?.site ?? {}}
          onSite={(patch) => onCompare?.({ ...(compare ?? {}), site: { ...(compare?.site ?? {}), ...patch } })}
          value={sheetInput?.인근초기분양률}
          onChange={(nb) => onSheetInput?.({ 인근초기분양률: nb })}
          district={district}
          onDistrict={onDistrict}
        />
      </div>

      <div style={S.box} data-rate-sec="result">
        <div style={S.head}>
          <span>초기예상분양률</span>
          <span style={S.headNote}>{SERIES.find(s => s.id === series)?.label}</span>
        </div>
        <div style={S.rate}>
          {res?.pending || total == null
            ? <span style={S.pend}>{total == null ? '아래 두 점수가 모두 있어야 분양률을 냅니다' : res?.text}</span>
            : (<>
                <span style={{ ...S.rateNum, color: T.ink }}>{res.rate}%</span>
                <span style={S.rateSub}>
                  종합평가 {total}점 · {res.band}<br />
                  <span style={{ color: T.muted }}>{res.series} 급간 적용</span>
                </span>
              </>)}
        </div>
        {/*
          근거 줄 — 급간표에 댄 종합평가 점수가 어디서 왔는지. 빈 쪽은 그 값을 내는 탭으로 바로 보낸다.
        */}
        <div style={S.basis}>
          <span style={S.basisKey}>종합평가 점수</span>
          <b style={S.basisNum}>{total ?? '—'}</b>
          <span style={S.basisOp}>=</span>
          <span>분양가격지수 제외 항목 <b style={S.basisNum}>{hasExcl ? excl : '—'}</b></span>
          {!hasExcl && (
            <button style={S.go} onClick={() => onJump?.('수기입력')}>
              수기입력 탭으로{manualSum?.missing?.length ? ` (${manualSum.missing.length}개 남음)` : ''} →
            </button>
          )}
          <span style={S.basisOp}>+</span>
          <span>분양가경쟁력 <b style={S.basisNum}>{compScore ?? '—'}</b>
            {compScore != null && <span style={S.small}> (분양가격지수 {cmp.index.toFixed(2)} · {cmp.sc.label})</span>}
          </span>
          {compScore == null && (
            <button style={S.go} onClick={() => onJump?.('비교사업장')}>비교사업장 탭으로 →</button>
          )}
        </div>
        {/*
          **판정 전 기본점수가 섞이면 점수는 「나오긴 나온다」** — 심사평점표로는 넘기지 않으므로 여기서 말한다.
        */}
        {provisional && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={S.prov}>
              <b>{manualSum.provisional.map(x => x.id).join(' · ')}</b> 에 판정 전 기본점수가 섞여 있습니다 —
              그 항목을 판정하면 이 점수가 바뀌므로 <b>심사평점표로 넘기지 않습니다.</b>
              <button style={S.go} onClick={() => onJump?.(provTab)}>{provTab} 탭으로 →</button>
            </div>
          </div>
        )}
        {res?.capped && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={S.cap}>
              <b>{res.capped.from}% → {res.capped.to}% 로 상한 적용</b><br />
              {res.capped.text}
            </div>
          </div>
        )}
        <div style={S.why}>
          <b>급간표</b>
          <table style={S.bands}>
            <tbody>
              <tr>
                {bands.map(b => <td key={b.label} style={S.bandTd(total != null && res?.band === b.label)}>{b.label}</td>)}
              </tr>
              <tr>
                {bands.map(b => <td key={b.label} style={S.bandTd(total != null && res?.band === b.label)}>{b.rate}%</td>)}
              </tr>
            </tbody>
          </table>
          {/*
            오피스텔 급간의 맨 아랫줄은 **원문에서 읽은 값이 아니라 「한 칸씩 낮다」 규칙으로 만든 값**이다.
            아파트만 다루면 안 걸리므로, 그 계열을 고른 그 자리에서만 말한다.
          */}
          {series !== '주택' && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.warn, lineHeight: 1.6 }}>
              ※ 이 계열의 급간은 주택 급간에서 <b>한 칸씩(10%p) 낮춘 것</b>입니다.
              맨 아랫줄(35점 미만 = 20%)은 <b>원문 표를 직접 대조하지 못했습니다</b> —
              원문이 30%에서 끝날 수도 있어 그 구간에 걸리면 원문으로 확인하세요.
            </div>
          )}
        </div>
        {/* ③ — 이 값이 심사평점표의 초기분양률(22) 점수가 된다 */}
        {chainValues.score != null && !provisional && (
          <div style={S.next}>
            ③ 심사평점표 <b>초기분양률(22)</b> : <b style={S.basisNum}>{chainValues.score}점</b>
            <button style={S.go} onClick={() => onJump?.('심사평점표')}>심사평점표 탭으로 →</button>
          </div>
        )}
      </div>
    </div>
  );
}
