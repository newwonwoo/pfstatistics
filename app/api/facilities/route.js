import { NextResponse } from 'next/server';
import { geocode, collectFacilities, FACILITY_SPEC, ROAD_NOTE } from '../../../src/collectors/kakao.js';
import { collectMedical } from '../../../src/collectors/hira.js';

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
  // 사업지 폴리곤(있으면 경계 기준으로 판정). lat,lng 쌍의 JSON 배열
  let polygon = null;
  try { polygon = JSON.parse(req.nextUrl.searchParams.get('polygon') ?? 'null'); } catch {}
  try {
    const coord = await geocode(addr);
    const point = { lat: Number(coord.y), lng: Number(coord.x) };
    const facilities = await collectFacilities(coord, null, polygon);

    // 의료시설만 심평원(법정 종별)으로 대체한다. 실패해도 나머지는 살린다.
    try {
      facilities['의료시설'] = await collectMedical({ point, polygon, radius: 1500 });
    } catch (e) {
      facilities['의료시설'] = {
        sheet: '주거편의', radius: 1500, count: 0, nearest: null, items: [],
        error: `심평원 조회 실패: ${e.message}`,
      };
    }
    return NextResponse.json({
      address: addr, coord, polygon, facilities,
      basis: polygon?.length >= 3 ? 'polygon' : 'point',
      spec: FACILITY_SPEC, note: ROAD_NOTE,
    });
  } catch (e) {
    const noKey = e.code === 'NO_KEY';
    return NextResponse.json({ error: e.message, needKey: noKey ? e.keyName : null }, { status: noKey ? 428 : 500 });
  }
}
