'use client';
import { useState, useMemo, useEffect } from 'react';
import './globals.css';
import { SHEETS, buildSheet } from './sheets';
import { T, mono } from './theme';
import Steps from './Steps';
import SheetTabs from './SheetTabs';
import { expectedRateOf } from '../src/lib/compare';
import { manualSummary } from '../src/lib/manual';
import { reviewScore, applyHidden } from '../src/lib/scoring';
import CompareView from './CompareView';
import RateView from './RateView';
import ReviewView from './ReviewView';
import ManualView from './ManualView';
import SheetView from './SheetView';
import Overview from './Overview';
import SavedList from './SavedList';
import SourceHealth from './SourceHealth';
import PolygonDrawer from './PolygonDrawer';
import RegionPicker from './RegionPicker';
import { matchRegion } from '../src/lib/sido';
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
  /* 접힌 입력 패널 — "무엇을 심사 중인가" 한 줄 */
  /*
   * **한 줄이 너무 소심했다**(사용자 지적 2026-09-17).
   * 회색 글씨 + 흰 버튼이라 [엑셀 다운로드]·[사업지 바꾸기] 가 배경에 묻혔다.
   * 이 줄은 어느 단계에서나 늘 떠 있는 유일한 조작 자리다 — 눈에 들어와야 한다.
   */
  summary: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12,
             padding: '10px 14px', background: '#fff', border: `1px solid ${T.line}`,
             borderLeft: `4px solid ${T.accent}`, borderRadius: 7,
             boxShadow: '0 1px 3px rgba(16,24,40,.06)' },
  summaryMain: { fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: '-.01em' },
  summaryMeta: { fontSize: 12, color: T.muted, ...mono },
  summaryBtn: {
    marginLeft: 'auto', padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${T.line}`, borderRadius: 6, background: '#fff', color: T.ink,
  },
  /* 내보내기는 이 줄의 주인공이다 — 다른 버튼과 같은 회색이면 찾지 못한다 */
  summaryBtnMain: {
    marginLeft: 0, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${T.accent}`, borderRadius: 6, background: T.accent, color: '#fff',
  },
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
  /** 수집 전 기준 선택 관문 — 지나칠 수 없게 눈에 띄어야 한다 */
  ask: {
    marginTop: 12, padding: '14px 16px', borderRadius: 8,
    border: `2px solid ${T.accent}`, background: T.accentSoft,
  },
  askQ: { fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 4 },
  askSub: { fontSize: 11.5, color: T.ink2, marginBottom: 12, lineHeight: 1.6 },
  askRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  askBtn: (primary) => ({
    flex: '1 1 260px', textAlign: 'left', padding: '11px 14px', borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${primary ? T.accent : T.lineStrong}`,
    background: primary ? T.accent : '#fff', color: primary ? '#fff' : T.ink,
  }),
  askBtnT: { fontSize: 13, fontWeight: 700, display: 'block' },
  askBtnS: (primary) => ({ fontSize: 11, display: 'block', marginTop: 3, lineHeight: 1.5,
    color: primary ? 'rgba(255,255,255,.85)' : T.muted }),
  basisTag: {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8,
    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
    background: T.okSoft, color: T.ok, border: `1px solid #c7e9d5`,
  },
  /** 주소 매칭 확인 — 어디를 사업지로 잡았는지 말없이 넘어가면 안 된다 */
  /**
   * 주소 매칭 박스.
   * 확정 뒤에도 노란 경고톤이면 **끝난 일이 미해결처럼 보인다** — 확정되면 톤을 바꾼다.
   * 다만 시군구 밖 결과는 확정 뒤에도 계속 경고로 남긴다(실제로 틀린 값일 수 있다).
   */
  match: (sure) => ({
    marginTop: 11, padding: '9px 12px', borderRadius: 6, fontSize: 12.5, lineHeight: 1.6,
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    background: sure ? T.accentSoft : T.warnSoft,
    border: `1px solid ${sure ? '#c8d5fb' : '#f0dcb4'}`,
    color: sure ? T.ink2 : T.warn,
  }),
  /*
   * 지도를 항상 펴 두면 탭이 1330px 아래로 밀린다(실측). 경계를 쓰지 않는 시트에서는 접는다.
   * 언마운트하면 카카오 지도를 다시 만들어야 하므로 **높이만 0** 으로 접는다 —
   * 안쪽 지도 컨테이너는 크기를 유지해 다시 펴도 그대로 뜬다.
   */
  drawerWrap: (open) => (open ? undefined : { height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }),
  mapToggle: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 12,
    padding: '9px 14px', borderRadius: T.radius, cursor: 'pointer', textAlign: 'left',
    background: T.panel, border: `1px solid ${T.line}`, fontSize: 12.5, color: T.ink, fontFamily: 'inherit',
  },
  mapToggleNote: { color: T.muted, fontSize: 11.5 },
  mapToggleArrow: { marginLeft: 'auto', color: T.muted, fontSize: 11.5, fontWeight: 700 },
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
/*
  단계 줄의 수집 버튼 순서는 **탭 순서와 같아야 한다.**
  손으로 적어두었더니 주거편의가 교통환경보다 앞에 서서, 탭은 교통환경부터인데
  버튼은 주거편의부터인 상태로 오래 굴러갔다 — SHEETS 에서 끌어와 갈릴 일을 없앤다.
*/
const POI_SHEETS = SHEETS.filter(s => s.kind === 'poi').map(s => s.id);

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
  /*
    **빈 칸으로 시작한다.** placeholder 도 마찬가지다 — 지번 칸에 "탄벌동 203-4"(골든 표본 주소)를
    적어 두었던 것을 "지번 또는 도로명" 으로 바꿨다. 초기값을 비운 것과 같은 함정이다.
    전에는 골든 표본(경기도 광주시 탄벌동 203-4 · 제일건설(주))이
    초기값으로 박혀 있었다. 개발 중엔 편했지만 실무자가 앱을 열면 **남의 사업장이
    이미 입력된 것처럼 보인다** — 그대로 [주소 확정] 을 눌러도 아무 경고가 없다.
    placeholder 에 그럴듯한 값을 넣지 말라던 것과 같은 함정이다(CLAUDE.md).
    조회월은 /api/latest 가 원천 최신월로 채운다.
  */
  const [form, setForm] = useState({
    sido: '', sgg: '', detail: '',
    ym: '', company: '',
  });
  const [data, setData] = useState(null);           // 통계 수집 결과
  const [facilities, setFacilities] = useState(null); // 반경시설 수집 결과
  const [polygon, setPolygon] = useState(null);     // 사업지 경계 (3점 이상)
  const [coord, setCoord] = useState(null);         // 대표지번 좌표 — 지도 중심
  const [fixed, setFixed] = useState(false);        // 주소 확정 — 확정 후엔 입력을 잠근다
  const [latest, setLatest] = useState(null);       // 원천이 가진 최신 조회월
  const [ymManual, setYmManual] = useState(false);  // 조회월 직접 지정
  const [rankMeta, setRankMeta] = useState(null);   // 시공능력평가 공시 연도·출처
  /*
   * 거리를 어디서부터 잴지는 **수집 전에** 정해야 한다.
   * 나중에 지도에서 바꾸는 옵션으로 두니 아무도 안 건드렸고, 그러면 판정이 늘 중심점 기준이 된다.
   * 수집 버튼을 누르면 먼저 묻고, 경계 기준이면 그리기를 켠 채 지도로 보낸다.
   */
  const [basisMode, setBasisMode] = useState(null);   // null=미정 · 'polygon' · 'point'
  const [pending, setPending] = useState(undefined);  // 기준을 정하면 수집할 시트 (null=전체)
  const [drawNow, setDrawNow] = useState(false);      // 지도를 그리기 모드로 열기
  const [geo, setGeo] = useState(null);             // 주소 매칭 결과 (후보 포함)
  const [pick, setPick] = useState(0);              // 고른 후보
  const [manual, setManual] = useState({});         // 위성 육안 판정(6차선 등)
  /*
   * 반경을 어디서부터 잴지. 지도 안쪽 버튼으로만 두니 아무도 못 찾았다 —
   * 시트 상단으로 꺼내고, 경계가 없을 때도 왜 못 고르는지 보이게 한다.
   */
  const [radiusBasis, setRadiusBasis] = useState('polygon');
  // 비교사업장 — 반경·선택·수집결과를 한 덩어리로 들고 있는다(보관·내보내기도 이걸 그대로 읽는다)
  const [compare, setCompare] = useState(null);
  const [rate, setRate] = useState(null);       // 초기예상분양률 탭 (주택종류·세대수)
  const [review, setReview] = useState(null);   // 심사평점표 탭 (수동입력 평점)
  const [sheetInput, setSheetInput] = useState(null); // 수기입력 탭 (A 를 만드는 값들)
  useEffect(() => { if (basisMode) setRadiusBasis(basisMode); }, [basisMode]);

  // 경계를 다 그리면 다음에 누를 곳을 알려준다 (수집 버튼은 위 단계 줄에 하나만 둔다)
  useEffect(() => {
    if (pending === undefined || basisMode !== 'polygon' || !(polygon?.length >= 3)) return;
    setMsg({ kind: 'ok', text: `경계 ${polygon.length}점 지정 완료 — [${pending ?? '시트'} 수집] 을 누르세요.` });
  }, [polygon?.length, basisMode, pending]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState('교통환경');   // 자료수집 첫 시트에서 시작한다
  /* 지도는 탭을 화면 밖으로 밀어낸다 — 경계를 쓰는 시트에서만 펴 둔다 */
  const [mapOpenManual, setMapOpenManual] = useState(null);
  /* 입력 패널 접힘 — null 이면 단계에 따라 자동, 누르면 그 뜻을 따른다 */
  const [panelOpenManual, setPanelOpenManual] = useState(null);
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
    /*
     * 미분양·주민등록세대수·매매지수는 전부 시군구 단위다.
     * 시도만으로 조회하면 그 셋이 통째로 비고, 시도 단위 지표만 채워진 표가 나온다.
     */
    if (!form.sgg && form.sido !== '세종특별자치시') {
      return setMsg({ kind: 'warn', text: `시군구를 골라야 합니다 — 미분양·세대수·매매지수는 시군구 단위 통계입니다 (지금: ${form.sido})` });
    }
    // [직접] 로 바꾼 뒤 칸을 비우면 빈 값이 그대로 나갔다 — 여기서 막는다
    if (!/^\d{6}$/.test(String(form.ym).trim())) {
      return setMsg({
        kind: 'warn',
        text: `조회월이 비었거나 형식이 맞지 않습니다 (지금: "${form.ym}"). YYYYMM 6자리로 넣거나 [자동] 을 누르세요.`,
      });
    }
    setBusy('collect'); setMsg(null);
    try {
      const qs = new URLSearchParams({ sgg: region, ym: String(form.ym).trim(), company: form.company });
      const res = await fetch(`/api/collect?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '수집 실패');
      setData(j);
      /*
        시공사를 안 넣으면 시공능력평가순위만 조용히 빠져 6/7 이 된다.
        초기 폼을 비우고 나서는 실제로 그렇게 되기 쉬우므로 무엇이 빠졌는지 말한다.
      */
      setMsg(String(form.company).trim()
        ? { kind: 'ok', text: `통계 ${j.okCount}/${j.total} 수집 완료` }
        : { kind: 'warn', text: `통계 ${j.okCount}/${j.total} 수집 완료 — 시공사를 안 넣어 시공능력평가순위(브랜드경쟁력)가 빠졌습니다. 상호를 넣고 다시 [통계 수집] 을 누르세요.` });
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
      setPanelOpenManual(null);   // [사업지 바꾸기] 로 펴 둔 상태를 자동 판단으로 되돌린다

      /*
       * 확정된 주소에서 시군구를 되짚어 채운다.
       * 시도만 고르고 지번을 치면 region 이 "인천광역시" 로 남아
       * 미분양·세대수·매매지수(전부 시군구 단위)가 통째로 실패했다.
       * 좌표가 연수구인데 통계는 인천 전체로 도는 상태를 만들면 안 된다.
       */
      const hit = matchRegion(j.coord?.jibunAddress ?? j.coord?.roadAddress);
      const filled = hit?.sgg && hit.sgg !== form.sgg;
      if (hit?.sido) setForm(f => ({ ...f, sido: hit.sido, sgg: hit.sgg || f.sgg }));

      const n = j.geo?.candidates?.length ?? 1;
      setMsg({
        kind: j.geo?.via === 'keyword' ? 'warn' : 'ok',
        text: j.geo?.via === 'keyword'
          ? `주소검색으로는 못 찾아 장소검색으로 잡았습니다 — 매칭이 맞는지 먼저 확인하세요.${filled ? ` (시군구를 ${hit.sgg} 로 맞췄습니다)` : ''}`
          /* 후보 드롭다운은 이 메시지보다 **위**에 있다 — "아래에서" 라고 적어 눈이 헛돌았다 */
          : `주소 매칭 완료${n > 1 ? ` (후보 ${n}건 — 다르면 위 [사업지 매칭] 에서 고르세요)` : ''}.`
            + (filled ? ` 시군구를 ${hit.sgg} 로 맞췄습니다.` : ''),
      });
    } catch (e) { setMsg({ kind: 'warn', text: e.message }); }
    finally { setBusy(null); }
  }

  /**
   * 반경시설 수집 버튼 — 기준이 안 정해졌으면 먼저 묻는다.
   * 경계 기준인데 경계가 없으면 지도를 그리기 모드로 열고 기다린다.
   */
  function collectPoi(sheet = null) {
    if (!fixed) return setMsg({ kind: 'warn', text: '사업지 주소를 먼저 확정하세요.' });
    if (!basisMode) { setPending(sheet); setMsg(null); return; }
    if (basisMode === 'polygon' && !(polygon?.length >= 3)) {
      setPending(sheet); setDrawNow(true);
      setMsg({ kind: 'warn', text: '지도에서 사업지 경계를 3점 이상 찍은 뒤 [이 경계로 수집] 을 누르세요.' });
      return;
    }
    runPoi(sheet, basisMode === 'polygon' ? polygon : null);
  }

  /** 실제 수집 — sheet 가 null 이면 전부, poly 가 null 이면 대표지번 중심 기준 */
  async function runPoi(sheet = null, poly = null) {
    setPending(undefined); setDrawNow(false);
    setBusy(sheet ?? 'poi'); setMsg(null);
    try {
      const qs = new URLSearchParams({ addr });
      qs.set('region', region);
      if (sheet) qs.set('sheet', sheet);
      if (poly?.length >= 3) qs.set('polygon', JSON.stringify(poly));
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
      /*
        "완료 — 0종 확인" 은 무엇이 완료인지 헷갈린다. 반경 안에 없는 것도 정상 결과이므로
        **조회한 종수와 그 중 몇 종이 반경 안에 있었는지**를 나눠 적는다.
      */
      const got = Object.values(j.facilities ?? {});
      const hit = got.filter(v => v.nearest).length;
      setMsg({
        kind: 'ok',
        text: `${sheet ?? '반경시설'} 수집 완료 — ${got.length}종 조회 · 반경 내 ${hit}종`
          + ` · ${j.basis === 'polygon' ? '사업지 경계 기준' : '대표지번 중심점 기준'}`,
      });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(null); }
  }

  /** 초기화 — 사업지를 바꾸려면 여기서부터 다시 시작한다 */
  function resetSite() {
    setFixed(false); setGeo(null); setPick(0);
    setCoord(null); setPolygon(null); setFacilities(null); setData(null);
    setBasisMode(null); setPending(undefined); setDrawNow(false);
    setMsg({ kind: 'warn', text: '사업지를 초기화했습니다. 시도·시군구부터 다시 지정하세요.' });
  }

  // ── 보관 / 내보내기 ───────────────────────────────────────
  function saveRecord() {
    if (!data) return;
    const ok = store.save({ data, facilities, addr, manual, compare, rate, review, sheetInput });
    setSavedKey(k => k + 1);
    setMsg(ok
      ? { kind: 'ok', text: `이 브라우저에 보관했습니다 — ${data.region} · ${data.period}` }
      : { kind: 'err', text: '보관 실패 (브라우저 저장소 사용 불가)' });
  }

  function openRecord(rec) {
    if (!rec) return;
    setData(rec.data);
    setFacilities(rec.facilities ?? null);
    setCompare(rec.compare ?? null);
    setRate(rec.rate ?? null);
    setReview(rec.review ?? null);
    setSheetInput(rec.sheetInput ?? null);
    setPolygon(rec.facilities?.polygon ?? null);
    setCoord(rec.facilities?.coord ?? null);
    setGeo(rec.facilities?.geo ?? null); setPick(0);
    setFixed(Boolean(rec.facilities?.coord));
    setBasisMode(rec.facilities?.basis ?? null); setPending(undefined); setDrawNow(false);
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
    /*
     * **비어 있는 탭이 있으면 묻는다**(사용자 요청 2026-09-17).
     * 엑셀은 화면 상태를 그대로 읽으므로, 안 채운 시트는 빗금인 채로 심사 파일에 들어간다.
     * 조용히 내보내면 받는 사람이 "왜 비었나" 를 묻게 된다 — 내보내는 사람이 먼저 알아야 한다.
     */
    const missing = [
      ...POI_SHEETS.filter(sh => !poiDone(sh)).map(sh => `${sh} (반경시설 미수집)`),
      ...(compare?.data ? [] : ['비교사업장 (미수집)']),
      ...(mSum?.excl == null ? [`수기입력 (A 미완성${mSum?.missing?.length ? ` — ${mSum.missing.length}개 남음` : ''})`] : []),
      ...(() => {
        const r = reviewScore({ manual: review ?? {}, rate });
        return r.missing?.length ? [`심사평점표 (${r.missing.length}개 미입력)`] : [];
      })(),
    ];
    if (missing.length && !window.confirm(
      `아래 탭이 아직 비어 있습니다 — 그대로 내보낼까요?\n\n· ${missing.join('\n· ')}\n\n`
      + '엑셀은 화면 상태를 그대로 담습니다. 비어 있는 칸은 빗금으로 들어갑니다.')) return;
    setBusy('xlsx'); setMsg(null);
    try {
      const { exportWorkbook } = await import('./exportExcel');
      await exportWorkbook({
        data, facilities: view, manual, compare: compare && { ...compare, addr }, rate, review, sheetInput, excl: mSum.excl, manualSum: mSum, sheets: SHEETS, buildSheet,
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
  const poiDone3 = POI_SHEETS.filter(poiDone).length;
  /*
    비교사업장도 **자료수집 단계**다. 이걸 빼고 STEP 2 를 완료로 표시했더니
    분양가경쟁력이 빈 채로 다음 단계가 열렸고, 단계 줄에 그 탭으로 가는 길도 없었다.
    반경·종류를 고르는 자리가 탭 안이라 수집 버튼은 탭에 두고, 단계 줄에는 **가는 길**만 둔다.
  */
  const compDone = Boolean(compare?.data);

  /*
   * 절차는 자료수집에서 끝나지 않는다 — **수집 → 분양률 산정 → 심사평점**.
   * 뒤 두 단계가 단계 줄에 없으면 "수집하면 끝" 으로 읽힌다(사용자 지적 2026-09-16).
   */
  /* A(제외 항목 점수)는 수기입력 탭이 단일 지점으로 만든다 */
  /*
   * **목록에서 지운 시설은 판정에서도 빠진다**(사용자 요청 2026-09-17).
   * 원본(`facilities`)은 그대로 두고 — 보관·되돌리기가 가능해야 한다 —
   * 화면·판정·엑셀이 **전부 이 파생본 하나만** 본다. 한 곳이라도 원본을 보면
   * "지웠는데 점수가 안 바뀐다" 가 된다.
   */
  const view = useMemo(() => applyHidden(facilities, manual), [facilities, manual]);

  const mSum = useMemo(() => manualSummary({ sheetInput: sheetInput ?? {}, data, facilities: view, manual }),
    [sheetInput, data, view, manual]);
  const rateRes = useMemo(() => expectedRateOf(compare, rate, mSum.excl, sheetInput), [compare, rate, mSum.excl, sheetInput]);
  const ratePct = rateRes.res && !rateRes.res.pending ? rateRes.res.rate : null;
  const reviewRes = useMemo(
    () => reviewScore({ manual: review ?? {}, rate: ratePct ?? NaN }), [review, ratePct]);

  const done = [
    ...(fixed ? ['input'] : []),
    ...(data && allPoi && compDone ? ['collect'] : []),
    ...(mSum.excl != null ? ['manual'] : []),
    ...(ratePct != null ? ['rate'] : []),
    ...(reviewRes?.net != null ? ['review'] : []),
  ];
  const current = !fixed ? 'input'
    : !data || !allPoi || !compDone ? 'collect'
    : mSum.excl == null ? 'manual'
    : ratePct == null ? 'rate'
    : 'review';

  /*
   * 경계를 쓰는 시트면 펴 두되, **이미 그렸거나 중심 기준을 골랐으면 접는다** —
   * 다 그린 지도, 안 쓸 지도가 500px 을 차지할 이유가 없다.
   * 손잡이에 현재 기준이 남아 언제든 다시 편다.
   */
  /*
    **기준을 고르기 전에는 펴지 않는다.** 주소 확정 직후부터 지도가 350px 을 먹는데,
    그 시점에 할 일은 [통계 수집] 이라 눈이 버튼 → 지도 → 다시 버튼으로 왕복했다.
    경계를 그리겠다고(=`basisMode==='polygon'`) 정했을 때만 편다.
  */
  const mapWanted = Boolean(SHEETS.find(x => x.id === tab)?.map)
    && !(polygon?.length >= 3)
    && basisMode === 'polygon';
  /* [사업지 경계 기준] 을 고르면 접혀 있어도 펴야 한다 — 안 그리면 그릴 곳이 안 보인다 */
  const mapOpen = drawNow ? true : (mapOpenManual ?? mapWanted);
  const setMapOpen = (fn) => setMapOpenManual(typeof fn === 'function' ? fn(mapOpen) : fn);

  /*
    **끝난 단계가 화면을 계속 먹고 있었다.**
    심사평점표 탭인데도 화면 900px 중 830px 이 입력폼·지도·보관목록·통계카드였고,
    정작 값을 넣을 표는 스크롤 밖에 있었다(실측). 입력칸과 결과가 한 화면에 없으면
    눈도 마우스도 왕복한다.
    → **자료수집 단계 탭에서만** 그 도구들을 펴 둔다. 뒤 단계로 가면 한 줄 요약만 남긴다.
  */
  const gatherTab = (SHEETS.find(s => s.id === tab)?.stage ?? '자료수집') === '자료수집';
  /*
    확정된 뒤의 입력 그리드는 **잠겨서 못 고치는 칸**인데도 320px 을 먹었다.
    한 줄 요약으로 접고 [사업지 바꾸기] 로 편다 — 시공사를 바꾸는 것도 그 길로 간다.
  */
  const panelOpen = panelOpenManual ?? !fixed;

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
      {/* 안내문은 처음 한 번만 읽는다 — 확정 뒤에는 그 자리를 일에 쓴다 */}
      {!fixed && <p style={S.lead}>사업장 시군구를 입력하면 심사에 필요한 수치와 증빙을 원천에서 직접 수집합니다.</p>}

      {/* 원천 상태는 수집할 때 보는 것이다 — 뒤 단계에서는 그 자리를 표에 내준다 */}
      {gatherTab && <SourceHealth />}
      <Steps current={current} done={done} />

      <div style={S.panel}>
        {/*
          **자료수집이 끝나면 접는다.** 입력폼·매칭 드롭다운은 그 단계의 도구인데
          뒤 단계 탭에서도 계속 화면 위쪽 400px 을 먹어, 값을 넣을 표가 스크롤 밖으로 밀렸다.
          접힌 자리에는 "무엇을 심사 중인가" 한 줄만 남긴다 — 그건 어느 단계에서나 필요하다.
        */}
        {!panelOpen && (
          <div style={S.summary}>
            <span style={S.summaryMain}>{addr || region}</span>
            <span style={S.summaryMeta}>
              {form.ym}
              {form.company ? ` · ${form.company}` : ''}
              {rankMeta?.rank ? ` ${rankMeta.rank}위` : ''}
              {data ? ` · 통계 ${data.okCount}/${data.total}` : ''}
              {facilities ? ` · 시설 ${POI_SHEETS.filter(poiDone).length}/${POI_SHEETS.length}` : ''}
              {compare?.data ? ' · 비교사업장' : ''}
            </span>
            {/* 내보내기는 어느 단계에서나 쓴다 — 요약 줄에 붙여 한 줄을 아낀다 */}
            {data && (
              <>
                <button style={{ ...S.summaryBtn, marginLeft: 'auto' }} onClick={saveRecord} disabled={!!busy}>
                  이 조회 보관
                </button>
                <button style={S.summaryBtnMain} onClick={exportXlsx} disabled={!!busy}>
                  {busy === 'xlsx' ? '생성 중…' : '⬇ 엑셀 다운로드'}
                </button>
              </>
            )}
            <button style={{ ...S.summaryBtn, marginLeft: data ? 0 : 'auto' }} onClick={() => setPanelOpenManual(true)}>
              사업지 바꾸기
            </button>
          </div>
        )}

        {panelOpen && (<>

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
            <input style={S.input} value={form.detail} onChange={set('detail')} placeholder="지번 또는 도로명"
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
                value={form.ym} onChange={set('ym')} placeholder="YYYYMM"
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
          {/* 시공사는 사업지 주소와 무관하다 — 확정 후에도 바꿀 수 있어야 한다 */}
          <CompanyPicker
            value={form.company}
            onChange={(v) => setForm(f => ({ ...f, company: v }))}
            onMeta={setRankMeta}
          />

          {/*
            **[주소 확정] 이 폼 왼쪽 아래에 있었다.** 마지막으로 만지는 칸은 오른쪽 끝의 시공사라
            확정하려면 마우스가 990px 을 되돌아갔다(실측). 입력이 끝나는 자리에 버튼을 둔다.
          */}
          {!fixed && (
            /*
              그리드 한 칸으로 넣었더니 칸이 모자라 **다음 줄 왼쪽 끝**으로 떨어졌다(실측 x=157).
              마지막 입력칸(시공사 x=1105)에서 여전히 950px 을 되돌아간다 —
              한 줄을 통째로 쓰고 **오른쪽 끝에 붙여** 입력이 끝나는 자리 바로 아래에 둔다.
            */
            <div style={{ ...S.field, gridColumn: '1 / -1', alignItems: 'flex-end' }}>
              <button style={S.btn({ busy: busy === 'geo', primary: true })} onClick={locate} disabled={!!busy}>
                {busy === 'geo' ? '주소 확인 중…' : '주소 확정'}
              </button>
            </div>
          )}
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
          {rankMeta && (
            <span> · 시공능력평가는 {rankMeta.year}년 공시({rankMeta.count.toLocaleString()}건) 기준</span>
          )}
        </div>

        {geo && (
          <div style={S.match(
            (fixed && !geo.outOfRegion)
            || (geo.via === 'address' && !geo.outOfRegion && geo.candidates.length === 1))}>
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
                  const c = geo.candidates[i];
                  setPick(i); setCoord(c);
                  // 후보를 바꾸면 시군구도 따라가야 한다 — 안 그러면 좌표와 통계가 딴 곳을 가리킨다
                  const h = matchRegion(c.jibunAddress ?? c.roadAddress);
                  if (h?.sido) setForm(f => ({ ...f, sido: h.sido, sgg: h.sgg || f.sgg }));
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

        </>)}

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
          {/*
            단계 버튼은 **자료수집 단계의 것**이다. 뒤 단계 탭에서는 전부 초록(완료)인 채로
            자리만 먹고, 정작 그 자리에서 쓰는 [이 조회 보관]·[엑셀 다운로드] 가
            줄바꿈돼 떨어져 있었다 — 접혔을 때는 그 둘만 남긴다.
          */}
          {gatherTab && fixed && (
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

              {basisMode && (
                <span style={S.basisTag}>
                  {basisMode === 'polygon' ? `경계 기준${polygon?.length >= 3 ? ` (${polygon.length}점)` : ' (미지정)'}` : '중심 기준'}
                  <button
                    style={{ border: 0, background: 'none', color: T.ok, fontWeight: 700, cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}
                    onClick={() => { setBasisMode(null); setPending(null); setDrawNow(false); }}
                  >변경</button>
                </span>
              )}

              {/*
                **파란 버튼이 셋이면 다음에 뭘 누를지 셋이 동시에 주장한다.**
                어차피 셋 다 눌러야 하고(기준까지 물으면 4클릭), 한 번에 받는 길은
                이미 있었다(`runPoi(null)`). 주 버튼은 하나로 묶고, 개별 재수집은
                다 끝난 뒤에만 보조로 남긴다 — 하나만 다시 받고 싶을 때가 있다.
              */}
              {!allPoi ? (
                <button
                  style={S.btn({ busy: busy === 'poi', primary: !!data, done: false })}
                  onClick={() => collectPoi(null)} disabled={!!busy}
                >
                  {busy === 'poi' ? '수집 중…' : `반경시설 수집${poiDone3 ? ` (${poiDone3}/3)` : ' (3종)'}`}
                </button>
              ) : (
                POI_SHEETS.map(sh => (
                  <button
                    key={sh}
                    style={S.btn({ busy: busy === sh, done: true })}
                    onClick={() => collectPoi(sh)} disabled={!!busy}
                    title={`${sh} 만 다시 수집합니다`}
                  >
                    {busy === sh ? '수집 중…' : <><span style={S.check}>✓</span>{sh}</>}
                  </button>
                ))
              )}

              {/* 반경·종류를 고른 뒤 수집해야 해서 버튼은 탭 안에 있다 — 여기서는 그 탭으로 보낸다 */}
              <button
                style={S.btn({ primary: !!data && allPoi && !compDone, done: compDone })}
                onClick={() => setTab('비교사업장')} disabled={!!busy}
              >
                {compDone && <span style={S.check}>✓</span>}
                {compDone ? '비교사업장 · 분양가' : '비교사업장 · 분양가 →'}
              </button>
            </>
          )}

          {data && fixed && panelOpen && (
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

        {/*
          수집 직전 관문. 이걸 지나야 수집이 돈다 —
          "거리를 어디서부터 쟀는가" 를 모른 채 나온 숫자는 증빙이 안 된다.
        */}
        {pending !== undefined && !basisMode && (
          <div style={S.ask}>
            <div style={S.askQ}>
              {pending ?? '반경시설'} 수집 — 거리를 어디서부터 잴까요?
            </div>
            <div style={S.askSub}>
              한 번 고르면 이후 시트도 같은 기준으로 수집합니다. 바꾸려면 [기준 변경].
            </div>
            <div style={S.askRow}>
              <button
                style={S.askBtn(true)}
                onClick={() => { setBasisMode('polygon'); setDrawNow(true);
                  setMsg({ kind: 'warn', text: '아래 지도에서 사업지 경계를 3점 이상 찍은 뒤 [이 경계로 수집] 을 누르세요.' }); }}
              >
                <span style={S.askBtnT}>사업지 경계 기준</span>
                <span style={S.askBtnS(true)}>
                  지도에 경계를 그려 경계 최단거리로 잽니다. 실측 100m 넘게 차이납니다.
                </span>
              </button>
              <button
                style={S.askBtn(false)}
                onClick={() => { setBasisMode('point'); runPoi(pending ?? null, null); }}
              >
                <span style={S.askBtnT}>대표지번 중심 기준</span>
                <span style={S.askBtnS(false)}>
                  경계를 그리지 않고 바로 수집합니다. {coord?.jibunAddress ?? addr} 한 점 기준.
                </span>
              </button>
            </div>
          </div>
        )}

        {msg && <div style={S.msg(msg.kind)}>{msg.text}</div>}
      </div>

      {/*
        경계 그리기는 주소 확정 **바로 다음** 동작이다.
        사이에 보관 목록이 끼면 흐름이 끊긴다 — 순서를 흐름대로 둔다.
      */}
      {/*
        지도는 **자료수집 단계의 도구**다. 수기입력·산정·평점 탭에서는 쓸 일이 없는데
        760px 을 차지해 탭이 화면 밖으로 밀린다 — 그 단계에서는 접는다.
      */}
      {coord && gatherTab && (
        <button style={S.mapToggle} onClick={() => setMapOpen(o => !o)}>
          <span style={{ fontWeight: 700 }}>사업지 경계 지도</span>
          <span style={S.mapToggleNote}>
            {polygon?.length >= 3 ? `경계 ${polygon.length}점 지정됨 — 경계 기준으로 잽니다`
              : '경계 미지정 — 대표지번 중심으로 잽니다'}
          </span>
          <span style={S.mapToggleArrow}>{mapOpen ? '접기 ▲' : '펴기 ▼'}</span>
        </button>
      )}
      {coord && gatherTab && (
        <div style={S.drawerWrap(mapOpen)}>
        <PolygonDrawer
          center={{ lat: Number(coord.y), lng: Number(coord.x) }}
          polygon={polygon}
          onChange={setPolygon}
          autoDraw={drawNow}
          pendingSheet={pending}
          confirmed={!!facilities}
          busy={busy === 'poi' || POI_SHEETS.includes(busy)}
        />
        </div>
      )}

      {/*
        보관목록·통계카드도 자료수집 단계의 것이다.
        심사평점표 탭에서 이 둘이 400px 을 먹어 정작 값 넣을 표가 스크롤 밖에 있었다.
      */}
      {gatherTab && <SavedList onOpen={openRecord} refreshKey={savedKey} />}

      {data && gatherTab && <Overview data={data} onJump={setTab} />}

      <div style={{ marginTop: 20 }}>
        <SheetTabs sheets={SHEETS} active={tab}
          onSelect={(id) => { setTab(id); setMapOpenManual(null); setMsg(null); }} status={status} />
        {/*
          모든 시트를 항상 마운트해 둔다.
          엑셀 내보내기가 각 시트의 증빙 카드와 지도를 캡쳐하는데,
          display:none 이면 캡쳐가 빈 이미지로 나온다.
          그래서 비활성 시트는 화면 밖으로 밀어 두되 레이아웃은 살려둔다.
        */}
        {SHEETS.map(s => (
          <div
            key={s.id}
            /* 모든 시트가 한 DOM 에 같이 있다 — 시트를 특정할 수 있는 이름표를 둔다 */
            data-sheet={s.id}
            aria-hidden={s.id !== tab}
            style={s.id === tab ? undefined : {
              position: 'absolute', left: -99999, top: 0, width: 1100, pointerEvents: 'none',
            }}
          >
            {s.kind === 'manual'
              ? (
                <ManualView
                  region={region} addr={addr} data={data} facilities={view} manual={manual}
                  value={sheetInput} onChange={setSheetInput}
                />
              )
              : s.kind === 'review'
              ? (
                <ReviewView
                  region={region} addr={addr} data={data} facilities={view}
                  compare={compare} rate={rate} excl={mSum.excl} sheetInput={sheetInput}
                  value={review} onChange={setReview} onJump={setTab}
                />
              )
              : s.kind === 'rate'
              ? (
                <RateView
                  region={region} addr={addr} facilities={view}
                  compare={compare} excl={mSum.excl} manualSum={mSum} sheetInput={sheetInput}
                  value={rate} onChange={setRate} onJump={setTab}
                />
              )
              : s.kind === 'comp'
              ? (
                <CompareView
                  addr={addr} coord={coord} region={region} polygon={polygon}
                  radiusBasis={radiusBasis}
                  company={data?.company}
                  /* 시공능력평가순위는 이미 수집돼 있다 — 본건 유사도 판정에 참고로 보여준다 */
                  companyRank={(data?.results ?? []).find(r => r.indicatorId === 'construction_capability_rank' && r.ok)?.value ?? null}
                  excl={mSum.excl} manualSum={mSum}
                  value={compare} onChange={setCompare}
                />
              )
              : (
                <SheetView
                  sheetId={s.id} data={data} facilities={view}
                  radiusBasis={radiusBasis} onRadiusBasis={setRadiusBasis}
                  manual={manual}
                  onManual={(label, v) => setManual(m => ({ ...m, [label]: v }))}
                />
              )}
          </div>
        ))}
      </div>
    </main>
  );
}
