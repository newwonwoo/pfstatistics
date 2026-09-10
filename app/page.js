'use client';
import { useState, useMemo } from 'react';
import './globals.css';
import { SHEETS } from './sheets';
import { T } from './theme';
import SheetTabs from './SheetTabs';
import SheetView from './SheetView';
import Overview from './Overview';

const S = {
  shell: { maxWidth: 1200, margin: '0 auto', padding: '26px 20px 90px' },
  head: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 3 },
  h1: { fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-.025em' },
  tag: { fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentSoft, padding: '3px 8px', borderRadius: 4 },
  lead: { color: T.muted, margin: '0 0 20px', fontSize: 12.5 },
  bar: { background: T.panel, border: `1px solid ${T.line}`, borderRadius: T.radius, padding: 16, boxShadow: T.shadow, marginBottom: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 11, alignItems: 'end' },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: '.02em' },
  input: { padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 13, background: '#fff', color: T.ink, width: '100%' },
  actions: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: (busy, primary) => ({
    padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
    border: primary ? 0 : `1px solid ${T.line}`,
    background: primary ? (busy ? '#9aa1ab' : T.accent) : '#fff',
    color: primary ? '#fff' : T.ink,
  }),
  msg: (kind) => ({
    marginTop: 11, padding: '9px 12px', borderRadius: 6, fontSize: 12.5,
    background: kind === 'err' ? T.errSoft : T.warnSoft,
    border: `1px solid ${kind === 'err' ? '#f5c6c2' : '#f0dcb4'}`,
    color: kind === 'err' ? T.err : T.warn,
  }),
};

export default function Home() {
  const [form, setForm] = useState({
    addr: '경기도 광주시 탄벌동 203-4',
    sgg: '경기도 광주시', ym: '202607',
    company: '제일건설(주)', year: '2025',
  });
  const [data, setData] = useState(null);
  const [facilities, setFacilities] = useState(null);
  const [tab, setTab] = useState('지역미분양');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function collect() {
    setBusy('collect'); setMsg(null);
    try {
      const qs = new URLSearchParams({ sgg: form.sgg, ym: form.ym, company: form.company, year: form.year });
      const res = await fetch(`/api/collect?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '수집 실패');
      setData(j);
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(null); }
  }

  async function collectPoi() {
    setBusy('poi'); setMsg(null);
    try {
      const res = await fetch(`/api/facilities?addr=${encodeURIComponent(form.addr)}`);
      const j = await res.json();
      if (res.status === 428) throw new Error(`${j.needKey} 미설정 — 베르셀 환경변수에 카카오 키를 넣고 Redeploy 하세요.`);
      if (!res.ok) throw new Error(j.error ?? '시설 수집 실패');
      setFacilities(j);
      setTab('교통환경');
    } catch (e) { setMsg({ kind: 'warn', text: e.message }); }
    finally { setBusy(null); }
  }

  /** 탭에 찍히는 상태점 — 채워졌는지 한눈에 보이게 */
  const status = useMemo(() => {
    if (!data) return {};
    const m = {};
    for (const r of data.results) m[r.sheet] = m[r.sheet] === 'ok' || r.ok ? (r.ok ? 'ok' : 'partial') : 'none';
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

      <div style={S.bar}>
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
        <div style={S.actions}>
          <button style={S.btn(busy === 'collect', true)} onClick={collect} disabled={!!busy}>
            {busy === 'collect' ? '수집 중…' : '통계 수집'}
          </button>
          <button style={S.btn(busy === 'poi', false)} onClick={collectPoi} disabled={!!busy}>
            {busy === 'poi' ? '수집 중…' : '반경시설 수집'}
          </button>
        </div>
        {msg && <div style={S.msg(msg.kind)}>{msg.text}</div>}
      </div>

      {data && <Overview data={data} onJump={setTab} />}

      <div style={{ marginTop: 20 }}>
        <SheetTabs sheets={SHEETS} active={tab} onSelect={setTab} status={status} />
        <SheetView sheetId={tab} data={data} facilities={facilities} />
      </div>
    </main>
  );
}
