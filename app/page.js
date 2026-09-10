'use client';
import { useState } from 'react';
import './globals.css';
import ResultTable from './ResultTable';
import EvidenceCard from './EvidenceCard';

const S = {
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '28px 20px 80px' },
  h1: { fontSize: 21, margin: '0 0 4px', letterSpacing: '-0.02em' },
  lead: { color: 'var(--muted)', margin: '0 0 22px', fontSize: 13 },
  panel: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 18 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 170, flex: '1 1 170px' },
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, background: '#fff', color: 'var(--ink)' },
  btn: (busy) => ({
    padding: '10px 22px', borderRadius: 6, border: 0, fontSize: 14, fontWeight: 700,
    background: busy ? '#9ca3af' : 'var(--accent)', color: '#fff', cursor: busy ? 'wait' : 'pointer',
  }),
  err: { marginTop: 14, padding: 12, borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--err)', fontSize: 13 },
};

export default function Home() {
  const [form, setForm] = useState({
    sgg: '경기도 광주시', ym: '202607', company: '제일건설(주)', year: '2025',
    addr: '경기도 광주시 탄벌동 203-4',
  });
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function run() {
    setBusy(true); setErr(null); setData(null);
    try {
      const qs = new URLSearchParams({ sgg: form.sgg, ym: form.ym, company: form.company, year: form.year });
      const res = await fetch(`/api/collect?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '수집 실패');
      setData(j);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <main style={S.wrap}>
      <h1 style={S.h1}>PF 보증심사 통계 자동수집</h1>
      <p style={S.lead}>사업장 시군구를 입력하면 심사에 필요한 수치와 증빙을 원천에서 직접 수집합니다.</p>

      <div style={S.panel}>
        <div style={S.row}>
          <div style={S.field}>
            <label style={S.label}>사업장 시군구</label>
            <input style={S.input} value={form.sgg} onChange={set('sgg')} placeholder="경기도 광주시" />
          </div>
          <div style={S.field}>
            <label style={S.label}>조회월 (YYYYMM)</label>
            <input style={S.input} value={form.ym} onChange={set('ym')} placeholder="202607" />
          </div>
          <div style={S.field}>
            <label style={S.label}>시공사</label>
            <input style={S.input} value={form.company} onChange={set('company')} placeholder="제일건설(주)" />
          </div>
          <div style={S.field}>
            <label style={S.label}>평가연도</label>
            <input style={S.input} value={form.year} onChange={set('year')} placeholder="2025" />
          </div>
          <button style={S.btn(busy)} onClick={run} disabled={busy}>
            {busy ? '수집 중…' : '수집'}
          </button>
        </div>
        {err && <div style={S.err}>{err}</div>}
      </div>

      {data && (
        <>
          <ResultTable data={data} />
          <div style={{ marginTop: 26 }}>
            {data.results.filter(r => r.ok).map(r => (
              <EvidenceCard key={r.indicatorId} row={r} region={data.region} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
