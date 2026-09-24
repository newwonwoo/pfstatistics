import { NextResponse } from 'next/server';
import { getKey, KEY_NAMES } from '../../../src/lib/env.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 원천 탐색 창구 (raw 텍스트).
 *
 * 기존 `/api/applyhome?op=raw` 는 **JSON 만** 본다 — https 로 강제하고 `getJson` 으로 파싱한다.
 * WFS(GML/XML) · GetCapabilities · 공시 HTML 처럼 JSON 이 아닌 원천은 그걸로 못 본다.
 * "붙었는데 JSON 이 아니다" 와 "아예 못 붙는다" 도 구분이 안 된다(둘 다 `fetch failed`).
 *
 *   /api/probe?url=http://호스트/경로?a=b
 *   /api/probe?url=...&key=VWORLD_API_KEY&keyParam=key
 *   /api/probe?url=...&key=DATA_GO_KR_KEY               (keyParam 기본값 serviceKey)
 *
 * **열린 프록시가 되면 안 되므로 호스트를 허용목록으로 막는다.** GET 만, 20초, 200KB.
 * 응답에 키가 섞여 나가지 않도록 URL 도 본문도 마스킹한다 — 증빙에 키가 박혀 나간 전례가 있다.
 */
const ALLOW = new Set([
  'api.vworld.kr',          // 브이월드 (국토교통부 WMS/WFS 원천)
  'www.vworld.kr',
  'openapi.nsdi.go.kr',     // 국가공간정보포털
  'apis.data.go.kr',        // 공공데이터포털
  'api.odcloud.kr',
  'www.data.go.kr',
  'www.law.go.kr',          // 법령
  'business.juso.go.kr',    // 도로명주소
  'www.juso.go.kr',
]);

const MAXB = 200 * 1024;

/** 알고 있는 키는 값 자체를 지운다 (파라미터 이름을 몰라도 새어 나가지 않게) */
const mask = (s) => {
  let t = String(s ?? '').replace(/(serviceKey|apiKey|authKey|key|domain)=[^&\s"'<]+/gi, '$1=***');
  for (const n of KEY_NAMES) {
    const v = getKey(n);
    if (v && v.length > 8) t = t.split(v).join('***');
  }
  return t;
};

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const raw = q.get('url');
  if (!raw) return NextResponse.json({ error: 'url 이 필요합니다' }, { status: 400 });

  let u;
  try { u = new URL(raw); } catch { return NextResponse.json({ error: 'url 형식이 아닙니다' }, { status: 400 }); }
  if (!/^https?:$/.test(u.protocol)) return NextResponse.json({ error: 'http/https 만 됩니다' }, { status: 400 });
  if (!ALLOW.has(u.hostname)) {
    return NextResponse.json({ error: `허용하지 않은 호스트입니다: ${u.hostname}`, allow: [...ALLOW] }, { status: 400 });
  }

  const keyName = q.get('key');
  if (keyName) {
    if (!KEY_NAMES.includes(keyName)) {
      return NextResponse.json({ error: `모르는 키 이름입니다: ${keyName}`, names: KEY_NAMES }, { status: 400 });
    }
    const v = getKey(keyName);
    if (!v) return NextResponse.json({ error: `${keyName} 가 배포 환경에 없습니다` }, { status: 428 });
    u.searchParams.set(q.get('keyParam') ?? 'serviceKey', v.trim());
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'pfstatistics-probe' } });
    const text = (await r.text()).slice(0, MAXB);
    return NextResponse.json({
      url: mask(u.toString()), status: r.status,
      contentType: r.headers.get('content-type'), bytes: text.length,
      body: mask(text),
    });
  } catch (e) {
    /* 못 붙은 이유를 그대로 남긴다 — ENOTFOUND(호스트 못 품)와 TLS·타임아웃은 다른 문제다 */
    return NextResponse.json({
      url: mask(u.toString()), status: 0,
      error: e.name === 'AbortError' ? '20초 안에 응답이 없습니다' : e.message,
      cause: e.cause?.code ?? e.cause?.message ?? null,
    });
  } finally { clearTimeout(timer); }
}
