'use client';
import { Fragment, useState } from 'react';
import { buildSheet } from './sheets';
import { scoreSheet, scoreGroup, scoreFacility, scorePoi, scoreAverage } from '../src/lib/scoring';
import { T, mono } from './theme';
import EvidenceCard from './EvidenceCard';
import RadiusMap from './RadiusMap';
import RoadPicker from './RoadPicker';

const S = {
  /* 시설 행 지우기 — 도로 후보 목록과 같은 모양이어야 같은 동작으로 읽힌다 */
  del: { border: 0, background: 'none', color: '#b8bec7', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px' },
  undo: { border: 0, background: 'none', color: '#1b4fd8', cursor: 'pointer', fontSize: 11.5, textDecoration: 'underline', padding: 0, marginLeft: 8 },
  hiddenBar: { padding: '6px 4px', fontSize: 11.5, color: '#4b525c' },
  page: { background: T.panel, border: `1px solid ${T.lineStrong}`, borderTop: 0, borderRadius: `0 0 ${T.radius}px ${T.radius}px`, padding: '22px 24px 26px' },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' },
  subject: { fontSize: 12.5, color: T.ink2, margin: '0 0 16px' },
  table: { borderCollapse: 'collapse', fontSize: 12.5, width: '100%', minWidth: 640 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 12px', fontWeight: 600, whiteSpace: 'nowrap', color: T.ink },
  td: { border: `1px solid ${T.sheetLine}`, padding: '8px 12px', textAlign: 'center', ...mono },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '8px 12px', textAlign: 'left', background: '#f7f9fb', fontWeight: 600, whiteSpace: 'nowrap' },
  tdVal: { border: `1px solid ${T.sheetLine}`, padding: '8px 12px', textAlign: 'center', fontWeight: 700, background: '#fffdf0', ...mono },
  pend: { color: T.muted, fontWeight: 400, fontStyle: 'italic' },
  blank: { border: `1px solid ${T.sheetLine}`, padding: '8px 12px', background: 'repeating-linear-gradient(45deg,#fafbfc,#fafbfc 5px,#f1f3f5 5px,#f1f3f5 10px)' },
  formula: { marginTop: 9, fontSize: 11.5, color: T.muted },
  why: { color: T.muted, fontWeight: 400, fontSize: 11 },
  block: { marginTop: 18, paddingTop: 14, borderTop: `2px solid ${T.line}` },
  blockHead: { fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  crit: { marginLeft: 'auto', fontSize: 11.5, color: T.ink2, background: '#f1f3f5', padding: '3px 9px', borderRadius: 4 },
  absent: { padding: '12px 14px', background: T.warnSoft, border: `1px solid #f0dcb4`, borderRadius: 6, fontSize: 12.5, color: T.warn, lineHeight: 1.6 },
  srcLine: { marginTop: 7, fontSize: 11, color: T.muted, lineHeight: 1.65 },
  seg: { display: 'inline-flex', border: `1px solid ${T.lineStrong}`, borderRadius: 6, overflow: 'hidden', marginLeft: 'auto' },
  segBtn: (on, off) => ({
    padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: 0, cursor: off ? 'not-allowed' : 'pointer',
    background: on ? T.accent : '#fff', color: on ? '#fff' : (off ? T.muted : T.ink2),
    opacity: off ? 0.55 : 1,
  }),
  note: { marginTop: 9, fontSize: 11.5, color: T.ink2 },
  secTitle: { fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '.04em', margin: '26px 0 12px', paddingTop: 18, borderTop: `1px solid ${T.line}` },
  empty: { padding: '44px 20px', textAlign: 'center', color: T.muted, fontSize: 13 },
  scroll: { overflowX: 'auto' },
  basis: (poly) => ({
    display: 'inline-block', marginBottom: 12, padding: '5px 11px', borderRadius: 5,
    fontSize: 11.5, fontWeight: 700,
    background: poly ? T.okSoft : T.warnSoft,
    color: poly ? T.ok : T.warn,
    border: `1px solid ${poly ? '#c7e9d5' : '#f0dcb4'}`,
  }),
  input: {
    width: '100%', minWidth: 150, padding: '4px 7px', fontSize: 12.5,
    border: `1px solid ${T.line}`, borderRadius: 4, background: '#fffdf0',
    color: T.ink, fontFamily: 'inherit',
  },
};

/** 반경 표기를 한 군데서 만든다 — 1500m 과 1.5km 이 섞여 나오면 같은 값인지 의심하게 된다 */
const rLabel = (r) => (r >= 1000 ? `${r / 1000}km` : `${r}m`);

function Cell({ v, highlight }) {
  if (v == null) return <td style={S.td}><span style={S.pend}>수집 대기</span></td>;
  if (v === '') return <td style={S.blank} />;
  return <td style={highlight ? S.tdVal : S.td}>{v}</td>;
}

/**
 * 평균점수 행.
 *
 * 가이드북은 교통환경·주거편의를 "항목별로 평가 후 **평균값** 적용" 이라고 적는다.
 * 그래서 상업·의료에 7점 행이 있어도 평균을 내면 5점 척도 안에 들어온다.
 * 한 항목이라도 판정 전이면 평균을 내지 않고 사유를 적는다.
 */
function AvgRow({ sheetId, facilities, manual, label, span, S }) {
  const sc = facilities ? scoreAverage(sheetId, { facilities, manual }) : null;
  if (!sc || sc.pending) {
    return (
      <tr>
        <td style={S.tdL} colSpan={span}>{label}</td>
        <td style={S.blank} />
        <td style={S.td}>{sc?.pending ? <span style={S.pend}>{sc.text}</span> : null}</td>
      </tr>
    );
  }
  /*
    점수 칸에는 **평균값**, 평가 칸에는 **등급 대표점수**를 적는다 (골든 캡쳐 01·02).
    평균 2.5 → 보통 → 평가점수 3점. 평균을 그대로 점수로 쓰면 총점이 소수로 어긋난다.
  */
  return (
    <tr>
      <td style={S.tdL} colSpan={span}>{label}</td>
      <td style={S.tdVal}>{sc.avg}</td>
      <td style={S.td}>
        <b>평가점수 {sc.score}점</b> · {sc.label}
        <span style={S.why}> (평균 {sc.avg} = {sc.text})</span>
        {sc.caution && <><br /><span style={S.pend}>{sc.caution}</span></>}
      </td>
    </tr>
  );
}

export default function SheetView({ sheetId, data, facilities, manual, onManual, sheetInput = {}, radiusBasis = 'polygon', onRadiusBasis }) {
  // 도로 후보에서 고른 지점 — 로드뷰를 그곳으로 보낸다
  const [roadSpot, setRoadSpot] = useState({});
  // 후보 목록 자체 — 큰 도로를 지도에 자동으로 찍기 위해 들고 있는다
  const [roadList, setRoadList] = useState({});
  const byId = Object.fromEntries((data?.results ?? []).map(r => [r.indicatorId, r]));
  const spec = buildSheet(sheetId, {
    byId, region: data?.region ?? '', period: data?.period ?? '', company: data?.company, sheetInput,
  });

  if (!spec) {
    return (
      <div style={S.page}>
        <div style={S.empty}>
          이 시트는 사업계획서 기반 수기입력 항목입니다.<br />
          <span style={{ fontSize: 12 }}>(표지 · 종합 · 규모 및 배치 · 평형구성 · 인근초기분양률)</span>
        </div>
      </div>
    );
  }

  // 반경시설 시트 — 캡쳐마다 표 구조가 달라 레이아웃별로 나눠 그린다
  if (spec.poi) {
    const near = (label) => facilities?.facilities?.[label]?.nearest ?? null;
    const hit  = (label) => facilities?.facilities?.[label] ?? null;
    const pend = <span style={S.pend}>수집 대기</span>;

    /**
     * 6차선 판정용 마커 — 큰 도로(대로·로)만 자동으로 찍는다.
     * 길·번길까지 다 찍으면 지도가 핀으로 덮여 무엇을 보는지 알 수 없다.
     * 고른 도로가 있으면 맨 앞에 둬서 파란 핀으로 눈에 띄게 한다.
     */
    const roadMarkers = (f) => {
      const dismissed = manual?.[f.label]?.dismissed ?? [];
      const picked = manual?.[f.label]?.name;
      const big = (roadList[f.label] ?? [])
        .filter(r => r.rank <= 1 && !dismissed.includes(r.name));
      const sorted = picked
        ? [...big.filter(r => r.name === picked), ...big.filter(r => r.name !== picked)]
        : big;
      const pins = sorted.map((r, i) => ({
        no: i + 1, lat: Number(r.y), lng: Number(r.x),
        name: `${r.name} (${r.grade})`, distance: r.distance,
      }));
      /*
       * **고른 도로가 지나는 자리를 다 찍는다**(사용자 지적 2026-09-17).
       * 표본점 하나만 찍으면 "배지 거리와 지도 위치가 다르다" 로 보인다 —
       * 그 점은 도로 중심선이 아니라 도로에 접한 필지이기 때문이다.
       * 고른 도로에 한해 표본점을 전부 찍어 도로의 走向이 눈에 보이게 한다.
       */
      const cur = sorted.find(r => r.name === picked);
      const trail = (cur?.points ?? []).slice(1, 12).map(p => ({
        lat: Number(p.y), lng: Number(p.x), name: `${cur.name} 지나는 지점`, distance: p.dist, faint: true,
      }));
      return [...pins, ...trail];
    };

    /** 시설명 셀 — 수집 전이면 대기, 수집 후 없으면 '부재' */
    const NameCell = ({ label }) => {
      const n = near(label);
      if (!facilities) return <td style={S.td}>{pend}</td>;
      return n ? <td style={S.tdVal}>{n.name}</td> : <td style={S.td}>부재</td>;
    };
    const DistCell = ({ label }) => {
      const n = near(label);
      if (!facilities) return <td style={S.td}>{pend}</td>;
      return <td style={S.td}>{n ? `${n.distance}m` : '-'}</td>;
    };

    return (
      <div style={S.page}>
        <h2 style={S.h2}>{spec.title}</h2>
        <p style={S.subject}>
          ▶ 사업지 : {facilities?.address ?? spec.subject}
          {/* 입력 주소와 실제 매칭 주소가 다르면 증빙에 그대로 드러나야 한다 */}
          {facilities?.matched && facilities.matched !== facilities.address && (
            <span style={{ color: T.muted }}> · 좌표매칭 {facilities.matched}</span>
          )}
        </p>

        {/*
          경계를 그려도 적용됐는지 화면에서 안 보이면 안 쓴 것과 같다.
          반경 표시 기준도 여기서 바꾼다 — 지도 안쪽 버튼은 아무도 못 찾았다.
        */}
        {facilities && spec.poi && (() => {
          const hasPoly = (facilities.polygon?.length ?? 0) >= 3;
          const on = hasPoly && radiusBasis === 'polygon';
          return (
            <div style={{ ...S.basis(hasPoly), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 380px' }}>
                {hasPoly
                  ? `판정 기준 : 사업지 경계 최단거리 (경계 ${facilities.polygon.length}점 · 사업지 안의 시설은 0m)`
                  : '판정 기준 : 대표지번 중심점 — 지도에서 경계를 그리면 실제 사업지 경계로 다시 잽니다'}
              </span>
              <span style={{ fontSize: 11.5, color: T.muted }}>지도 반경 표시</span>
              <span style={S.seg}>
                <button
                  style={S.segBtn(on, !hasPoly)}
                  disabled={!hasPoly}
                  title={hasPoly ? '사업지 경계에서 잰 선 — 판정선과 같습니다'
                                 : '사업지 경계를 그려야 쓸 수 있습니다'}
                  onClick={() => onRadiusBasis?.('polygon')}
                >경계 기준{!hasPoly && ' (경계 없음)'}</button>
                <button
                  style={S.segBtn(!on, false)}
                  title="대표지번 중심의 원 — 경계 기준 판정과는 다릅니다"
                  onClick={() => onRadiusBasis?.('point')}
                >중심 기준</button>
              </span>
            </div>
          );
        })()}

        {facilities && !spec.poi && (
          <div style={S.basis(facilities.basis === 'polygon')}>
            {facilities.basis === 'polygon'
              ? `판정 기준 : 사업지 경계 최단거리 (경계 ${facilities.polygon?.length ?? 0}점)`
              : '판정 기준 : 대표지번 중심점'}
          </div>
        )}

        <div style={S.scroll}>
          <table style={S.table}>
            <thead><tr>{spec.columns.map(c => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
            <tbody>
              {/* 교통환경 — 항목별 독립 판정 */}
              {spec.layout === 'flat' && (<>
                {spec.facilities.map(f => (
                  <tr key={f.label}>
                    <td style={S.tdL}>{f.label}</td>
                    <td style={S.td}>{f.criteria}</td>
                    {/*
                      수기 입력칸을 없앴다. 아래 도로 후보에서 고르고 차선만 세면
                      이름·거리·판정이 여기 그대로 채워진다.
                    */}
                    {f.manual
                      ? (() => {
                          const m = manual?.[f.label];
                          return (<>
                            <td style={m?.name ? S.tdVal : S.td}>
                              {m?.name
                                ? `${m.name}${m.lanes ? ` (왕복 ${m.lanes}차선)` : ''}`
                                : <span style={S.pend}>아래에서 도로 선택</span>}
                            </td>
                            <td style={S.td}>{m?.distance != null ? `${m.distance}m` : '-'}</td>
                          </>);
                        })()
                      : <><NameCell label={f.label} /><DistCell label={f.label} /></>}
                    {/* 구간표가 들어온 항목만 점수를 낸다 — 없으면 빗금 그대로 */}
                    {(() => {
                      /*
                        수집 전에는 **어느 항목도 점수를 내지 않는다.**
                        6차선만 `scoreFacility` 가 facilities 와 무관하게 기본 1점을 내서,
                        주소도 안 넣은 첫 화면에 지하철역은 "수집 대기" 인데 6차선만 1점이 떠 있었다.
                      */
                      const sc = f.manual
                        ? (facilities ? scoreFacility(f.label, manual?.[f.label]) : null)
                        : scorePoi(f.label, facilities);
                      if (!sc) return (<><td style={S.blank} /><td style={S.blank} /></>);
                      // 구간을 못 받은 경우 — 점수를 매기지 않고 사유를 적는다
                      if (sc.pending) {
                        return (<>
                          <td style={S.blank} />
                          <td style={S.td}><span style={S.pend}>{sc.text}</span></td>
                        </>);
                      }
                      /*
                        항목마다 따로 판정하고 평균으로 등급을 낸다 — 그러니 **아직 판정 안 한 항목**의
                        기본점수(1점)를 판정된 값과 같은 색으로 두면 안 된다. 노란 칸은 확정된 값 자리다.
                      */
                      const unjudged = sc.reason === '차선 수 미입력' || sc.reason === '도로 미선택';
                      return (<>
                        <td style={unjudged ? S.td : S.tdVal}>{sc.score}</td>
                        <td style={S.td}>
                          {unjudged
                            ? <span style={S.pend}>판정 전 기본 {sc.score}점 — {sc.reason}</span>
                            : <>{sc.score}점 · {sc.label}
                                {sc.reason ?? sc.text ? <span style={S.why}> ({sc.reason ?? sc.text})</span> : null}</>}
                        </td>
                      </>);
                    })()}
                  </tr>
                ))}
                {spec.summaryRow && (
                  <AvgRow sheetId={sheetId} facilities={facilities} manual={manual}
                          label={spec.summaryRow} span={4} S={S} />
                )}
              </>)}

              {/* 주거편의 — 그룹별 판정, 그룹 아래 묶음 라벨 행 */}
              {spec.layout === 'grouped' && spec.groups.map(g => {
                // 그룹 단위 점수 — 맞은 규칙의 구분 문구를 평가조건 칸에 그대로 쓴다
                const sc = facilities ? scoreGroup(sheetId, g.label, facilities) : null;
                const n = g.facilities.length;
                return (
                <Fragment key={g.label}>
                  {g.facilities.map((f, i) => (
                    <tr key={f.label}>
                      <td style={S.tdL}>{f.label}</td>
                      <NameCell label={f.label} />
                      <DistCell label={f.label} />
                      {i === 0 && (
                        <td style={S.td} rowSpan={n}>
                          {sc?.text ?? g.condition}
                        </td>
                      )}
                      {i === 0 && (sc && !sc.pending
                        ? <td style={S.tdVal} rowSpan={n}>{sc.score}</td>
                        : <td style={S.blank} rowSpan={n} />)}
                      {i === 0 && (sc && !sc.pending
                        ? <td style={S.td} rowSpan={n}>{sc.score}점{sc.label ? ` · ${sc.label}` : ''}</td>
                        : <td style={S.blank} rowSpan={n} />)}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...S.td, background: '#eef2f7', fontWeight: 600 }} colSpan={spec.columns.length}>
                      {g.label}
                      {sc?.pending && (
                        <span style={S.why}> · {sc.text}</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ); })}
              {spec.layout === 'grouped' && spec.summaryRow && (
                <AvgRow sheetId={sheetId} facilities={facilities} manual={manual}
                        label={spec.summaryRow} span={4} S={S} />
              )}

              {/* 교육환경 — 500m / 1km 2단 판정 */}
              {spec.layout === 'dual' && (<>
                {spec.facilities.map(f => {
                  const h = hit(f.label);
                  const n = h?.nearest;
                  const in500 = n && n.distance <= 500;
                  const in1k  = n && n.distance > 500 && n.distance <= 1000;
                  return (
                    <tr key={f.label}>
                      <td style={S.tdL}>{f.label}</td>
                      <td style={in500 ? S.tdVal : S.td}>
                        {!facilities ? pend : (in500 ? `${n.name} (${n.distance}m)` : '')}
                      </td>
                      <td style={in1k ? S.tdVal : S.td}>
                        {!facilities ? pend : (in1k ? `${n.name} (${n.distance}m)` : '')}
                      </td>
                      <td style={S.blank} /><td style={S.blank} />
                    </tr>
                  );
                })}
                {spec.summaryRow && (() => {
                  const sc = facilities ? scoreSheet(sheetId, facilities) : null;
                  return (
                    <tr>
                      <td style={S.tdL} colSpan={3}>{spec.summaryRow}</td>
                      {sc
                        ? (<>
                            <td style={S.tdVal}>{sc.score}</td>
                            <td style={S.td}>{sc.score}점 · {sc.label}</td>
                          </>)
                        : (<><td style={S.blank} /><td style={S.blank} /></>)}
                    </tr>
                  );
                })()}
              </>)}
            </tbody>
          </table>
        </div>

        {!facilities && <div style={S.formula}>사업지 주소를 입력하고 [반경시설 수집]을 누르면 채워집니다.</div>}

        {facilities && (
          <>
            {/*
              시설마다 [목록 표] 바로 아래 [그 시설의 지도] 를 붙인다.
              표를 다 모아놓고 지도를 다 모아놓으면 어느 표가 어느 지도인지
              위아래로 스크롤하며 맞춰봐야 한다. 한 시설 = 한 덩어리로 읽힌다.
            */}
            <div style={S.secTitle}>증빙 — 시설별 목록 · 반경원 지도</div>

            {(spec.groups ? spec.groups.flatMap(g => g.facilities) : spec.facilities).map(f => {
              // 수기판정 항목은 수집결과가 없으므로 스펙의 반경으로 빈 지도를 띄운다
              const h = hit(f.label) ?? (f.manual ? { radius: f.radius, count: null, nearest: null, items: [] } : null);
              if (!h) return null;
              const n = h.nearest;
              const items = h.items ?? [];
              return (
                <div key={f.label} style={S.block}>
                  <div style={S.blockHead}>
                    <span style={{ fontWeight: 700 }}>{f.label}</span>
                    <span style={{ color: T.muted, fontWeight: 400 }}>
                      {' · '}반경 {rLabel(h.radius)}
                      {f.manual ? ' · 지도 육안 판정' : ` · ${h.count ?? 0}건`}
                    </span>
                    {f.criteria && <span style={S.crit}>{f.criteria}</span>}
                  </div>

                  {/* ── 표 ── */}
                  {f.manual ? (
                    <RoadPicker
                      coord={facilities.coord}
                      radius={h.radius}
                      /* 다른 시설과 같은 규칙 — 경계로 수집했으면 도로도 경계에서 잰다 */
                      polygon={facilities.basis === 'polygon' ? facilities.polygon : null}
                      value={manual?.[f.label]}
                      onRoads={(rows) => setRoadList(prev => ({ ...prev, [f.label]: rows }))}
                      /* 누르기만 해도 로드뷰는 그쪽으로 — 보고 나서 적용한다 */
                      onPreview={(r) => setRoadSpot(prev => ({ ...prev,
                        [f.label]: { lat: Number(r.y), lng: Number(r.x), name: r.name, distance: r.distance } }))}
                      onChange={(v) => {
                        onManual?.(f.label, v);
                        // 고른 도로 지점으로 지도를 옮겨 로드뷰를 띄운다
                        if (v?.name && v?.y != null) {
                          setRoadSpot(prev => ({ ...prev,
                            [f.label]: { lat: Number(v.y), lng: Number(v.x), name: v.name, distance: v.distance } }));
                        }
                      }}
                    />
                  ) : items.length ? (
                    <div style={S.scroll}>
                      <table style={S.table}>
                        <thead><tr>{['#', '시설명', '거리', '분류', '주소', ''].map((c, i) => <th key={i} style={S.th}>{c}</th>)}</tr></thead>
                        <tbody>
                          {items.map((it, i) => (
                            <tr key={i}>
                              <td style={{ ...S.td, width: 34, color: T.muted }}>{i + 1}</td>
                              <td style={i === 0 ? { ...S.tdVal, textAlign: 'left' } : { ...S.td, textAlign: 'left' }}>{it.name}</td>
                              <td style={i === 0 ? S.tdVal : S.td}>{it.distance}m</td>
                              <td style={{ ...S.td, textAlign: 'left', color: T.muted, fontSize: 11.5 }}>{it.category ?? '-'}</td>
                              <td style={{ ...S.td, textAlign: 'left', color: T.ink2 }}>{it.address}</td>
                              {/*
                                **도로처럼 지울 수 있어야 한다**(사용자 요청 2026-09-17).
                                지우면 표·지도·최근접 판정에서 같이 빠진다 — 화면에서만 지우면
                                "지웠는데 점수가 안 바뀐다" 가 된다(`applyHidden`).
                              */}
                              <td style={{ ...S.td, width: 28 }}>
                                <button style={S.del} title="이 시설을 목록·지도·판정에서 뺍니다"
                                  onClick={() => onManual?.(f.label, {
                                    ...(manual?.[f.label] ?? {}),
                                    hidden: [...(manual?.[f.label]?.hidden ?? []), it.name],
                                  })}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(manual?.[f.label]?.hidden?.length > 0) && (
                        <div style={S.hiddenBar}>
                          뺀 시설 {manual[f.label].hidden.length}곳 —{' '}
                          <span style={{ color: T.muted }}>{manual[f.label].hidden.join(' · ')}</span>
                          <button style={S.undo}
                            onClick={() => onManual?.(f.label, { ...(manual?.[f.label] ?? {}), hidden: [] })}>
                            되돌리기
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={S.absent}>
                      반경 {rLabel(h.radius)} 이내 부재
                      {/* 왜 부재인지 근거를 남긴다 — 의원급은 의료시설이 아니다 */}
                      {h.excludedClinics
                        ? ` — 심사 대상(병원급 이상)이 아닌 ${h.excludedClinics}곳을 제외했습니다`
                          + (h.excludedByGrade ? ` (${h.excludedByGrade})` : '')
                        : ''}
                      {h.excluded
                        ? ` — 분류가 맞지 않는 ${h.excluded}곳을 제외했습니다`
                          + (h.excludedBy ? ` (${h.excludedBy})` : '')
                        : ''}
                      {h.error ? ` · ${h.error}` : ''}
                    </div>
                  )}

                  {/*
                    **어느 원천에서 온 목록인지 적는다.** 의료시설만 심평원이고 나머지는 카카오인데
                    화면이 그 구분을 말하지 않아 전부 카카오맵으로 보였다(사용자 지적).
                  */}
                  {h.source && (
                    <div style={S.srcLine}>
                      * 출처 : <b style={{ color: T.ink2 }}>{h.source.name}</b>
                      {h.source.detail ? ` · ${h.source.detail}` : ''}
                      {h.source.filter ? <><br />　{h.source.filter}</> : null}
                      {h.excluded ? (
                        <><br />　분류가 맞지 않아 <b>{h.excluded}곳 제외</b>
                          {h.excludedBy ? ` (${h.excludedBy})` : ''}</>
                      ) : null}
                      {h.capped ? (
                        <><br />　<b style={{ color: T.warn }}>카카오 45건 상한에 걸렸습니다</b>
                          {' '}— 가까운 순으로 받으므로 최근접·존재여부 판정은 그대로지만
                          건수는 반경 안 전부가 아닙니다</>
                      ) : null}
                    </div>
                  )}

                  {/* ── 지도 ── */}
                  <div style={{ marginTop: 10 }}>
                    <RadiusMap
                      title={f.label}
                      center={{ lat: Number(facilities.coord.y), lng: Number(facilities.coord.x) }}
                      radius={h.radius}
                      polygon={facilities.basis === 'polygon' ? facilities.polygon : null}
                      radiusBasis={radiusBasis}
                      defaultMapType={f.manual ? 'HYBRID' : 'ROADMAP'}
                      roadview
                      roadviewOpen={Boolean(f.manual)}
                      /* 고른 도로가 없으면 가장 큰·가까운 후보로 로드뷰를 열어둔다 */
                      roadviewAt={roadSpot[f.label] ?? roadMarkers(f)[0] ?? null}
                      /* 표에 있는 것은 지도에도 전부 있어야 한다 — 번호는 표의 # 와 같다 */
                      markers={f.manual ? roadMarkers(f) : items.map((it, i) => ({
                        no: i + 1, lat: Number(it.y), lng: Number(it.x),
                        name: it.name, distance: it.distance,
                      }))}
                      caption={f.manual
                        ? `로드뷰에서 차선을 세어 위 [왕복 __ 차선] 에 넣으면 판정됩니다 (기준 ${rLabel(h.radius)} 이내 · 왕복 6차선 = 편도 3차로)`
                        : (n ? `최근접 ${n.name} · ${n.distance}m · 반경 ${rLabel(h.radius)} 내 ${h.count}건`
                             : `반경 ${rLabel(h.radius)} 이내 부재`)}
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  // 통계 시트
  const evid = (spec.evidence ?? []).map(id => byId[id]).filter(r => r?.ok);
  return (
    <div style={S.page}>
      <h2 style={S.h2}>{spec.title}</h2>
      <p style={S.subject}>▶ 사업지 : {spec.subject}{data?.period ? ` · ${data.period}` : ''}</p>

      <div style={S.scroll}>
        <table style={S.table}>
          <thead><tr>{spec.columns.map(c => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
          <tbody>
            {spec.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => ci === 0
                  ? <td key={ci} style={S.tdL}>{c}</td>
                  : <Cell key={ci} v={c} highlight={ci === 2 && c != null && c !== ''} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {spec.formula && <div style={S.formula}>산식 : {spec.formula}</div>}
      {spec.footnote && <div style={S.note}>{spec.footnote}</div>}

      {evid.length > 0 && (
        <>
          <div style={S.secTitle}>증빙</div>
          {evid.map(r => <EvidenceCard key={r.indicatorId} row={r} region={data.region} />)}
        </>
      )}
    </div>
  );
}
