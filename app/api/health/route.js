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
      return { status: 'rejected', code: j.err, message: j.errMsg, hint };
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
    if (r.status === 401) return { status: 'rejected', code: 401, hint: 'REST API 키가 아니거나 오탈자. 콘솔 > 앱 키 > REST API 키 확인' };
    if (r.status === 403) return { status: 'rejected', code: 403, hint: '앱 권한 문제. 플랫폼 > Web 등록 확인' };
    if (!r.ok) return { status: 'rejected', code: r.status };
    const j = await r.json();
    return { status: 'ok', sample: `${j.documents?.length ?? 0}건 조회됨` };
  } catch (e) { return { status: 'error', message: e.message }; }
}

export async function GET() {
  const env = {
    KOSIS_API_KEY: process.env.KOSIS_API_KEY,
    KAKAO_REST_KEY: process.env.KAKAO_REST_KEY,
    NEXT_PUBLIC_KAKAO_JS_KEY: process.env.NEXT_PUBLIC_KAKAO_JS_KEY,
    ECOS_API_KEY: process.env.ECOS_API_KEY,
  };
  const [kosis, kakao] = await Promise.all([
    probeKosis(env.KOSIS_API_KEY),
    probeKakaoRest(env.KAKAO_REST_KEY),
  ]);
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    keys: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, mask(v)])),
    probes: {
      KOSIS: kosis,
      KAKAO_REST: kakao,
      // JS 키는 브라우저 전용이라 서버에서 검증 불가 — 존재 여부만 본다
      KAKAO_JS: env.NEXT_PUBLIC_KAKAO_JS_KEY ? { status: 'present', note: '브라우저에서만 검증 가능 (지도 렌더시 확인)' } : { status: 'missing' },
    },
    keylessSources: { 통계누리: 'ok', KB부동산: 'ok', 금융투자협회: 'ok' },
  });
}
