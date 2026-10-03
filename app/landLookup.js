'use client';
import { fetchJson } from './fetchJson';
import { siteLandOf, slimDistrict } from '../src/lib/landSite';

/**
 * 고른 비교단지마다 사업지구를 조회해 **사업부지(민간/공공/수용/환지)** 를 낸다.
 * 비교사업장 화면이 고를 때 부르고, 엑셀은 화면이 이미 받아 둔 값을 쓴다(못 받은 것만 다시 부른다).
 *
 * @param {object[]} items   비교단지(청약홈 봉투 · x,y 필요)
 * @returns {Promise<Record<string, {type, detail}>>}  manageNo → 판정
 */
export async function lookupLand(items = []) {
  const out = {};
  await Promise.all(items.filter(a => a.x != null && a.y != null).map(async (a) => {
    let d;
    try { d = slimDistrict(await fetchJson(`/api/district?x=${a.x}&y=${a.y}`)); }
    catch (e) { d = { error: e.message }; }
    out[a.manageNo] = siteLandOf(a, d);
  }));
  return out;
}
