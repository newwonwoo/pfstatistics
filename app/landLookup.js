'use client';
import { fetchJson } from './fetchJson';
import { landInfoOf, slimDistrict } from '../src/lib/landSite';

/**
 * 고른 비교단지마다 사업지구를 조회해 **사업부지 원천 정보 한 줄**을 만든다(판정하지 않는다).
 * 민간/공공/환지/수용은 화면에서 실무자가 고른다. 엑셀은 화면이 받아 둔 값을 쓰고, 못 받은 것만 다시 부른다.
 *
 * @returns {Promise<Record<string, string>>}  manageNo → 원천 정보
 */
export async function lookupLand(items = []) {
  const out = {};
  await Promise.all(items.map(async (a) => {
    let d;
    if (a.x == null || a.y == null) d = { error: '단지 좌표 없음' };
    else {
      try { d = slimDistrict(await fetchJson(`/api/district?x=${a.x}&y=${a.y}`)); }
      catch (e) { d = { error: e.message }; }
    }
    out[a.manageNo] = landInfoOf(a, d);
  }));
  return out;
}

/** 저장된 값이 원천 정보를 갖고 있는가 — 2026-10-03 오전의 자동 판정본({type, detail})은 버리고 다시 받는다 */
export const hasLandInfo = (e) => e != null && typeof e.info === 'string';
