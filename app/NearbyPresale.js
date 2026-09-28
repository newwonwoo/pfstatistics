'use client';
import { useMemo, useState } from 'react';
import { T, mono } from './theme';
import { fetchJson } from './fetchJson';
import RadiusMap from './RadiusMap';
import { nearbyTable, nearbySurvey } from '../src/lib/manual';
import { scoreNearbyPresale } from '../src/lib/scoring';
import {
  baseRadius, presaleCandidates, pickPresale, HOUSE_TYPES, SIZE_BANDS, RANK_BANDS, LAND_TYPES,
} from '../src/lib/similar';

/**
 * 인근아파트 초기 분양률(10) — **조사 항목**이다.
 *
 * 선정 방법은 가이드북 원문 「"인근아파트 초기 분양률(10)" 항목 평가 시 '인근아파트' 선정 방법」 을 따른다
 * (2026-09-28 원문 수령 · docs/규정-인근단지-선정기준.md 의 B).
 *   ① 거리   단위사업장으로부터 2km (수도권·광역시 1km) 이내
 *   ② 시기   최근 1년 이내 분양 개시 → 없으면 분양 진행 중 (**준공은 쓰지 않는다**)
 *   ③ 유형   주택유형이 일치하는 사업장
 *   비고1   해당 사업장이 없으면 **최하위 배점**
 *   비고2   2개 이상이면 주택유형·단지규모·시공능력평가순위·택지유형 4개 항목이 **가장 많이** 일치하는 곳.
 *           가장 많이 일치하는 곳이 여럿이면 그 **평균값**(사례 EX3)
 *
 * **전에 틀렸던 것 두 가지**(원문을 받기 전 옛 문구로 만들었다) —
 *   · 거리 규정이 없다고 보고 반경을 사람이 고르게 했다(기본 2km) → 이제 규정 거리로 고정한다
 *   · 유사도를 위치·세대수·브랜드로 봤다 → 원문은 분양가 쪽과 **같은 4개 항목**이다
 *
 * **초기분양률(6개월 이내) 값 자체는 어느 공개 원천에도 없다.**
 * 그래서 이 화면은 **누구를 조사할지**까지 대신하고, 조사한 값은 사람이 넣는다.
 * 판정은 `src/lib/similar.js` 한 곳에서 한다 — 자가진단이 원문 사례해설을 매일 재현한다.
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
  siteRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10,
             padding: '8px 12px', background: '#fbfcfd', border: `1px solid ${T.line}`, borderRadius: 6 },
  siteSel: (need) => ({ padding: '4px 6px', fontSize: 12, borderRadius: 4, fontFamily: 'inherit', background: '#fff',
    border: need ? '2px solid #d98324' : `1px solid ${T.line}` }),
  pick: { padding: '6px 13px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${T.accent}`, background: '#fff', color: T.accent },
  autoMsg: { flexBasis: '100%', padding: '7px 11px', borderRadius: 6, background: '#f7f9fb',
             border: `1px solid ${T.line}`, fontSize: 11.5, color: T.ink2, lineHeight: 1.6 },
  secTitle: { fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '.04em', margin: '18px 0 10px' },
};

const rLabel = (r) => (r >= 1000 ? `${r / 1000}km` : `${r}m`);
const SITE_FIELDS = [
  ['houseType', '가. 주택유형', HOUSE_TYPES],
  ['sizeBand', '나. 단지규모', SIZE_BANDS],
  ['rankBand', '다. 시공순위', RANK_BANDS],
  ['landType', '라. 택지유형', LAND_TYPES],
];

export default function NearbyPresale({
  region, addr, coord, polygon, radiusBasis, series = '주택',
  site = {}, onSite, value, onChange,
}) {
  const v = value ?? {};
  const set = (patch) => onChange?.({ ...v, ...patch });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [autoMsg, setAutoMsg] = useState(null);

  const t = nearbyTable();
  /* ① 거리는 규정으로 정해진다 — 고르는 칸을 두지 않는다 */
  const radius = baseRadius(region);
  const data = v.data ?? null;
  const collected = Boolean(data) && data.radius === radius;
  const picked = v.picked ?? {};
  const usePoly = polygon?.length >= 3 && radiusBasis === 'polygon';
  /* ③ 유형 — 오피스텔 분양보증이면 대상이 오피스텔이다 */
  const officetel = series === '오피스텔';

  const collect = async () => {
    if (!coord) { setErr('사업지 주소를 먼저 확정하세요'); return; }
    setBusy(true); setErr(null); setAutoMsg(null);
    try {
      const qs = new URLSearchParams({ x: String(coord.x), y: String(coord.y), region, radius: String(radius) });
      if (addr) qs.set('site', `${region} ${addr}`.trim());
      if (usePoly) qs.set('polygon', JSON.stringify(polygon));
      const j = await fetchJson(`/api/apts?${qs}`);
      /* 다시 받으면 고른 단지는 비운다 — 목록에 없는 단지가 평균에 남으면 안 된다 */
      set({ radius, data: j, picked: {} });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  /** 규정대로 거른다 — 본건 제외 → ③ 유형 → ② 시기(준공 없음) → 비고2 유사도 */
  const funnel = useMemo(
    () => presaleCandidates(data?.items ?? [], site, { officetel }),
    [data, site, officetel]);
  const rows = funnel.rows;
  const best = useMemo(() => pickPresale(rows), [rows]);
  const siteLeft = SITE_FIELDS.filter(([k]) => !site[k]).map(([, label]) => label.slice(3));

  /* 비고2 — 가장 많이 일치하는 곳을 고른다. 이미 넣은 분양률은 지우지 않는다 */
  const autoPick = () => {
    if (!best.ids.length) return;
    const next = {};
    for (const id of best.ids) next[id] = picked[id] ?? '';
    set({ picked: next, special: null });
    setAutoMsg(best.ids.length === 1
      ? `${rows.length === 1 ? '대상이 1곳뿐이라 그 1곳' : `4개 항목 중 ${best.top}개가 일치하는 1곳`}을 골랐습니다 — 그 단지의 초기분양률을 조사해 넣으세요.`
      : `4개 항목 중 ${best.top}개가 일치하는 ${best.ids.length}곳을 골랐습니다 — 가장 많이 일치하는 곳이 여럿이라 초기분양률 평균값을 씁니다(사례 EX3).`);
  };

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

  const typeLabel = officetel ? '오피스텔·도시형생활주택' : '아파트';

  return (
    <div style={S.box}>
      <div style={S.head}>
        <span>인근아파트 초기 분양률</span>
        <span style={S.headNote}>배점 10 · 조사 항목 (이 점수는 위 분양가격지수 제외 항목 점수에 들어갑니다)</span>
      </div>
      <div style={S.body}>
        <div style={S.reg}>
          <b>인근아파트 선정 방법</b> (가이드북 원문) —
          ① 거리 <b>{rLabel(radius)}</b> 이내 (2km · 수도권·광역시 1km) ·
          ② 최근 1년 이내 <b>분양 개시</b> → 없으면 <b>분양 진행 중</b> (준공 단지는 쓰지 않음) ·
          ③ <b>주택유형이 일치</b>하는 사업장({typeLabel})<br />
          여럿이면 <b>주택유형 · 단지규모 · 시공능력평가순위 · 택지유형</b>이 가장 많이 일치하는 곳
          (가장 많이 일치하는 곳이 여럿이면 <b>평균값</b>). 해당 사업장이 없으면 <b>최하위 배점</b>.<br />
          분양가 비교 사업장과는 기준이 다릅니다 — 준공 단지를 쓰지 않고, 2개 일치 요건 없이 가장 많이 일치하는 곳을 고르며,
          못 찾아도 반경을 넓히지 않습니다. 그래서 비교사업장 탭의 목록을 그대로 쓰지 않고 따로 찾습니다.
        </div>

        {/*
          비고2 의 4개 항목은 **비교사업장 탭의 [본건 제원] 과 같은 값**이다.
          여기서 고쳐도 그쪽이 같이 바뀐다 — 한 값을 두 곳에서 따로 들고 있으면 조용히 갈린다.
        */}
        <div style={S.siteRow}>
          <span style={S.lab}>본건 제원</span>
          {SITE_FIELDS.map(([k, label, opts]) => (
            <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.ink2 }}>
              {label}
              <select style={S.siteSel(!site[k])} value={site[k] ?? ''}
                onChange={e => onSite?.({ [k]: e.target.value || null })}>
                <option value="">선택</option>
                {opts.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          ))}
          <span style={S.hit}>
            {siteLeft.length
              ? `${siteLeft.join('·')} 을(를) 고르면 일치 항목을 셉니다 · 비교사업장 탭 [본건 제원] 과 같은 값입니다`
              : '비교사업장 탭 [본건 제원] 과 같은 값입니다'}
          </span>
        </div>

        <div style={S.bar}>
          <span style={S.lab}>거리</span>
          <span style={S.step}>{rLabel(radius)} 이내 <span style={{ fontWeight: 400, color: T.muted }}>(규정)</span></span>
          {collected
            ? <button style={S.done} onClick={collect}>✓ 수집 완료 — 다시 찾기</button>
            : <button style={S.run(busy)} disabled={busy || !coord} onClick={collect}>
                {busy ? '찾는 중…' : `반경 ${rLabel(radius)} 인근 단지 찾기`}
              </button>}
          {!coord && <span style={S.pend}>사업지 주소를 먼저 확정하세요</span>}
          {data && !collected && (
            <span style={S.pend}>전에 {rLabel(data.radius)} 로 받은 목록입니다 — 규정 거리로 다시 찾으세요</span>
          )}
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
            <span style={S.step}>주택유형 일치({officetel ? '오피스텔·도시형' : '아파트'}) {funnel.sale.length}건</span>
            <span style={S.arrow}>›</span>
            <span style={funnel.stage === 'fresh' ? S.stepOn : S.step}>1년 이내 분양개시 {funnel.fresh.length}건</span>
            <span style={S.arrow}>›</span>
            <span style={funnel.stage === 'ongoing' ? S.stepOn : S.step}>분양 진행중 {funnel.ongoing.length}건</span>
            {funnel.done.length > 0 && (
              <span style={{ ...S.hit, marginLeft: 4 }}>
                (준공 {funnel.done.length}건은 대상이 아니어서 제외)
              </span>
            )}
          </div>

          {funnel.stage === 'none' ? (
            <div style={S.none}>
              <b>적용할 인근 아파트가 없습니다</b> — {rLabel(data.radius)} 안에 1년 이내 분양개시했거나
              분양 진행중인 {typeLabel}가 없습니다.
              원문 비고1 에 따라 <b>최하위 배점</b>을 적용합니다(반경을 넓히지 않습니다).
              <button style={S.apply} onClick={() => set({ special: 'none' })}>
                최하위 배점 2점 적용
              </button>
            </div>
          ) : (<>
            <div style={{ ...S.bar, marginBottom: 8 }}>
              <span style={S.hit}>
                {rows.length === 1
                  ? '대상이 1곳입니다 — 그 단지의 초기분양률을 조사합니다(사례 EX1).'
                  : `대상 ${rows.length}곳 — 4개 항목이 가장 많이 일치하는 곳을 고릅니다(비고2).`}
              </span>
              <button style={{ ...S.pick, marginLeft: 'auto' }} onClick={autoPick}>규정대로 선정</button>
              {autoMsg && <div style={S.autoMsg}>{autoMsg}</div>}
            </div>
            <table style={S.tbl}>
              <thead>
                <tr>
                  {['조사', '#', '단지명', '거리', '분양개시일', '시기', '세대수', '시공사', '일치 항목', '초기분양률(%)']
                    .map(c => <th key={c} style={S.th}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const on = a.manageNo in picked;
                  const blank = on && !(Number(picked[a.manageNo]) >= 0 && picked[a.manageNo] !== '');
                  const top = best.ids.includes(a.manageNo);
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
                      <td style={S.tdL}>{a.builder ?? '-'}{a.builderRank ? ` (${a.builderRank}위)` : ''}</td>
                      <td style={S.td}>
                        <span style={S.badge(top ? 'ok' : 'none')}>{a.sim.n}개 일치{top ? ' · 최다' : ''}</span>
                        <div style={S.hit}>{a.sim.hit.join(' · ') || '일치 항목 없음'}</div>
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
              단지별 분양률은 조사해 넣는 값입니다. 택지유형은 원천에 없어 상대 단지는 「미상」 으로 셉니다.
              거리는 <b>{data.distance?.from ?? '대표지번 중심'}</b> ↔{' '}
              <b>{data.distance?.to ?? '상대 단지 대표지번'}</b> 의 <b>최단거리</b>입니다
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
