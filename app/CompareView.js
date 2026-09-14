'use client';
import { useMemo, useState } from 'react';
import { T, mono } from './theme';
import RadiusMap from './RadiusMap';

/**
 * 비교사업장.
 *
 * 사업지 반경 안에서 **분양한 아파트**를 찾아 전용면적 기준 ㎡당 분양가를 보여주고,
 * 실무자가 몇 곳을 골라 그 산술평균을 쓰게 한다 — 심사에서 분양가 적정성을 볼 때
 * 지금은 청약홈을 하나씩 열어 손으로 계산하는 일이다.
 *
 * 원천은 한국부동산원 청약홈 분양정보(공공데이터포털). 분양가를 전국 단위로
 * 주는 공공 원천은 여기뿐이다 — 실거래는 이미 팔린 값이고, KB시세는 기축이다.
 */
const S = {
  page: { background: T.panel, border: `1px solid ${T.lineStrong}`, borderTop: 0, borderRadius: `0 0 ${T.radius}px ${T.radius}px`, padding: '22px 24px 26px' },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' },
  subject: { fontSize: 12.5, color: T.ink2, margin: '0 0 16px' },
  bar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  seg: { display: 'inline-flex', border: `1px solid ${T.lineStrong}`, borderRadius: 6, overflow: 'hidden' },
  segBtn: (on) => ({
    padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 0, cursor: 'pointer',
    background: on ? T.accent : '#fff', color: on ? '#fff' : T.ink2,
  }),
  go: (busy) => ({
    padding: '7px 16px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, cursor: busy ? 'progress' : 'pointer',
    border: `1px solid ${T.accent}`, background: busy ? '#dfe6ef' : T.accent, color: busy ? T.muted : '#fff',
  }),
  label: { fontSize: 11.5, color: T.muted },
  sum: {
    display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
    padding: '14px 18px', marginBottom: 16, borderRadius: 8,
    background: '#f4f8ff', border: `1px solid #cfdcf0`,
  },
  sumNum: { fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', ...mono },
  sumUnit: { fontSize: 13, color: T.ink2, fontWeight: 700 },
  sumNote: { fontSize: 11.5, color: T.muted, marginLeft: 'auto', textAlign: 'right', lineHeight: 1.6 },
  scroll: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', fontSize: 12.5, width: '100%', minWidth: 780 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 10px', fontWeight: 600, whiteSpace: 'nowrap', color: T.ink },
  td: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'center', ...mono },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'left' },
  tdVal: { border: `1px solid ${T.sheetLine}`, padding: '7px 10px', textAlign: 'right', fontWeight: 700, background: '#fffdf0', ...mono },
  rowOn: { background: '#eef5ff' },
  empty: { padding: '40px 20px', textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.8 },
  warn: { padding: '12px 14px', background: T.warnSoft, border: '1px solid #f0dcb4', borderRadius: 6, fontSize: 12.5, color: T.warn, lineHeight: 1.6 },
  secTitle: { fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '.04em', margin: '26px 0 12px', paddingTop: 18, borderTop: `1px solid ${T.line}` },
  note: { marginTop: 10, fontSize: 11.5, color: T.muted, lineHeight: 1.7 },
  link: { color: T.accent, textDecoration: 'none' },
};

const won = (v) => (v == null ? '-' : Math.round(v).toLocaleString('ko-KR'));
const m2 = (v) => (v == null ? '-' : v.toFixed(2));
const RADII = [1000, 2000, 3000];
const rLabel = (r) => `${r / 1000}km`;

export default function CompareView({ addr, coord, region, polygon, radiusBasis, value, onChange }) {
  const [radius, setRadius] = useState(value?.radius ?? 2000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // 단지 대표단가를 세대수로 가중할지 주택형 단순평균으로 할지 — 실무 관행이 갈린다
  const [mode, setMode] = useState(value?.mode ?? 'weighted');

  const data = value?.data ?? null;
  const picked = value?.picked ?? [];
  const set = (patch) => onChange?.({ radius, mode, data, picked, ...patch });

  const priceOf = (a) => (mode === 'weighted' ? a.weighted : a.simple);

  const collect = async () => {
    if (!coord) { setErr('사업지 주소를 먼저 확정하세요'); return; }
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams({
        x: String(coord.x), y: String(coord.y), region, radius: String(radius),
      });
      if (polygon?.length >= 3) qs.set('polygon', JSON.stringify(polygon));
      const res = await fetch(`/api/apts?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `수집 실패 (${res.status})`);
      set({ radius, data: j, picked: [] });
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  const items = data?.items ?? [];
  const chosen = useMemo(() => items.filter(a => picked.includes(a.manageNo)), [items, picked]);

  /* 3번 요구 — 고른 단지들의 **산술평균**. 단지 안에서는 가중/단순을 고를 수 있게 했다 */
  const avg = useMemo(() => {
    const vals = chosen.map(priceOf).filter(v => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }, [chosen, mode]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (no) =>
    set({ picked: picked.includes(no) ? picked.filter(v => v !== no) : [...picked, no] });

  const markers = useMemo(() => items.map((a, i) => ({
    no: i + 1, lat: a.y, lng: a.x, name: a.name, distance: a.distance,
  })), [items]);

  return (
    <div style={S.page}>
      <h2 style={S.h2}>비교사업장</h2>
      <p style={S.subject}>▶ 사업지 : {addr ?? '주소 미확정'}</p>

      <div style={S.bar}>
        <span style={S.label}>반경</span>
        <span style={S.seg}>
          {RADII.map(r => (
            <button key={r} style={S.segBtn(r === radius)}
              onClick={() => { setRadius(r); set({ radius: r }); }}>{rLabel(r)}</button>
          ))}
        </span>
        <button style={S.go(busy)} onClick={collect} disabled={busy || !coord}>
          {busy ? '수집 중…' : `반경 ${rLabel(radius)} 분양단지 수집`}
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.label}>단지 대표단가</span>
          <span style={S.seg}>
            <button style={S.segBtn(mode === 'weighted')}
              title="주택형별 세대수로 가중한 평균 — 실제 분양수입에 가깝다"
              onClick={() => { setMode('weighted'); set({ mode: 'weighted' }); }}>세대수 가중</button>
            <button style={S.segBtn(mode === 'simple')}
              title="주택형별 단가의 단순평균"
              onClick={() => { setMode('simple'); set({ mode: 'simple' }); }}>단순평균</button>
          </span>
        </span>
      </div>

      {err && <div style={S.warn}>{err}</div>}

      {/* 2·3번 요구 — 고르는 즉시 산술평균이 바뀐다 */}
      <div style={S.sum}>
        <span style={S.sumUnit}>선택 {chosen.length}곳 산술평균</span>
        <span style={{ ...S.sumNum, color: avg == null ? T.muted : T.ink }}>
          {avg == null ? '—' : won(avg)}
        </span>
        <span style={S.sumUnit}>원/㎡ <span style={{ color: T.muted, fontWeight: 400 }}>(전용면적 기준)</span></span>
        <span style={S.sumNote}>
          {avg != null && <>평당 약 {won(avg * 3.305785)} 원 · 3.3㎡ 환산<br /></>}
          단지 대표단가 : {mode === 'weighted' ? '세대수 가중평균' : '주택형 단순평균'}
        </span>
      </div>

      {!data && (
        <div style={S.empty}>
          사업지 주소를 확정한 뒤 반경을 고르고 [수집] 을 누르세요.<br />
          <span style={{ fontSize: 12 }}>한국부동산원 청약홈 분양정보에서 반경 안의 분양 단지를 찾습니다.</span>
        </div>
      )}

      {data && items.length === 0 && (
        <div style={S.warn}>
          반경 {rLabel(data.radius)} 안에 분양공고 이력이 있는 단지가 없습니다
          ({data.sido} 공고 {data.scanned}건 조회). 반경을 넓혀 보세요.
        </div>
      )}

      {items.length > 0 && (<>
        <div style={S.scroll}>
          <table style={S.table}>
            <thead><tr>
              {['선택', '#', '단지명', '주소', '거리', '공고일', '공급세대', '전용면적', '분양가(원/㎡)'].map(c =>
                <th key={c} style={S.th}>{c}</th>)}
            </tr></thead>
            <tbody>
              {items.map((a, i) => {
                const on = picked.includes(a.manageNo);
                return (
                  <tr key={a.manageNo} style={on ? S.rowOn : undefined}>
                    <td style={S.td}>
                      <input type="checkbox" checked={on} onChange={() => toggle(a.manageNo)} />
                    </td>
                    <td style={S.td}>{i + 1}</td>
                    <td style={S.tdL}>
                      {a.url ? <a href={a.url} target="_blank" rel="noreferrer" style={S.link}>{a.name}</a> : a.name}
                      {a.builder && <span style={{ color: T.muted, fontSize: 11 }}> · {a.builder}</span>}
                    </td>
                    <td style={S.tdL}>{a.address}</td>
                    <td style={S.td}>{a.distance}m</td>
                    <td style={S.td}>{a.noticeDate}</td>
                    <td style={S.td}>{a.totalHouseholds?.toLocaleString('ko-KR') ?? '-'}</td>
                    <td style={S.td}>{a.areaMin ? `${m2(a.areaMin)}~${m2(a.areaMax)}㎡` : '-'}</td>
                    <td style={S.tdVal}>{won(priceOf(a))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={S.note}>
          {data.source?.citation}<br />
          거리는 {data.basis === 'polygon' ? '사업지 경계 최단거리' : '대표지번 중심'} 기준입니다.
          같은 단지가 재공고(조합원 취소분 등)로 여러 건 올라오면 <b>최신 공고 1건</b>만 남깁니다.
        </p>

        <div style={S.secTitle}>반경 {rLabel(data.radius)} 분양단지 위치</div>
        <RadiusMap
          title={`비교사업장 · 반경 ${rLabel(data.radius)}`}
          center={{ lat: Number(coord.y), lng: Number(coord.x) }}
          radius={data.radius}
          markers={markers}
          polygon={polygon}
          radiusBasis={radiusBasis}
          defaultMapType="ROADMAP"
          caption={`핀 번호 = 위 표의 #`}
        />

        {/* 4번 요구 — 고른 단지의 면적별 세대수·분양가를 별도 그리드로 */}
        <div style={S.secTitle}>선택 단지 상세 (면적별)</div>
        {chosen.length === 0
          ? <div style={S.empty}>위 표에서 단지를 선택하면 면적별 세대수와 분양가가 여기 표시됩니다.</div>
          : (
            <div style={S.scroll}>
              <table style={S.table}>
                <thead><tr>
                  {['단지명', '주소', '주택형', '전용면적(㎡)', '세대수', '분양최고금액(원)', '원/㎡'].map(c =>
                    <th key={c} style={S.th}>{c}</th>)}
                </tr></thead>
                <tbody>
                  {chosen.flatMap(a => {
                    const rows = a.types.length ? a.types : [null];
                    return rows.map((t, i) => (
                      <tr key={`${a.manageNo}-${i}`}>
                        {i === 0 && <td style={S.tdL} rowSpan={rows.length}>{a.name}</td>}
                        {i === 0 && <td style={S.tdL} rowSpan={rows.length}>{a.address}</td>}
                        <td style={S.td}>{t?.type ?? '-'}</td>
                        <td style={S.td}>{m2(t?.area)}</td>
                        <td style={S.td}>{t ? t.households.toLocaleString('ko-KR') : '-'}</td>
                        <td style={S.td}>{won(t?.amount)}</td>
                        <td style={S.tdVal}>{won(t?.unitPrice)}</td>
                      </tr>
                    ));
                  })}
                  {chosen.map(a => (
                    <tr key={`sum-${a.manageNo}`}>
                      <td style={S.tdL} colSpan={4}>
                        <b>{a.name}</b> 계 · {mode === 'weighted' ? '세대수 가중' : '단순'}평균
                      </td>
                      <td style={S.td}>{a.households?.toLocaleString('ko-KR') ?? '-'}</td>
                      <td style={S.td}>-</td>
                      <td style={S.tdVal}>{won(priceOf(a))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </>)}
    </div>
  );
}
