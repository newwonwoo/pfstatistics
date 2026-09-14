import { NextResponse } from 'next/server';
import { geocodeCandidates, collectFacilities, FACILITY_SPEC, ROAD_NOTE } from '../../../src/collectors/kakao.js';
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
  /*
   * 좌표를 직접 받으면(x,y) 그 점을 쓴다.
   * 주소 후보가 여러 개일 때 사용자가 화면에서 고른 것을 그대로 따르기 위해서다 —
   * 매칭을 서버가 말없이 정하면 엉뚱한 사업지로 수집해도 알 방법이 없다.
   */
  const sp = req.nextUrl.searchParams;
  const px = Number(sp.get('x')), py = Number(sp.get('y'));
  const picked = Number.isFinite(px) && Number.isFinite(py) && px && py;

  try {
    let geo = null, coord;
    if (picked) {
      coord = { x: px, y: py, roadAddress: sp.get('road') || null, jibunAddress: sp.get('jibun') || null };
    } else {
      geo = await geocodeCandidates(addr);
      coord = geo.candidates[0];
    }
    const point = { lat: Number(coord.y), lng: Number(coord.x) };

    /*
     * 시트별로 나눠 수집한다.
     * 9종을 한 번에 훑으면 한 번의 실패가 전부를 날리고, 어디까지 됐는지도 안 보인다.
     * 시트 단위면 화면의 탭·완료표시와 그대로 맞아떨어진다.
     */
    const sheet = sp.get('sheet');
    const labels = Object.entries(FACILITY_SPEC)
      .filter(([, v]) => !sheet || v.sheet === sheet)
      .map(([k]) => k);
    const wantMedical = !sheet || sheet === '주거편의';
    const only = sp.get('only') === 'none' ? [] : labels;

    const facilities = only.length ? await collectFacilities(coord, only, polygon) : {};

    // 의료시설만 심평원(법정 종별)으로 대체한다. 실패해도 나머지는 살린다.
    if (wantMedical && sp.get('only') !== 'none') {
      try {
        facilities['의료시설'] = await collectMedical({ point, polygon, radius: 1500 });
      } catch (e) {
        facilities['의료시설'] = {
          sheet: '주거편의', radius: 1500, count: 0, nearest: null, items: [],
          error: `심평원 조회 실패: ${e.message}`,
        };
      }
    }
    return NextResponse.json({
      address: addr,
      // 무엇으로 매칭됐는지 — 증빙에 남고 화면에서 확인할 수 있어야 한다
      matched: coord.jibunAddress ?? coord.roadAddress ?? null,
      geo, coord, polygon, facilities, sheet: sheet ?? null,
      basis: polygon?.length >= 3 ? 'polygon' : 'point',
      spec: FACILITY_SPEC, note: ROAD_NOTE,
    });
  } catch (e) {
    const noKey = e.code === 'NO_KEY';
    return NextResponse.json({ error: e.message, needKey: noKey ? e.keyName : null }, { status: noKey ? 428 : 500 });
  }
}
