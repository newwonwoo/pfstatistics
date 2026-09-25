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

/**
 * 마커 핀 — 카카오 기본 마커 이미지도 CORS 대상이라 직접 그린다.
 * 번호를 주면 머리에 새긴다(표의 # 와 같은 번호).
 */
function drawPin(ctx, x, y, color, no = null) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 3.5, y - 10, x - 10, y - 13, x - 10, y - 21);
  ctx.arc(x, y - 21, 10, Math.PI, 0);          // 머리 (위쪽 반원)
  ctx.bezierCurveTo(x + 10, y - 13, x + 3.5, y - 10, x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (no == null) {
    ctx.beginPath();
    ctx.arc(x, y - 21, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px "Malgun Gothic","맑은 고딕",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(no), x, y - 21 + 0.5);
  }
  ctx.restore();
}

const LABEL_FONT = '700 13px "Malgun Gothic","맑은 고딕",sans-serif';
const hits = (a, b) => !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);

/** 시설 라벨 한 장 그리기 */
function paintLabel(ctx, box, text) {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  roundRect(ctx, box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1, 5);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#111111';
  ctx.stroke();
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, (box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2 + 0.5);
  ctx.restore();
}

/**
 * 겹치지 않는 자리를 찾아 라벨을 놓는다.
 *
 * 시설을 전부 찍으면 라벨이 서로 덮어 아무것도 못 읽는다 — 증빙으로 못 쓴다.
 * 핀 위/아래로 자리를 옮겨보고, 그래도 안 되면 라벨을 포기한다(번호 핀은 남으므로
 * 표의 # 로 찾을 수 있다).
 */
function placeLabel(ctx, placed, x, y, text, bounds) {
  ctx.font = LABEL_FONT;
  const w = Math.ceil(ctx.measureText(text).width) + 18;
  const h = 24;
  for (const dy of [0, -27, 27, -54, 54, -81, 81, -108, 108, -135, 135]) {
    let cx = x;
    // 화면 밖으로 나가면 안쪽으로 당긴다
    cx = Math.max(w / 2 + 4, Math.min(bounds.w - w / 2 - 4, cx));
    const box = { x1: cx - w / 2, y1: y - h + dy, x2: cx + w / 2, y2: y + dy };
    if (box.y1 < 2 || box.y2 > bounds.h - 26) continue;      // 각주 띠도 피한다
    if (placed.some(q => hits(box, q))) continue;
    placed.push(box);
    paintLabel(ctx, box, text);
    return true;
  }
  return false;
}

const rLabel = (r) => (r >= 1000 ? `${r / 1000}km` : `${r}m`);

/** 이름표를 다는 최대 개수 — RadiusMap 과 같게 유지할 것 */
const LABEL_MAX = 999;   /* 이름은 전부 단다 — 자리를 못 찾은 것만 포기한다 */

/**
 * 타일 + 오버레이를 캔버스에 합성한다.
 * @returns {Promise<string>} PNG dataURL
 */
export async function composeMap(el, spec = {}) {
  const { map, kakao, center, radius, markers = [], lines = [], polygon = null, radiusRing = null, title = '', labels = true, labelMax = null, labelPlacement = null,
          mime = 'image/png', quality = 0.92 } = spec;
  /*
   * **확대해도 깨지지 않게 3배로 찍는다**(사용자 요청 2026-09-17).
   * 타일 자체는 1배라 타일 그림은 확대의 한계가 있지만,
   * 핀·라벨·반경원·경계선은 캔버스에 직접 그리므로 배율만큼 선명해진다 —
   * 증빙에서 실제로 읽어야 하는 것이 그 글자들이다.
   */
  const ratio = spec.pixelRatio ?? 3;
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

    /*
     * 표에 있는 시설을 전부 찍는다. 번호는 표의 # 와 같다.
     * 핀을 먼저 다 그리고, 라벨은 가까운 것부터 겹치지 않는 자리에 놓는다.
     */
    /*
      **도로는 선으로 그린다** — 화면과 같아야 한다.
      핀 하나로 찍던 시절엔 그 좌표가 도로가 아니라 필지라 증빙 그림이 거짓말을 했다.
      (ctx 는 이미 ratio 로 scale 돼 있어 선 굵기는 화면과 같은 값을 쓴다)
    */
    lines.forEach((ln) => {
      const path = (ln.path ?? []).map(p => pt(p.lat, p.lng));
      if (path.length < 2) return;
      ctx.beginPath();
      path.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.strokeStyle = ln.strong ? '#1b4fd8' : '#ff6f00';
      ctx.globalAlpha = ln.strong ? 0.95 : 0.7;
      ctx.lineWidth = ln.strong ? 6 : 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    markers.forEach((m, i) => {
      const q = pt(m.lat, m.lng);
      /* `faint` 는 도로가 지나는 자리 — 시설이 아니라 자취라 번호를 달지 않는다 */
      if (m.faint) {
        ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(27,79,216,.55)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        return;
      }
      drawPin(ctx, q.x, q.y, i === 0 ? '#1b4fd8' : '#EA4335', m.no ?? i + 1);
    });
    /* 경계가 그려져 있으면 사업지 핀은 그리지 않는다 — 화면과 같은 규칙 */
    const siteHasPoly = polygon?.length >= 3;
    if (!siteHasPoly) drawPin(ctx, c.x, c.y, '#111111');       // 사업지

    /*
     * 라벨은 핀도 가리면 안 된다 — 어느 핀의 이름인지 알 수 없게 된다.
     * 사업지와 모든 시설 핀의 자리를 먼저 막아두고 라벨 자리를 찾는다.
     */
    const pinBox = (q) => ({ x1: q.x - 12, y1: q.y - 33, x2: q.x + 12, y2: q.y + 3 });
    const placed = [...(siteHasPoly ? [] : [pinBox(c)]), ...markers.filter(m => !m.faint).map(m => pinBox(pt(m.lat, m.lng)))];

    /*
      **화면이 잡은 자리를 그대로 쓴다.**
      전에는 여기서 따로 자리를 찾아, 같은 지도인데 화면과 증빙의 이름표가 다른 자리에 붙었다.
      증빙이 화면과 달라지면 안 된다 — 화면이 준 배치가 있으면 그것만 그린다.
    */
    if (labels && labelPlacement?.length) {
      for (const L of labelPlacement) {
        const q = pt(L.lat, L.lng);
        const box = { x1: q.x + L.dx - L.w / 2, y1: q.y + L.dy - L.h / 2,
                      x2: q.x + L.dx + L.w / 2, y2: q.y + L.dy + L.h / 2 };
        paintLabel(ctx, box, L.text);
      }
    } else {
      (labels ? markers.filter(m => !m.faint) : []).slice(0, labelMax ?? LABEL_MAX).forEach((m, i) => {
        const q = pt(m.lat, m.lng);
        const no = m.no ?? i + 1;
        placeLabel(ctx, placed, q.x, q.y - 36,
          `${no}. ${m.name}${m.distance != null ? ` · ${m.distance}m` : ''}`, { w, h });
      });
    }
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
    /*
     * **지도는 사진이라 JPEG 가 맞다**(실측 2026-09-17).
     * 3배로 찍으니 엑셀이 47MB 가 됐다 — 메일로 못 보낸다.
     * 타일은 연속톤 사진이라 PNG 가 최악이고, 핀·라벨 글자는 크고 진해서
     * JPEG 품질 0.92 에서도 그대로 읽힌다. 표·글자 증빙(카드)은 PNG 를 유지한다.
     */
    url = canvas.toDataURL(mime, quality);
  } catch (e) {
    throw new Error(`캔버스가 오염되어 저장할 수 없습니다 (${e.name})`);
  }
  if (!url || url.length < 5000) {
    throw new Error(`캡쳐 결과가 비었습니다 (타일 ${drawn}/${tiles.length}, 결과 ${url?.length ?? 0}B)`);
  }
  return url;
}

/**
 * 로드뷰 캡쳐.
 *
 * 로드뷰는 2D 캔버스에 그린다(SDK 코드 확인 — WebGL 아님).
 * 캔버스는 캡쳐를 막지 않는다. 막는 건 **cross-origin 이미지로 오염된 캔버스의 읽기**다.
 * 카카오가 파노라마 타일을 CORS 로 받으면 오염되지 않아 그대로 읽힌다.
 *
 * 타일에 CORS 헤더가 붙는지는 밖에서 확인할 방법이 없었다(타일 주소에 panoId 가 필요한데
 * 그건 브라우저에서만 나온다). 그래서 추측하지 않고 **그냥 시도해서 실제 사유를 알린다.**
 */
export function captureRoadview(root) {
  if (!root) throw new Error('로드뷰 요소를 찾지 못했습니다');
  const canvases = [...root.querySelectorAll('canvas')]
    .filter(c => c.width > 50 && c.height > 50)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  if (!canvases.length) throw new Error('로드뷰 캔버스를 찾지 못했습니다 (아직 로딩 중일 수 있습니다)');

  const c = canvases[0];
  let url;
  try {
    url = c.toDataURL('image/png');
  } catch (e) {
    throw new Error(
      `로드뷰 캔버스를 읽을 수 없습니다 — ${e.name}. `
      + '파노라마 타일에 CORS 헤더가 없어 캔버스가 오염된 상태입니다. '
      + '증빙은 위성 지도로 남기세요.');
  }
  if (!url || url.length < 5000) {
    throw new Error(`로드뷰 캡쳐가 비었습니다 (${c.width}x${c.height}, ${url?.length ?? 0}B)`);
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
/*
 * **기본값 2 가 `composeMap` 의 3 을 덮고 있었다**(실측 2026-09-17).
 * 지도를 3배로 찍기로 해놓고 정작 부르는 쪽이 2 를 넘겨 조용히 무력화됐다 —
 * 엑셀 원본이 2096x1280 으로 나와 배치 1240px 대비 1.69배 여유뿐이었다.
 * 두 곳의 기본값을 같은 수로 맞춘다.
 */
export async function captureMap(el, { pixelRatio = 3, mime, quality } = {}) {
  if (!el) throw new Error('지도 요소를 찾지 못했습니다');
  let first = null;
  if (typeof el.__capture === 'function') {
    try {
      return await el.__capture({ pixelRatio, ...(mime ? { mime, quality } : {}) });
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
