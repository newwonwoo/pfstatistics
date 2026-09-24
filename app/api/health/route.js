import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 키 진단 엔드포인트.
 *
 * "키를 넣었는데 왜 안 되지" 를 배포 환경에서 바로 알 수 있어야 한다.
 * 값은 절대 그대로 노출하지 않고, 길이·앞뒤 4자·공백 혼입 여부만 보여준 뒤
 * 원천에 실제로 한 번 찔러서 살아있는 키인지 확인한다.
 */
/* 브이월드 키는 도메인 제한이 걸린다 — 배포 도메인을 그대로 실어 보낸다 */
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://pfstatistics.vercel.app');

const mask = (v) => {
  if (!v) return null;
  const trimmed = v.trim();
  return {
    length: v.length,
    preview: trimmed.length > 8 ? `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}` : '****',
    hasWhitespace: v !== trimmed,          // 복붙할 때 줄바꿈·공백이 딸려오는 사고가 잦다
    hasQuotes: /^["']|["']$/.test(v),      // 값에 따옴표를 같이 넣는 사고도 잦다
  };
};

async function probeKosis(key) {
  if (!key) return { status: 'missing' };
  const url = `https://kosis.kr/openapi/statisticsList.do?method=getList&apiKey=${encodeURIComponent(key.trim())}`
    + `&vwCd=MT_ZTITLE&parentListId=&format=json&jsonVD=Y`;
  try {
    const r = await fetch(url);
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { return { status: 'unknown', body: t.slice(0, 120) }; }
    if (j?.err) {
      const hint = {
        '10': '인증키 누락 — 환경변수가 전달되지 않음',
        '11': '유효하지 않은 인증키 — 오탈자·공백 혼입이거나 아직 활성화 전(발급 직후 수 시간 소요)',
        '20': '해당 자료 없음 — 키는 유효함',
        '30': '서비스 미신청 — KOSIS 마이페이지에서 오픈API 활용신청 필요',
        '31': '기간만료 — 인증키 재발급 필요',
        '32': '일일 호출 초과',
      }[String(j.err)];
      return { status: 'rejected', code: j.err, message: j.errMsg, hint, body: t.slice(0, 200) };
    }
    return { status: 'ok', sample: Array.isArray(j) ? `${j.length}건 조회됨` : 'ok' };
  } catch (e) { return { status: 'error', message: e.message }; }
}

async function probeKakaoRest(key) {
  if (!key) return { status: 'missing' };
  try {
    const r = await fetch('https://dapi.kakao.com/v2/local/search/address.json?query=서울시청', {
      headers: { Authorization: `KakaoAK ${key.trim()}` },
    });
    const body = await r.text();
    if (r.ok) {
      let j; try { j = JSON.parse(body); } catch {}
      return { status: 'ok', sample: `${j?.documents?.length ?? 0}건 조회됨` };
    }
    // 카카오는 403 을 여러 이유로 준다. 원인 판별은 응답 본문의 코드에 달려있다.
    // 카카오는 403 을 여러 이유로 준다. 실제로 겪은 케이스를 그대로 해설로 붙인다.
    let hint = { 401: 'REST API 키가 아니거나 오탈자입니다' }[r.status]
      ?? '키는 인식되나 거부됨 — 아래 body 를 확인하십시오';
    if (/disabled OPEN_MAP_AND_LOCAL/.test(body)) {
      hint = '카카오맵 서비스가 꺼져 있습니다 → 콘솔 > 앱 선택 > 제품 설정 > 카카오맵 > ON '
           + '(키 문제가 아니며, 이 설정 하나로 REST 검색과 지도 SDK 가 함께 풀립니다)';
    } else if (/insufficient scope|not registered/i.test(body)) {
      hint = '플랫폼(Web) 도메인이 등록되지 않았습니다 → 콘솔 > 앱 설정 > 플랫폼';
    }
    return { status: 'rejected', code: r.status, hint, body: body.slice(0, 300) };
  } catch (e) { return { status: 'error', message: e.message }; }
}

/**
 * 브이월드 키 점검.
 *
 * 거부 사유가 **셋인데 응답 코드는 하나**다(`INCORRECT_KEY`) — 실측 2026-09-24.
 *   ① 키가 틀렸다  ② 도메인 제한에 걸렸다  ③ **그 키에 이 API 권한이 없다**
 * 실제로 겪은 것은 ③ 이었다. 같은 키로 주소검색은 되는데 WFS·데이터API 만 거부됐다.
 * 그래서 **주소검색(권한 기본 포함)을 같이 찔러** 둘을 가른다 —
 * 주소검색이 되는데 WFS 가 안 되면 키가 아니라 **활용 API 선택**의 문제다.
 * (카카오 403 이 "키 문제가 아니라 제품설정 OFF" 였던 것과 같은 구조다.)
 */
async function probeVworld(key) {
  if (!key) return { status: 'missing', note: '브이월드 인증키 — www.vworld.kr/dev/v4api.do 에서 발급 (사용 URL 에 배포 도메인 등록 필수)' };
  const k = encodeURIComponent(key.trim());
  const ask = async (url) => {
    try { const r = await fetch(url); return { ok: r.ok, body: await r.text() }; }
    catch (e) { return { ok: false, body: `ERR ${e.message}` }; }
  };
  const wfs = await ask('https://api.vworld.kr/req/wfs?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=1.1.0'
    + `&key=${k}&domain=${encodeURIComponent(VWORLD_DOMAIN)}`);
  if (/WFS_Capabilities/i.test(wfs.body)) return { status: 'ok', sample: 'WFS GetCapabilities 응답 수신' };

  /* WFS 가 막혔다 — 키가 죽은 것인지, 이 API 만 막힌 것인지 갈라본다 */
  const addr = await ask('https://api.vworld.kr/req/address?service=address&request=getcoord&type=road'
    + `&address=${encodeURIComponent('서울특별시 중구 세종대로 110')}&format=json&key=${k}`);
  const addrOk = /"status"\s*:\s*"OK"/.test(addr.body);

  const hint = addrOk
    ? '키는 살아 있는데 **WFS·데이터 API 권한이 없습니다** — 브이월드 > 마이페이지 > 오픈API 인증키 관리 '
      + '> 해당 키 수정 > 활용 API 에 「데이터 API」(WMS/WFS) 를 체크하고 저장하십시오'
    : /도메인|domain/i.test(wfs.body)
      ? `사용 URL 이 맞지 않습니다 — 브이월드 키 설정의 사용 URL 에 ${VWORLD_DOMAIN} 를 등록하십시오`
      : '인증키가 거부되었습니다 — 오탈자·공백 혼입을 확인하십시오';

  return { status: 'rejected', hint, otherApiWorks: addrOk, body: wfs.body.slice(0, 300) };
}

export async function GET() {
  const env = {
    KOSIS_API_KEY: process.env.KOSIS_API_KEY,
    KAKAO_REST_KEY: process.env.KAKAO_REST_KEY,
    DATA_GO_KR_KEY: process.env.DATA_GO_KR_KEY,
    NEXT_PUBLIC_KAKAO_JS_KEY: process.env.NEXT_PUBLIC_KAKAO_JS_KEY,
    ECOS_API_KEY: process.env.ECOS_API_KEY,
    VWORLD_API_KEY: process.env.VWORLD_API_KEY,
  };
  const [kosis, kakao, vworld] = await Promise.all([
    probeKosis(env.KOSIS_API_KEY),
    probeKakaoRest(env.KAKAO_REST_KEY),
    probeVworld(env.VWORLD_API_KEY),
  ]);
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    keys: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, mask(v)])),
    probes: {
      KOSIS: kosis,
      KAKAO_REST: kakao,
      // JS 키는 브라우저 전용이라 서버에서 검증 불가 — 존재 여부만 본다
      KAKAO_JS: env.NEXT_PUBLIC_KAKAO_JS_KEY ? { status: 'present', note: '브라우저에서만 검증 가능 (지도 렌더시 확인)' } : { status: 'missing' },
      // KOSIS 가 계속 막히면 세대수는 이쪽으로 우회할 수 있다
      /*
        브이월드는 **도메인 제한**이 있다 — 키를 발급할 때 등록한 URL 에서 온 요청만 받는다.
        그래서 "키가 있다" 와 "이 배포에서 쓸 수 있다" 가 다르다. 실제로 한 번 불러 확인한다.
      */
      VWORLD: vworld,
      DATA_GO_KR: env.DATA_GO_KR_KEY
        ? { status: 'present', note: '행정안전부 주민등록 세대현황 우회경로로 사용 가능' }
        : { status: 'missing', note: 'KOSIS 대안 — data.go.kr 활용신청 시 세대수 우회수집 가능' },
    },
    keylessSources: { 통계누리: 'ok', KB부동산: 'ok', 금융투자협회: 'ok' },
  });
}
