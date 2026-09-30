import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100';
const server = process.env.E2E_BASE_URL ? null : spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', '3100'], {
  stdio: 'pipe', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
let serverOutput = '';
server?.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server?.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    if (server?.exitCode != null) throw new Error(`Next 서버 종료: ${serverOutput.slice(-1000)}`);
    try { if ((await fetch(baseURL)).ok) return; } catch {}
    await delay(1000);
  }
  throw new Error(`Next 서버 시작 실패: ${serverOutput.slice(-1000)}`);
}

// 외부 API와 지도 타일 대신 일정한 응답을 사용한다. 화면의 클릭과 상태 전환은 실제 앱 코드로 수행한다.
async function installFixtures(page, calls) {
  await page.addInitScript(() => {
    class LatLng {
      constructor(lat, lng) { this.lat = lat; this.lng = lng; }
      getLat() { return this.lat; }
      getLng() { return this.lng; }
    }
    class Map {
      constructor(el) {
        this.clicks = 0;
        el.addEventListener('click', () => {
          const points = [[37.5, 126.75], [37.5, 126.752], [37.502, 126.75]];
          const [lat, lng] = points[this.clicks++ % points.length];
          this.onClick?.({ latLng: new LatLng(lat, lng) });
        });
      }
      setBounds() {}
      setCenter() {}
      setLevel() {}
      getLevel() { return 4; }
      getProjection() { return { containerPointFromCoords: () => ({ x: 100, y: 100 }) }; }
      relayout() {}
      setMapTypeId() {}
    }
    class Shape {
      setMap() {}
      getBounds() { return new Bounds(); }
    }
    class Bounds { extend() {} }
    window.kakao = { maps: {
      LatLng, Map, Marker: Shape, Polygon: Shape, Circle: Shape, Polyline: Shape,
      CustomOverlay: Shape, LatLngBounds: Bounds, MapTypeId: { ROADMAP: 1, HYBRID: 2, SKYVIEW: 3 },
      event: { addListener: (map, name, listener) => { if (name === 'click') map.onClick = listener; } },
    } };
    Element.prototype.scrollIntoView = function () {};
  });

  const coord = { x: 126.75, y: 37.5, jibunAddress: '경기도 부천시 상동 540-1', roadAddress: null };
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const q = url.searchParams;
    switch (url.pathname) {
      case '/api/latest': return route.fulfill(json({ ym: '202607', source: '통계누리' }));
      case '/api/selftest': return route.fulfill(json({ healthy: true, summary: '검사 정상' }));
      case '/api/constructors': return route.fulfill(json({ rows: [], count: 0 }));
      case '/api/district': return route.fulfill(json({}));
      case '/api/config': return route.fulfill(json({ kakaoJsKey: '' }));
      case '/api/facilities': {
        calls.facilities.push(url);
        if (q.get('only') === 'none') return route.fulfill(json({
          geo: { via: 'address', candidates: [coord], dropped: 0, outOfRegion: false }, coord,
        }));
        return route.fulfill(json({
          address: q.get('addr'), coord, facilities: {}, spec: {}, note: {},
          basis: q.has('polygon') ? 'polygon' : 'point',
        }));
      }
      case '/api/collect': return route.fulfill(json({ period: '202607', okCount: 0, total: 7, results: [] }));
      case '/api/apts':
        calls.radii.push(Number(q.get('radius')));
        return route.fulfill(json({ radius: Number(q.get('radius')), sido: '경기도', scanned: 0,
          items: [], knownApts: { items: [] }, source: { citation: '브라우저 테스트 자료' },
          basis: q.has('polygon') ? 'polygon' : 'point' }));
      default: return route.fulfill(json({}));
    }
  });
}

let browser;
try {
  console.log('브라우저 테스트: 서버 준비');
  await waitForServer();
  console.log('브라우저 테스트: Chromium 실행');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = { facilities: [], radii: [] };
  await installFixtures(page, calls);
  await page.goto(baseURL);
  await page.getByText('원천 정상', { exact: true }).waitFor();
  console.log('브라우저 테스트: 주소 선택');

  await page.locator('select').first().selectOption('경기도');
  await page.locator('input[placeholder*="시군구 검색"]').fill('부천시');
  await page.locator('input[placeholder*="시군구 검색"]').press('Enter');
  await page.locator('input[placeholder="지번 또는 도로명"]').fill('상동 540-1');
  await page.getByRole('button', { name: '지도에서 검색하기' }).click();
  await page.getByRole('button', { name: /주소 확정됨/ }).waitFor();

  const map = page.locator('[data-map="사업지 경계"]');
  for (let i = 0; i < 3; i++) await map.click({ position: { x: 50 + i * 25, y: 50 + i * 25 } });
  await page.getByRole('button', { name: '경계 3점 확정' }).click();
  await page.getByRole('button', { name: '통계 수집', exact: true }).click();
  await page.getByRole('button', { name: /통계 수집 \(0\/7\)/ }).waitFor();
  await page.getByRole('button', { name: /반경시설 수집 \(3종\)/ }).click();
  console.log('브라우저 테스트: 경계 수집 확인');
  await page.getByText('반경시설 수집 완료', { exact: false }).waitFor();
  assert.match(await page.getByRole('button', { name: /사업지 경계 지도/ }).innerText(), /경계 기준으로 잽니다/);

  await page.getByRole('button', { name: '변경', exact: true }).click();
  console.log('브라우저 테스트: 중심 기준 전환');
  assert.match(await page.getByRole('button', { name: /사업지 경계 지도/ }).innerText(), /거리 기준 선택 중/);
  await page.getByRole('button', { name: /대표지번 중심 기준/ }).click();
  await page.getByText('대표지번 중심점 기준', { exact: false }).waitFor();
  const summary = page.getByRole('button', { name: /사업지 경계 지도/ });
  assert.match(await summary.innerText(), /중심 기준 — 대표지번 한 점에서 잽니다/);
  assert.doesNotMatch(await summary.innerText(), /경계 기준으로 잽니다/);
  assert.equal(calls.facilities.at(-1).searchParams.has('polygon'), false);

  await summary.click();
  await page.getByText('중심 기준 — 보관된 경계는 거리 판정에 쓰지 않습니다').waitFor();
  assert.equal(await page.getByRole('button', { name: '그리기 시작' }).count(), 0);
  await map.click({ position: { x: 150, y: 150 } });
  await page.getByText(/경계 3점은 보관 중/).waitFor();

  await page.getByRole('tab', { name: /비교사업장/ }).click();
  console.log('브라우저 테스트: 비교사업장 반경 확장');
  await page.locator('[data-sheet="비교사업장"]').getByRole('button', { name: /반경 1km 분양단지 수집/ }).click();
  await page.locator('[data-sheet="비교사업장"]').getByText('매 1km 범위로 확장', { exact: true }).waitFor();
  await page.locator('[data-sheet="비교사업장"]').getByRole('button', { name: '2km', exact: true }).click();
  await page.locator('[data-sheet="비교사업장"]').getByRole('button', { name: /반경 2km 분양단지 수집/ }).click();
  await page.locator('[data-sheet="비교사업장"]').getByRole('button', { name: /반경 2km 수집됨/ }).waitFor();
  assert.deepEqual(calls.radii, [1000, 2000]);

  await page.getByRole('tab', { name: '초기예상분양률' }).click();
  const rate = page.locator('[data-sheet="초기예상분양률"]');
  assert.match(await rate.innerText(), /종합평가 점수가 있어야 분양률을 냅니다/);
  assert.deepEqual(errors, []);
  console.log('브라우저 흐름 통과: 주소 → 경계/중심 전환 → 거리 수집 → 반경 확장 → 미완성 계산 차단');
} finally {
  await browser?.close();
  if (server) {
    server.kill('SIGTERM');
    await delay(500);
  }
}
