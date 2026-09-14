'use client';

/**
 * 지도 캡쳐.
 *
 * 카카오 타일(daumcdn)에는 CORS 헤더가 없다(실측 확인).
 * html-to-image 는 DOM 을 SVG foreignObject 로 감싸 그리는 방식이라
 * 타일 인라인에 실패하면 통째로 빈 그림이 나온다 — 실패 사유도 안 남는다.
 *
 * 그래서 지도는 **직접 합성**한다.
 *   1) 화면에 깔린 타일 이미지를 같은 출처(/api/tile)로 다시 받아 캔버스에 그대로 찍고
 *   2) 반경원·사업지 경계·마커·라벨은 좌표를 알고 있으니 캔버스에 직접 그린다.
 * 오버레이를 DOM 에서 베끼지 않으므로 foreignObject·웹폰트·SVG 문제가 아예 없다.
 *
 * RadiusMap 이 지도 DOM 에 `__capture` 를 달아둔다. 그게 없으면 예전 방식으로 물러선다.
 */

/** 카카오 지도 이미지 호스트 — CORS 헤더가 없어 그대로는 캔버스에 못 그린다 */
const KAKAO_IMG = /^https?:\/\/[a-z0-9.-]*\.(?:daumcdn\.net|daum\.net|kakaocdn\.net)\//i;
const proxy = (u) => `/api/tile?u=${encodeURIComponent(u)}`;
const bgUrl = (v) => (String(v || '').match(/url\(["']?(.*?)["']?\)/) || [])[1] || '';

function loadImage(src, ms = 10000) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const t = setTimeout(() => rej(new Error('타일 로드 지연')), ms);
    im.onload = () => { clearTimeout(t); res(im); };
    im.onerror = () => { clearTimeout(t); rej(new Error('타일 로드 실패')); };
    im.src = src;
  });
}

/**
 * 지도 DOM 에 깔린 타일을 DOM 순서(= 쌓임 순서)대로 모은다.
 * <img> 와 CSS background-image 양쪽을 본다 — 지도 타입에 따라 어느 쪽인지 달라진다.
 */
function collectTiles(root) {
  const base = root.getBoundingClientRect();
  const out = [];
  const push = (src, el, alpha) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    out.push({ src, alpha, x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
  };
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const a = Number(cs.opacity);
    if (el.tagName === 'IMG' && el.src && KAKAO_IMG.test(el.src)) push(el.src, el, a);
    const u = bgUrl(cs.backgroundImage);
    if (u && KAKAO_IMG.test(u)) push(u, el, a);
  }
  return out;
}

/** 실패했을 때 "왜" 를 말할 수 있게 지도 DOM 을 들여다본다 */
export function diagnose(root) {
  if (!root) return '지도 요소 없음';
  const tiles = collectTiles(root);
  return [
    `크기 ${root.offsetWidth}x${root.offsetHeight}`,
    `타일 ${tiles.length}`,
    `img ${root.querySelectorAll('img').length}`,
    `canvas ${root.querySelectorAll('canvas').length}`,
    `요소 ${root.querySelectorAll('*').length}`,
  ].join(' · ');
}

/* ── 캔버스 드로잉 ───────────────────────────────────────── */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 마커 핀 — 카카오 기본 마커 이미지도 CORS 대상이라 직접 그린다 */
function drawPin(ctx, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 3.5, y - 10, x - 9, y - 13, x - 9, y - 20);
  ctx.arc(x, y - 20, 9, Math.PI, 0);          // 머리 (위쪽 반원)
  ctx.bezierCurveTo(x + 9, y - 13, x + 3.5, y - 10, x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - 20, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** 시설 라벨 — 화면의 CustomOverlay 와 같은 모양 */
function drawLabel(ctx, x, y, text) {
  ctx.save();
  ctx.font = '700 13px "Malgun Gothic","맑은 고딕",sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 18;
  const h = 24;
  const bx = x - w / 2;
  const by = y - h;
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  roundRect(ctx, bx, by, w, h, 5);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#111111';
  ctx.stroke();
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, by + h / 2 + 0.5);
  ctx.restore();
}

const rLabel = (r) => (r >= 1000 ? `${r / 1000}km` : `${r}m`);

/**
 * 타일 + 오버레이를 캔버스에 합성한다.
 * @returns {Promise<string>} PNG dataURL
 */
export async function composeMap(el, spec = {}) {
  const { map, kakao, center, radius, markers = [], polygon = null, radiusRing = null, title = '' } = spec;
  const ratio = spec.pixelRatio ?? 2;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!w || !h) throw new Error('지도 크기가 0입니다 (화면에 보이지 않는 상태)');

  const tiles = collectTiles(el);
  if (!tiles.length) throw new Error(`지도 타일을 찾지 못했습니다 — ${diagnose(el)}`);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#e9ecef';
  ctx.fillRect(0, 0, w, h);

  // 1) 타일 — 같은 출처로 다시 받아 캔버스가 오염되지 않게 한다
  let failed = 0;
  const loaded = await Promise.all(tiles.map(t =>
    loadImage(proxy(t.src)).then(im => ({ t, im })).catch(() => { failed += 1; return null; })
  ));
  let drawn = 0;
  for (const it of loaded) {
    if (!it) continue;
    ctx.globalAlpha = it.t.alpha > 0 ? it.t.alpha : 1;
    ctx.drawImage(it.im, it.t.x, it.t.y, it.t.w, it.t.h);
    drawn += 1;
  }
  ctx.globalAlpha = 1;
  if (!drawn) throw new Error(`타일을 하나도 가져오지 못했습니다 (대상 ${tiles.length} · 실패 ${failed})`);

  // 2) 오버레이 — DOM 을 베끼지 않고 좌표에서 다시 그린다
  const proj = map?.getProjection?.();
  const pt = (lat, lng) => {
    const p = proj.containerPointFromCoords(new kakao.maps.LatLng(lat, lng));
    return { x: p.x, y: p.y };
  };

  if (proj && center) {
    const c = pt(center.lat, center.lng);

    if (radiusRing?.length) {
      // 경계 기준 — 판정에 쓰는 거리로 역산한 선이라 그린 선이 곧 판정선이다
      ctx.beginPath();
      radiusRing.forEach((p, i) => {
        const q = pt(p.lat, p.lng);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(206,147,216,0.18)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFEB3B';
      ctx.stroke();
    } else if (radius) {
      // 중심 기준 — 반경 픽셀은 정북으로 radius m 떨어진 점을 투영해 잰다 (배율 가정 없이)
      const n = pt(center.lat + radius / 111320, center.lng);
      const rpx = Math.hypot(n.x - c.x, n.y - c.y);
      ctx.beginPath();
      ctx.arc(c.x, c.y, rpx, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(206,147,216,0.18)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFEB3B';
      ctx.stroke();
    }

    if (polygon?.length >= 3) {
      ctx.beginPath();
      polygon.forEach((p, i) => {
        const q = pt(p.lat, p.lng);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(27,79,216,0.22)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1b4fd8';
      ctx.stroke();
    }

    for (const m of markers) {
      const q = pt(m.lat, m.lng);
      drawPin(ctx, q.x, q.y, '#EA4335');
      drawLabel(ctx, q.x, q.y - 30, `${m.name}${m.distance != null ? ` · ${m.distance}m` : ''}`);
    }
    drawPin(ctx, c.x, c.y, '#1b4fd8');       // 사업지
  }

  // 3) 증빙용 각주 — 캡쳐만 떼어놔도 무엇을 찍은 것인지 알 수 있게
  const cap = [
    title,
    radius ? `반경 ${rLabel(radius)}` : null,
    radiusRing?.length ? '사업지 경계 기준' : '대표지번 중심 기준',
    new Date().toLocaleString('ko-KR'),
  ].filter(Boolean).join('  ·  ');
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, h - 24, w, 24);
  ctx.fillStyle = '#333333';
  ctx.font = '600 11.5px "Malgun Gothic","맑은 고딕",sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cap, 10, h - 12);
  ctx.restore();

  let url;
  try {
    url = canvas.toDataURL('image/png');
  } catch (e) {
    throw new Error(`캔버스가 오염되어 저장할 수 없습니다 (${e.name})`);
  }
  if (!url || url.length < 5000) {
    throw new Error(`캡쳐 결과가 비었습니다 (타일 ${drawn}/${tiles.length}, 결과 ${url?.length ?? 0}B)`);
  }
  return url;
}

/* ── 예전 방식(물러설 자리) ──────────────────────────────── */

/** 타일 src 를 같은 출처로 바꿔치기하고 끝나면 되돌린다 */
function swapTiles(root) {
  const undo = [];
  const waits = [];
  for (const i of root.querySelectorAll('img')) {
    if (!i.src || !KAKAO_IMG.test(i.src)) continue;
    const orig = i.src;
    undo.push(() => { i.removeAttribute('crossorigin'); i.src = orig; });
    waits.push(new Promise(res => {
      i.addEventListener('load', res, { once: true });
      i.addEventListener('error', res, { once: true });
      i.crossOrigin = 'anonymous';
      i.src = proxy(orig);
      if (i.complete) res();
    }));
  }
  for (const el of root.querySelectorAll('*')) {
    const u = bgUrl(getComputedStyle(el).backgroundImage);
    if (!u || !KAKAO_IMG.test(u)) continue;
    const orig = el.style.backgroundImage;
    undo.push(() => { el.style.backgroundImage = orig; });
    el.style.backgroundImage = `url("${proxy(u)}")`;
    waits.push(fetch(proxy(u)).catch(() => {}));
  }
  return { count: undo.length, ready: Promise.all(waits), undo };
}

async function captureByDom(el, pixelRatio) {
  const { count, ready, undo } = swapTiles(el);
  try {
    await Promise.race([ready, new Promise(r => setTimeout(r, 8000))]);
    await new Promise(r => setTimeout(r, 300));
    const { toPng } = await import('html-to-image');
    const url = await toPng(el, { pixelRatio, backgroundColor: '#ffffff', cacheBust: false, skipFonts: true });
    if (!url || url.length < 5000) {
      throw new Error(`캡쳐 결과가 비었습니다 (타일 ${count}개, 결과 ${url?.length ?? 0}B)`);
    }
    return url;
  } finally {
    undo.forEach(f => { try { f(); } catch {} });
  }
}

/**
 * 지도 DOM → PNG dataURL.
 * RadiusMap 이 달아둔 캔버스 합성기를 먼저 쓰고, 없거나 실패하면 예전 방식으로 물러선다.
 * @returns {Promise<string>} 실패하면 사유와 함께 예외를 던진다
 */
export async function captureMap(el, { pixelRatio = 2 } = {}) {
  if (!el) throw new Error('지도 요소를 찾지 못했습니다');
  let first = null;
  if (typeof el.__capture === 'function') {
    try {
      return await el.__capture({ pixelRatio });
    } catch (e) {
      first = e;   // 합성이 안 되면 예전 방식이라도 시도해 본다
    }
  }
  try {
    return await captureByDom(el, pixelRatio);
  } catch (e) {
    throw new Error(first ? `${first.message} / 대체방식도 실패: ${e.message}` : e.message);
  }
}
