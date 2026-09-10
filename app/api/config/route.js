import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * 브라우저가 필요한 공개 설정만 내려준다.
 *
 * 카카오 지도 SDK 는 JavaScript 키를 브라우저에서 써야 하는데,
 * NEXT_PUBLIC_ 접두사를 붙여야만 클라이언트 번들에 들어간다.
 * 접두사 유무로 헷갈리는 사고가 잦아 어느 이름으로 넣어도 동작하게 서버에서 내려준다.
 * (JS 키는 원래 브라우저에 노출되는 값이고, 보호는 카카오 콘솔의 도메인 등록으로 한다)
 */
export async function GET() {
  const src = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ? 'NEXT_PUBLIC_KAKAO_JS_KEY'
    : process.env.KAKAO_JS_KEY ? 'KAKAO_JS_KEY'
    : process.env.KAKAO_JAVASCRIPT_KEY ? 'KAKAO_JAVASCRIPT_KEY' : null;
  const kakaoJsKey = src ? process.env[src].trim() : null;
  return NextResponse.json({ kakaoJsKey, kakaoJsKeySource: src });
}
