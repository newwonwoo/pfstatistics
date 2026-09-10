'use client';
import { Fragment } from 'react';
import { buildSheet } from './sheets';
import { T, mono } from './theme';
import EvidenceCard from './EvidenceCard';
import RadiusMap from './RadiusMap';

const S = {
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
  note: { marginTop: 9, fontSize: 11.5, color: T.ink2 },
  secTitle: { fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '.04em', margin: '26px 0 12px', paddingTop: 18, borderTop: `1px solid ${T.line}` },
  empty: { padding: '44px 20px', textAlign: 'center', color: T.muted, fontSize: 13 },
  scroll: { overflowX: 'auto' },
};

function Cell({ v, highlight }) {
  if (v == null) return <td style={S.td}><span style={S.pend}>수집 대기</span></td>;
  if (v === '') return <td style={S.blank} />;
  return <td style={highlight ? S.tdVal : S.td}>{v}</td>;
}

export default function SheetView({ sheetId, data, facilities }) {
  const byId = Object.fromEntries((data?.results ?? []).map(r => [r.indicatorId, r]));
  const spec = buildSheet(sheetId, {
    byId, region: data?.region ?? '', period: data?.period ?? '', company: data?.company,
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
        <p style={S.subject}>▶ 사업지 : {facilities?.address ?? spec.subject}</p>

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
                    {f.manual
                      ? <td style={S.td} colSpan={2}><span style={S.pend}>도로 데이터 연계 전 — 수기입력</span></td>
                      : <><NameCell label={f.label} /><DistCell label={f.label} /></>}
                    <td style={S.blank} /><td style={S.blank} />
                  </tr>
                ))}
                {spec.summaryRow && (
                  <tr>
                    <td style={S.tdL} colSpan={4}>{spec.summaryRow}</td>
                    <td style={S.blank} /><td style={S.blank} />
                  </tr>
                )}
              </>)}

              {/* 주거편의 — 그룹별 판정, 그룹 아래 묶음 라벨 행 */}
              {spec.layout === 'grouped' && spec.groups.map(g => (
                <Fragment key={g.label}>
                  {g.facilities.map((f, i) => (
                    <tr key={f.label}>
                      <td style={S.tdL}>{f.label}</td>
                      <NameCell label={f.label} />
                      <DistCell label={f.label} />
                      {i === 0 && <td style={S.td} rowSpan={g.facilities.length}>{g.condition}</td>}
                      {i === 0 && <td style={S.blank} rowSpan={g.facilities.length} />}
                      {i === 0 && <td style={S.blank} rowSpan={g.facilities.length} />}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...S.td, background: '#eef2f7', fontWeight: 600 }} colSpan={spec.columns.length}>
                      {g.label}
                    </td>
                  </tr>
                </Fragment>
              ))}

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
                {spec.summaryRow && (
                  <tr>
                    <td style={S.tdL} colSpan={3}>{spec.summaryRow}</td>
                    <td style={S.blank} /><td style={S.blank} />
                  </tr>
                )}
              </>)}
            </tbody>
          </table>
        </div>

        {!facilities && <div style={S.formula}>사업지 주소를 입력하고 [반경시설 수집]을 누르면 채워집니다.</div>}

        {facilities && (
          <>
            <div style={S.secTitle}>증빙 — 반경원 지도</div>
            <div style={{ display: 'grid', gap: 14, marginBottom: 6 }}>
              {(spec.groups ? spec.groups.flatMap(g => g.facilities) : spec.facilities)
                .filter(f => !f.manual).map(f => {
                const h = hit(f.label);
                if (!h) return null;
                const n = h.nearest;
                return (
                  <RadiusMap
                    key={f.label}
                    title={f.label}
                    center={{ lat: Number(facilities.coord.y), lng: Number(facilities.coord.x) }}
                    radius={h.radius}
                    markers={n ? [{ lat: Number(n.y), lng: Number(n.x), name: n.name }] : []}
                    caption={n ? `최근접 ${n.name} · ${n.distance}m · 반경 내 ${h.count}건`
                               : `반경 ${h.radius}m 이내 부재`}
                  />
                );
              })}
            </div>

            <div style={S.secTitle}>증빙 — 반경내 시설 목록</div>
            {(spec.groups ? spec.groups.flatMap(g => g.facilities) : spec.facilities)
              .filter(f => !f.manual).map(f => {
              const h = hit(f.label);
              if (!h?.items?.length) return null;
              return (
                <div key={f.label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                    {f.label} <span style={{ color: T.muted, fontWeight: 400 }}>· 반경 {h.radius}m · {h.count}건</span>
                  </div>
                  <div style={S.scroll}>
                    <table style={S.table}>
                      <thead><tr>{['시설명', '거리', '분류', '주소'].map(c => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
                      <tbody>
                        {h.items.slice(0, 5).map((it, i) => (
                          <tr key={i}>
                            <td style={{ ...S.td, textAlign: 'left' }}>{it.name}</td>
                            <td style={i === 0 ? S.tdVal : S.td}>{it.distance}m</td>
                            <td style={{ ...S.td, textAlign: 'left', color: T.muted, fontSize: 11.5 }}>{it.category ?? '-'}</td>
                            <td style={{ ...S.td, textAlign: 'left', color: T.ink2 }}>{it.address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
