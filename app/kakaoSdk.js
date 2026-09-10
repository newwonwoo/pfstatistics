'use client';

/**
 * 카카오맵 JS SDK 로더 (앱 전체에서 한 번만 로드).
 *
 * 키는 서버(/api/config)에서 받는다 — 환경변수 이름이 NEXT_PUBLIC_ 접두사든 아니든
 * 동작하게 하기 위해서다. 실제로 이름 불일치로 한참 막혔던 지점이다.
 */
let promise = null;

export function loadKakaoSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저 전용'));
  if (window.kakao?.maps) return Promise.resolve(window.kakao);
  if (promise) return promise;

  promise = (async () => {
    const cfg = await (await fetch('/api/config')).json();
    const key = cfg.kakaoJsKey;
    if (!key) throw new Error('카카오 JavaScript 키가 설정되지 않았습니다');
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
      s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
      s.onerror = () => reject(new Error(
        '카카오맵 SDK 로드 실패 — 콘솔 > 앱 설정 > 플랫폼 > Web 에 이 도메인이 등록됐는지 확인하세요',
      ));
      document.head.appendChild(s);
    });
  })();
  return promise;
}
