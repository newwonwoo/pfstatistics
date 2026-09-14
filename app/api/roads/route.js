import { NextResponse } from 'next/server';
import { nearbyRoads } from '../../../src/collectors/kakao.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/roads?x=경도&y=위도&radius=300
 * 사업지 주변 도로명 후보. 6차선 왕복도로 판정의 출발점이다.
 */
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const x = Number(q.get('x')), y = Number(q.get('y'));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: 'x, y 좌표가 필요합니다' }, { status: 400 });
  }
  try {
    const rows = await nearbyRoads({ x, y }, Number(q.get('radius')) || 300);
    return NextResponse.json({ center: { x, y }, radius: Number(q.get('radius')) || 300, count: rows.length, roads: rows });
  } catch (e) {
    const noKey = e.code === 'NO_KEY';
    return NextResponse.json({ error: e.message, needKey: noKey ? e.keyName : null }, { status: noKey ? 428 : 500 });
  }
}
