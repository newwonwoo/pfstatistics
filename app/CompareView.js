'use client';
import { useMemo, useState, useEffect } from 'react';
import { T, mono } from './theme';
import RadiusMap from './RadiusMap';
import { scoreMatrix } from '../src/lib/scoring';

/**
 * 비교사업장 · 분양가 적정성.
 *
 * 심사에서 분양가 적정성을 볼 때 지금은 청약홈을 하나씩 열어 손으로 계산한다.
 * 그 일을 그대로 옮긴다 — 반경 안의 분양 단지를 찾고, 규정이 정한 요건으로 유사사업장을
 * 가리고, 평균가격과 분양가격지수를 내고, 배점표로 점수를 낸다.
 *
 * **규정을 코드에 흩어놓지 않는다.** 아래 REG 한 곳에 문구와 숫자를 모아두고
 * 화면·판정이 같은 값을 본다. 규정이 바뀌면 여기만 고친다.
 *
 * 원천은 한국부동산원 청약홈 분양정보(공공데이터포털).
 * 분양가를 전국 단위로 주는 공공 원천은 여기뿐이다 — 실거래는 이미 팔린 값이고 KB시세는 기축이다.
 */

/* ── 인근 유사사업장 요건 (보증심사 실무기준) ────────────────────────── */
const REG = {
  거리: '단위사업장으로부터 2km(수도권·광역시는 1km) 이내. 없으면 매 1km 범위로 확장',
  거리측정: '단위 사업장(단지) 경계로부터 인근 사업장 경계까지의 거리',
  시기: '심사 시점 기준 최근 1년 이내 분양 개시(=공급계약시작일)한 사업장. 없으면 분양 진행중 + 준공 사업장',
  유사도: '주택유형 · 단지규모 · 시공능력평가순위 · 택지유형 중 2개 이상 일치. 3개 이상이면 우선 선정',
  제외: '공공분양, 분양개시 후 10년 경과 등 평균가격을 현저히 왜곡하는 사업장은 제외',
  // 수도권·광역시는 1km, 그 밖은 2km (거리 요건의 기본값)
  METRO: ['서울', '인천', '경기', '부산', '대구', '광주', '대전', '울산', '세종'],
};

const HOUSE_TYPES = ['아파트', '주상복합', '기타'];
const SIZE_BANDS = ['500세대 미만', '500~999세대', '1,000세대 이상'];
/*
  좌표를 어디까지 맞춰서 잰 거리인가 — `exact` 는 배지를 달지 않는다(기본이라 조용해야 한다).
  나머지는 근사라서 **반경 판정이 뒤집힐 수 있다**는 걸 표에서 바로 보여야 한다.
*/
const GEOCODE_LABEL = { name: '단지명 위치', zone: '택지지구 위치', dong: '읍면동 근사', place: '지구 위치', sample: '견본주택 위치' };
const GEOCODE_NOTE = {
  name: '공고 주소에 지번이 없어 단지명으로 찾은 위치입니다',
  zone: '공고 주소에 지번이 없어 택지지구(카카오맵 개발지구) 중심으로 잰 거리입니다',
  dong: '공고 주소에 지번이 없어 읍면동 중심으로 잰 거리입니다 — 수백 m 틀어질 수 있습니다',
  place: '지구명으로만 찾은 위치입니다 — 거리 오차가 가장 큽니다',
  sample: '견본주택 위치입니다 — 단지와 다른 자리일 수 있습니다',
};

const RANK_BANDS = ['50위 이내', '51~100위', '101~200위', '201~300위', '300위 밖'];
/* 이 앱이 시공능력평가순위를 이미 수집한다 — 순위를 구간으로 옮기는 일을 사람에게 시키지 않는다 */
const rankBandOf = (rank) => {
  const n = Number(rank);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n <= 50 ? '50위 이내' : n <= 100 ? '51~100위' : n <= 200 ? '101~200위' : n <= 300 ? '201~300위' : '300위 밖';
};
const LAND_TYPES = ['민간택지', '공공택지', '신도시', '기타'];

const S = {
  page: { background: T.panel, border: `1px solid ${T.lineStrong}`, borderTop: 0, borderRadius: `0 0 ${T.radius}px ${T.radius}px`, padding: '22px 24px 26px' },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em' },
  subject: { fontSize: 12.5, color: T.ink2, margin: '0 0 16px' },
  bar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  seg: { display: 'inline-flex', border: `1px solid ${T.lineStrong}`, borderRadius: 6, overflow: 'hidden' },
  segBtn: (on) => ({
    padding: '6px 13px', fontSize: 12, fontWeight: 700, border: 0, cursor: 'pointer',
    background: on ? T.accent : '#fff', color: on ? '#fff' : T.ink2,
  }),
  go: (busy) => ({
    padding: '7px 16px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, cursor: busy ? 'progress' : 'pointer',
    border: `1px solid ${T.accent}`, background: busy ? '#dfe6ef' : T.accent, color: busy ? T.muted : '#fff',
  }),
  ghost: { padding: '6px 13px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: `1px solid ${T.accent}`, background: '#fff', color: T.accent },
  take: {
    whiteSpace: 'nowrap', padding: '3px 8px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${T.accent}`, borderRadius: 4, background: T.accentSoft, color: T.accent,
  },
  autoMsg: {
    flexBasis: '100%', marginTop: 8, padding: '8px 12px', borderRadius: 6,
    background: '#f7f9fb', border: `1px solid ${T.line}`, fontSize: 11.5, color: T.ink2, lineHeight: 1.6,
  },
  label: { fontSize: 11.5, color: T.muted },
  regHead: {
    width: '100%', display: 'flex', alignItems: 'baseline', gap: 10, cursor: 'pointer',
    padding: '9px 14px', marginBottom: 12, textAlign: 'left',
    background: '#f7f9fb', border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12.5, color: T.ink,
  },
  regHeadNote: { fontSize: 11.5, color: T.muted, fontWeight: 400 },
  regHeadArrow: { marginLeft: 'auto', fontSize: 11, color: T.muted, fontWeight: 700 },
  reg: { padding: '11px 14px', marginBottom: 14, borderRadius: 7, background: '#f7f9fc', border: `1px solid ${T.line}`, fontSize: 11.5, color: T.ink2, lineHeight: 1.85 },
  regKey: { display: 'inline-block', minWidth: 52, fontWeight: 700, color: T.muted },
  card: { padding: '14px 16px', marginBottom: 14, borderRadius: 8, background: '#fffdf5', border: '1px solid #ecdfc0' },
  grid: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  input: { padding: '5px 8px', fontSize: 12.5, border: `1px solid ${T.line}`, borderRadius: 4, background: '#fff', color: T.ink, fontFamily: 'inherit', width: 150, ...mono },
  select: { padding: '5px 8px', fontSize: 12.5, border: `1px solid ${T.line}`, borderRadius: 4, background: '#fff', color: T.ink, fontFamily: 'inherit' },
  sum: { display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', padding: '14px 18px', marginBottom: 14, borderRadius: 8, background: '#f4f8ff', border: '1px solid #cfdcf0' },
  sumNum: { fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', ...mono },
  sumUnit: { fontSize: 13, color: T.ink2, fontWeight: 700 },
  sumNote: { fontSize: 11.5, color: T.muted, marginLeft: 'auto', textAlign: 'right', lineHeight: 1.6 },
  scroll: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', fontSize: 12.5, width: '100%', minWidth: 900 },
  th: { border: `1px solid ${T.sheetLine}`, background: T.sheetHead, padding: '7px 9px', fontWeight: 600, whiteSpace: 'nowrap', color: T.ink },
  td: { border: `1px solid ${T.sheetLine}`, padding: '7px 9px', textAlign: 'center', verticalAlign: 'middle', ...mono },
  // 날짜·면적·종류가 좁은 열에서 두 줄로 접히면 표가 들쭉날쭉해진다
  tdNo: { border: `1px solid ${T.sheetLine}`, padding: '7px 9px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', ...mono },
  tdL: { border: `1px solid ${T.sheetLine}`, padding: '7px 9px', textAlign: 'left', verticalAlign: 'middle' },
  tdVal: { border: `1px solid ${T.sheetLine}`, padding: '7px 9px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 700, background: '#fffdf0', ...mono },
  rowOn: { background: '#eef5ff' },
  rowOut: { background: '#fafafa', color: T.muted },
  empty: { padding: '40px 20px', textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.8 },
  warn: { padding: '12px 14px', background: T.warnSoft, border: '1px solid #f0dcb4', borderRadius: 6, fontSize: 12.5, color: T.warn, lineHeight: 1.6 },
  ok: { padding: '12px 14px', background: T.okSoft, border: '1px solid #c7e9d5', borderRadius: 6, fontSize: 12.5, color: T.ok, lineHeight: 1.6 },
  secTitle: { fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '.04em', margin: '26px 0 12px', paddingTop: 18, borderTop: `1px solid ${T.line}` },
  note: { marginTop: 10, fontSize: 11.5, color: T.muted, lineHeight: 1.7 },
  /* 깔때기 — 어느 단계에서 몇 건이 빠졌는지 한 줄로 */
  funnel: { marginBottom: 10, padding: '7px 12px', background: T.soft ?? '#f6f7f9', border: '1px solid #e5e7eb',
            borderRadius: 6, fontSize: 12, color: T.ink2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  arrow: { color: '#b8bec7', margin: '0 6px' },
  /* 지역 평균 기준선 — 비교사업장 평균과 섞이지 않게 색을 달리한다 */
  baseline: { marginTop: 12, padding: '9px 14px', background: '#f4f7fb', border: '1px solid #dfe6ef',
              borderRadius: 7, fontSize: 12.5, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  baseNum: { fontSize: 17, fontWeight: 800, ...mono },
  simHit: { fontSize: 10.5, color: T.ok ?? '#1a7f4b', marginTop: 3, lineHeight: 1.4, whiteSpace: 'normal', maxWidth: 150 },
  simMiss: { fontSize: 10.5, color: T.muted, lineHeight: 1.4, whiteSpace: 'normal', maxWidth: 150 },
  link: { color: T.accent, textDecoration: 'none' },
  kind: { fontSize: 11, color: T.muted, background: '#f1f3f5', padding: '2px 7px', borderRadius: 4 },
  chips: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', margin: '0 0 14px' },
  chip: (on) => ({
    padding: '5px 12px', fontSize: 11.5, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${on ? T.accent : T.line}`, background: on ? '#eaf1fb' : '#fff', color: on ? T.accent : T.muted,
  }),
  pend: { color: T.muted, fontWeight: 400, fontStyle: 'italic', fontSize: 11.5 },
  propBox: { marginBottom: 14, borderRadius: 8, border: `1px solid ${T.lineStrong}`, overflow: 'hidden', background: '#fff' },
  propHead: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 16px', background: '#eef2f7', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 700, color: T.ink },
  propClause: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.muted },
  propTable: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  propKey: { padding: '7px 16px', color: T.ink2, whiteSpace: 'nowrap', width: 200 },
  propNum: { padding: '7px 8px', textAlign: 'right', fontWeight: 700, width: 140, ...mono },
  propUnit: { padding: '7px 4px', color: T.muted, fontSize: 11.5, width: 44 },
  propPy: { padding: '7px 16px', color: T.muted, fontSize: 11.5, ...mono },
  propFinal: { borderTop: `2px solid ${T.lineStrong}`, background: '#fffdf0', paddingTop: 9, paddingBottom: 9 },
  propWhy: { padding: '9px 16px 12px', fontSize: 12, color: T.ink2, lineHeight: 1.7 },
  propAsk: { padding: '11px 16px 13px', borderTop: `1px solid ${T.line}`, background: '#fafbfc' },
  propAskHead: { fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: '.04em', marginBottom: 7 },
  propCheck: { display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 11.5, color: T.ink2, lineHeight: 1.7, marginTop: 4 },
  propHint: { color: T.muted },
  exclRead: { display: 'flex', alignItems: 'baseline', gap: 7, padding: '5px 0', fontSize: 15, fontWeight: 700, ...mono },
  exclNote: { fontSize: 10.5, fontWeight: 400, color: T.muted, fontFamily: 'inherit', lineHeight: 1.4 },
  regScope: { marginTop: 7, paddingTop: 7, borderTop: `1px dashed ${T.line}`, fontSize: 11.5, color: T.ink2, lineHeight: 1.7 },
  badge: (tone) => ({
    fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
    background: tone === 'ok' ? T.okSoft : tone === 'warn' ? T.warnSoft : '#f1f3f5',
    color: tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : T.muted,
  }),
};

const won = (v) => (v == null ? '-' : Math.round(v).toLocaleString('ko-KR'));
const m2 = (v) => (v == null ? '-' : v.toFixed(2));
/* 1평 = 400/121 ㎡. 3.305785 로 쓰면 6,050,000원/㎡ 이 평당 19,999,999 로 떨어진다 */
const PY = 400 / 121;
const RADII = [1000, 2000, 3000, 4000, 5000];
const KIND_ORDER = ['아파트', '민간임대', '오피스텔', '도시형생활주택', '생활형숙박시설'];
const rLabel = (r) => `${r / 1000}km`;

/** 거리 요건 기본값 — 수도권·광역시 1km, 그 밖 2km */
const baseRadius = (region) =>
  REG.METRO.some(m => String(region ?? '').startsWith(m)) ? 1000 : 2000;

export default function CompareView({ addr, coord, region, polygon, radiusBasis, company, companyRank, excl = null, manualSum = null, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [autoMsg, setAutoMsg] = useState(null);   // [규정대로 자동선택] 이 무엇을 했는지
  const [regOpen, setRegOpen] = useState(false);  // 선정기준 원문 — 기본은 접힘

  const v = value ?? {};
  const radius = v.radius ?? baseRadius(region);
  const mode = v.mode ?? 'weighted';
  const areaBasis = v.areaBasis ?? 'supply';           // supply(심사기준) | exclusive
  const kinds = v.kinds ?? ['아파트'];
  const data = v.data ?? null;
  const picked = v.picked ?? [];
  const site = v.site ?? {};                           // 본건 제원 (유사도 판정용)
  const set = (patch) => onChange?.({ ...v, radius, mode, areaBasis, kinds, data, picked, site, ...patch });
  const setSite = (patch) => set({ site: { ...site, ...patch } });

  /* 민간임대 금액은 임대보증금이라 분양가와 자릿수가 다르다 — 평균에 절대 섞지 않는다 */
  const isSale = (a) => a.priceKind !== 'deposit';
  /** 단지 대표단가 — 면적기준(공급/전용) × 산식(가중/단순) */
  const priceOf = (a) => (areaBasis === 'supply'
    ? (mode === 'weighted' ? a.weightedSupply : a.simpleSupply)
    : (mode === 'weighted' ? a.weighted : a.simple));
  const usePoly = polygon?.length >= 3 && radiusBasis === 'polygon';

  /*
   * **지역 평균 분양가 기준선**(HUG · KOSIS 414/DT_41401N_005, 2026-09-17 연결).
   * 사용자 제안 — "분양가 정보를 얻지 못할 때는 분양보증 현황에서 가져올 수 있을 것 같다".
   * **시도 단위라 비교사업장(단지별)을 대체하지 못한다.** 규정 제16조가 요구하는 것은
   * 반경 안 유사사업장의 평균가격이다. 이 값은 "이 지역에서 이 정도가 보통" 이라는
   * 감각을 주는 기준선일 뿐이므로 평균에 섞지 않고 따로 적는다.
   */
  const [hug, setHug] = useState(null);
  useEffect(() => {
    if (!region) return;
    let dead = false;
    fetch(`/api/hug?region=${encodeURIComponent(region)}`)
      .then(r => r.json()).then(j => !dead && setHug(j)).catch(() => {});
    return () => { dead = true; };
  }, [region]);
  const hugPrice = hug?.price?.all ?? null;

  const collect = async () => {
    if (!coord) { setErr('사업지 주소를 먼저 확정하세요'); return; }
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams({ x: String(coord.x), y: String(coord.y), region, radius: String(radius) });
      /* 본건(심사대상) 단지가 제 목록에 앉지 않도록 확정한 주소를 같이 넘긴다 */
      if (addr) qs.set('site', `${region} ${addr}`.trim());
      // 그린 선이 곧 판정선이어야 한다 — 지도에 경계 기준으로 그릴 때만 경계로 잰다
      if (usePoly) qs.set('polygon', JSON.stringify(polygon));
      const res = await fetch(`/api/apts?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `수집 실패 (${res.status})`);
      set({ radius, data: j, picked: [] });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const all = data?.items ?? [];
  const kindCounts = useMemo(() => {
    const m = new Map();
    for (const a of all) m.set(a.kind ?? '아파트', (m.get(a.kind ?? '아파트') ?? 0) + 1);
    const rank = (k) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? KIND_ORDER.length : i; };
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [all]);

  /**
   * ③ 유사도 — 본건과 몇 개 항목이 일치하는가.
   * 택지유형은 원천에 없어 본건·상대 모두 수기다(상대는 아직 못 받으므로 판정에서 뺀다).
   */
  /* 본건 제원을 하나도 안 채웠으면 유사도를 "0개 일치" 로 붉게 띄우지 않는다 — 겁만 준다 */
  const siteFilled = Boolean(site.houseType || site.sizeBand || site.rankBand || site.landType);
  const similarity = (a) => {
    const hit = [];
    const miss = [];
    const cmp = (name, mine, theirs) => {
      if (!mine || !theirs) { miss.push(`${name}(미상)`); return; }
      (mine === theirs ? hit : miss).push(`${name}${mine === theirs ? '' : `(${theirs})`}`);
    };
    cmp('주택유형', site.houseType, a.houseType);
    cmp('단지규모', site.sizeBand, a.sizeBand);
    cmp('시공순위', site.rankBand, a.rankBand);
    cmp('택지유형', site.landType, a.landType);        // 상대 택지유형은 원천에 없다
    return { n: hit.length, hit, miss };
  };

  const items = useMemo(
    () => all.filter(a => kinds.includes(a.kind ?? '아파트')).map(a => ({ ...a, sim: similarity(a) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, kinds, site.houseType, site.sizeBand, site.rankBand, site.landType]);

  /* 본건은 보관본에서 복원돼도 평균에 들어가지 않는다 */
  const chosen = useMemo(() => items.filter(a => picked.includes(a.manageNo) && !a.isSite), [items, picked]);

  const toggleKind = (k) => {
    const next = kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k];
    const keep = all.filter(a => next.includes(a.kind ?? '아파트')).map(a => a.manageNo);
    set({ kinds: next, picked: picked.filter(no => keep.includes(no)) });
  };
  const toggle = (no) =>
    set({ picked: picked.includes(no) ? picked.filter(x => x !== no) : [...picked, no] });

  /**
   * ②③ 규정대로 자동선택.
   *   1) 유사도 2개 이상만 후보 · 공공분양/10년 경과는 제외(비고2)
   *   2) 1년 이내 분양개시 사업장이 있으면 그것만 (시기 우선)
   *   3) 3개 이상 일치가 있으면 그것만 (유사도 우선)
   */
  /*
    눌렀는데 **아무 일도 안 일어나는** 자리였다. 유사도 2개 이상이 하나도 없으면
    고른 것을 조용히 비웠다 — 손으로 골라둔 단지까지 같이 날아가고 사유도 안 남았다.
    (실측: 본건 제원 중 시공순위만 채운 상태로 누르면 5건 중 0건이 남는다)
    0건이면 **지우지 않고** 왜 0건인지 말한다.
  */
  const autoPick = () => {
    const sale = items.filter(isSale);
    const excluded = sale.filter(a => a.publicSale || a.years > 10).length;
    let c = sale.filter(a => a.sim.n >= 2 && !a.isSite && !a.publicSale && !(a.years > 10));
    if (!c.length) {
      setAutoMsg(`규정 요건(유사도 2개 이상 일치)을 채우는 단지가 없습니다`
        + `${excluded ? ` (공공분양·10년 경과로 제외한 ${excluded}건 별도)` : ''}`
        + ` — [본건 제원] 을 더 채우면 일치 항목이 늘어납니다. 고른 단지는 그대로 두었습니다.`);
      return;
    }
    const fresh = c.filter(a => a.timing === '1년 이내 분양개시');
    const usedFresh = fresh.length > 0;
    if (usedFresh) c = fresh;
    const three = c.filter(a => a.sim.n >= 3);
    const usedThree = three.length > 0;
    if (usedThree) c = three;
    setAutoMsg(`${c.length}곳을 골랐습니다 — 유사도 ${usedThree ? '3개 이상' : '2개 이상'} 일치`
      + `${usedFresh ? ' · 1년 이내 분양개시 우선' : ''}`
      + `${excluded ? ` · 공공분양·10년 경과 ${excluded}건 제외` : ''}`);
    set({ picked: c.map(a => a.manageNo) });
  };

  /* 비교사업장 평균 = 고른 단지들의 **산술평균** (평가표 검산으로 확인) */
  const avg = useMemo(() => {
    const vals = chosen.filter(isSale).map(priceOf).filter(x => x != null);
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, mode, areaBasis]);

  /* 본건 ㎡당 분양가 — ㎡ 또는 평 어느 쪽으로 넣어도 된다 */
  const sitePrice = Number(site.unitPrice) || null;
  const index = sitePrice && avg ? (sitePrice / avg) * 100 : null;
  /* A 는 **수기입력 탭**이 단일 지점으로 만든다 — 두 곳에서 받으면 조용히 갈린다 */
  const sc = scoreMatrix('분양가경쟁력', index ?? NaN, excl == null ? NaN : Number(excl));

  /* 제16조①2 — 적정분양가 산정 */
  /**
   * 제16조①2 — 적정분양가 산정.
   *
   * **④는 자동이 아니다.** "±10퍼센트 범위 이내로서 단위사업의 입지여건, 마감수준,
   * 인근부동산중개업소 방문조사 결과 등을 감안하여 그 **타당성이 인정되는 경우**" 다.
   * 예전에는 110% 이내면 말없이 예정분양가를 채택했는데, 그건 규정을 앞질러 간 것이다.
   * 원칙(나목)은 평균가격 채택이고, ④는 심사자가 체크해야 열린다.
   */
  const proper = (() => {
    if (!sitePrice || !avg) return null;
    const ratio = (sitePrice / avg) * 100;
    const within10 = ratio <= 110;
    if (sitePrice <= avg) {
      return {
        price: sitePrice, ratio, within10, tone: 'ok',
        clause: '제16조①2 가목',
        why: '예정분양가가 평균가격보다 낮으므로 예정분양가를 적용합니다.'
          + (ratio < 90 ? ' 적정분양가의 90% 미만이므로 실무상 적정한 것으로 간주합니다.' : ''),
      };
    }
    if (within10 && site.art4) {
      return {
        price: sitePrice, ratio, within10, tone: 'ok',
        clause: '제16조④',
        why: '±10% 범위 이내이고 입지여건·마감수준·인근 중개업소 방문조사 결과를 감안해 '
          + '타당성이 인정되는 것으로 판단하여 예정분양가를 적용합니다.',
      };
    }
    return {
      price: avg, ratio, within10, tone: 'warn',
      clause: '제16조①2 나목',
      why: '예정분양가가 평균가격보다 높으므로 평균가격을 적용하며, 보증신청인과 사전협의가 필요합니다.',
    };
  })();

  /* 근사 좌표로 찍은 핀은 이름에 그 사실을 적는다 — 지도에서 정확한 핀과 구분이 안 되면 안 된다 */
  const markers = useMemo(() => items.map((a, i) => ({
    no: i + 1, lat: a.y, lng: a.x, distance: a.distance,
    name: a.geocode && a.geocode !== 'exact' ? `${a.name} (${GEOCODE_LABEL[a.geocode] ?? '근사'})` : a.name,
  })), [items]);

  const basisNote = areaBasis === 'supply' ? '공급면적 기준' : '전용면적 기준';
  const noSupply = areaBasis === 'supply' && items.some(a => isSale(a) && priceOf(a) == null);

  return (
    <div style={S.page}>
      <h2 style={S.h2}>비교사업장 · 분양가 적정성</h2>
      <p style={S.subject}>▶ 사업지 : {addr ?? '주소 미확정'}{company ? ` · 시공사 ${company}` : ''}</p>

      {/*
        규정은 보이는 자리에 있어야 하지만 **매번 읽는 글은 아니다.**
        150px 을 늘 먹어서 정작 고르는 표가 그만큼 아래로 밀렸다 — 접어 두고 필요할 때 편다.
        머리줄에 요약을 남겨 "무엇을 근거로 거르는지" 는 접힌 채로도 보인다.
      */}
      <button style={S.regHead} onClick={() => setRegOpen(o => !o)}>
        <span style={{ fontWeight: 700 }}>인근 유사사업장 선정기준</span>
        <span style={S.regHeadNote}>
          제16조 · 거리 {radius / 1000}km · 1년 이내 분양개시 우선 · 유사도 2개 이상 · 공공분양/10년경과 제외
        </span>
        <span style={S.regHeadArrow}>{regOpen ? '접기 ▲' : '펴기 ▼'}</span>
      </button>
      <div style={{ ...S.reg, display: regOpen ? 'block' : 'none' }}>
        <div><span style={S.regKey}>① 거리</span> {REG.거리}</div>
        <div><span style={S.regKey}></span><span style={{ color: T.muted }}>측정 : {REG.거리측정}</span></div>
        <div><span style={S.regKey}>② 시기</span> {REG.시기}</div>
        <div><span style={S.regKey}>③ 유사도</span> {REG.유사도}</div>
        <div><span style={S.regKey}>제외</span> {REG.제외}</div>
        {/*
          같은 "인근 단지" 라는 말을 쓰지만 초기분양률의 선정기준은 이것과 다르다
          (준공 단지를 안 쓰고, 유사도를 브랜드로 보고, 못 찾으면 최하위 배점).
          이 목록을 그쪽에 돌려 쓰면 틀린다 — 어느 규정의 목록인지 못박아 둔다.
          대조표: docs/규정-인근단지-선정기준.md
        */}
        <div style={S.regScope}>
          이 선정기준은 <b>분양가 적정성(제16조)</b> 전용입니다 —
          인근아파트 <b>초기분양률</b>은 선정기준이 달라(준공 단지 제외 · 유사도를 브랜드로 판단 ·
          미존재시 최하위 배점) 이 목록을 그대로 쓸 수 없습니다.
        </div>
      </div>

      <div style={S.bar}>
        <span style={S.label}>반경</span>
        <span style={S.seg}>
          {RADII.map(r => (
            <button key={r} style={S.segBtn(r === radius)} onClick={() => set({ radius: r })}>{rLabel(r)}</button>
          ))}
        </span>
        <span style={S.label}>규정 기본 {rLabel(baseRadius(region))}</span>
        <button style={S.go(busy)} onClick={collect} disabled={busy || !coord}>
          {busy ? '수집 중…' : `반경 ${rLabel(radius)} 분양단지 수집`}
        </button>
      </div>

      <div style={S.bar}>
        <span style={S.label}>면적 기준</span>
        <span style={S.seg}>
          <button style={S.segBtn(areaBasis === 'supply')}
            title="Σ(세대수×세대당분양가) ÷ Σ(세대수×공급면적) — 심사 평가표가 쓰는 산식"
            onClick={() => set({ areaBasis: 'supply' })}>공급면적 (심사기준)</button>
          <button style={S.segBtn(areaBasis === 'exclusive')}
            title="전용면적으로 나눈 단가 — 같은 단지가 약 30% 높게 나온다"
            onClick={() => set({ areaBasis: 'exclusive' })}>전용면적</button>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.label}>단지 대표단가</span>
          <span style={S.seg}>
            <button style={S.segBtn(mode === 'weighted')} title="세대수로 가중한 평균 — 평가표 산식"
              onClick={() => set({ mode: 'weighted' })}>세대수 가중</button>
            <button style={S.segBtn(mode === 'simple')} title="주택형별 단가의 단순평균"
              onClick={() => set({ mode: 'simple' })}>단순평균</button>
          </span>
        </span>
      </div>

      {/* 본건 제원 — 유사도 판정과 분양가격지수에 쓴다 */}
      <div style={S.card}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: T.ink2 }}>
          본건 제원 <span style={{ fontWeight: 400, color: T.muted }}>· 유사도 판정과 분양가격지수에 씁니다</span>
        </div>
        <div style={S.grid}>
          <label style={S.field}>
            <span style={S.label}>본건 ㎡당 분양가 (원)</span>
            <input style={S.input} inputMode="numeric" value={site.unitPrice ?? ''}
              placeholder="입력"
              onChange={e => setSite({ unitPrice: e.target.value.replace(/[^\d]/g, '') })} />
          </label>
          <label style={S.field}>
            <span style={S.label}>평당 환산</span>
            <input style={S.input} inputMode="numeric"
              value={sitePrice ? Math.round(sitePrice * PY) : ''}
              placeholder="자동 환산"
              onChange={e => {
                const py = Number(e.target.value.replace(/[^\d]/g, ''));
                setSite({ unitPrice: py ? String(Math.round(py / PY)) : '' });
              }} />
          </label>
          {/* A 는 수기입력 탭이 만든다 — 여기서 또 받으면 두 값이 갈린다 */}
          <label style={S.field}>
            <span style={S.label}>제외 항목 점수 (A)</span>
            <span style={S.exclRead}>
              {excl != null ? excl : '—'}
              <span style={S.exclNote}>
                {excl != null
                  ? (manualSum?.source === 'override' ? '수기입력 탭 · 직접 입력' : '수기입력 탭에서 자동 합산')
                  : `[수기입력] 탭에서 완성하세요${manualSum?.missing?.length ? ` (${manualSum.missing.length}개 남음)` : ''}`}
              </span>
            </span>
          </label>
          <label style={S.field}>
            <span style={S.label}>가. 주택유형</span>
            <select style={S.select} value={site.houseType ?? ''} onChange={e => setSite({ houseType: e.target.value })}>
              <option value="">선택</option>
              {HOUSE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label style={S.field}>
            <span style={S.label}>나. 단지규모</span>
            <select style={S.select} value={site.sizeBand ?? ''} onChange={e => setSite({ sizeBand: e.target.value })}>
              <option value="">선택</option>
              {SIZE_BANDS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label style={S.field}>
            <span style={S.label}>다. 시공능력평가순위{companyRank ? ` (${companyRank}위)` : ''}</span>
            {/*
              순위를 알면서 구간을 또 고르게 하지 않는다. 말없이 채우면 입력값과 구분이 안 되므로
              **누를 때만** 들어간다 — 공동시공처럼 다른 시공자로 볼 때가 있어 자동채택이 늘 옳지도 않다.
              버튼을 select 아래에 두었더니 이 칸만 2줄이 되어 옆 칸(택지유형)이 밀렸다 — 같은 줄에 둔다.
            */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select style={S.select} value={site.rankBand ?? ''} onChange={e => setSite({ rankBand: e.target.value })}>
                <option value="">선택</option>
                {RANK_BANDS.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              {rankBandOf(companyRank) && site.rankBand !== rankBandOf(companyRank) && (
                <button type="button" style={S.take}
                  onClick={() => setSite({ rankBand: rankBandOf(companyRank) })}>
                  {rankBandOf(companyRank)}
                </button>
              )}
            </span>
          </label>
          <label style={S.field}>
            <span style={S.label}>라. 택지유형</span>
            <select style={S.select} value={site.landType ?? ''} onChange={e => setSite({ landType: e.target.value })}>
              <option value="">선택</option>
              {LAND_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <div style={{ ...S.note, marginTop: 8 }}>
          택지유형은 청약홈이 주지 않습니다 — 본건만 입력받고 <b>상대 단지는 판정에서 「미상」으로 둡니다</b>.
          추정해서 일치시키면 유사도가 부풀려집니다.
        </div>
      </div>

      {err && <div style={S.warn}>{err}</div>}

      {kindCounts.length > 0 && (
        <div style={S.chips}>
          <span style={S.label}>종류</span>
          {kindCounts.map(([k, n]) => (
            <button key={k} style={S.chip(kinds.includes(k))} onClick={() => toggleKind(k)}
              title={k === '민간임대' ? '공급금액이 임대보증금이라 분양가 평균에는 넣을 수 없습니다' : ''}>
              {k} {n}
            </button>
          ))}
          <span style={{ ...S.label, marginLeft: 4 }}>
            {items.length}건 표시{kinds.length === 0 && ' · 종류를 하나 이상 고르세요'}
          </span>
          {items.length > 0 && (
            /*
              못 누르는 이유를 title 에만 적어뒀더니, 마우스를 올리기 전에는
              **왜 회색인지 알 수 없었다**. 이유를 옆에 그대로 적는다.
            */
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {!siteFilled && (
                <span style={{ ...S.label, fontWeight: 400 }}>
                  위 [본건 제원] 을 채우면 유사도로 골라줍니다
                </span>
              )}
              <button style={{ ...S.ghost, opacity: siteFilled ? 1 : 0.5 }}
                onClick={autoPick} disabled={!siteFilled}
                title={siteFilled
                  ? '유사도 2개 이상 · 공공분양/10년 경과 제외 · 1년 이내 분양개시 우선 · 3개 이상 일치 우선'
                  : '위 [본건 제원] 을 채워야 유사도를 판정할 수 있습니다'}>
                규정대로 자동선택
              </button>
            </span>
          )}
          {autoMsg && (
            <div style={S.autoMsg}>{autoMsg}</div>
          )}
        </div>
      )}

      <div style={S.sum}>
        <span style={S.sumUnit}>비교사업장 {chosen.length}곳 평균</span>
        <span style={{ ...S.sumNum, color: avg == null ? T.muted : T.ink }}>{avg == null ? '—' : won(avg)}</span>
        <span style={S.sumUnit}>원/㎡ <span style={{ color: T.muted, fontWeight: 400 }}>({basisNote})</span></span>
        {index != null && (<>
          <span style={{ ...S.sumUnit, marginLeft: 10 }}>분양가격지수</span>
          <span style={{ ...S.sumNum, fontSize: 22 }}>{index.toFixed(2)}</span>
        </>)}
        <span style={S.sumNote}>
          {avg != null && <>평당 약 {won(avg * PY)} 원<br /></>}
          {sc && !sc.pending
            ? <b style={{ color: T.ink }}>{sc.score}점 · {sc.label} <span style={{ fontWeight: 400, color: T.muted }}>({sc.text})</span></b>
            : <span style={S.pend}>{sc?.text ?? '본건 분양가와 비교사업장을 정하면 점수가 나옵니다'}</span>}
        </span>
      </div>

      {/*
        적정분양가는 심사의 결론이다 — 한 줄 문장에 밀어넣으면 무엇이 값이고 무엇이 근거인지
        구분이 안 된다. 산정 과정을 **표로** 펴서 ①②와 결론을 한자리에서 본다.
        판단이 필요한 것(④ 타당성, 미분양관리지역)은 결론에서 떼어내 아래에 둔다.
      */}
      {proper && (
        <div style={S.propBox}>
          <div style={S.propHead}>
            <span>적정분양가 산정</span>
            <span style={S.propClause}>{proper.clause}</span>
          </div>
          <table style={S.propTable}>
            <tbody>
              <tr>
                <td style={S.propKey}>① 비교사업장 평균가격</td>
                <td style={S.propNum}>{won(avg)}</td>
                <td style={S.propUnit}>원/㎡</td>
                <td style={S.propPy}>평당 {won(avg * PY)}</td>
              </tr>
              <tr>
                <td style={S.propKey}>② 본건 예정분양가</td>
                <td style={S.propNum}>{won(sitePrice)}</td>
                <td style={S.propUnit}>원/㎡</td>
                <td style={S.propPy}>평당 {won(sitePrice * PY)}</td>
              </tr>
              <tr>
                <td style={S.propKey}>② ÷ ①</td>
                <td style={{ ...S.propNum, fontWeight: 600 }}>{proper.ratio.toFixed(1)}%</td>
                <td style={S.propUnit} />
                <td style={S.propPy}>
                  {proper.within10 ? '±10% 범위 이내' : '±10% 범위 초과'}
                </td>
              </tr>
              <tr>
                <td style={{ ...S.propKey, ...S.propFinal }}>⇒ 적정분양가</td>
                <td style={{ ...S.propNum, ...S.propFinal, fontSize: 17 }}>{won(proper.price)}</td>
                <td style={{ ...S.propUnit, ...S.propFinal }}>원/㎡</td>
                <td style={{ ...S.propPy, ...S.propFinal }}>평당 {won(proper.price * PY)}</td>
              </tr>
            </tbody>
          </table>
          <div style={S.propWhy}>{proper.why}</div>

          <div style={S.propAsk}>
            <div style={S.propAskHead}>심사자 판단</div>
            {/* ④ 는 자동이 아니다 — 타당성 인정은 사람이 한다 */}
            <label style={{ ...S.propCheck, opacity: proper.within10 && sitePrice > avg ? 1 : 0.45 }}>
              <input type="checkbox" checked={!!site.art4}
                disabled={!(proper.within10 && sitePrice > avg)}
                onChange={e => setSite({ art4: e.target.checked })} />
              <span>
                <b>제16조④ 타당성 인정</b> — ±10% 이내이고 입지여건·마감수준·인근 중개업소
                방문조사 결과를 감안해 타당하다고 판단
                {proper.within10 && sitePrice > avg
                  ? <span style={S.propHint}> → 체크하면 적정분양가가 예정분양가 {won(sitePrice)} 이 됩니다</span>
                  : <span style={S.propHint}> (예정분양가가 평균보다 높고 ±10% 이내일 때만 해당)</span>}
              </span>
            </label>
            <label style={S.propCheck}>
              <input type="checkbox" checked={!!site.unsoldZone}
                onChange={e => setSite({ unsoldZone: e.target.checked })} />
              <span>
                <b>미분양관리지역 사업장</b> — 예정분양가가 적정분양가의 105% 이내여야 함 (제16조⑥)
                {site.unsoldZone && (
                  <b style={{ color: proper.ratio <= 105 ? T.ok : T.warn }}>
                    {' '}→ 현재 {proper.ratio.toFixed(1)}% · {proper.ratio <= 105 ? '충족' : '초과'}
                  </b>
                )}
              </span>
            </label>
          </div>
        </div>
      )}

      {/*
        아직 산정할 수 없어도 **자리는 보여준다.**
        전에는 조건이 갖춰지기 전까지 이 표가 통째로 없어서
        "분양가 적정성은 어디 있냐" 가 됐다 — 없는 것과 대기 중인 것은 다르다.
      */}
      {!proper && (
        <div style={{ ...S.propBox, opacity: 0.85 }}>
          <div style={S.propHead}>
            <span>적정분양가 산정</span>
            <span style={S.propClause}>주택분양보증 심사지침 제16조</span>
          </div>
          <table style={S.propTable}>
            <tbody>
              <tr>
                <td style={S.propKey}>① 비교사업장 평균가격</td>
                <td style={{ ...S.propNum, color: avg == null ? T.muted : T.ink }}>{avg == null ? '—' : won(avg)}</td>
                <td style={S.propUnit}>원/㎡</td>
                <td style={S.propPy}>{avg == null ? '아래 표에서 비교사업장을 고르세요' : `평당 ${won(avg * PY)}`}</td>
              </tr>
              <tr>
                <td style={S.propKey}>② 본건 예정분양가</td>
                <td style={{ ...S.propNum, color: sitePrice == null ? T.muted : T.ink }}>{sitePrice == null ? '—' : won(sitePrice)}</td>
                <td style={S.propUnit}>원/㎡</td>
                <td style={S.propPy}>{sitePrice == null ? '위 [본건 제원] 에 입력하세요' : `평당 ${won(sitePrice * PY)}`}</td>
              </tr>
              <tr>
                <td style={S.propKey}>② ÷ ①</td>
                <td style={{ ...S.propNum, color: T.muted }}>—</td>
                <td style={S.propUnit} />
                <td style={S.propPy} />
              </tr>
              <tr>
                <td style={{ ...S.propKey, ...S.propFinal }}>⇒ 적정분양가</td>
                <td style={{ ...S.propNum, ...S.propFinal, color: T.muted }}>—</td>
                <td style={{ ...S.propUnit, ...S.propFinal }}>원/㎡</td>
                <td style={{ ...S.propPy, ...S.propFinal }} />
              </tr>
            </tbody>
          </table>
          <div style={{ ...S.propWhy, color: T.muted }}>
            {avg == null && sitePrice == null
              ? '반경 안의 분양단지를 수집해 비교사업장을 고르고, 본건 예정분양가를 입력하면 여기서 적정분양가가 산정됩니다.'
              : avg == null
                ? '비교사업장을 고르면 평균가격이 잡히고 적정분양가가 산정됩니다.'
                : '본건 예정분양가를 입력하면 적정분양가가 산정됩니다.'}
          </div>
        </div>
      )}
      {!data && (
        <div style={S.empty}>
          사업지 주소를 확정한 뒤 반경을 고르고 [수집] 을 누르세요.<br />
          <span style={{ fontSize: 12 }}>한국부동산원 청약홈 분양정보에서 반경 안의 분양 단지를 찾습니다.</span>
        </div>
      )}
      {data && all.length === 0 && (
        <div style={S.warn}>
          반경 {rLabel(data.radius)} 안에 분양공고 이력이 있는 단지가 없습니다
          ({data.sido} 공고 {data.scanned}건 조회).
          규정상 <b>매 1km 범위로 확장</b>해 다시 조사합니다 — 위에서 반경을 넓히세요.
        </div>
      )}
      {data && all.length > 0 && items.length === 0 && (
        <div style={S.warn}>반경 안에 {all.length}건이 있지만 고른 종류에 해당하는 것이 없습니다 — 위에서 종류를 켜세요.</div>
      )}

      {items.length > 0 && (<>
        {/*
          **반경 안을 먼저 다 담고, 단계별로 거른다**(사용자 확정 2026-09-17).
          어느 단계에서 몇 건이 빠졌는지 한 줄로 보여준다 —
          "옆에 단지가 있는데 왜 표에 없나" 가 이 줄에서 답이 된다.
        */}
        {data.funnel && (
          <div style={S.funnel}>
            {data.sido} 공고 <b>{data.funnel.scanned}</b>
            <span style={S.arrow}>→</span> 인근 시군구 <b>{data.funnel.shortlisted}</b>
            <span style={S.arrow}>→</span> 좌표 확보 <b>{data.funnel.located}</b>
            <span style={S.arrow}>→</span> 반경 {rLabel(data.radius)} 안 <b>{data.funnel.within}</b>
            {data.funnel.rental > 0 && <><span style={S.arrow}>→</span> 임대 제외 <b>-{data.funnel.rental}</b></>}
            <span style={S.arrow}>→</span> 표 <b>{all.length}</b>
            {items.length !== all.length && <><span style={S.arrow}>→</span> 고른 종류 <b>{items.length}</b></>}
            {data.funnel.approx > 0 &&
              <span style={{ color: T.muted, marginLeft: 8 }}>· 이 중 {data.funnel.approx}건은 근사 좌표</span>}
          </div>
        )}
        {noSupply && (
          <div style={{ ...S.warn, marginBottom: 10 }}>
            일부 단지는 원천이 <b>공급면적을 주지 않습니다</b>(오피스텔·도시형생활주택 계열).
            그 줄은 심사기준 단가가 비어 있으니 [전용면적] 으로 바꿔 보거나 선택에서 빼세요.
          </div>
        )}
        <div style={S.scroll}>
          <table style={S.table}>
            <thead><tr>
              {['선택', '#', '종류', '단지명', '주소', '거리', '분양개시일', '시기', '공급세대', '면적', `분양가(원/㎡)`, '유사도'].map(c =>
                <th key={c} style={S.th}>{c}</th>)}
            </tr></thead>
            <tbody>
              {items.map((a, i) => {
                const on = picked.includes(a.manageNo);
                const old = a.years > 10;
                const drop = a.publicSale || old;      // 비고2 — 평균가격 왜곡
                return (
                  <tr key={a.manageNo} style={on ? S.rowOn : drop ? S.rowOut : undefined}>
                    <td style={S.td}>
                      <input type="checkbox" checked={on} disabled={!isSale(a) || a.isSite}
                        title={a.isSite ? '본건(심사대상)이라 비교사업장에 넣을 수 없습니다'
                             : isSale(a) ? '' : '임대보증금이라 분양가 평균에 넣을 수 없습니다'}
                        onChange={() => toggle(a.manageNo)} />
                    </td>
                    <td style={S.td}>{i + 1}</td>
                    <td style={S.tdNo}><span style={a.kind === '아파트' ? undefined : S.kind}>{a.kind}</span></td>
                    <td style={S.tdL}>
                      {a.url ? <a href={a.url} target="_blank" rel="noreferrer" style={S.link}>{a.name}</a> : a.name}
                      {a.builder && <span style={{ color: T.muted, fontSize: 11 }}> · {a.builder}{a.builderRank ? ` ${a.builderRank}위` : ''}</span>}
                      {a.isSite && <><br /><span style={S.badge('ok')} title="사업지와 같은 지번입니다 — 자기 자신은 비교사업장이 될 수 없습니다">
                        본건 (심사대상) — 비교에서 제외
                      </span></>}
                      {drop && <><br /><span style={S.badge('warn')}>
                        {a.publicSale ? '공공분양 — 제외 권고' : '분양개시 10년 경과 — 제외 권고'}
                      </span></>}
                    </td>
                    <td style={S.tdL}>{a.address}</td>
                    {/*
                      **이 거리가 정확한 좌표로 잰 것인지 보여준다.**
                      공고 주소에 지번이 없으면(신규 택지 블록 표기) 읍면동 중심으로 잴 수밖에 없는데,
                      그러면 수백 m 틀어진다 — 반경 1~5km 판정에 그대로 들어가므로 숨기면 안 된다.
                    */}
                    <td style={S.tdNo}>
                      {a.distance}m
                      {a.geocode && a.geocode !== 'exact' && (
                        <><br /><span style={S.badge('warn')} title={GEOCODE_NOTE[a.geocode]}>
                          {GEOCODE_LABEL[a.geocode]}
                        </span></>
                      )}
                    </td>
                    <td style={S.tdNo}>{a.saleStart ?? '-'}</td>
                    <td style={S.tdNo}>
                      <span style={S.badge(a.timing === '1년 이내 분양개시' ? 'ok' : 'none')}>{a.timing ?? '-'}</span>
                    </td>
                    <td style={S.tdNo}>{a.totalHouseholds?.toLocaleString('ko-KR') ?? '-'}</td>
                    <td style={S.tdNo}>
                      {areaBasis === 'supply'
                        ? (a.supplyMin ? `${m2(a.supplyMin)}~${m2(a.supplyMax)}㎡` : '-')
                        : (a.areaMin ? `${m2(a.areaMin)}~${m2(a.areaMax)}㎡` : '-')}
                    </td>
                    {isSale(a)
                      ? <td style={{ ...S.tdVal, whiteSpace: 'nowrap' }}>{won(priceOf(a))}</td>
                      : <td style={S.tdNo} title="민간임대의 공급금액은 임대보증금입니다">
                          <span style={S.pend}>임대보증금 {won(priceOf(a))}</span>
                        </td>}
                    {/*
                      **무엇이 일치했는지 화면에 적는다**(사용자 요청 2026-09-17).
                      전에는 `title` 에만 있어 마우스를 올리기 전엔 안 보였다 —
                      이 앱이 이미 두 번 겪은 함정이다. 선정 근거라 증빙에도 남아야 한다.
                    */}
                    <td style={S.tdNo}>
                      {siteFilled ? (<>
                        <span style={S.badge(a.sim.n >= 3 ? 'ok' : a.sim.n >= 2 ? 'none' : 'warn')}>{a.sim.n}개 일치</span>
                        <div style={S.simHit}>{a.sim.hit.join(' · ') || '일치 없음'}</div>
                        {a.sim.miss.length > 0 && <div style={S.simMiss}>{a.sim.miss.join(' · ')}</div>}
                      </>) : <span style={S.pend}>본건 제원 미입력</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/*
          **기축 단지** — 청약홈 적재가 2020-02 부터라 그 앞 단지는 원천에 아예 없다.
          실측(용답동 1km): 청약홈 4건 vs 카카오 아파트 16곳.
          **분양가는 어느 원천에도 없다.** 그래서 평균에 넣지 못하고, 그 사실을 적어 둔다 —
          조용히 섞으면 분양가격지수가 통째로 틀어진다.
        */}
        {hugPrice && (
          <div style={S.baseline}>
            <b>{hug.price.areaName} 지역 평균 분양가</b>
            <span style={S.baseNum}>{won(hugPrice)}</span>
            <span style={{ color: T.muted }}>원/㎡ · {String(hug.price.period).slice(0, 4)}년 {String(hug.price.period).slice(4)}월</span>
            {avg != null && (
              <span style={{ marginLeft: 8, color: T.ink2 }}>
                비교사업장 평균은 이 값의 <b>{((avg / hugPrice) * 100).toFixed(1)}%</b>
              </span>
            )}
            <span style={{ width: '100%', color: T.muted, fontSize: 11, marginTop: 4 }}>
              {hug.price.citation} · <b>시도 단위</b>라 규정 제16조의 「인근 유사사업장 평균가격」을 대체하지 못합니다 —
              반경 안에 비교할 단지가 없을 때 감각을 잡는 기준선입니다.
              {' '}{hug.price.areaBasisNote}.
              {hug.price.bySize?.T3 && <> 규모별 : 60㎡이하 {won(hug.price.bySize.T2?.won)} · 60~85 {won(hug.price.bySize.T3?.won)} · 85~102 {won(hug.price.bySize.T4?.won)} · 102초과 {won(hug.price.bySize.T5?.won)}</>}
            </span>
          </div>
        )}

        {data.knownApts?.items?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={S.secTitle}>
              반경 {rLabel(data.radius)} 기축·미공고 단지 {data.knownApts.items.length}곳
              <span style={{ fontWeight: 400, color: T.muted, fontSize: 11.5 }}>
                {' · '}청약홈에 분양공고가 없어 <b>분양가를 알 수 없습니다</b> — 비교사업장 평균에 넣지 못합니다
              </span>
            </div>
            <div style={S.scroll}>
              <table style={S.table}>
                <thead><tr>{['#', '단지명', '주소', '거리', '세대수', '시공사', '사용승인일',
                             '실거래 단가(원/㎡·전용)', '거래'].map(c =>
                  <th key={c} style={S.th}>{c}</th>)}</tr></thead>
                <tbody>
                  {data.knownApts.items.map((a, i) => (
                    <tr key={`${a.name}-${i}`} style={S.rowOut}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.tdL}>
                        {a.name}
                        {a.planned && <span style={{ ...S.badge('none'), marginLeft: 6 }}>미준공</span>}
                      </td>
                      <td style={S.tdL}>{a.address}</td>
                      <td style={S.tdNo}>{a.distance}m</td>
                      <td style={S.tdNo}>{a.kapt?.households?.toLocaleString('ko-KR') ?? '-'}</td>
                      <td style={S.tdL}>{a.kapt?.builder ?? '-'}</td>
                      <td style={S.tdNo}>{a.kapt?.usedate ?? '-'}</td>
                      <td style={S.tdNo}>{a.trade ? won(a.trade.unit) : '-'}</td>
                      <td style={S.tdNo}>
                        {a.trade
                          ? <span style={{ fontSize: 11, color: T.muted }}>{a.trade.deals}건 · {a.trade.from}~{a.trade.to}</span>
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={S.note}>
              * 출처 : <b>{data.knownApts.source?.name}</b>
              {data.knownApts.source?.detail ? ` · ${data.knownApts.source.detail}` : ''}<br />
              <b>실거래 단가는 분양가가 아닙니다</b> — 이미 팔린 값이고 <b>전용면적</b> 기준이라
              심사기준(공급면적) 단가보다 높게 나옵니다. 위 비교사업장 평균에 넣지 않습니다.
              Σ거래금액 ÷ Σ전용면적(면적 가중)으로 냈습니다.<br />
              카카오 장소검색은 한 번에 45곳까지만 줍니다 — <b>가까운 곳부터</b> 받습니다
              {data.knownApts.scanned != null && ` (반경 안 아파트 분류 ${data.knownApts.scanned}곳 중)`}.
              세대수·시공사·사용승인일이 빈 줄은 K-apt 에서 이름이 맞지 않은 것입니다(관리비 의무단지만 있습니다).
            </p>
          </div>
        )}

        {data.excludedRental?.length > 0 && (
          <div style={{ ...S.warn, marginTop: 10 }}>
            반경 안에 <b>분양전환 임대 아파트 {data.excludedRental.length}건</b>이 더 있었지만 분양가가 없어 표에서 뺐습니다 —{' '}
            {data.excludedRental.slice(0, 3).map(r => `${r.name} (${r.distance}m · ${r.kind})`).join(' · ')}
            {data.excludedRental.length > 3 && ` 외 ${data.excludedRental.length - 3}건`}
          </div>
        )}

        {/*
          **목록이 아니라 건수 한 줄이다**(사용자 지적 2026-09-17).
          같은 시군구를 전부 적으면 반경과 무관한 단지까지 길게 늘어놓게 된다.
          좌표는 택지지구 단계까지 찾아보고, 그래도 못 찾은 것만 숫자로 남긴다.
        */}
        {data.unlocated?.length > 0 && (
          <div style={{ ...S.warn, marginTop: 10 }}>
            같은 시군구에 <b>위치를 못 찾은 공고 {data.unlocated.length}건</b>이 있습니다 —
            지번도 택지지구명도 대장에 없어 좌표를 얻지 못했습니다.
            <b> 반경 안인지 밖인지도 알 수 없어</b> 표에 넣지 않았습니다.
            <span style={{ color: T.muted }}> (예: {data.unlocated[0].address})</span>
          </div>
        )}

        <p style={S.note}>
          {data.source?.citation}<br />
          거리는 <b>사업지 {data.basis === 'polygon' ? '경계 최단거리' : '대표지번 중심'}</b> ↔ 상대 단지 <b>대표지번</b> 기준입니다.
          규정은 경계↔경계를 요구하지만 상대 단지의 경계는 공개 원천에 없습니다 — 그만큼 거리가 길게 잡힙니다.
          같은 단지가 재공고(조합원 취소분 등)로 여러 건 올라오면 <b>최신 공고 1건</b>만 남깁니다.
        </p>

        <div style={S.secTitle}>반경 {rLabel(data.radius)} 분양단지 위치</div>
        <RadiusMap
          /* RadiusMap 이 제목 뒤에 "· 반경 Nkm" 을 스스로 붙인다 — 여기서 또 쓰면 두 번 나온다 */
          title="비교사업장"
          center={{ lat: Number(coord.y), lng: Number(coord.x) }}
          radius={data.radius}
          markers={markers}
          polygon={data.basis === 'polygon' ? polygon : null}
          radiusBasis={radiusBasis}
          defaultMapType="ROADMAP"
          caption="핀 번호 = 위 표의 #"
        />

        <div style={S.secTitle}>선택 단지 상세 (면적별)</div>
        {chosen.length === 0
          ? <div style={S.empty}>위 표에서 단지를 선택하면 면적별 세대수와 분양가가 여기 표시됩니다.</div>
          : (
            <div style={S.scroll}>
              <table style={S.table}>
                <thead><tr>
                  {['단지명', '주소', '주택형', '전용면적(㎡)', '공급면적(㎡)', '세대수', '세대당분양가(원)', '원/㎡'].map(c =>
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
                        <td style={S.td}>{m2(t?.supplyArea)}</td>
                        <td style={S.td}>{t ? t.households.toLocaleString('ko-KR') : '-'}</td>
                        <td style={S.td}>{won(t?.amount)}</td>
                        <td style={S.tdVal}>{won(areaBasis === 'supply' ? t?.unitPriceSupply : t?.unitPrice)}</td>
                      </tr>
                    ));
                  })}
                  {chosen.map(a => (
                    <tr key={`sum-${a.manageNo}`}>
                      <td style={S.tdL} colSpan={5}>
                        <b>{a.name}</b> 계 · {mode === 'weighted' ? '세대수 가중' : '단순'}평균 ({basisNote})
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
