/**
 * 시군구 → 법정동코드 앞 5자리.
 *
 * KOSIS 는 지역을 objL1(시군구코드)로 지정해야 조회된다.
 * 코드를 하드코딩하면 행정구역 개편 때마다 깨지므로,
 * 카카오 로컬 API 로 주소를 조회해 코드를 얻는 방식이 정석이지만
 * 시군구는 개수가 한정적이라 조회결과를 캐시해 쓴다.
 */
const cache = new Map();

/** "경기도 광주시" → "41610" */
export async function toSggCode(region, { kakaoKey } = {}) {
  const k = region.trim();
  if (cache.has(k)) return cache.get(k);

  if (!kakaoKey) throw new Error(`시군구코드 조회 불가 — KAKAO_REST_KEY 필요 (${k})`);
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(k)}`,
    { headers: { Authorization: `KakaoAK ${kakaoKey.trim()}` } },
  );
  if (!res.ok) throw new Error(`주소 조회 실패(${res.status}): ${k}`);
  const j = await res.json();
  const code = j.documents?.[0]?.address?.b_code;
  if (!code) throw new Error(`시군구코드를 찾지 못했습니다: ${k}`);
  const sgg = String(code).slice(0, 5);
  cache.set(k, sgg);
  return sgg;
}

/** 카카오가 막혀도 자주 쓰는 시군구는 바로 나가게 해둔다 */
export const KNOWN = {
  '경기도 광주시': '41610',
};
export function known(region) { return KNOWN[region.trim()] ?? null; }
