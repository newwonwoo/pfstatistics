import { NextResponse } from 'next/server';
import { collectComparables } from '../../../src/collectors/applyhome.js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/apts?x=127.25&y=37.40&region=경기도 광주시&radius=2000
 *
 * 비교사업장 — 반경 안에서 분양한 아파트와 그 분양가(원/㎡).
 * 좌표는 사업지 확정 때 사용자가 고른 것을 그대로 받는다(서버가 다시 고르지 않는다).
 * polygon 을 주면 다른 시트와 같은 규칙으로 **경계 최단거리**로 잰다.
 */
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const x = Number(q.get('x')), y = Number(q.get('y'));
  const region = q.get('region');
  const radius = Math.min(5000, Math.max(500, Number(q.get('radius')) || 2000));

  if (!Number.isFinite(x) || !Number.isFinite(y) || !x || !y) {
    return NextResponse.json({ error: '사업지 좌표(x,y)가 필요합니다 — 주소를 먼저 확정하세요' }, { status: 400 });
  }
  if (!region) return NextResponse.json({ error: 'region 파라미터가 필요합니다' }, { status: 400 });

  let polygon = null;
  try { polygon = JSON.parse(q.get('polygon') ?? 'null'); } catch {}

  try {
    const r = await collectComparables({
      site: { x, y }, region, radius, polygon,
      from: q.get('from') || null,
      probe: q.get('probe') || null,
      /* ?census=1 — 지오코딩 실패 전수조사 (거리·상세는 건너뛴다) */
      census: q.get('census') === '1',
    });
    return NextResponse.json({ region, ...r });
  } catch (e) {
    const code = e.code === 'NEED_SGG' ? 400 : e.code === 'NO_KEY' ? 428 : 502;
    return NextResponse.json({ error: e.message, code: e.code ?? null }, { status: code });
  }
}
