'use client';
import { buildSheet } from './sheets';
import { T, mono } from './theme';
import EvidenceCard from './EvidenceCard';

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

  // 반경시설 시트 — /api/facilities 결과로 시설명·거리를 채운다
  if (spec.poi) {
    return (
      <div style={S.page}>
        <h2 style={S.h2}>{spec.title}</h2>
        <p style={S.subject}>▶ 사업지 : {facilities?.address ?? spec.subject}</p>
        <div style={S.scroll}>
          <table style={S.table}>
            <thead><tr>{spec.columns.map(c => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
            <tbody>
              {spec.facilities.map((f) => {
                const hit = facilities?.facilities?.[f.label];
                const near = hit?.nearest;
                return (
                  <tr key={f.label}>
                    <td style={S.tdL}>{f.label}</td>
                    <td style={S.td}>{f.criteria}</td>
                    {f.manual
                      ? <><td style={S.td} colSpan={2}><span style={S.pend}>도로 데이터 연계 전 — 수기입력</span></td></>
                      : <>
                          <Cell v={near ? near.name : (facilities ? '부재' : null)} highlight={!!near} />
                          <Cell v={near ? `${near.distance}m` : (facilities ? '-' : null)} />
                        </>}
                    <td style={S.blank} />
                    <td style={S.blank} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!facilities && <div style={S.formula}>사업지 주소를 입력하고 [반경시설 수집]을 누르면 채워집니다.</div>}

        {facilities && (
          <>
            <div style={S.secTitle}>증빙 — 반경내 시설 목록</div>
            {spec.facilities.filter(f => !f.manual).map(f => {
              const hit = facilities.facilities?.[f.label];
              if (!hit?.items?.length) return null;
              return (
                <div key={f.label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                    {f.label} <span style={{ color: T.muted, fontWeight: 400 }}>· 반경 {hit.radius}m · {hit.count}건</span>
                  </div>
                  <div style={S.scroll}>
                    <table style={S.table}>
                      <thead><tr>{['시설명', '거리', '주소'].map(c => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
                      <tbody>
                        {hit.items.slice(0, 5).map((it, i) => (
                          <tr key={i}>
                            <td style={{ ...S.td, textAlign: 'left' }}>{it.name}</td>
                            <td style={i === 0 ? S.tdVal : S.td}>{it.distance}m</td>
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
