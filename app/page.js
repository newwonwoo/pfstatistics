'use client';
import { useState, useMemo, useEffect } from 'react';
import './globals.css';
import { SHEETS, buildSheet } from './sheets';
import { T } from './theme';
import Steps from './Steps';
import SheetTabs from './SheetTabs';
import SheetView from './SheetView';
import Overview from './Overview';
import SavedList from './SavedList';
import SourceHealth from './SourceHealth';
import PolygonDrawer from './PolygonDrawer';
import RegionPicker from './RegionPicker';
import CompanyPicker from './CompanyPicker';
import * as store from './storage';

const S = {
  shell: { maxWidth: 1200, margin: '0 auto', padding: '26px 20px 90px' },
  head: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 3 },
  h1: { fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-.025em' },
  tag: { fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentSoft, padding: '3px 8px', borderRadius: 4 },
  lead: { color: T.muted, margin: '0 0 18px', fontSize: 12.5 },

  panel: { background: T.panel, border: `1px solid ${T.line}`, borderRadius: T.radius, padding: 16, boxShadow: T.shadow, marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 11, alignItems: 'end' },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: '.02em' },
  input: { padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 13, background: '#fff', color: T.ink, width: '100%' },

  actions: { display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap', alignItems: 'center' },
  /** 버튼에 완료 상태를 달아 "어디까지 했는지"가 버튼만 봐도 보이게 한다 */
  btn: ({ busy, primary, done }) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700,
    cursor: busy ? 'wait' : 'pointer',
    border: done ? `1px solid ${T.ok}` : primary ? 0 : `1px solid ${T.line}`,
    background: done ? T.okSoft : primary ? (busy ? '#9aa1ab' : T.accent) : '#fff',
    color: done ? T.ok : primary ? '#fff' : T.ink,
  }),
  check: { fontSize: 11, fontWeight: 800 },
  dim: { color: T.muted },
  /** 주소 매칭 확인 — 어디를 사업지로 잡았는지 말없이 넘어가면 안 된다 */
  match: (sure) => ({
    marginTop: 11, padding: '9px 12px', borderRadius: 6, fontSize: 12.5, lineHeight: 1.6,
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    background: sure ? T.accentSoft : T.warnSoft,
    border: `1px solid ${sure ? '#c8d5fb' : '#f0dcb4'}`,
    color: sure ? T.ink2 : T.warn,
  }),
  matchSel: { padding: '5px 8px', border: `1px solid ${T.line}`, borderRadius: 5, fontSize: 12, background: '#fff', maxWidth: 460 },
  arrow: { color: T.muted, fontSize: 16, fontWeight: 700, userSelect: 'none' },
  spacer: { marginLeft: 'auto' },
  msg: (kind) => ({
    marginTop: 11, padding: '9px 12px', borderRadius: 6, fontSize: 12.5,
    background: kind === 'err' ? T.errSoft : kind === 'ok' ? T.okSoft : T.warnSoft,
    border: `1px solid ${kind === 'err' ? '#f5c6c2' : kind === 'ok' ? '#c7e9d5' : '#f0dcb4'}`,
    color: kind === 'err' ? T.err : kind === 'ok' ? T.ok : T.warn,
  }),
};

/** 반경시설 시트 — 수집도 화면도 이 단위로 움직인다 */
const POI_SHEETS = ['주거편의', '교통환경', '교육환경'];

/** "경기도 광주시" → { sido, sgg } (보관본 복원용) */
function splitRegion(r) {
  if (!r) return null;
  const i = String(r).indexOf(' ');
  return i < 0 ? { sido: r, sgg: '' } : { sido: r.slice(0, i), sgg: r.slice(i + 1) };
}

/** 후보 한 줄 표기 — 지번과 도로명을 같이 보여줘야 실무자가 판별할 수 있다 */
const addrLabel = (c) => {
  if (!c) return '-';
  const main = c.jibunAddress ?? c.roadAddress ?? c.placeName ?? '-';
  const sub = [c.placeName, c.jibunAddress && c.roadAddress ? c.roadAddress : null]
    .filter(Boolean).join(' · ');
  return sub ? `${main} (${sub})` : main;
};

export default function Home() {
  /*
   * 행정구역은 목록에서 고르고, 지번만 직접 친다.
   * 주소 한 칸에 통으로 받으면 "광주시"가 광주광역시로, "고성군"이 강원·경남 중
   * 아무데나 잡힐 수 있는데 사용자는 그걸 알 방법이 없다.
   */
  const [form, setForm] = useState({
    sido: '경기도', sgg: '광주시', detail: '탄벌동 203-4',
    ym: '202607', company: '제일건설(주)', year: '2025',
  });
  const [data, setData] = useState(null);           // 통계 수집 결과
  const [facilities, setFacilities] = useState(null); // 반경시설 수집 결과
  const [polygon, setPolygon] = useState(null);     // 사업지 경계 (3점 이상)
  const [coord, setCoord] = useState(null);         // 대표지번 좌표 — 지도 중심
  const [fixed, setFixed] = useState(false);        // 주소 확정 — 확정 후엔 입력을 잠근다
  const [latest, setLatest] = useState(null);       // 원천이 가진 최신 조회월
  const [ymManual, setYmManual] = useState(false);  // 조회월 직접 지정
  const [geo, setGeo] = useState(null);             // 주소 매칭 결과 (후보 포함)
  const [pick, setPick] = useState(0);              // 고른 후보
  const [manual, setManual] = useState({});         // 위성 육안 판정(6차선 등)
  /*
   * 반경을 어디서부터 잴지. 지도 안쪽 버튼으로만 두니 아무도 못 찾았다 —
   * 시트 상단으로 꺼내고, 경계가 없을 때도 왜 못 고르는지 보이게 한다.
   */
  const [radiusBasis, setRadiusBasis] = useState('polygon');
  const [tab, setTab] = useState('지역미분양');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [savedKey, setSavedKey] = useState(0);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  /*
   * 조회월은 사람이 칠 값이 아니다. 원천마다 공표 시차가 달라서
   * 이번 달을 넣으면 "자료 없음"이 난다(실측: 2026-09 기준 미분양 최신은 202607).
   * 최신 시점을 물어서 채운다.
   */
  useEffect(() => {
    let dead = false;
    fetch('/api/latest').then(r => r.json()).then(j => {
      if (dead || !j.ym) return;
      setLatest(j);
      setForm(f => (ymManual ? f : { ...f, ym: j.ym }));
    }).catch(() => {});
    return () => { dead = true; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // 통계는 시군구 단위, 지도는 지번까지 — 둘 다 고른 행정구역에서 만들어진다
  const region = [form.sido, form.sgg].filter(Boolean).join(' ');
  const addr = [region, form.detail].filter(Boolean).join(' ').trim();

  // ── 수집 ─────────────────────────────────────────────────
  async function collect() {
    if (!region) return setMsg({ kind: 'warn', text: '시도·시군구를 먼저 고르세요.' });
    // [직접] 로 바꾼 뒤 칸을 비우면 빈 값이 그대로 나갔다 — 여기서 막는다
    if (!/^\d{6}$/.test(String(form.ym).trim())) {
      return setMsg({
        kind: 'warn',
        text: `조회월이 비었거나 형식이 맞지 않습니다 (지금: "${form.ym}"). YYYYMM 6자리로 넣거나 [자동] 을 누르세요.`,
      });
    }
    setBusy('collect'); setMsg(null);
    try {
      const qs = new URLSearchParams({ sgg: region, ym: String(form.ym).trim(), company: form.company, year: form.year });
      const res = await fetch(`/api/collect?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '수집 실패');
      setData(j);
      setMsg({ kind: 'ok', text: `통계 ${j.okCount}/${j.total} 수집 완료` });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(null); }
  }

  /** 주소 확정 — 좌표를 잡고 입력을 잠근다. 바꾸려면 [초기화]. */
  async function locate() {
    if (!region) return setMsg({ kind: 'warn', text: '시도·시군구를 먼저 고르세요.' });
    setBusy('geo'); setMsg(null);
    try {
      const res = await fetch(`/api/facilities?addr=${encodeURIComponent(addr)}&region=${encodeURIComponent(region)}&only=none`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '주소 조회 실패');
      setGeo(j.geo); setPick(0);
      setCoord(j.coord);
      setFixed(true);
      const n = j.geo?.candidates?.length ?? 1;
      setMsg({
        kind: j.geo?.via === 'keyword' ? 'warn' : 'ok',
        text: j.geo?.via === 'keyword'
          ? '주소검색으로는 못 찾아 장소검색으로 잡았습니다 — 매칭이 맞는지 먼저 확인하세요.'
          : `주소 매칭 완료${n > 1 ? ` (후보 ${n}건 — 다르면 아래에서 고르세요)` : ''}. 지도에서 경계를 그린 뒤 수집하세요.`,
      });
    } catch (e) { setMsg({ kind: 'warn', text: e.message }); }
    finally { setBusy(null); }
  }

  /** 반경시설 수집 — 시트 단위로 나눠 받는다 (sheet 가 null 이면 전부) */
  async function collectPoi(sheet = null) {
    if (!fixed) return setMsg({ kind: 'warn', text: '사업지 주소를 먼저 확정하세요.' });
    setBusy(sheet ?? 'poi'); setMsg(null);
    try {
      const qs = new URLSearchParams({ addr });
      qs.set('region', region);
      if (sheet) qs.set('sheet', sheet);
      if (polygon?.length >= 3) qs.set('polygon', JSON.stringify(polygon));
      // 화면에서 확인·선택한 좌표를 그대로 쓴다 (서버가 다시 첫 결과를 고르지 않게)
      if (coord?.x && coord?.y) {
        qs.set('x', String(coord.x)); qs.set('y', String(coord.y));
        if (coord.roadAddress) qs.set('road', coord.roadAddress);
        if (coord.jibunAddress) qs.set('jibun', coord.jibunAddress);
      }
      const res = await fetch(`/api/facilities?${qs}`);
      const j = await res.json();
      if (res.status === 428) throw new Error(`${j.needKey} 미설정 — 베르셀 환경변수를 확인하세요.`);
      if (!res.ok) throw new Error(j.error ?? '시설 수집 실패');
      // 시트별로 받으므로 이전 결과 위에 덮어쓴다 (좌표·기준은 최신 응답을 따른다)
      setFacilities(prev => (prev
        ? { ...prev, ...j, facilities: { ...prev.facilities, ...j.facilities } }
        : j));
      setCoord(j.coord);
      setTab(sheet ?? '교통환경');
      const n = Object.values(j.facilities ?? {}).filter(v => v.nearest).length;
      setMsg({
        kind: 'ok',
        text: `${sheet ?? '반경시설'} 수집 완료 — ${n}종 확인 · ${j.basis === 'polygon' ? '사업지 경계 기준' : '대표지번 중심점 기준'}`,
      });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(null); }
  }

  /** 초기화 — 사업지를 바꾸려면 여기서부터 다시 시작한다 */
  function resetSite() {
    setFixed(false); setGeo(null); setPick(0);
    setCoord(null); setPolygon(null); setFacilities(null); setData(null);
    setMsg({ kind: 'warn', text: '사업지를 초기화했습니다. 시도·시군구부터 다시 지정하세요.' });
  }

  // ── 보관 / 내보내기 ───────────────────────────────────────
  function saveRecord() {
    if (!data) return;
    const ok = store.save({ data, facilities, addr, manual });
    setSavedKey(k => k + 1);
    setMsg(ok
      ? { kind: 'ok', text: `이 브라우저에 보관했습니다 — ${data.region} · ${data.period}` }
      : { kind: 'err', text: '보관 실패 (브라우저 저장소 사용 불가)' });
  }

  function openRecord(rec) {
    if (!rec) return;
    setData(rec.data);
    setFacilities(rec.facilities ?? null);
    setPolygon(rec.facilities?.polygon ?? null);
    setCoord(rec.facilities?.coord ?? null);
    setGeo(rec.facilities?.geo ?? null); setPick(0);
    setFixed(Boolean(rec.facilities?.coord));
    setManual(rec.manual ?? {});
    setForm(f => ({
      ...f,
      ...splitRegion(rec.region) ?? {},
      // 보관본 주소에서 행정구역을 뺀 나머지가 지번이다
      detail: rec.addr && rec.region && rec.addr.startsWith(rec.region)
        ? rec.addr.slice(rec.region.length).trim()
        : f.detail,
      ym: rec.period ?? f.ym, company: rec.company ?? f.company,
    }));
    setMsg({ kind: 'warn', text: `보관본을 불러왔습니다 (${new Date(rec.savedAt).toLocaleString('ko-KR')} 보관)` });
  }

  async function exportXlsx() {
    if (!data) return;
    setBusy('xlsx'); setMsg(null);
    try {
      const { exportWorkbook } = await import('./exportExcel');
      await exportWorkbook({
        data, facilities, manual, sheets: SHEETS, buildSheet,
        getCardEl: (id) => document.querySelector(`[data-evidence="${id}"]`),
        onProgress: (label) => setMsg({ kind: 'warn', text: `엑셀 생성 중 — ${label}` }),
      });
      setMsg({ kind: 'ok', text: '엑셀을 내려받았습니다.' });
    } catch (e) {
      setMsg({ kind: 'err', text: `엑셀 생성 실패: ${e.message}` });
    } finally { setBusy(null); }
  }

  // ── 진행 상태 ─────────────────────────────────────────────
  /** 그 시트의 시설이 하나라도 수집됐는지 — 시트별 버튼의 완료표시 근거 */
  const poiDone = (sheet) =>
    Object.values(facilities?.facilities ?? {}).some(v => v.sheet === sheet);
  const allPoi = POI_SHEETS.every(poiDone);

  const done = [
    ...(fixed ? ['input'] : []),
    ...(polygon?.length >= 3 ? ['boundary'] : []),
    ...(data && allPoi ? ['collect'] : []),
  ];
  const current = !fixed ? 'input'
    : !coord && !data ? 'boundary'
    : !data || !allPoi ? 'collect'
    : 'result';

  const status = useMemo(() => {
    const m = {};
    if (data) for (const r of data.results) m[r.sheet] = r.ok ? 'ok' : (m[r.sheet] ?? 'none');
    for (const sh of POI_SHEETS) {
      if (Object.values(facilities?.facilities ?? {}).some(v => v.sheet === sh)) m[sh] = 'ok';
    }
    return m;
  }, [data, facilities]);

  return (
    <main style={S.shell}>
      <div style={S.head}>
        <h1 style={S.h1}>PF 보증심사 통계 자동수집</h1>
        <span style={S.tag}>원천 직결</span>
      </div>
      <p style={S.lead}>사업장 시군구를 입력하면 심사에 필요한 수치와 증빙을 원천에서 직접 수집합니다.</p>

      <SourceHealth />
      <Steps current={current} done={done} />

      <div style={S.panel}>
        <div style={S.grid}>
          <div style={{ gridColumn: 'span 2' }}>
            <RegionPicker
              disabled={fixed}
              sido={form.sido}
              sgg={form.sgg}
              onChange={({ sido, sgg }) => {
                setForm(f => ({ ...f, sido, sgg }));
                // 행정구역이 바뀌면 이전 좌표·경계·수집결과는 더 이상 이 사업지 것이 아니다
                setGeo(null); setCoord(null); setPolygon(null); setFacilities(null);
              }}
            />
          </div>
          <div style={{ ...S.field, gridColumn: 'span 2' }}>
            <label style={S.label}>
              지번 · 상세 <span style={{ color: T.muted, fontWeight: 400 }}>(비워도 시군구 중심으로 잡힙니다)</span>
            </label>
            <input style={S.input} value={form.detail} onChange={set('detail')} placeholder="탄벌동 203-4"
              disabled={fixed} />
          </div>
          <div style={S.field}>
            <label style={S.label}>
              조회월
              {!ymManual && latest && <span style={{ color: T.accent }}> · 자동 (원천 최신)</span>}
              {!ymManual && !latest && <span style={S.dim}> · 확인 중…</span>}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...S.input, ...(ymManual ? null : { background: T.accentSoft, borderColor: T.accent }) }}
                value={form.ym} onChange={set('ym')} placeholder="202607"
                readOnly={!ymManual} disabled={fixed}
              />
              <button
                style={{ ...S.btn({}), padding: '8px 10px', fontSize: 11.5, whiteSpace: 'nowrap' }}
                onClick={() => {
                  if (ymManual && latest) setForm(f => ({ ...f, ym: latest.ym }));
                  setYmManual(m => !m);
                }}
                disabled={fixed}
              >{ymManual ? '자동' : '직접'}</button>
            </div>
          </div>
          <CompanyPicker
            value={form.company}
            year={form.year}
            disabled={fixed}
            onChange={(v) => setForm(f => ({ ...f, company: v }))}
          />
          <div style={S.field}>
            <label style={S.label}>평가연도</label>
            <input style={S.input} value={form.year} onChange={set('year')} />
          </div>
        </div>

        {/*
          주소를 넣으면 카카오 주소검색이 좌표를 준다. 그런데 동명이동·표기차가 있으면
          엉뚱한 곳을 사업지로 잡고도 알 방법이 없다 — 반경시설이 통째로 틀어진다.
          그래서 무엇으로 매칭됐는지 보여주고, 후보가 여러 개면 고르게 한다.
        */}
        <div style={{ marginTop: 9, fontSize: 12, color: T.muted }}>
          조회 주소 : <b style={{ color: T.ink2 }}>{addr || '(시도·시군구를 고르세요)'}</b>
          {latest && !ymManual && (
            <span> · 조회월 {latest.ym} 는 {latest.source} 기준 최신입니다</span>
          )}
        </div>

        {geo && (
          <div style={S.match(geo.via === 'address' && !geo.outOfRegion && geo.candidates.length === 1)}>
            <span>
              사업지 매칭 : <b>{addrLabel(geo.candidates[pick])}</b>
              {geo.normalized && <span style={{ color: T.muted }}> · 조회어 「{geo.query}」로 정리</span>}
              {geo.via === 'keyword' && <span> · 주소검색 0건 → 장소검색 결과라 확인이 필요합니다</span>}
              {geo.outOfRegion && <span> · <b>고른 시군구 밖 결과입니다</b> — 지번을 확인하세요</span>}
              {geo.dropped > 0 && !geo.outOfRegion && (
                <span style={{ color: T.muted }}> · 시군구 밖 후보 {geo.dropped}건 제외</span>
              )}
            </span>
            {geo.candidates.length > 1 && (
              <select
                style={S.matchSel}
                value={pick}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setPick(i); setCoord(geo.candidates[i]);
                  setPolygon(null); setFacilities(null);   // 기준점이 바뀌면 경계·수집결과는 무효
                }}
              >
                {geo.candidates.map((c, i) => (
                  <option key={i} value={i}>{i + 1}. {addrLabel(c)}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/*
          순서: 사업지 경계 → 통계 수집 → 반경시설 수집.
          주소를 넣고 사업지를 확정한 뒤 수집하는 흐름이 실무 순서와 맞다.
          (통계는 시군구 단위라 경계와 무관하지만, 사업지를 먼저 확정하는 편이 읽기 쉽다)
        */}
        {/*
          흐름: 주소 확정 → (경계) → 통계 → 시트별 반경시설.
          확정 전에는 뒤 단계를 아예 못 누르게 한다 — 어떤 사업지 기준인지 모르는 채로
          수집이 돌아가면 결과를 믿을 수 없다.
        */}
        <div style={S.actions}>
          {!fixed ? (
            <button style={S.btn({ busy: busy === 'geo', primary: true })} onClick={locate} disabled={!!busy}>
              {busy === 'geo' ? '주소 확인 중…' : '주소 확정'}
            </button>
          ) : (
            <>
              <button style={S.btn({ done: true })} onClick={resetSite} disabled={!!busy}>
                <span style={S.check}>✓</span> 주소 확정됨 — 초기화
              </button>

              <span style={S.arrow}>›</span>

              <button
                style={S.btn({ busy: busy === 'collect', primary: !data, done: !!data })}
                onClick={collect} disabled={!!busy}
              >
                {data && <span style={S.check}>✓</span>}
                {busy === 'collect' ? '수집 중…' : data ? `통계 수집 (${data.okCount}/${data.total})` : '통계 수집'}
              </button>

              <span style={S.arrow}>›</span>

              {POI_SHEETS.map(sh => (
                <button
                  key={sh}
                  style={S.btn({ busy: busy === sh, primary: !!data && !poiDone(sh), done: poiDone(sh) })}
                  onClick={() => collectPoi(sh)} disabled={!!busy}
                >
                  {poiDone(sh) && <span style={S.check}>✓</span>}
                  {busy === sh ? '수집 중…' : `${sh} 수집`}
                </button>
              ))}
            </>
          )}

          {data && fixed && (
            <>
              <button style={{ ...S.btn({}), ...S.spacer }} onClick={saveRecord} disabled={!!busy}>
                이 조회 보관
              </button>
              <button style={S.btn({ busy: busy === 'xlsx' })} onClick={exportXlsx} disabled={!!busy}>
                {busy === 'xlsx' ? '생성 중…' : '엑셀 다운로드'}
              </button>
            </>
          )}
        </div>

        {msg && <div style={S.msg(msg.kind)}>{msg.text}</div>}
      </div>

      {/*
        경계 그리기는 주소 확정 **바로 다음** 동작이다.
        사이에 보관 목록이 끼면 흐름이 끊긴다 — 순서를 흐름대로 둔다.
      */}
      {coord && (
        <PolygonDrawer
          center={{ lat: Number(coord.y), lng: Number(coord.x) }}
          polygon={polygon}
          onChange={setPolygon}
          onConfirm={() => collectPoi(null)}
          confirmed={!!facilities}
          busy={busy === 'poi' || POI_SHEETS.includes(busy)}
        />
      )}

      <SavedList onOpen={openRecord} refreshKey={savedKey} />

      {data && <Overview data={data} onJump={setTab} />}

      <div style={{ marginTop: 20 }}>
        <SheetTabs sheets={SHEETS} active={tab} onSelect={setTab} status={status} />
        {/*
          모든 시트를 항상 마운트해 둔다.
          엑셀 내보내기가 각 시트의 증빙 카드와 지도를 캡쳐하는데,
          display:none 이면 캡쳐가 빈 이미지로 나온다.
          그래서 비활성 시트는 화면 밖으로 밀어 두되 레이아웃은 살려둔다.
        */}
        {SHEETS.map(s => (
          <div
            key={s.id}
            aria-hidden={s.id !== tab}
            style={s.id === tab ? undefined : {
              position: 'absolute', left: -99999, top: 0, width: 1100, pointerEvents: 'none',
            }}
          >
            <SheetView
              sheetId={s.id} data={data} facilities={facilities}
              radiusBasis={radiusBasis} onRadiusBasis={setRadiusBasis}
              manual={manual}
              onManual={(label, v) => setManual(m => ({ ...m, [label]: v }))}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
