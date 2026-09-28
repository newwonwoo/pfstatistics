import { NextResponse } from 'next/server';
import { detectDistrict } from '../../../src/collectors/district.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/district?x=경도&y=위도
 * 사업지가 걸린 **사업지구(택지개발·공공주택·도시개발 …)와 지구단위계획구역**, 그 면적.
 * 교통환경·주거편의의 「수용·환지 사업지구 특례」(지구면적별 등급 하한) 재료다.
 * 주소 확정 직후 화면이 부른다 — 면적이 있으면 바로 보여 주고, 없으면 실무자가 넣는다.
 */
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  try {
    const out = await detectDistrict({ x: q.get('x'), y: q.get('y') });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: /좌표/.test(e.message) ? 400 : 500 });
  }
}
