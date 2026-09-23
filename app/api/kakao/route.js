import { NextResponse } from 'next/server';
import { requireKey } from '../../../src/lib/env.js';
import { getJson } from '../../../src/lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 카카오 로컬 탐색 창구.
 *
 * 키가 배포 환경에만 있어 파라미터 실험을 여기서 한다(KOSIS·심평원·청약홈과 같은 이유).
 * 특히 **아파트**는 카카오에 전용 카테고리 그룹코드가 없어서
 * 키워드 검색 + `category_name` 분포를 실측해야 쓸 수 있는지 판단할 수 있다.
 *
 *   /api/kakao?q=아파트&x=127.25&y=37.40&radius=3000
 *   /api/kakao?category=MT1&x=&y=&radius=1500
 *   ?pages=3  최대 45건씩 더 받는다 (카카오는 페이지당 15건, 최대 45건)
 */
const BASE = 'https://dapi.kakao.com/v2/local/search';

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const x = q.get('x'), y = q.get('y');
  const radius = Math.min(20000, Number(q.get('radius')) || 3000);
  const pages = Math.min(3, Math.max(1, Number(q.get('pages')) || 3));
  /* addr=1 이면 주소검색 — 행정구역 개편으로 시군구가 바뀌었는지 확인하는 창구 */
  const kind = q.get('addr') ? 'address' : q.get('category') ? 'category' : 'keyword';

  try {
    const H = { Authorization: `KakaoAK ${requireKey('KAKAO_REST_KEY').trim()}` };
    const docs = [];
    let total = null;
    for (let page = 1; page <= pages; page++) {
      /* sort=distance 는 중심좌표가 있어야 한다 — 없이 보내면 400 (Required Parameter x,y) */
      const p = new URLSearchParams({ size: '15', page: String(page) });
      /*
        **정렬을 고를 수 있어야 한다.** 키워드가 일반명사면(백화점·공원) 상호에 그 말이 든
        동네 가게가 더 가까워서, sort=distance 로는 45건 상한 안에 진짜 대상이 안 들어온다
        (구리 롯데백화점 실측 — 반경 2km 241건 중 45건을 거리순으로 받으니 백화점이 0건).
      */
      const sort = q.get('sort') === 'accuracy' ? 'accuracy' : 'distance';
      if (x && y) { p.set('x', x); p.set('y', y); p.set('radius', String(radius)); p.set('sort', sort); }
      if (kind === 'category') p.set('category_group_code', q.get('category'));
      else p.set('query', q.get('q') ?? '아파트');
      if (kind === 'address') { p.delete('x'); p.delete('y'); p.delete('radius'); p.delete('sort'); }
      const d = await getJson(`${BASE}/${kind}.json?${p}`, { headers: H, retries: 2, timeout: 12000 });
      total ??= d.meta?.total_count ?? null;
      docs.push(...(d.documents ?? []));
      if (d.meta?.is_end) break;
    }
    /* 무엇으로 분류돼 오는지를 봐야 걸러쓸 수 있다 — 상호가 아니라 분류로 거르는 게 이 앱의 규칙 */
    const byCategory = {};
    for (const d of docs) byCategory[d.category_name ?? '?'] = (byCategory[d.category_name ?? '?'] ?? 0) + 1;

    return NextResponse.json({
      kind, radius, sort: q.get('sort') === 'accuracy' ? 'accuracy' : 'distance',
      totalCount: total, returned: docs.length,
      byCategory,
      items: docs.map(d => ({
        name: d.place_name ?? d.address_name, category: d.category_name,
        address: d.address_name, road: d.road_address_name,
        /* 주소검색이 주는 현재 행정구역 — 개편 전 표기와 다를 수 있다 */
        sido: d.address?.region_1depth_name ?? null,
        sgg: d.address?.region_2depth_name ?? d.road_address?.region_2depth_name ?? null,
        distance: d.distance ? Number(d.distance) : null,
        x: d.x, y: d.y,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? null }, { status: e.code === 'NO_KEY' ? 428 : 502 });
  }
}
