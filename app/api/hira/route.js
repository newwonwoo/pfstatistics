import { NextResponse } from 'next/server';
import { requireKey } from '../../../src/lib/env.js';
import { getJson } from '../../../src/lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 심평원 탐색 창구.
 *
 * 키가 배포 환경에만 있어 파라미터 실험을 여기서 한다(KOSIS 와 같은 이유).
 *   /api/hira?lat=37.38&lng=126.61&radius=1500
 *   /api/hira?lat=..&lng=..&radius=..&rows=1000&page=1
 *   /api/hira?sido=&sgg=            (지역코드로 조회)
 */
const BASE = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  try {
    const qs = new URLSearchParams({
      serviceKey: requireKey('DATA_GO_KR_KEY').trim(),
      pageNo: q.get('page') ?? '1',
      numOfRows: q.get('rows') ?? '300',
      _type: 'json',
    });
    if (q.get('lat') && q.get('lng')) {
      qs.set('xPos', q.get('lng'));
      qs.set('yPos', q.get('lat'));
      qs.set('radius', q.get('radius') ?? '1500');
    }
    if (q.get('sido')) qs.set('sidoCd', q.get('sido'));
    if (q.get('sgg')) qs.set('sgguCd', q.get('sgg'));

    const url = `${BASE}?${qs}`;
    const d = await getJson(url);

    const err = d?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (err) return NextResponse.json({ error: `심평원(${err.returnReasonCode}): ${err.returnAuthMsg}`, url: url.replace(/serviceKey=[^&]+/, 'serviceKey=***') }, { status: 502 });

    const body = d?.response?.body;
    const raw = body?.items?.item ?? [];
    const items = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    const byGrade = {};
    for (const r of items) byGrade[r.clCdNm ?? '?'] = (byGrade[r.clCdNm ?? '?'] ?? 0) + 1;

    return NextResponse.json({
      url: url.replace(/serviceKey=[^&]+/, 'serviceKey=***'),
      header: d?.response?.header,
      totalCount: body?.totalCount, numOfRows: body?.numOfRows, pageNo: body?.pageNo,
      returned: items.length,
      byGrade,
      sample: items.slice(0, Number(q.get('limit')) || 8)
        .map(r => ({ 종별: r.clCdNm, 이름: r.yadmNm, 주소: r.addr, x: r.XPos, y: r.YPos })),
    });
  } catch (e) {
    const noKey = e.code === 'NO_KEY';
    return NextResponse.json({ error: e.message }, { status: noKey ? 428 : 500 });
  }
}
