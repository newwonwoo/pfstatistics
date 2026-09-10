import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { requireKey } from '../lib/env.js';

/**
 * 지도 반경 증빙 캡쳐.
 *
 * 캡쳐 01·02·05 는 실무자가 카카오맵에서 반경원 그리고 스크린샷 뜬 것이다.
 * 카카오맵 JS SDK 를 헤드리스로 띄워 같은 그림을 자동 생성한다.
 *   - 사업지 폴리곤/중심 마커
 *   - 반경원 (300m / 500m / 1km / 1.5km)
 *   - 판정 대상 시설 마커 + 라벨
 *
 * JS SDK 는 REST 키가 아니라 JavaScript 키를 쓴다.
 * 카카오 콘솔 > 앱 > 앱 키 > JavaScript 키, 그리고
 * 플랫폼 > Web 에 http://localhost 를 등록해야 헤드리스에서 로드된다.
 */
const LOCAL_CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find(p => fs.existsSync(p));
const launchOpts = LOCAL_CHROME ? { executablePath: LOCAL_CHROME } : {};

function pageHtml({ jsKey, center, radius, markers, label }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body,#map{margin:0;width:900px;height:700px}
.badge{background:#fff;border:2px solid #333;padding:3px 8px;font:600 13px 'Malgun Gothic',sans-serif;border-radius:3px}</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false"></script></head>
<body><div id="map"></div><script>
kakao.maps.load(function(){
  var c = new kakao.maps.LatLng(${center.lat}, ${center.lng});
  var map = new kakao.maps.Map(document.getElementById('map'), { center: c, level: 6 });
  var circle = new kakao.maps.Circle({
    center: c, radius: ${radius},
    strokeWeight: 2, strokeColor: '#7B1FA2', strokeOpacity: 0.9,
    fillColor: '#E1BEE7', fillOpacity: 0.45,
  });
  circle.setMap(map);
  new kakao.maps.Marker({ position: c, map: map });
  ${(markers ?? []).map(m => `
  (function(){
    var p = new kakao.maps.LatLng(${m.lat}, ${m.lng});
    new kakao.maps.Marker({ position: p, map: map });
    new kakao.maps.CustomOverlay({ position: p, map: map, yAnchor: 2.2,
      content: '<div class="badge">${String(m.name).replace(/'/g, '')}</div>' });
  })();`).join('')}
  map.setBounds(circle.getBounds());
  window.__ready = true;
});
</script></body></html>`;
}

/** 반경원 지도 PNG 생성 */
export async function captureRadiusMap({ center, radius, markers = [], outPath }) {
  const jsKey = requireKey('KAKAO_JS_KEY');
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
    await page.setContent(pageHtml({ jsKey, center, radius, markers }), { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 20000 });
    await page.waitForTimeout(1500);   // 타일 로딩 대기
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
    return outPath;
  } finally { await browser.close(); }
}
