'use client';
import { useState, useMemo } from 'react';
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
  arrow: { color: T.muted, fontSize: 16, fontWeight: 700, userSelect: 'none' },
  spacer: { marginLeft: 'auto' },
  msg: (kind) => ({
    marginTop: 11, padding: '9px 12px', borderRadius: 6, fontSize: 12.5,
    background: kind === 'err' ? T.errSoft : kind === 'ok' ? T.okSoft : T.warnSoft,
    border: `1px solid ${kind === 'err' ? '#f5c6c2' : kind === 'ok' ? '#c7e9d5' : '#f0dcb4'}`,
    color: kind === 'err' ? T.err : kind === 'ok' ? T.ok : T.warn,
  }),
};

export default function Home() {
  const [form, setForm] = useState({
    addr: '경기도 광주시 탄벌동 203-4',
    sgg: '경기도 광주시', ym: '202607',
    company: '제일건설(주)', year: '2025',
  });
  const [data, setData] = useState(null);           // 통계 수집 결과
  const [facilities, setFacilities] = useState(null); // 반경시설 수집 결과
  const [polygon, setPolygon] = useState(null);     // 사업지 경계 (3점 이상)
  const [coord, setCoord] = useState(null);         // 대표지번 좌표 — 지도 중심
  const [manual, setManual] = useState({});         // 위성 육안 판정(6차선 등)
  const [tab, setTab] = useState('지역미분양');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [savedKey, setSavedKey] = useState(0);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // ── 수집 ─────────────────────────────────────────────────
  async function collect() {
    setBusy('collect'); setMsg(null);
    try {
      const qs = new URLSearchParams({ sgg: form.sgg, ym: form.ym, company: form.company, year: form.year });
      const res = await fetch(`/api/collect?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '수집 실패');
      setData(j);
      setMsg({ kind: 'ok', text: `통계 ${j.okCount}/${j.total} 수집 완료` });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(null); }
  }

  /** 주소 → 좌표만 잡아 지도를 띄운다 (경계를 그린 뒤 수집하기 위해) */
  async function locate() {
    setBusy('geo'); setMsg(null);
    try {
      const res = await fetch(`/api/facilities?addr=${encodeURIComponent(form.addr)}&only=none`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '주소 조회 실패');
      setCoord(j.coord);
      setMsg({ kind: 'warn', text: '지도에서 사업지 경계를 그린 뒤, 지도 아래 버튼으로 수집하세요. (경계는 생략해도 됩니다)' });
    } catch (e) { setMsg({ kind: 'warn', text: e.message }); }
    finally { setBusy(null); }
  }

  async function collectPoi() {
    setBusy('poi'); setMsg(null);
    try {
      const qs = new URLSearchParams({ addr: form.addr });
      if (polygon?.length >= 3) qs.set('polygon', JSON.stringify(polygon));
      const res = await fetch(`/api/facilities?${qs}`);
      const j = await res.json();
      if (res.status === 428) throw new Error(`${j.needKey} 미설정 — 베르셀 환경변수를 확인하세요.`);
      if (!res.ok) throw new Error(j.error ?? '시설 수집 실패');
      setFacilities(j);
      setCoord(j.coord);
      setTab('교통환경');
      const n = Object.values(j.facilities ?? {}).filter(v => v.nearest).length;
      setMsg({
        kind: 'ok',
        text: `반경시설 수집 완료 — ${n}종 확인 · ${j.basis === 'polygon' ? '사업지 경계 기준' : '대표지번 중심점 기준'}`,
      });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(null); }
  }

  // ── 보관 / 내보내기 ───────────────────────────────────────
  function saveRecord() {
    if (!data) return;
    const ok = store.save({ data, facilities, addr: form.addr, manual });
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
    setManual(rec.manual ?? {});
    setForm(f => ({
      ...f,
      addr: rec.addr ?? f.addr, sgg: rec.region ?? f.sgg,
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
  const done = [
    'input',
    ...(polygon?.length >= 3 ? ['boundary'] : []),
    ...(data && facilities ? ['collect'] : []),
  ];
  const current = !coord && !data ? 'boundary'
    : !data ? 'collect'
    : !facilities ? 'collect'
    : 'result';

  const status = useMemo(() => {
    const m = {};
    if (data) for (const r of data.results) m[r.sheet] = r.ok ? 'ok' : (m[r.sheet] ?? 'none');
    if (facilities) for (const s of ['교통환경', '주거편의', '교육환경']) m[s] = 'ok';
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
          <div style={{ ...S.field, gridColumn: 'span 2' }}>
            <label style={S.label}>사업지 주소</label>
            <input style={S.input} value={form.addr} onChange={set('addr')} placeholder="경기도 광주시 탄벌동 203-4" />
          </div>
          <div style={S.field}>
            <label style={S.label}>시군구</label>
            <input style={S.input} value={form.sgg} onChange={set('sgg')} />
          </div>
          <div style={S.field}>
            <label style={S.label}>조회월</label>
            <input style={S.input} value={form.ym} onChange={set('ym')} placeholder="202607" />
          </div>
          <div style={S.field}>
            <label style={S.label}>시공사</label>
            <input style={S.input} value={form.company} onChange={set('company')} />
          </div>
          <div style={S.field}>
            <label style={S.label}>평가연도</label>
            <input style={S.input} value={form.year} onChange={set('year')} />
          </div>
        </div>

        {/*
          순서: 사업지 경계 → 통계 수집 → 반경시설 수집.
          주소를 넣고 사업지를 확정한 뒤 수집하는 흐름이 실무 순서와 맞다.
          (통계는 시군구 단위라 경계와 무관하지만, 사업지를 먼저 확정하는 편이 읽기 쉽다)
        */}
        <div style={S.actions}>
          <button
            style={S.btn({ busy: busy === 'geo', primary: !coord && !data, done: polygon?.length >= 3 })}
            onClick={locate} disabled={!!busy}
          >
            {polygon?.length >= 3 && <span style={S.check}>✓</span>}
            {busy === 'geo' ? '조회 중…'
              : polygon?.length >= 3 ? `사업지 경계 (${polygon.length}점)` : '사업지 경계 지정'}
          </button>

          <span style={S.arrow}>›</span>

          <button
            style={S.btn({ busy: busy === 'collect', primary: !data && (coord || polygon), done: !!data })}
            onClick={collect} disabled={!!busy}
          >
            {data && <span style={S.check}>✓</span>}
            {busy === 'collect' ? '수집 중…' : data ? `통계 수집 (${data.okCount}/${data.total})` : '통계 수집'}
          </button>

          <span style={S.arrow}>›</span>

          <button
            style={S.btn({ busy: busy === 'poi', primary: !!data && !facilities, done: !!facilities })}
            onClick={collectPoi} disabled={!!busy}
          >
            {facilities && <span style={S.check}>✓</span>}
            {busy === 'poi' ? '수집 중…' : facilities ? '반경시설 수집 완료' : '반경시설 수집'}
          </button>

          {data && (
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

      <SavedList onOpen={openRecord} refreshKey={savedKey} />

      {coord && (
        <PolygonDrawer
          center={{ lat: Number(coord.y), lng: Number(coord.x) }}
          polygon={polygon}
          onChange={setPolygon}
          onConfirm={collectPoi}
          confirmed={!!facilities}
          busy={busy === 'poi'}
        />
      )}

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
              manual={manual}
              onManual={(label, v) => setManual(m => ({ ...m, [label]: v }))}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
