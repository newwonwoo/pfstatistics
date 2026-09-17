import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';
import { centroid, circumradius, distanceToPolygon } from '../lib/geo.js';

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
  /*
   * 상업시설 = 대형마트 + 백화점.
   * 백화점은 카테고리 코드가 없어 키워드로 보완하는데, 그대로 쓰면
   * "밧데리백화점" 같은 상호가 딸려온다(실제 광주시 조회에서 확인).
   * → 카카오가 분류한 category_name 이 대형마트/백화점 계열인 것만 남긴다.
   */
  상업시설: {
    sheet: '주거편의', category: 'MT1', keywordAlso: '백화점', radius: 1500,
    categoryFilter: /대형마트|백화점/,
  },
  /*
   * 의료시설: HP8(병원)에는 동물병원도 들어간다("송정동물의료센터" 확인).
   * 사람 대상 의료기관만 남긴다.
   */
  /*
   * 의료시설은 카카오가 아니라 심평원에서 가져온다 (src/collectors/hira.js).
   * 카카오 카테고리 말단은 진료과목이라 의료법상 종별을 못 가린다 —
   * 30병상 넘는 정형외과병원이 걸러지고 의원이 병원으로 잡힌다.
   * 심사 기준은 병원급 이상이므로 법정 종별이 있는 심평원을 쓴다.
   */
  // 공원도 카테고리가 없어 키워드로 잡는다. "물놀이장·주차장" 같은 부속시설이 섞이므로
  // 카카오 분류가 공원 계열인 것만 남긴다.
  공원: {
    sheet: '주거편의', keyword: '공원', radius: 1000,
    categoryFilter: /공원/,
    excludeName: /주차장|화장실|매점/,
  },
  문화시설:   { sheet: '주거편의', category: 'CT1', radius: 1000 },
  공공시설:   { sheet: '주거편의', category: 'PO3', radius: 1000 },
  // 교육환경 (500m / 1km 2단 판정)
  초등학교:   { sheet: '교육환경', category: 'SC4', radius: 1000, nameFilter: /초등학교$/ },
  중학교:     { sheet: '교육환경', category: 'SC4', radius: 1000, nameFilter: /중학교$/ },
  고등학교:   { sheet: '교육환경', category: 'SC4', radius: 1000, nameFilter: /고등학교$/ },
};

/**
 * 사업지 주소 표기를 카카오가 읽을 수 있게 다듬는다.
 *
 * 실무 주소는 "탄벌동 203-4 **외 57필지**" 처럼 필지 수가 붙어 오는데,
 * 카카오 주소검색은 이걸 통째로 못 읽고 0건을 돌려준다.
 * 대표지번만 남기고, 꼬리표(외 N필지 / 일원 / 일대 / 번지)를 떼어낸다.
 */
export function normalizeAddress(address) {
  return String(address ?? '')
    .replace(/\s*(?:외|외그)\s*\d+\s*(?:필지|번지).*$/, '')
    .replace(/\s*(?:일원|일대)\s*$/, '')
    .replace(/\s*번지\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const asCandidate = (d) => ({
  x: Number(d.x), y: Number(d.y),
  roadAddress: d.road_address?.address_name ?? d.road_address_name ?? null,
  jibunAddress: d.address?.address_name ?? d.address_name ?? null,
  placeName: d.place_name ?? null,
});

/**
 * 후보가 고른 시군구 안에 있는지.
 *
 * 카카오는 시도를 축약해 준다("경기 광주시"). 강원·전북·제주는 정식명으로 오기도 한다
 * ("강원특별자치도 고성군"). 그래서 시도는 축약형 접두로, 시군구는 정확히 본다.
 */
function inRegion(c, region) {
  if (!region?.sgg) return true;                  // 세종처럼 하위 시군구가 없으면 거르지 않는다
  const re = new RegExp(`^${region.sidoShort}\\S*\\s+${region.sgg}(\\s|$)`);
  return re.test(c.jibunAddress ?? '') || re.test(c.roadAddress ?? '');
}

/**
 * 주소 → 좌표 후보들.
 *
 * 지금까지 첫 결과를 말없이 채택했다. 동명이동·오타·표기차가 있으면
 * 엉뚱한 곳을 사업지로 잡고도 사용자가 알 방법이 없다 —
 * 반경시설이 전부 틀어지는데 증빙만 그럴듯하게 나온다.
 * 그래서 후보를 다 돌려주고 화면에서 확인·선택하게 한다.
 *
 * 주소검색(지번/도로명)이 0건이면 장소검색으로 한 번 더 시도한다
 * (아파트명·현장명만 주는 경우가 있다). 다만 장소검색은 시군구를 넘어간다 —
 * 실측: "경기도 광주시 롯데마트" 7건 중 6건이 성남시 분당구였다.
 * 그래서 고른 시군구 밖 후보는 걸러낸다.
 *
 * @param {{sidoShort:string, sgg:string}} [region] 화면에서 고른 행정구역
 */
export async function geocodeCandidates(address, region = null) {
  const query = normalizeAddress(address);
  if (!query) throw new Error('사업지 주소가 비어 있습니다');

  const addr = await getJson(
    `${BASE}/search/address.json?query=${encodeURIComponent(query)}&size=10`, { headers: H() });
  let docs = addr.documents ?? [];
  let via = 'address';

  if (!docs.length) {
    const kw = await getJson(
      `${BASE}/search/keyword.json?query=${encodeURIComponent(query)}&size=10`, { headers: H() });
    docs = kw.documents ?? [];
    via = 'keyword';
  }
  if (!docs.length) {
    const e = new Error(
      `주소를 찾지 못했습니다: ${query}`
      + (region?.sgg ? ` — 「${region.sidoShort} ${region.sgg}」에 없는 지번일 수 있습니다.` : '')
      + ' 지번을 비우면 시군구 중심으로 잡습니다.');
    e.code = 'NO_MATCH';
    throw e;
  }

  const all = docs.map(asCandidate);
  const inside = region ? all.filter(c => inRegion(c, region)) : all;
  // 전부 시군구 밖이면 지우지 않고 넘기되, 화면에서 경고할 수 있게 표시한다
  const outOfRegion = Boolean(region?.sgg) && inside.length === 0;

  return {
    query,
    normalized: query !== String(address ?? '').trim(),
    via,                                   // address = 주소검색 / keyword = 장소검색(정확도 낮음)
    outOfRegion,
    dropped: all.length - (outOfRegion ? all.length : inside.length),
    candidates: outOfRegion ? all : inside,
  };
}

/** 주소 → 좌표 (사업지 주소가 입력이므로 이게 모든 지도 수집의 출발점) */
export async function geocode(address) {
  const { candidates } = await geocodeCandidates(address);
  return candidates[0];
}

/**
 * 사업지 주변 도로명 후보.
 *
 * 6차선 왕복도로는 POI 가 아니라 도로라서 장소검색으로 안 나온다.
 * 그래서 사업지 둘레를 점으로 훑어 각 점의 도로명주소를 물어본다 —
 * 도로 위의 점은 그 도로 이름을 돌려준다.
 *
 * 차로수는 여기서 안 나온다(좌표→주소 변환에는 그 속성이 없다).
 * 이름을 찾아주는 데까지가 여기 몫이고, 차선은 로드뷰로 센다.
 */
export async function nearbyRoads({ x, y }, radius = 300) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const k = Math.cos(rad(Number(y)));
  const toLngLat = (dx, dy) => ({
    x: Number(x) + (dx / (k * R)) * (180 / Math.PI),
    y: Number(y) + (dy / R) * (180 / Math.PI),
  });

  /*
   * 격자로 훑는다.
   *
   * 처음엔 고리 모양(반경 3겹 × 12방향)으로 찍었는데 **큰 도로를 놓쳤다** —
   * 300m 고리에서 표본 간격이 157m 라 그 사이를 지나는 도로는 한 점도 안 걸린다.
   * (송도에서 랜드마크로가 통째로 안 잡혔다)
   * 도로는 선이라 간격이 도시 블록(보통 100~200m)보다 촘촘해야 걸린다.
   */
  const step = Math.min(120, Math.max(50, Math.round(radius / 4)));
  const pts = [];
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const dist = Math.round(Math.hypot(dx, dy));
      if (dist > radius) continue;
      pts.push({ dist, ...toLngLat(dx, dy) });
    }
  }

  /*
   * 도로 유형 기준 — 도로명주소법 시행령 제3조제1항제1호나목 (원문 확인)
   *   대로 : 도로의 폭이 40미터 이상**이거나** 왕복 8차로 이상인 도로
   *   로   : 도로의 폭이 12미터 이상 40미터 미만**이거나** 왕복 2차로 이상 8차로 미만인 도로
   *   길   : 대로와 로 외의 도로
   *
   * 단정하면 안 되는 이유가 셋이다.
   *   1) "폭 또는 차로수" **OR** 조건이라 둘이 어긋나면 어느 쪽으로도 해석된다.
   *   2) 같은 영 제8조제2항제1호 **단서** — "주소정보 사용의 편리성 등을 고려하여 필요한 경우에는
   *      대로와 로 또는 로와 길을 서로 바꾸어 사용할 수 있다." 실제로 송도 랜드마크로가 그렇다.
   *   3) 도로명은 도로구간 **설정 시점** 기준이다. 뒤에 넓어져도 개명은 별도 절차(제12조)다.
   *
   * 그래서 이름은 **후보를 추리는 신호**로만 쓰고, 차로수는 로드뷰로 세어 확정한다.
   */
  const grade = (name) => {
    if (/번길$/.test(name)) return { rank: 3, grade: '번길', hint: '그 밖의 도로 — 6차선 가능성 낮음' };
    if (/대로\d*번?길$/.test(name)) return { rank: 3, grade: '번길', hint: '그 밖의 도로 — 6차선 가능성 낮음' };
    if (/대로$/.test(name)) return { rank: 0, grade: '대로', hint: '기준상 폭 40m↑ 또는 왕복 8차로↑' };
    if (/로$/.test(name)) return { rank: 1, grade: '로', hint: '기준상 폭 12~40m 또는 왕복 2~7차로' };
    if (/길$/.test(name)) return { rank: 3, grade: '길', hint: '그 밖의 도로 — 6차선 가능성 낮음' };
    return { rank: 2, grade: '기타', hint: null };
  };

  const found = new Map();
  const results = await Promise.all(pts.map(async (p) => {
    try {
      const d = await getJson(
        `${BASE}/geo/coord2address.json?x=${p.x}&y=${p.y}`, { headers: H() });
      const road = d.documents?.[0]?.road_address;
      return road?.road_name ? { name: road.road_name, dist: p.dist, x: p.x, y: p.y,
                                 addr: road.address_name ?? null } : null;
    } catch { return null; }
  }));

  /*
   * **표본점을 버리지 말고 다 들고 온다.**
   * 전에는 가장 가까운 표본점 하나만 남겼는데, 그 점은 도로 위가 아니라
   * 그 도로에 접한 **필지**라 지도에 찍힌 핀이 도로와 어긋나 보였다(사용자 지적).
   * 같은 도로명이 나온 점을 모두 주면 지도가 **도로가 지나는 자리**를 보여줄 수 있다.
   */
  for (const r of results) {
    if (!r) continue;
    const cur = found.get(r.name);
    if (!cur) {
      found.set(r.name, { name: r.name, distance: r.dist, x: r.x, y: r.y, address: r.addr,
                          points: [{ x: r.x, y: r.y, dist: r.dist }], ...grade(r.name) });
      continue;
    }
    cur.points.push({ x: r.x, y: r.y, dist: r.dist });
    if (r.dist < cur.distance) { cur.distance = r.dist; cur.x = r.x; cur.y = r.y; cur.address = r.addr; }
  }
  /* 가까운 순으로 — 지도에 몇 개만 찍을 때 사업지 쪽부터 남는다 */
  for (const v of found.values()) v.points.sort((a, b) => a.dist - b.dist);
  // 큰 도로부터, 같은 급이면 가까운 것부터
  return [...found.values()].sort((a, b) => a.rank - b.rank || a.distance - b.distance);
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

/**
 * 반경내 시설 수집.
 *
 * 사업지가 폴리곤이면 "사업지 반경 N 이내"는 대표지번 한 점이 아니라 **경계 기준**이다.
 * 카카오는 점+반경 검색만 되므로, 중심점에서 (반경 + 외접반경)만큼 넓게 훑은 뒤
 * 폴리곤 경계까지의 실제 거리로 다시 걸러낸다. 폴리곤 안의 시설은 거리 0 이다.
 *
 * @param {{x:number,y:number}} point 대표지번 좌표 (폴리곤 없을 때 기준점)
 * @param {Array<{lat:number,lng:number}>} [polygon] 사업지 경계
 */
export async function collectFacilities({ x, y }, only = null, polygon = null) {
  // only 는 라벨 배열. 시트별로 나눠 수집할 때 쓴다.
  const ring = Array.isArray(polygon) && polygon.length >= 3 ? polygon : null;
  const origin = ring ? centroid(ring) : { lat: Number(y), lng: Number(x) };
  const pad = ring ? Math.ceil(circumradius(ring, origin)) : 0;
  const ox = String(origin.lng), oy = String(origin.lat);

  const result = {};
  for (const [label, spec] of Object.entries(FACILITY_SPEC)) {
    if (only && !only.includes(label)) continue;
    // 경계 기준이면 중심에서 더 넓게 훑어야 경계 근처 시설을 놓치지 않는다
    const searchRadius = Math.min(20000, spec.radius + pad);
    const params = { x: ox, y: oy, radius: searchRadius, sort: 'distance' };
    let docs = spec.category
      ? await searchAll('category', { ...params, category_group_code: spec.category })
      : await searchAll('keyword', { ...params, query: spec.keyword });
    if (spec.keywordAlso) {
      const extra = await searchAll('keyword', { ...params, query: spec.keywordAlso });
      const seen = new Set(docs.map(d => d.id ?? d.place_name));
      docs = [...docs, ...extra.filter(d => !seen.has(d.id ?? d.place_name))];
      docs.sort((a, b) => Number(a.distance) - Number(b.distance));
    }
    // 카카오가 붙인 분류(category_name)로 걸러야 상호에 낚이지 않는다
    if (spec.categoryFilter) docs = docs.filter(d => spec.categoryFilter.test(d.category_name ?? ''));
    // 분류 말단만 본다: "의료,건강 > 병원 > 치과" → "치과"
    if (spec.categoryLeaf) {
      docs = docs.filter(d => spec.categoryLeaf.test(String(d.category_name ?? '').split('>').pop().trim()));
    }
    if (spec.excludeName) docs = docs.filter(d => !spec.excludeName.test(d.place_name));
    if (spec.nameFilter) docs = docs.filter(d => spec.nameFilter.test(d.place_name));

    // 거리 재계산: 폴리곤이 있으면 경계 최단거리, 없으면 카카오가 준 점 기준 거리
    let items = docs.map(d => ({
      name: d.place_name,
      distance: ring
        ? Math.round(distanceToPolygon({ lat: Number(d.y), lng: Number(d.x) }, ring))
        : Number(d.distance),
      address: d.road_address_name || d.address_name,
      category: d.category_name ?? null,      // 판정 근거를 증빙에 남긴다
      x: d.x, y: d.y,
    }));
    items = items.filter(i => i.distance <= spec.radius).sort((a, b) => a.distance - b.distance);

    result[label] = {
      sheet: spec.sheet,
      radius: spec.radius,
      basis: ring ? 'polygon' : 'point',   // 무엇을 기준으로 쟀는지 증빙에 남긴다
      /*
        **어느 원천에서 왔는지를 봉투가 들고 다닌다.**
        의료시설만 심평원이고 나머지는 카카오인데, 화면에도 엑셀에도 그 구분이 없어
        전부 카카오맵으로 보였다(엑셀은 실제로 "출처 : 카카오맵" 을 의료시설에도 찍고 있었다).
        표준 봉투 규칙대로 `source` 를 값과 함께 들고 간다.
      */
      source: {
        name: '카카오맵',
        detail: spec.category
          ? `카테고리 ${spec.category}${spec.keywordAlso ? ` + 키워드 "${spec.keywordAlso}"` : ''}`
          : `키워드 "${spec.keyword}"`,
        filter: spec.categoryFilter ? `카카오 분류 ${spec.categoryFilter}` : null,
      },
      count: items.length,
      nearest: items[0] ?? null,
      items,
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
