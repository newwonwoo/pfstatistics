'use client';
import { useMemo } from 'react';
import { T, mono } from './theme';
import { scoreAverage, scoreSheet, scoreRank, scoreBand, tableOf } from '../src/lib/scoring';
import { expectedRateOf } from '../src/lib/compare';

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
  segBtn: (on) => ({ padding: '6px 13px', fontSize: 12, fontWeight: 700, border: 0, cursor: 'pointer', background: on ? T.accent : '#fff', color: on ? '#fff' : T.ink2 }),

  box: { marginBottom: 14, borderRadius: 8, border: `1px solid ${T.lineStrong}`, overflow: 'hidden', background: '#fff' },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 16px', background: '#eef2f7', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 700, color: T.ink },
  headNote: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.muted },
  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  key: { padding: '7px 16px', color: T.ink2, whiteSpace: 'nowrap', width: 280 },
  num: { padding: '7px 8px', textAlign: 'right', fontWeight: 700, width: 120, ...mono },
  unit: { padding: '7px 4px', color: T.muted, fontSize: 11.5, width: 40 },
  memo: { padding: '7px 16px', color: T.muted, fontSize: 11.5 },
  final: { borderTop: `2px solid ${T.lineStrong}`, background: '#fffdf0', paddingTop: 10, paddingBottom: 10 },
  why: { padding: '9px 16px 12px', fontSize: 12, color: T.ink2, lineHeight: 1.7 },

  input: { width: 110, padding: '5px 8px', fontSize: 12.5, textAlign: 'right', border: `1px solid ${T.line}`, borderRadius: 4, background: '#fffdf0', color: T.ink, fontFamily: 'inherit', ...mono },

  rate: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '18px 20px', flexWrap: 'wrap' },
  rateNum: { fontSize: 42, fontWeight: 800, letterSpacing: '-.03em', ...mono },
  rateSub: { fontSize: 12.5, color: T.ink2, lineHeight: 1.7 },
  pend: { color: T.muted, fontStyle: 'italic', fontSize: 12.5 },
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

export default function RateView({ region, addr, data, facilities, manual, company, compare, value, onChange }) {
  const v = value ?? {};
  const series = v.series ?? '주택';
  const households = v.households ?? '';
  const set = (patch) => onChange?.({ ...v, series, households, ...patch });

  /* 산식은 src/lib/compare.js 한 곳에만 둔다 — 심사평점표 탭과 같은 숫자를 써야 한다 */
  const { cmp, compScore, excl, total, res } =
    useMemo(() => expectedRateOf(compare, { series, households }), [compare, series, households]);
  const hasExcl = excl != null;

  /* 이 앱이 스스로 낸 항목 점수 — A 를 눈으로 맞춰보기 위한 대조표 */
  const rows = useMemo(() => {
    const val = (id) => (data?.results ?? []).find(r => r.indicatorId === id && r.ok)?.value ?? null;
    const traffic = facilities ? scoreAverage('교통환경', { facilities, manual }) : null;
    const living = facilities ? scoreAverage('주거편의', { facilities, manual }) : null;
    const edu = facilities ? scoreSheet('교육환경', facilities) : null;
    const rank = val('construction_capability_rank');
    const brand = rank == null ? null : scoreRank('브랜드경쟁력', rank);
    const cd = val('cd_rate_91');
    const loan = cd == null ? null : scoreBand('주택담보대출금리', cd);
    const done = (sc) => (sc && !sc.pending && Number.isFinite(sc.score) ? sc.score : null);
    return [
      { name: '교통환경', max: 5, score: done(traffic), memo: traffic?.pending ? traffic.text : traffic?.text },
      { name: '주거편의', max: 5, score: done(living), memo: living?.pending ? living.text : living?.text },
      { name: '교육환경', max: 5, score: done(edu), memo: edu?.text ?? '' },
      { name: '브랜드경쟁력', max: 5, score: done(brand), memo: brand ? (brand.pending ? brand.text : `${company ?? ''} ${rank}위 · ${brand.text}`) : '수집 대기' },
      { name: '주택담보대출금리', max: 5, score: done(loan), memo: loan ? (loan.pending ? loan.text : `CD ${cd}% + 1.57% = ${loan.applied.toFixed(2)}% · ${loan.text}`) : '수집 대기' },
      { name: '규모 및 배치', max: 5, score: null, memo: '수기입력 시트 — 이 앱의 범위 밖' },
      { name: '평형구성', max: 5, score: null, memo: '수기입력 시트 — 이 앱의 범위 밖' },
      { name: '인근아파트 초기 분양률', max: 10, score: null, memo: '옆 단지의 실제 분양률 조사 — 공공 원천 없음' },
      { name: '지역미분양 · 지역수요 · 지역경쟁력 · 소비심리지수', max: null, score: null, memo: '구간표 일부 미수령 — 수치는 각 시트에서 수집됨' },
    ];
  }, [data, facilities, manual, company]);

  const auto = rows.filter(r => r.score != null);
  const autoSum = auto.reduce((s, r) => s + r.score, 0);

  const t = tableOf('초기예상분양률');
  const bands = t?.series?.[series]?.bands ?? [];

  return (
    <div style={S.page}>
      <h2 style={S.h2}>초기예상분양률</h2>
      <p style={S.subject}>▶ 사업지 : {facilities?.address ?? addr ?? region}</p>

      <div style={S.intro}>
        평가표의 <b>결론</b>입니다. 다른 시트들이 내는 항목 점수가 모여 <b>종합평가 점수</b>가 되고,
        그 점수를 급간표에 대면 <b>초기예상분양률</b>이 나옵니다.<br />
        <span style={{ color: T.muted }}>
          같은 말이 두 곳에 나오니 주의 — 「인근아파트 초기 분양률(10)」은 옆 단지를 조사해 매기는
          <b> 입력 항목</b>이고, 여기 초기예상분양률은 본건의 <b>산정 결과</b>입니다.
        </span>
      </div>

      <div style={S.bar}>
        <span style={S.label}>주택 종류</span>
        <span style={S.seg}>
          {SERIES.map(s => (
            <button key={s.id} style={S.segBtn(series === s.id)} onClick={() => set({ series: s.id })}>{s.label}</button>
          ))}
        </span>
        <span style={S.label}>총 세대수</span>
        <input style={S.input} type="number" min="0" placeholder="선택"
          value={households} onChange={e => set({ households: e.target.value })} />
        <span style={{ ...S.label, fontWeight: 400 }}>100세대 미만이면 60% 상한이 걸립니다</span>
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
              <td style={S.memo}>
                {hasExcl ? '비교사업장 탭 [본건 제원] 에 입력한 값' : '비교사업장 탭 [본건 제원] 의 «제외 항목 점수(A)» 에 입력하세요'}
              </td>
            </tr>
            <tr>
              <td style={S.key}>② 분양가경쟁력</td>
              <td style={{ ...S.num, color: compScore != null ? T.ink : T.muted }}>{compScore ?? '—'}</td>
              <td style={S.unit}>점</td>
              <td style={S.memo}>
                {compScore != null
                  ? `분양가격지수 ${cmp.index.toFixed(2)} · ${cmp.sc.label}`
                  : (cmp.sc?.text ?? '비교사업장을 고르고 본건 예정분양가를 입력하세요')}
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
        </div>
      </div>

      {/*
        A 를 이 앱이 계산하지 않는 이유를 표로 보여준다 — 자동으로 낸 항목과
        아직 못 내는 항목을 나란히 놓아야 "왜 직접 넣어야 하나" 에 답이 된다.
      */}
      <div style={S.secTitle}>참고 — 이 앱이 낸 항목 점수</div>
      <table style={S.ref}>
        <thead>
          <tr>
            <th style={S.th}>평가항목</th><th style={S.th}>배점</th><th style={S.th}>점수</th><th style={S.th}>근거</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name}>
              <td style={S.tdL}>{r.name}</td>
              <td style={S.td}>{r.max ?? <span style={S.small}>미수령</span>}</td>
              {r.score != null
                ? <td style={{ ...S.td, fontWeight: 700, background: '#fffdf0' }}>{r.score}</td>
                : <td style={S.blank} />}
              <td style={{ ...S.td, textAlign: 'left', fontFamily: 'inherit' }}>
                <span style={S.small}>{r.memo}</span>
              </td>
            </tr>
          ))}
          <tr>
            <td style={S.tdL}>이 앱이 자동으로 낸 합계</td>
            <td style={S.td}>{auto.reduce((s, r) => s + (r.max ?? 0), 0)}</td>
            <td style={{ ...S.td, fontWeight: 700, background: '#fffdf0' }}>{auto.length ? autoSum : '—'}</td>
            <td style={{ ...S.td, textAlign: 'left', fontFamily: 'inherit' }}>
              <span style={S.small}>
                A 의 일부입니다. 나머지(수기입력 시트·구간표 미수령 항목)는 내부망 평가표에서 가져와야
                하므로 <b>A 는 직접 입력</b>합니다 — 이 합계와 대조해 보세요.
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
