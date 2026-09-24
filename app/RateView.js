'use client';
import { useMemo } from 'react';
import { T, mono } from './theme';
import { tableOf, scorePresaleRate } from '../src/lib/scoring';
import { expectedRateOf } from '../src/lib/compare';
import PresaleChain from './PresaleChain';

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
  bandTd: (on) => ({ border: `1px solid ${T.sheetLine}`, padding: '5px 13px', textAlign: 'center', background: on ? '#fffdf0' : '#fff', fontWeight: on ? 700 : 400, ...mono }),
};

const SERIES = [
  { id: '주택', label: '아파트 등 주택' },
  { id: '오피스텔', label: '오피스텔 · 도시형생활주택' },
];

export default function RateView({ region, addr, facilities, compare, excl: exclProp = null, manualSum = null, sheetInput = null, value, onChange, onJump }) {
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
    useMemo(() => expectedRateOf(compare, { series }, exclProp, sheetInput), [compare, series, exclProp, sheetInput]);
  const hasExcl = excl != null;

  const t = tableOf('초기예상분양률');
  const bands = t?.series?.[series]?.bands ?? [];

  /* 「초기분양률」 세 곳의 현재 값 — 세 탭이 같은 그림을 같은 값으로 보여준다 */
  const pct = res?.pending || total == null ? null : res.rate;
  const presale = pct == null ? null : scorePresaleRate(pct);
  const chainValues = {
    input: sheetInput?.인근초기분양률?.rate,
    pct,
    score: presale && !presale.pending ? presale.score : null,
  };

  return (
    <div style={S.page}>
      <h2 style={S.h2}>초기예상분양률</h2>
      <p style={S.subject}>▶ 사업지 : {facilities?.address ?? addr ?? region}</p>

      <div style={S.intro}>
        평가표의 <b>결론</b>입니다. 다른 시트들이 내는 항목 점수가 모여 <b>종합평가 점수</b>가 되고,
        그 점수를 급간표에 대면 <b>초기예상분양률</b>이 나옵니다.<br />
      </div>

      {/* 「초기분양률」 이 세 곳에 나와 헷갈린다 — 세 탭에 같은 그림을 둔다 */}
      <PresaleChain here="result" values={chainValues} />

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
          1,859세대에도 99세대에도 똑같이 「100세대 미만이면 60% 상한이 걸립니다」 만 떴다 —
          조건에 걸린 사업장이 그 사실을 화면에서 알 길이 없었다.
          조건에 해당하면 **걸렸다고 말한다.** (`capped` 는 상한이 실제로 값을 내렸을 때만 서므로
          "해당하지만 값은 그대로" 인 경우까지 세대수로 함께 본다)
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

      <div style={S.box}>
        <div style={S.head}>
          <span>종합평가 점수</span>
          <span style={S.headNote}>제외 항목 점수(A) + 분양가경쟁력</span>
        </div>
        <table style={S.tbl}>
          <tbody>
            <tr>
              <td style={S.key}>① 분양가격지수 제외 항목 점수 (A)</td>
              <td style={{ ...S.num, color: hasExcl ? T.ink : T.muted }}>{hasExcl ? excl : '—'}</td>
              <td style={S.unit}>점</td>
              {/*
                "[수기입력] 탭에서 하세요" 를 글로만 적어두면 위로 스크롤해 탭을 찾아 눌러야 한다.
                막힌 자리에서 **그 자리로 바로 보내는** 버튼을 둔다.
              */}
              <td style={S.memo}>
                {hasExcl
                  ? (manualSum?.source === 'override' ? '[수기입력] 탭에서 직접 입력한 값' : '[수기입력] 탭에서 자동 합산')
                  : (<>
                      A 를 완성해야 합니다{manualSum?.missing?.length ? ` — ${manualSum.missing.length}개 남음` : ''}
                      <button style={S.go} onClick={() => onJump?.('수기입력')}>수기입력 탭으로 →</button>
                    </>)}
                {/*
                  **판정 전 기본점수가 섞이면 A 는 「나오긴 나온다」.** 6차선 차선 수나 인구유입요인을
                  안 넣으면 비는 게 아니라 기본 1점이 들어가기 때문이다 — 그래서 여기까지는 숫자가 오고,
                  심사평점표까지 조용히 흘러갔다. 이 줄에서 말하고, 심사평점표로는 넘기지 않는다.
                */}
                {hasExcl && manualSum?.provisional?.length > 0 && (
                  <div style={S.prov}>
                    <b>{manualSum.provisional.map(x => x.id).join(' · ')}</b> 에 판정 전 기본점수가 섞여 있습니다 —
                    그 항목을 판정하면 A 가 바뀌므로 <b>심사평점표로 넘기지 않습니다.</b>
                    <button style={S.go} onClick={() => onJump?.(manualSum.provisional[0].id === '지역수요' ? '수기입력' : manualSum.provisional[0].id)}>
                      {manualSum.provisional[0].id === '지역수요' ? '수기입력' : manualSum.provisional[0].id} 탭으로 →
                    </button>
                  </div>
                )}
              </td>
            </tr>
            <tr>
              <td style={S.key}>② 분양가경쟁력</td>
              <td style={{ ...S.num, color: compScore != null ? T.ink : T.muted }}>{compScore ?? '—'}</td>
              <td style={S.unit}>점</td>
              <td style={S.memo}>
                {compScore != null
                  ? `분양가격지수 ${cmp.index.toFixed(2)} · ${cmp.sc.label}`
                  : (<>
                      {cmp.sc?.text ?? '비교사업장을 고르고 본건 예정분양가를 입력하세요'}
                      <button style={S.go} onClick={() => onJump?.('비교사업장')}>비교사업장 탭으로 →</button>
                    </>)}
              </td>
            </tr>
            <tr>
              <td style={{ ...S.key, ...S.final }}>⇒ 종합평가 점수</td>
              <td style={{ ...S.num, ...S.final, fontSize: 17, color: total != null ? T.ink : T.muted }}>{total ?? '—'}</td>
              <td style={{ ...S.unit, ...S.final }}>점</td>
              <td style={{ ...S.memo, ...S.final }}>{total != null ? res.band : ''}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={S.box}>
        <div style={S.head}>
          <span>초기예상분양률</span>
          <span style={S.headNote}>{SERIES.find(s => s.id === series)?.label}</span>
        </div>
        <div style={S.rate}>
          {res?.pending || total == null
            ? <span style={S.pend}>{res?.text ?? '종합평가 점수가 있어야 분양률을 냅니다'}</span>
            : (<>
                <span style={{ ...S.rateNum, color: T.ink }}>{res.rate}%</span>
                <span style={S.rateSub}>
                  종합평가 {total}점 · {res.band}<br />
                  <span style={{ color: T.muted }}>{res.series} 급간 적용</span>
                </span>
              </>)}
        </div>
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
      </div>

      {/*
        전에는 여기에 「이 앱이 낸 항목 점수」 표를 또 두었는데, 수기입력 탭의 A 산출표와
        같은 내용이다. 같은 표가 두 곳에 있으면 어느 쪽이 맞는지 의심하게 된다 — 한쪽만 남긴다.
      */}
      <div style={S.secTitle}>A 는 어떻게 만들어지나</div>
      <div style={S.intro}>
        A 안에는 이 앱이 자동으로 내는 항목(교통환경 · 주거편의 · 교육환경 · 브랜드경쟁력 ·
        주택담보대출금리 · 지역경쟁력 · 소비심리지수)과
        값을 넣으면 점수가 나는 항목(규모 및 배치 · 평형구성 · 인근아파트 초기 분양률),
        그리고 구간표를 아직 못 받아 점수를 직접 넣는 항목이 함께 들어 있습니다.<br />
        <b>항목별 점수와 합계는 [수기입력] 탭에서 한자리에 봅니다.</b>
        {manualSum?.missing?.length
          ? <span style={{ color: T.warn }}> — 지금 {manualSum.missing.length}개가 비어 있어 A 가 확정되지 않았습니다.</span>
          : null}
      </div>
    </div>
  );
}
