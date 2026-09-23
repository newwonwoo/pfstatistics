import { NextResponse } from 'next/server';
import { nearbyRoads } from '../../../src/collectors/kakao.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/roads?x=경도&y=위도&radius=300&poly=lng,lat;lng,lat;…
 * 사업지 주변 도로명 후보. 6차선 왕복도로 판정의 출발점이다.
 *
 * `poly` 를 주면 거리를 **사업지 경계 최단거리**로 잰다 — 다른 시트와 같은 규칙이다.
 * 도로는 POI 가 아니라 검색이 안 되므로 격자로 훑어 도로명주소를 물어 모은다.
 */
const parsePoly = (raw) => {
  if (!raw) return null;
  const ring = String(raw).split(';').map((pair) => {
    const [lng, lat] = pair.split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }).filter(Boolean);
  return ring.length >= 3 ? ring : null;
};
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const x = Number(q.get('x')), y = Number(q.get('y'));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: 'x, y 좌표가 필요합니다' }, { status: 400 });
  }
  try {
    const radius = Number(q.get('radius')) || 300;
    const polygon = parsePoly(q.get('poly'));
    const rows = await nearbyRoads({ x, y }, radius, { polygon });
    return NextResponse.json({
      center: { x, y }, radius, count: rows.length,
      basis: polygon ? 'polygon' : 'point',
      roads: rows,
    });
  } catch (e) {
    const noKey = e.code === 'NO_KEY';
    return NextResponse.json({ error: e.message, needKey: noKey ? e.keyName : null }, { status: noKey ? 428 : 500 });
  }
}
