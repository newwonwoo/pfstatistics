import { NextResponse } from 'next/server';
import { avgPrice, initialSaleRate } from '../../../src/collectors/hug.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/hug?region=경기도 광주시
 *
 * HUG 지역 평균 분양가 · 지역 평균 초기분양률.
 * **시도 단위**라 비교사업장(단지별)을 대체하지 못한다 — 기준선·참고치로 쓴다.
 */
export async function GET(req) {
  const region = req.nextUrl.searchParams.get('region');
  if (!region) return NextResponse.json({ error: 'region 파라미터가 필요합니다' }, { status: 400 });
  try {
    const [price, rate] = await Promise.all([
      avgPrice(region).catch(e => ({ error: e.message })),
      initialSaleRate(region).catch(e => ({ error: e.message })),
    ]);
    return NextResponse.json({ region, price, rate });
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? null },
      { status: e.code === 'NEED_SGG' ? 400 : 502 });
  }
}
