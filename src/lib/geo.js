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

/**
 * **면 ↔ 면 최단거리(m).**
 *
 * 규정이 재는 거리는 「단지 경계로부터」다. 상대 단지도 **면**이 있으면
 * 점(대표지번)까지가 아니라 **경계끼리** 재야 지도에서 보이는 최단거리와 같다
 * (사용자 지적 2026-09-25 — 「실제 지도상 최단거리를 재서 표기해야 해」).
 *
 * 거리는 `distanceToPolygon` 으로만 잰다 — 반경원(`bufferPolygon`)이 그 함수를
 * 역산해 그려지므로 다른 식으로 재면 그림과 판정이 갈린다. 그래서 두 링의 변을
 * `step` m 이하로 잘게 나눠 **양쪽 방향으로** 점→면 거리를 재고 최소값을 쓴다
 * (한쪽만 재면 긴 변 하나로 이어진 도형에서 최단점을 놓친다).
 */
export function ringToRing(ringA, ringB, step = 5) {
  if (!ringA?.length || !ringB?.length) return null;
  const dense = (ring) => {
    if (ring.length < 2) return ring;
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(haversine(a, b) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      }
    }
    return out;
  };
  const A = dense(ringA), B = dense(ringB);
  let min = Infinity;
  for (const p of A) { const d = distanceToPolygon(p, ringB); if (d != null && d < min) min = d; if (min === 0) return 0; }
  for (const p of B) { const d = distanceToPolygon(p, ringA); if (d != null && d < min) min = d; if (min === 0) return 0; }
  return Number.isFinite(min) ? min : null;
}

/** 로컬 평면 오프셋 → 위경도 */
function offset(c, dist, theta, k) {
  const dx = dist * Math.cos(theta);
  const dy = dist * Math.sin(theta);
  return {
    lat: c.lat + (dy / R) * (180 / Math.PI),
    lng: c.lng + (dx / (k * R)) * (180 / Math.PI),
  };
}

/**
 * 사업지 경계에서 radius m 떨어진 선(버퍼).
 *
 * "사업지 반경 1km" 를 대표지번 중심의 원으로 그리면 **판정선과 그림이 다르다**.
 * 판정은 경계 최단거리로 하는데 그림은 중심 기준이니, 원 밖에 있는 시설이
 * 반경 내로 잡히는 일이 생긴다. 증빙으로 못 쓴다.
 *
 * 그래서 판정에 쓰는 distanceToPolygon 을 그대로 역산한다 —
 * 중심에서 각 방향으로 이분탐색해 거리가 정확히 radius 가 되는 점을 찾는다.
 * 그린 선이 곧 판정선이므로 해석 차이가 생길 수 없다.
 *
 * 사업지(수백 m)보다 반경(수백~1500m)이 크므로 중심에서 별모양(star-shaped)이
 * 보장되어 이분탐색이 유일해를 준다.
 */
export function bufferPolygon(ring, radius, steps = 180) {
  if (!ring?.length || !(radius > 0)) return null;
  const c = centroid(ring);
  const k = Math.cos(rad(c.lat));
  const far = (circumradius(ring, c) + radius) * 1.5;
  const out = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * 2 * Math.PI;
    let lo = 0, hi = far;
    for (let n = 0; n < 24; n++) {
      const mid = (lo + hi) / 2;
      if (distanceToPolygon(offset(c, mid, th, k), ring) < radius) lo = mid; else hi = mid;
    }
    out.push(offset(c, (lo + hi) / 2, th, k));
  }
  return out;
}
