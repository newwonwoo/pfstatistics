'use client';

/**
 * 카카오맵 JS SDK 로더 (앱 전체에서 한 번만 로드).
 *
 * 키는 서버(/api/config)에서 받는다 — 환경변수 이름이 NEXT_PUBLIC_ 접두사든 아니든
 * 동작하게 하기 위해서다. 실제로 이름 불일치로 한참 막혔던 지점이다.
 */
let promise = null;

/**
 * **한 번 실패하면 그 페이지의 모든 지도가 죽어 있었다**(실측 2026-10-01) — 실패한 약속을 그대로 붙들고 있어서
 * 네트워크가 잠깐 끊긴 것만으로 새로고침 전까지 어느 지도도 안 떴다. 실패하면 약속을 버려 다음에 다시 받게 하고,
 * 처음 한 번은 스스로 1.5초 뒤 다시 받는다.
 */
function inject(key) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    s.onerror = () => { s.remove(); reject(new Error('sdk')); };
    document.head.appendChild(s);
  });
}

export function loadKakaoSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저 전용'));
  if (window.kakao?.maps) return Promise.resolve(window.kakao);
  if (promise) return promise;

  promise = (async () => {
    const cfg = await (await fetch('/api/config')).json();
    const key = cfg.kakaoJsKey;
    if (!key) throw new Error('카카오 JavaScript 키가 설정되지 않았습니다');
    try { return await inject(key); }
    catch {
      await new Promise(r => setTimeout(r, 1500));
      try { return await inject(key); }
      catch {
        throw new Error('카카오 지도 서버에 연결하지 못했습니다 — 네트워크가 잠시 끊겼을 수 있습니다. [다시 불러오기] 를 눌러 보세요.'
          + ' 계속되면 카카오 콘솔 > 앱 설정 > 플랫폼 > Web 에 이 도메인이 등록돼 있는지 확인이 필요합니다.');
      }
    }
  })();
  promise.catch(() => { promise = null; });
  return promise;
}
