import { NextResponse } from 'next/server';
import { requireKey } from '../../../src/lib/env.js';
import { getJson } from '../../../src/lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 청약홈(한국부동산원) 분양정보 탐색 창구.
 *
 * 비교사업장의 **분양가**를 주는 유일한 공공 원천이다.
 * 키가 배포 환경에만 있어 파라미터 실험을 여기서 한다(심평원·KOSIS 와 같은 이유).
 *
 *   /api/applyhome?op=detail&area=경기&from=2024-01-01&rows=10
 *   /api/applyhome?op=model&manageNo=2024000123&pblancNo=2024000123
 *   /api/applyhome?op=raw&path=ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail&rows=3
 *
 * 공공데이터포털 키는 **API 마다 따로 활용신청**해야 한다 —
 * 키가 있어도 신청 안 했으면 SERVICE_KEY_IS_NOT_REGISTERED 가 난다.
 */
const HOST = 'https://api.odcloud.kr/api';

const PATHS = {
  detail: 'ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail',   // 분양정보(공고 단위)
  model:  'ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl',      // 주택형별 상세(면적·세대수·분양가)
};

const mask = (u) => u.replace(/serviceKey=[^&]+/, 'serviceKey=***');

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const op = q.get('op') ?? 'detail';
  try {
    const path = op === 'raw' ? q.get('path') : PATHS[op];
    if (!path) return NextResponse.json({ error: `알 수 없는 op: ${op}` }, { status: 400 });
    /*
      공공데이터포털 키는 API 마다 따로 활용신청해야 한다 — 다른 서비스(K-apt 등)도
      **같은 키로 되는지 여기서 시험한다.** host 를 주면 odcloud 대신 그쪽으로 묻는다.
      passthrough: 응답 규격이 서비스마다 달라 가공하지 않고 그대로 돌려준다.
    */
    const host = q.get('host');
    if (host) {
      const p = new URLSearchParams({ serviceKey: requireKey('DATA_GO_KR_KEY').trim(), _type: 'json' });
      for (const [k, v] of q.entries()) {
        if (!['op', 'host', 'path'].includes(k)) p.set(k, v);
      }
      /* path 에 이미 질의문자열이 붙어 오면 물음표가 두 개가 된다 — 갈라서 합친다 */
      const [bare, inline] = String(path).split('?');
      if (inline) for (const [k, v] of new URLSearchParams(inline)) p.set(k, v);
      const url = `https://${host.replace(/^https?:\/\//, '')}/${bare.replace(/^\//, '')}?${p}`;
      try {
        const d = await getJson(url, { retries: 1, timeout: 20000 });
        return NextResponse.json({ url: mask(url), ok: true, data: d });
      } catch (e) {
        return NextResponse.json({ url: mask(url), ok: false, error: e.message }, { status: 200 });
      }
    }

    const qs = new URLSearchParams({
      serviceKey: requireKey('DATA_GO_KR_KEY').trim(),
      page: q.get('page') ?? '1',
      perPage: q.get('rows') ?? '10',
    });
    // 지역·기간 필터는 odcloud 의 cond[필드::연산자] 문법을 쓴다
    if (q.get('area')) qs.set('cond[SUBSCRPT_AREA_CODE_NM::EQ]', q.get('area'));
    if (q.get('from')) qs.set('cond[RCRIT_PBLANC_DE::GTE]', q.get('from'));
    if (q.get('manageNo')) qs.set('cond[HOUSE_MANAGE_NO::EQ]', q.get('manageNo'));
    if (q.get('pblancNo')) qs.set('cond[PBLANC_NO::EQ]', q.get('pblancNo'));
    // 임의 조건도 통째로 넘길 수 있게 둔다 (탐색용)
    for (const [k, v] of q.entries()) if (k.startsWith('cond[')) qs.set(k, v);

    const url = `${HOST}/${path}?${qs}`;
    const d = await getJson(url, { retries: 2 });

    return NextResponse.json({
      url: mask(url),
      totalCount: d?.totalCount, currentCount: d?.currentCount, matchCount: d?.matchCount,
      fields: d?.data?.[0] ? Object.keys(d.data[0]) : [],
      data: d?.data ?? d,
    });
  } catch (e) {
    const noKey = e.code === 'NO_KEY';
    return NextResponse.json({ error: e.message, op }, { status: noKey ? 428 : 502 });
  }
}
