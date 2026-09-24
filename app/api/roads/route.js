import { NextResponse } from 'next/server';
import { nearbyRoads } from '../../../src/collectors/kakao.js';
import { roadLines } from '../../../src/collectors/vworld.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/roads?x=경도&y=위도&radius=300&poly=lng,lat;lng,lat;…
 * 사업지 주변 도로 후보. 6차선 왕복도로 판정의 출발점이다.
 *
 * `poly` 를 주면 거리를 **사업지 경계 최단거리**로 잰다 — 다른 시트와 같은 규칙이다.
 *
 * **원천이 둘이고 정확도가 다르다.**
 *   geometry : 브이월드 WFS 도로명주소도로 — **도로 선형**을 준다.
 *              핀이 도로 위에 서고 거리는 선까지의 최단거리다(오차 ≤ 2.5m).
 *   grid     : 카카오 coord2address 를 격자로 훑어 도로명을 모은다.
 *              좌표는 도로가 아니라 **그 도로에 접한 필지**라 핀이 어긋나고
 *              거리도 격자 간격만큼 뭉갠다(±25~150m).
 *
 * 브이월드 키가 있으면 geometry 를 쓰고, 없거나 실패하면 grid 로 물러선다.
 * **어느 쪽으로 냈는지 봉투에 실어** 화면·엑셀이 같은 말을 하게 한다.
 */
const parsePoly = (raw) => {
  if (!raw) return null;
  const ring = String(raw).split(';').map((pair) => {
    const [lng, lat] = pair.split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }).filter(Boolean);
  return ring.length >= 3 ? ring : null;
};

const SOURCE = {
  geometry: {
    method: 'geometry',
    name: '브이월드 도로명주소도로(WFS)',
    note: '도로 선형 좌표. 거리는 도로 선까지의 최단거리입니다',
  },
  grid: {
    method: 'grid',
    name: '카카오맵 좌표→주소 격자탐색',
    note: '도로에 접한 필지의 주소입니다 — 핀은 도로 위가 아니고 거리는 격자 간격만큼 뭉갭니다',
  },
};

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const x = Number(q.get('x')), y = Number(q.get('y'));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: 'x, y 좌표가 필요합니다' }, { status: 400 });
  }
  const radius = Number(q.get('radius')) || 300;
  const polygon = parsePoly(q.get('poly'));
  const want = q.get('method');                     // 탐색용 — grid 를 강제로 볼 수 있게

  let rows = null, source = null, fellBack = null;
  if (want !== 'grid') {
    try {
      rows = await roadLines({ x, y }, radius, { polygon });
      source = { ...SOURCE.geometry, features: rows.__features ?? null, capped: rows.__capped ?? false };
    } catch (e) {
      /* 키가 없거나 권한이 없으면 조용히 죽지 말고 **무엇 때문에 물러섰는지** 남긴다 */
      rows = null;
      fellBack = e.code === 'NO_KEY'
        ? '브이월드 인증키가 없어 격자탐색으로 냈습니다'
        : `브이월드 도로 선형을 받지 못해 격자탐색으로 냈습니다 (${e.message})`;
    }
  }
  if (!rows) {
    try {
      rows = await nearbyRoads({ x, y }, radius, { polygon });
      source = { ...SOURCE.grid, fellBack };
    } catch (e) {
      const noKey = e.code === 'NO_KEY';
      return NextResponse.json({ error: e.message, needKey: noKey ? e.keyName : null }, { status: noKey ? 428 : 500 });
    }
  }

  return NextResponse.json({
    center: { x, y }, radius, count: rows.length,
    basis: polygon ? 'polygon' : 'point',
    source,
    roads: rows.map(r => ({ ...r })),
  });
}
