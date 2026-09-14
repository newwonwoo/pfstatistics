'use client';

/**
 * 지도 캡쳐.
 *
 * 카카오 타일(daumcdn)에는 CORS 헤더가 없어 html-to-image 가 인라인하지 못한다.
 * 그대로 캡쳐하면 지도가 빈 채로 저장된다(브라우저 fetch 차단 확인함).
 * 그래서 캡쳐 직전에만 타일 src 를 같은 출처(/api/tile)로 바꿔 로드를 기다린 뒤 찍고,
 * 끝나면 원래 주소로 되돌린다. 지도 동작에는 영향을 주지 않는다.
 */
const TILE = /^https?:\/\/map\d*\.daumcdn\.net\//;

function swapTiles(root) {
  const imgs = [...root.querySelectorAll('img')].filter(i => TILE.test(i.src));
  const restore = imgs.map(i => [i, i.src]);
  const loaded = imgs.map(i => new Promise(resolve => {
    const done = () => resolve();
    i.addEventListener('load', done, { once: true });
    i.addEventListener('error', done, { once: true });
    i.crossOrigin = 'anonymous';
    i.src = `/api/tile?u=${encodeURIComponent(restore.find(([el]) => el === i)[1])}`;
    // 캐시로 즉시 완료된 경우
    if (i.complete) resolve();
  }));
  return { restore, ready: Promise.all(loaded) };
}

/** 지도 DOM → PNG dataURL. 타일이 비어 나오지 않도록 중계 경로를 거친다. */
export async function captureMap(el, { pixelRatio = 2 } = {}) {
  if (!el) return null;
  const { toPng } = await import('html-to-image');
  const { restore, ready } = swapTiles(el);
  try {
    await Promise.race([ready, new Promise(r => setTimeout(r, 8000))]);  // 타일이 느려도 8초까지만
    await new Promise(r => setTimeout(r, 250));                          // 렌더 안정화
    return await toPng(el, { pixelRatio, backgroundColor: '#ffffff', cacheBust: false });
  } finally {
    for (const [img, src] of restore) { img.removeAttribute('crossorigin'); img.src = src; }
  }
}
