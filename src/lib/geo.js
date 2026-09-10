/**
 * 사업지 폴리곤 기반 거리 계산.
 *
 * "사업지 반경 N 이내" 는 대표지번 한 점이 아니라 사업지 경계 기준이다.
 * 수 km 범위라 등거리원통도법(local equirectangular)으로 평면 근사해도
 * 오차가 수십 cm 수준이라 실무 판정에 충분하다.
 */
const R = 6371008.8;                      // 지구 평균반지름(m)
const rad = (d) => (d * Math.PI) / 180;

/** 기준위도에서 위경도 → 로컬 평면(m) */
function projector(lat0) {
  const k = Math.cos(rad(lat0));
  return ({ lat, lng }) => ({ x: rad(lng) * k * R, y: rad(lat) * R });
}

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 폴리곤 무게중심 (면적가중). 자기교차 없는 단순 폴리곤 가정. */
export function centroid(ring) {
  const lat0 = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const proj = projector(lat0);
  const pts = ring.map(proj);
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    a2 += cross;
    cx += (pts[j].x + pts[i].x) * cross;
    cy += (pts[j].y + pts[i].y) * cross;
  }
  if (Math.abs(a2) < 1e-9) {            // 면적 0 (직선/1점) → 산술평균
    return {
      lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length,
      lng: ring.reduce((s, p) => s + p.lng, 0) / ring.length,
    };
  }
  const k = Math.cos(rad(lat0));
  return { lat: (cy / (3 * a2)) / R * (180 / Math.PI), lng: (cx / (3 * a2)) / (k * R) * (180 / Math.PI) };
}

/** 중심점에서 가장 먼 꼭짓점까지 거리(m) — 검색 반경을 넓힐 때 쓴다 */
export function circumradius(ring, c = centroid(ring)) {
  return Math.max(...ring.map(p => haversine(c, p)));
}

function segDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.x - a.x, wy = p.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = p.x - (a.x + t * vx), dy = p.y - (a.y + t * vy);
  return Math.hypot(dx, dy);
}

function inside(p, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * 점 → 폴리곤 경계 최단거리(m).
 * 폴리곤 내부의 점은 0 을 돌려준다 (사업지 안에 있는 시설은 '반경 내' 가 자명하므로).
 */
export function distanceToPolygon(point, ring) {
  if (!ring?.length) return null;
  if (ring.length === 1) return haversine(point, ring[0]);
  const lat0 = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const proj = projector(lat0);
  const pts = ring.map(proj);
  const p = proj(point);
  if (inside(p, pts)) return 0;
  let min = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    min = Math.min(min, segDist(p, pts[j], pts[i]));
  }
  return min;
}
