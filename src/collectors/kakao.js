import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';

const BASE = 'https://dapi.kakao.com/v2/local';
const H = () => ({ Authorization: `KakaoAK ${requireKey('KAKAO_REST_KEY')}` });

/**
 * 캡쳐(교통환경·주거편의·교육환경)의 평가기준 → 카카오 카테고리 그룹 매핑.
 * radius 는 캡쳐에 적힌 "사업지 반경 N 이내" 문구를 그대로 옮긴 값이다.
 */
export const FACILITY_SPEC = {
  // 교통환경
  지하철역:   { sheet: '교통환경', category: 'SW8', radius: 1000 },
  // 6차선 왕복도로는 POI 가 아니라 도로 → 카테고리 검색 불가. 도로망 데이터 별도 필요(아래 note)
  // 주거편의
  상업시설:   { sheet: '주거편의', category: 'MT1', radius: 1500 },
  의료시설:   { sheet: '주거편의', category: 'HP8', radius: 1500 },
  공원:       { sheet: '주거편의', keyword: '공원', radius: 1000 },
  문화시설:   { sheet: '주거편의', category: 'CT1', radius: 1000 },
  공공시설:   { sheet: '주거편의', category: 'PO3', radius: 1000 },
  // 교육환경 (500m / 1km 2단 판정)
  초등학교:   { sheet: '교육환경', category: 'SC4', radius: 1000, nameFilter: /초등학교$/ },
  중학교:     { sheet: '교육환경', category: 'SC4', radius: 1000, nameFilter: /중학교$/ },
  고등학교:   { sheet: '교육환경', category: 'SC4', radius: 1000, nameFilter: /고등학교$/ },
};

/** 주소 → 좌표 (사업지 주소가 입력이므로 이게 모든 지도 수집의 출발점) */
export async function geocode(address) {
  const d = await getJson(`${BASE}/search/address.json?query=${encodeURIComponent(address)}`, { headers: H() });
  const doc = d.documents?.[0];
  if (!doc) throw new Error(`주소 좌표변환 실패: ${address}`);
  return {
    x: Number(doc.x), y: Number(doc.y),
    roadAddress: doc.road_address?.address_name ?? null,
    jibunAddress: doc.address?.address_name ?? null,
  };
}

async function searchAll(path, params) {
  const out = [];
  for (let page = 1; page <= 3; page++) {   // 카카오 최대 45건(15×3)
    const d = await getJson(`${BASE}/search/${path}.json?${new URLSearchParams({ ...params, page, size: 15 })}`, { headers: H() });
    out.push(...(d.documents ?? []));
    if (d.meta?.is_end) break;
  }
  return out;
}

/** 좌표 기준 반경내 시설 수집. 거리 오름차순으로 반환한다(가장 가까운 1건이 증빙 대상). */
export async function collectFacilities({ x, y }, only = null) {
  const result = {};
  for (const [label, spec] of Object.entries(FACILITY_SPEC)) {
    if (only && !only.includes(label)) continue;
    const params = { x, y, radius: spec.radius, sort: 'distance' };
    let docs = spec.category
      ? await searchAll('category', { ...params, category_group_code: spec.category })
      : await searchAll('keyword', { ...params, query: spec.keyword });
    if (spec.nameFilter) docs = docs.filter(d => spec.nameFilter.test(d.place_name));
    result[label] = {
      sheet: spec.sheet,
      radius: spec.radius,
      count: docs.length,
      nearest: docs[0] ? { name: docs[0].place_name, distance: Number(docs[0].distance), x: docs[0].x, y: docs[0].y } : null,
      items: docs.map(d => ({ name: d.place_name, distance: Number(d.distance), address: d.road_address_name || d.address_name, x: d.x, y: d.y })),
    };
  }
  return result;
}

/**
 * ⚠️ 6차선 왕복도로는 POI 검색으로 안 나온다.
 * 캡쳐(이배재로, 반경 300m 이내 존재)는 실무자가 지도 보고 눈으로 판정한 것.
 * → 국가교통DB 또는 도로명주소 도로구간 데이터(차로수 속성) 필요. 1차에서는 수기입력 유지.
 */
export const ROAD_NOTE = '6차선 왕복도로: POI 아님 → 도로명주소 도로구간DB(차로수) 연계 필요. 1차 수기입력.';
