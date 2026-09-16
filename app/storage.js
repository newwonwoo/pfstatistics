'use client';

/**
 * 조회 결과 브라우저 보관.
 *
 * 심사는 내부망에서 하고, 이 앱은 개인이 쓰는 자료수집 도구다.
 * 서버에 쌓을 이유가 없고 계정도 없으므로 localStorage 에 개인별로 남긴다.
 * 같은 사업장을 다시 열면 재조회 없이 그때 수치를 그대로 본다 — 감사 대응에도 유리하다.
 *
 * 저장 실패(용량초과·사생활보호모드)는 조용히 넘긴다. 보관은 편의기능이지 필수가 아니다.
 */
const KEY = 'pf-stat-records-v1';
const LIMIT = 50;   // 브라우저 저장소 한도를 넘기지 않도록

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
    return true;
  } catch { return false; }
}

/** 사업장 + 조회월 조합을 하나의 건으로 본다 */
export const recordId = ({ region, period, company }) =>
  [region, period, company ?? ''].join('|');

export function list() {
  return read().map(r => ({
    id: r.id, region: r.region, period: r.period, company: r.company,
    addr: r.addr ?? null,
    okCount: r.data?.okCount ?? 0, total: r.data?.total ?? 0,
    hasFacilities: Boolean(r.facilities),
    hasInput: Boolean(r.sheetInput || r.review),
    savedAt: r.savedAt,
  }));
}

export function load(id) {
  return read().find(r => r.id === id) ?? null;
}

/** 같은 사업장·조회월이면 덮어쓰고 맨 앞으로 올린다 */
export function save({ data, facilities, addr, manual, compare, rate, review, sheetInput }) {
  if (!data) return false;
  const id = recordId(data);
  const rec = {
    id, region: data.region, period: data.period, company: data.company,
    addr: addr ?? null, data, facilities: facilities ?? null,
    manual: manual ?? null,   // 수기판정(6차선 왕복도로 등)도 같이 보관해야 재현된다
    compare: compare ?? null, // 비교사업장 — 고른 단지까지 같이 보관해야 평균이 재현된다
    /*
      수기입력·초기예상분양률·심사평점표 입력은 **손으로 넣은 값이라 재조회로 되살릴 수 없다.**
      전에는 page.js 가 넘기는데 여기서 받지 않아 통째로 버려졌다 —
      보관본을 다시 열면 A·종합평점이 빈 채로 나왔다(실측).
    */
    sheetInput: sheetInput ?? null, // 규모및배치 · 평형구성 · 인근초기분양률 · 점수 직접
    rate: rate ?? null,             // 주택 종류 등 분양률 산정 설정
    review: review ?? null,         // 심사평점표 입력값
    savedAt: new Date().toISOString(),
  };
  const rest = read().filter(r => r.id !== id);
  return write([rec, ...rest]);
}

export function remove(id) {
  return write(read().filter(r => r.id !== id));
}

export function clearAll() {
  try { localStorage.removeItem(KEY); return true; } catch { return false; }
}
