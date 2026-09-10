import { NextResponse } from 'next/server';
import cat from '../../../config/indicators.json' with { type: 'json' };
import * as molit from '../../../src/collectors/molit.js';
import * as kb from '../../../src/collectors/kb.js';
import * as kofia from '../../../src/collectors/kofia.js';
import * as kosis from '../../../src/collectors/kosis.js';
import * as constructor from '../../../src/collectors/constructor.js';

export const runtime = 'nodejs';
export const maxDuration = 60;   // 원천 여러 곳을 도니 기본 10초로는 부족하다

const ADAPTERS = { molit, kb, kofia, kosis, constructor };

/**
 * GET /api/collect?sgg=경기도 광주시&ym=202607&company=제일건설(주)&year=2025
 *
 * 지표를 병렬로 수집하고, 실패한 항목도 이유를 그대로 돌려준다.
 * 실무자가 "왜 이 칸이 비었는지" 화면에서 바로 알 수 있어야 한다.
 */
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const region = q.get('sgg');
  const period = q.get('ym');
  const company = q.get('company');
  const rankYear = q.get('year') ?? '2025';

  if (!region || !period) {
    return NextResponse.json({ error: 'sgg, ym 파라미터가 필요합니다' }, { status: 400 });
  }

  const jobs = cat.indicators.map(async (ind) => {
    const a = ADAPTERS[ind.source.adapter];
    if (ind.source.adapter === 'kakao') {
      // 반경내 시설은 주소(좌표)가 있어야 하므로 /api/facilities 에서 별도 수집한다
      return { indicatorId: ind.id, name: ind.name, sheet: ind.sheet, ok: false,
               reason: '사업장 주소 입력 후 [반경시설 수집] 사용' };
    }
    if (!a?.collect) {
      return { indicatorId: ind.id, name: ind.name, sheet: ind.sheet, ok: false,
               reason: `${ind.source.adapter} 어댑터 미지원` };
    }
    // 지역 인자는 지표의 집계 단위에 맞춰 넘긴다
    const target = ind.regionLevel === 'sido' ? region.split(' ')[0]
                 : ind.regionLevel === 'company' ? company
                 : region;
    // 시공능력평가는 연 단위라 조회월(YYYYMM)이 아니라 평가연도를 넘겨야 한다
    const p = ind.regionLevel === 'company' ? rankYear : period;

    if (ind.regionLevel === 'company' && !company) {
      return { indicatorId: ind.id, name: ind.name, sheet: ind.sheet, ok: false, reason: '시공사명 미입력' };
    }
    try {
      const env = await a.collect(ind, { region: target, period: p });
      const g = ind.golden;
      return {
        ...env, sheet: ind.sheet, ok: true,
        golden: g && String(g.period) === String(env.period)
          ? { expected: g.value, match: Math.abs(Number(g.value) - Number(env.value)) < 0.005 }
          : null,
      };
    } catch (e) {
      return { indicatorId: ind.id, name: ind.name, sheet: ind.sheet, ok: false,
               reason: String(e.message).split('\n')[0] };
    }
  });

  const results = await Promise.all(jobs);
  return NextResponse.json({
    region, period, company: company ?? null,
    collectedAt: new Date().toISOString(),
    okCount: results.filter(r => r.ok).length,
    total: results.length,
    results,
  });
}
