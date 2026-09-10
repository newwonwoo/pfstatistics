import { NextResponse } from 'next/server';
import { geocode, collectFacilities, FACILITY_SPEC, ROAD_NOTE } from '../../../src/collectors/kakao.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/facilities?addr=경기도 광주시 탄벌동 203-4
 * 교통환경·주거편의·교육환경 3개 시트의 반경내 시설을 한 번에 수집한다.
 * 좌표도 같이 돌려준다 — 클라이언트가 그 좌표로 지도를 그려 캡쳐하기 때문이다.
 */
export async function GET(req) {
  const addr = req.nextUrl.searchParams.get('addr');
  if (!addr) return NextResponse.json({ error: 'addr 파라미터가 필요합니다' }, { status: 400 });
  try {
    const coord = await geocode(addr);
    const facilities = await collectFacilities(coord);
    return NextResponse.json({ address: addr, coord, facilities, spec: FACILITY_SPEC, note: ROAD_NOTE });
  } catch (e) {
    const noKey = e.code === 'NO_KEY';
    return NextResponse.json({ error: e.message, needKey: noKey ? e.keyName : null }, { status: noKey ? 428 : 500 });
  }
}
