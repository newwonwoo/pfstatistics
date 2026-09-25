'use client';
import { useMemo, useState } from 'react';
import { T, mono } from './theme';
import { fetchJson } from './fetchJson';
import RadiusMap from './RadiusMap';
import { nearbyTable, nearbySurvey } from '../src/lib/manual';
import { scoreNearbyPresale } from '../src/lib/scoring';

/**
 * 인근아파트 초기 분양률(10) — **조사 항목**이다.
 *
 * 「왜 아파트를 선정하는 로직이 없냐」(사용자 지적 2026-09-25)에 대한 답 —
 * 전에는 이 시트를 범위 밖으로 두어 숫자 칸 하나만 있었다. 이제 후보를 찾아 준다.
 *
 * **분양가 적정성(제16조)의 목록을 돌려 쓰면 안 된다**(docs/규정-인근단지-선정기준.md).
 * 셋이 다르다 —
 *   ① 준공 단지를 **안 쓴다**(준공 단지에는 볼 초기분양률이 없다).
 *      1년 이내 분양개시 → 없으면 **분양 진행중까지**. 거기서 멈춘다.
 *   ② 유사도를 **위치 · 세대수 · 브랜드**로 본다(시공능력평가순위·택지유형이 아니다).
 *   ③ 못 찾으면 범위를 넓히지 않고 **최하위 기준배점**을 준다.
 * 거리 규정은 원문에 **없다** — 「인근」 이라고만 적혀 있어 반경을 실무자가 고른다.
 *
 * **초기분양률(6개월 이내) 값 자체는 어느 공개 원천에도 없다.**
 * 청약홈·K-apt·실거래 어디에도 단지별 분양률은 없다(HUG 는 시도 평균뿐이다).
 * 그래서 이 화면은 **누구를 조사할지**까지 대신하고, 조사한 값은 사람이 넣는다.
 */

const S = {
  box: { border: `1px solid ${T.line}`, borderRadius: T.radius, background: '#fff', marginBottom: 18, overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
          padding: '11px 16px', borderBottom: `1px solid ${T.line}`, background: '#fbfcfd', fontWeight: 700, fontSize: 13.5 },
  headNote: { marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: T.muted },
  body: { padding: '14px 16px 16px' },
  reg: { fontSize: 11.5, color: T.ink2, lineHeight: 1.75, background: '#f7f9fb',
         border: `1px solid ${T.line}`, borderRadius: 6, padding: '9px 12px', marginBottom: 12 },
  bar: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  lab: { fontSize: 12, fontWeight: 700, color: T.ink2 },
  seg: { display: 'inline-flex', border: `1px solid ${T.lineStrong}`, borderRadius: 6, overflow: 'hidden' },
  segBtn: (on) => ({
    padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: 0, cursor: 'pointer',
    background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink2,
    boxShadow: on ? `inset 0 -2px 0 ${T.accent}` : 'none',
  }),
  run: (busy) => ({ padding: '8px 16px', borderRadius: 6, border: 0, fontSize: 12.5, fontWeight: 700,
    cursor: busy ? 'progress' : 'pointer', background: busy ? '#9fb4e8' : T.accent, color: '#fff' }),
  done: { padding: '8px 16px', borderRadius: 6, border: `1px solid #c7e9d5`, fontSize: 12.5, fontWeight: 700,
          cursor: 'pointer', background: T.okSoft, color: T.ok },
  funnel: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: T.ink2, margin: '2px 0 10px' },
  step: { padding: '3px 9px', borderRadius: 4, background: '#f1f3f5', fontWeight: 700 },
  stepOn: { padding: '3px 9px', borderRadius: 4, background: T.accentSoft, color: T.accent, fontWeight: 800 },
  arrow: { color: T.muted },
  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { border: `1px solid ${T.sheetLine}`, padding: '6px 8px', textAlign: 'center', ...mono },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '6px 8px', textAlign: 'left' },
  rate: { width: 78, padding: '4px 6px', fontSize: 12.5, textAlign: 'right', borderRadius: 4,
          border: `1px solid ${T.line}`, background: '#fffdf0', fontFamily: 'inherit' },
  need: { width: 78, padding: '4px 6px', fontSize: 12.5, textAlign: 'right', borderRadius: 4,
          border: `2px solid ${T.warn}`, background: '#fffaf2', fontFamily: 'inherit' },
  badge: (k) => ({ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
    background: k === 'ok' ? T.okSoft : k === 'warn' ? T.warnSoft : '#f1f3f5',
    color: k === 'ok' ? T.ok : k === 'warn' ? T.warn : T.muted }),
  hit: { fontSize: 10.5, color: T.muted },
  out: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12,
         padding: '10px 14px', borderRadius: 6, background: '#fffdf0', border: `1px solid #eadfae` },
  num: { ...mono, fontSize: 17, fontWeight: 800 },
  pend: { color: T.muted, fontStyle: 'italic', fontSize: 12 },
  none: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10,
          padding: '11px 14px', borderRadius: 6, background: T.warnSoft, border: `1px solid #f0dcb4`, fontSize: 12.5, color: T.ink2 },
  apply: { padding: '6px 13px', borderRadius: 5, border: 0, background: T.warn, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  chip: (on) => ({ padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', borderRadius: 5,
    border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink2 }),
  err: { marginTop: 10, padding: '9px 13px', background: T.warnSoft, border: `1px solid #f0dcb4`, borderRadius: 6, fontSize: 12, color: T.warn },
  note: { marginTop: 10, fontSize: 11, color: T.muted, lineHeight: 1.7 },
  secTitle: { fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '.04em', margin: '18px 0 10px' },
};

const RADII = [1000, 2000, 3000, 5000];
const rLabel = (r) => (r >= 1000 ? `${r / 1000}km` : `${r}m`);
/* 상호 표기차((주)/㈜/주식회사/공백)를 지운다 — 명부 매칭과 같은 규칙이다 */
const normCo = (s) => String(s ?? '').replace(/\(주\)|㈜|주식회사|\s/g, '').trim();

export default function NearbyPresale({
  region, addr, coord, polygon, radiusBasis, company, households, series = '주택',
  value, onChange,
}) {
  const v = value ?? {};
  const set = (patch) => onChange?.({ ...v, ...patch });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const t = nearbyTable();
  const radius = v.radius ?? 2000;
  const data = v.data ?? null;
  const picked = v.picked ?? {};
  const usePoly = polygon?.length >= 3 && radiusBasis === 'polygon';
  /* 오피스텔 분양보증이면 대상이 오피스텔이다(원문 괄호) */
  const wantOfficetel = series === '오피스텔';

  const collect = async () => {
    if (!coord) { setErr('사업지 주소를 먼저 확정하세요'); return; }
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams({ x: String(coord.x), y: String(coord.y), region, radius: String(radius) });
      if (addr) qs.set('site', `${region} ${addr}`.trim());
      if (usePoly) qs.set('polygon', JSON.stringify(polygon));
      const j = await fetchJson(`/api/apts?${qs}`);
      /* 반경을 바꿔 다시 받으면 고른 단지는 비운다 — 목록에 없는 단지가 평균에 남으면 안 된다 */
      set({ radius, data: j, picked: {} });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  /** 규정대로 거른다 — 종류 → 본건 제외 → 시기(준공 없음) */
  const funnel = useMemo(() => {
    const all = data?.items ?? [];
    const kindOK = (a) => (wantOfficetel
      ? ['오피스텔', '도시형생활주택'].includes(a.kind)
      : (a.kind ?? '아파트') === '아파트');
    const site = all.filter(a => a.isSite);
    const notSite = all.filter(a => !a.isSite);
    const kind = notSite.filter(kindOK);
    /* 민간임대는 분양이 아니라 임대다 — 초기분양률 개념이 성립하지 않는다 */
    const sale = kind.filter(a => a.priceKind !== 'deposit');
    const fresh = sale.filter(a => a.timing === '1년 이내 분양개시');
    const ongoing = sale.filter(a => a.timing === '분양 진행중');
    const done = sale.filter(a => a.timing === '준공');
    const stage = fresh.length ? 'fresh' : (ongoing.length ? 'ongoing' : 'none');
    return { all, site, notSite, kind, sale, fresh, ongoing, done, stage,
      rows: stage === 'fresh' ? fresh : stage === 'ongoing' ? ongoing : [] };
  }, [data, wantOfficetel]);

  /**
   * 유사도 — 원문이 말하는 **위치 · 세대수 · 브랜드**로만 본다.
   * 시공능력평가순위·택지유형은 분양가 적정성(제16조) 잣대라 여기서 쓰지 않는다.
   */
  const rows = useMemo(() => {
    const mine = Number(households);
    const co = normCo(company);
    const half = radius / 2;
    return funnel.rows.map(a => {
      const hit = [], miss = [];
      if (a.distance != null && a.distance <= half) hit.push(`위치 ${rLabel(half)} 이내`); else miss.push('위치');
      const n = Number(a.totalHouseholds);
      if (Number.isFinite(mine) && mine > 0 && Number.isFinite(n) && n > 0) {
        if (Math.abs(n - mine) / mine <= 0.3) hit.push('세대수 ±30%'); else miss.push('세대수');
      } else miss.push('세대수 미상');
      const theirs = normCo(a.builder);
      if (co && theirs && (co === theirs || a.name?.replace(/\s/g, '').includes(co) || theirs.includes(co))) hit.push('브랜드');
      else miss.push('브랜드');
      return { ...a, sim: { n: hit.length, hit, miss } };
    }).sort((x, y) => (y.sim.n - x.sim.n) || (x.distance - y.distance));
  }, [funnel.rows, households, company, radius]);

  const survey = nearbySurvey(v);
  const sc = (survey.pending && !v.special)
    ? { pending: true, text: survey.pending }
    : scoreNearbyPresale(survey.value, v.special || null);

  const markers = useMemo(() => rows.map((a, i) => ({
    no: i + 1, lat: a.y, lng: a.x, distance: a.distance, name: a.name,
  })), [rows]);

  const toggle = (a) => {
    const next = { ...picked };
    if (a.manageNo in next) delete next[a.manageNo];
    else next[a.manageNo] = '';
    set({ picked: next });
  };

  return (
    <div style={S.box}>
      <div style={S.head}>
        <span>인근아파트 초기 분양률</span>
        <span style={S.headNote}>배점 10 · 조사 항목 (이 점수는 위 A 에 들어갑니다)</span>
      </div>
      <div style={S.body}>
        <div style={S.reg}>
          원문 — 최근 1년 이내 <b>분양개시한 타아파트</b>{wantOfficetel ? '(오피스텔 분양보증이면 오피스텔)' : ''}를 기준으로 하고,
          없으면 <b>분양 진행중</b>인 아파트의 <b>초기분양률(6개월 이내)</b>을 조사해 급간에 따라 평가.
          다수면 <b>위치 · 세대수 · 브랜드</b>가 비슷한 수준을 우선 적용(비슷한 것이 여럿이면 <b>평균분양률</b>).
          적용 아파트가 없으면 <b>최하위 기준배점</b>.<br />
          <b>거리 규정은 원문에 없습니다</b> — 「인근」 이라고만 적혀 있어 반경은 직접 고릅니다.
          분양가 적정성(제16조)과 <b>선정기준이 다릅니다</b> — 준공 단지를 쓰지 않고, 유사도를 브랜드로 봅니다.
          그래서 <b>비교사업장 탭의 목록을 그대로 쓰지 않고</b> 따로 찾습니다.
        </div>

        <div style={S.bar}>
          <span style={S.lab}>반경</span>
          <span style={S.seg}>
            {RADII.map(r => (
              <button key={r} style={S.segBtn(radius === r)} onClick={() => set({ radius: r })}>{rLabel(r)}</button>
            ))}
          </span>
          {data && data.radius === radius
            ? <button style={S.done} onClick={collect}>✓ 수집 완료 — 다시 찾기</button>
            : <button style={S.run(busy)} disabled={busy || !coord} onClick={collect}>
                {busy ? '찾는 중…' : `반경 ${rLabel(radius)} 인근 단지 찾기`}
              </button>}
          {!coord && <span style={S.pend}>사업지 주소를 먼저 확정하세요</span>}
        </div>

        {err && <div style={S.err}>{err}</div>}

        {data && (<>
          <div style={S.funnel}>
            <span style={S.step}>반경 {rLabel(data.radius)} 안 {funnel.notSite.length}건</span>
            {/*
              **본건으로 걸러낸 것을 말한다.** 조용히 빼면 「왜 옆 단지가 안 보이나」 에 답을 못 한다
              (실측 2026-09-25: 경계를 넉넉히 그리자 85m 옆 단지가 본건으로 잡혀 1년 이내가 0건이 됐다).
            */}
            {funnel.site.length > 0 && (
              <span style={S.hit}>
                (본건으로 판정해 제외 {funnel.site.length}건 — {funnel.site.map(a => a.name).join(' · ')})
              </span>
            )}
            <span style={S.arrow}>›</span>
            <span style={S.step}>{wantOfficetel ? '오피스텔·도시형' : '아파트'} {funnel.sale.length}건</span>
            <span style={S.arrow}>›</span>
            <span style={funnel.stage === 'fresh' ? S.stepOn : S.step}>1년 이내 분양개시 {funnel.fresh.length}건</span>
            <span style={S.arrow}>›</span>
            <span style={funnel.stage === 'ongoing' ? S.stepOn : S.step}>분양 진행중 {funnel.ongoing.length}건</span>
            {funnel.done.length > 0 && (
              <span style={{ ...S.hit, marginLeft: 4 }}>
                (준공 {funnel.done.length}건은 초기분양률이 없어 제외)
              </span>
            )}
          </div>

          {funnel.stage === 'none' ? (
            <div style={S.none}>
              <b>적용할 인근 아파트가 없습니다</b> — 반경 {rLabel(data.radius)} 안에 1년 이내 분양개시했거나
              분양 진행중인 {wantOfficetel ? '오피스텔·도시형생활주택' : '아파트'}가 없습니다.
              원문은 이때 <b>최하위 기준배점</b>을 적용하라고 합니다(반경을 넓히라는 문구는 없습니다).
              <button style={S.apply} onClick={() => set({ special: 'none' })}>
                최하위 기준배점 2점 적용
              </button>
            </div>
          ) : (<>
            <table style={S.tbl}>
              <thead>
                <tr>
                  {['조사', '#', '단지명', '거리', '분양개시일', '시기', '세대수', '시공사', '유사도', '초기분양률(%)']
                    .map(c => <th key={c} style={S.th}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const on = a.manageNo in picked;
                  const blank = on && !(Number(picked[a.manageNo]) >= 0);
                  return (
                    <tr key={a.manageNo} style={on ? { background: '#f4f8ff' } : null}>
                      <td style={S.td}>
                        <input type="checkbox" checked={on} onChange={() => toggle(a)}
                          title="조사 대상으로 고릅니다 — 고른 단지의 평균분양률을 씁니다" />
                      </td>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.tdL}>{a.name}</td>
                      <td style={S.td}>{a.distance}m</td>
                      <td style={S.td}>{a.saleStart ?? '-'}</td>
                      <td style={S.td}>
                        <span style={S.badge(a.timing === '1년 이내 분양개시' ? 'ok' : 'none')}>{a.timing}</span>
                      </td>
                      <td style={S.td}>{a.totalHouseholds?.toLocaleString('ko-KR') ?? '-'}</td>
                      <td style={S.tdL}>{a.builder ?? '-'}</td>
                      <td style={S.td}>
                        <span style={S.badge(a.sim.n >= 2 ? 'ok' : 'none')}>{a.sim.n}개 비슷</span>
                        <div style={S.hit}>{a.sim.hit.join(' · ') || '비슷한 항목 없음'}</div>
                      </td>
                      <td style={S.td}>
                        <input style={blank ? S.need : S.rate} type="number" min="0" max="100" step="any"
                          placeholder={on ? '입력' : ''} disabled={!on}
                          value={picked[a.manageNo] ?? ''}
                          onChange={e => set({ picked: { ...picked, [a.manageNo]: e.target.value } })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={S.note}>
              {data.source?.citation}<br />
              목록은 <b>청약홈 분양정보</b>에서 왔지만 <b>초기분양률(6개월 이내)은 어느 공개 원천에도 없습니다</b> —
              단지별 분양률은 조사해 넣는 값입니다(HUG 가 주는 것은 시도 평균 분기값뿐입니다).
              거리는 사업지 <b>{data.distance?.from ?? '대표지번 중심'}</b> ↔ 상대 단지{' '}
              <b>{data.distance?.to ?? '대표지번'}</b> 의 <b>최단거리</b>입니다
              {data.distance?.parcelCount > 0 && (
                <>{' '}(필지 경계 {data.distance.parcelCount}곳
                  {data.distance.pointCount > 0 && <> · 대표지번 점 {data.distance.pointCount}곳</>})</>
              )}.
            </p>

            {rows.length > 0 && coord && (<>
              <div style={S.secTitle}>인근 단지 위치</div>
              <RadiusMap
                title="인근아파트 초기분양률 조사 대상"
                center={{ lat: Number(coord.y), lng: Number(coord.x) }}
                radius={data.radius}
                markers={markers}
                polygon={data.basis === 'polygon' ? polygon : null}
                radiusBasis={radiusBasis}
                caption="핀 번호 = 위 표의 #"
              />
            </>)}
          </>)}
        </>)}

        {/* 조사표를 쓰지 않고 손으로 넣는 길 — 내부망에서 이미 조사해 온 값이 있을 때 */}
        <div style={{ ...S.bar, marginTop: 14 }}>
          <span style={S.lab}>직접 입력</span>
          <input style={S.rate} type="number" min="0" max="100" step="any" placeholder="%"
            disabled={!!v.special || Object.keys(picked).length > 0}
            value={v.rate ?? ''} onChange={e => set({ rate: e.target.value })} />
          <span style={S.hit}>
            {Object.keys(picked).length > 0
              ? '위에서 고른 단지의 평균을 씁니다 — 직접 입력은 고른 단지를 모두 풀어야 쓸 수 있습니다'
              : v.special ? '특례가 선택되어 있습니다' : '조사표를 쓰지 않고 조사값을 바로 넣을 때'}
          </span>
        </div>

        <div style={{ ...S.bar, marginBottom: 0 }}>
          <span style={S.lab}>특례</span>
          {t?.special?.map(sp => (
            <button key={sp.id} style={S.chip(v.special === sp.id)}
              title={sp.text}
              onClick={() => set({ special: v.special === sp.id ? null : sp.id })}>
              {sp.label} = {sp.score}점
            </button>
          ))}
        </div>

        <div style={S.out}>
          {sc?.pending
            ? <span style={S.pend}>{sc.text}</span>
            : (<>
                {survey.from === 'survey' && survey.count > 0 && (
                  <><span style={{ color: T.muted, fontSize: 12 }}>고른 {survey.count}곳 평균</span>
                    <span style={S.num}>{survey.value}%</span>
                    <span style={{ color: T.muted }}>→</span></>)}
                <b>{sc.label} · 평가점수 {sc.score}점</b>
                <span style={{ color: T.muted, fontSize: 11.5 }}>({sc.text})</span>
              </>)}
        </div>
      </div>
    </div>
  );
}
