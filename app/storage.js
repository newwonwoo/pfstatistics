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
    savedAt: r.savedAt,
  }));
}

export function load(id) {
  return read().find(r => r.id === id) ?? null;
}

/** 같은 사업장·조회월이면 덮어쓰고 맨 앞으로 올린다 */
export function save({ data, facilities, addr }) {
  if (!data) return false;
  const id = recordId(data);
  const rec = {
    id, region: data.region, period: data.period, company: data.company,
    addr: addr ?? null, data, facilities: facilities ?? null,
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
