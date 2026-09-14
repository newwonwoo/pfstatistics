import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * 지도 타일 중계.
 *
 * 카카오 지도 타일(daumcdn)에는 CORS 헤더가 없다.
 * 그래서 브라우저에서 캡쳐(html-to-image)하면 타일을 인라인하지 못해
 * **지도가 빈 채로 저장된다** — 실제로 브라우저에서 fetch 가 막히는 것을 확인했다.
 *
 * 캡쳐 직전에만 타일 src 를 이 경로로 바꿔 같은 출처로 만든 뒤 캡쳐하고 되돌린다.
 * 타일 자체는 카카오에서 그대로 가져오며, 변형하지 않는다.
 */
// 타일 외에 마커·라벨 이미지도 같은 계열 호스트에서 온다. 카카오 호스트로만 한정한다.
const ALLOWED = /^https:\/\/[a-z0-9.-]+\.(?:daumcdn\.net|daum\.net|kakaocdn\.net)\//i;

export async function GET(req) {
  const target = req.nextUrl.searchParams.get('u');
  if (!target || !ALLOWED.test(target)) {
    return NextResponse.json({ error: '허용되지 않은 타일 주소' }, { status: 400 });
  }
  try {
    const res = await fetch(target, { headers: { Referer: 'https://map.kakao.com/' } });
    if (!res.ok) return NextResponse.json({ error: `타일 ${res.status}` }, { status: 502 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message) }, { status: 502 });
  }
}
