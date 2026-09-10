import { NextResponse } from 'next/server';
import { searchTable, fetchData, fetchMeta } from '../../../src/collectors/kosis.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * KOSIS 탐색 창구.
 *
 * 통계표 ID·항목코드는 문서만 봐서는 못 맞춘다. 실제 키로 검색하고 값을 꺼내봐야 안다.
 * 키가 배포 환경에만 있으므로 탐색을 여기서 할 수 있게 열어둔다.
 *
 *   /api/kosis?q=주민등록세대수                                  통계표 후보 검색
 *   /api/kosis?orgId=101&tblId=DT_1B040B3&meta=ITM              항목코드 목록
 *   /api/kosis?orgId=101&tblId=DT_1B040B3&period=202607&find=광주시   실제 조회
 */
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const orgId = q.get('orgId');
  const tblId = q.get('tblId');

  try {
    if (q.get('q')) {
      const rows = await searchTable(q.get('q'));
      return NextResponse.json({ keyword: q.get('q'), count: rows.length, rows: rows.slice(0, 40) });
    }
    if (!orgId || !tblId) {
      return NextResponse.json({ error: 'q 또는 orgId+tblId 가 필요합니다' }, { status: 400 });
    }
    if (q.get('meta')) {
      const rows = await fetchMeta({ orgId, tblId, type: q.get('meta') });
      return NextResponse.json({ orgId, tblId, type: q.get('meta'), count: rows.length, rows: rows.slice(0, 60) });
    }

    const period = q.get('period') ?? '202607';
    const { rows, url } = await fetchData({
      orgId, tblId,
      prdSe: q.get('prd') ?? 'M',
      startPrdDe: period, endPrdDe: period,
      itmId: q.get('itmId') ?? '',
      objL1: q.get('objL1') ?? '',
    });
    const named = rows.map(r => ({
      C1: r.C1_NM, C2: r.C2_NM, ITM: r.ITM_NM, ITM_ID: r.ITM_ID,
      PRD: r.PRD_DE, DT: r.DT, UNIT: r.UNIT_NM, UPD: r.LST_CHN_DE,
    }));
    const find = q.get('find');
    return NextResponse.json({
      url, total: rows.length,
      matched: find ? named.filter(r => [r.C1, r.C2].some(v => v?.includes(find))) : undefined,
      sample: named.slice(0, 25),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
