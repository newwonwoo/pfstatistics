import { NextResponse } from 'next/server';
import { latestPeriod } from '../../../src/lib/latestPeriod.js';

export const runtime = 'nodejs';
export const revalidate = 3600;

/** 최신 조회월 — 판정 로직은 `src/lib/latestPeriod.js` 한 곳에 둔다(수집 라우트도 같은 것을 쓴다) */
export async function GET() {
  const r = await latestPeriod();
  return r.ym ? NextResponse.json(r) : NextResponse.json(r, { status: 502 });
}
