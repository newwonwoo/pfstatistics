import { NextResponse } from 'next/server';
import { latestPeriod } from '../../../src/lib/latestPeriod.js';
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
/** 골든 표본과 같은 대상인지 — 시공사 지표는 상호로, 나머지는 지역으로 본다 */
function sameGolden(goldenRegion, region, company) {
  if (!goldenRegion) return false;
  const n = (x) => String(x ?? '').replace(/\(주\)|㈜|주식회사|\s+/g, '');
  return n(goldenRegion) === n(region) || n(goldenRegion) === n(company)
    || n(region).startsWith(n(goldenRegion));   // "경기도" 골든 ↔ "경기도 광주시" 조회
}

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const region = q.get('sgg');
  /*
    **조회월은 화면이 안 보내도 된다**(사용자 지적 2026-09-24).
    `periodPolicy` 를 넣은 뒤 `latest` 지표는 시점을 안 넘기면 제 최신을 찾고,
    남은 것은 `anchor` 두 지표(미분양·주민등록세대수)뿐이다 — 그 둘은 **같은 달**이어야
    미분양비율이 성립하므로 값 자체는 여전히 필요하다. 사람이 칠 값이 아니니 **서버가 구한다.**
    진단·재현용으로 `?ym=` 을 넘기면 그것을 그대로 쓴다.
  */
  let period = q.get('ym');
  const company = q.get('company');
  // 평가연도는 화면에서 받지 않는다 — 적재된 공시 중 최신을 쓴다
  const rankYear = q.get('year') || null;

  if (region && !period) {
    const l = await latestPeriod();
    period = l.ym;
    if (!period) {
      return NextResponse.json({ error: '원천이 가진 최신 조회월을 판정하지 못했습니다 — 잠시 뒤 다시 시도하세요' }, { status: 502 });
    }
  }
  if (!region || !period) {
    // 무엇이 비었는지 말해줘야 화면에서 바로 고친다
    const miss = [!region && 'sgg(시도·시군구)', !period && 'ym(조회월 YYYYMM)'].filter(Boolean);
    return NextResponse.json({ error: `${miss.join(' · ')} 가 비었습니다` }, { status: 400 });
  }
  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: `조회월 형식이 맞지 않습니다: "${period}" (YYYYMM 6자리)` }, { status: 400 });
  }

  /*
   * 반경내 시설은 좌표가 있어야 하고 시트별로 따로 받는다(/api/facilities).
   * 통계 목록에 섞어두면 언제나 "7/8 실패"로 보여 진짜 실패를 못 알아본다.
   */
  const stats = cat.indicators.filter(i => i.source.adapter !== 'kakao');

  const jobs = stats.map(async (ind) => {
    const a = ADAPTERS[ind.source.adapter];
    if (!a?.collect) {
      return { indicatorId: ind.id, name: ind.name, sheet: ind.sheet, ok: false,
               reason: `${ind.source.adapter} 어댑터 미지원` };
    }
    /*
     * 지역 인자.
     * 시도 단위라고 시군구를 떼면 안 된다 — 통합 시도(전남광주통합특별시)는
     * 시군구를 봐야 KOSIS 의 광주/전남 중 어느 쪽인지 가린다.
     * 수집기가 알아서 필요한 만큼만 쓴다.
     */
    const target = ind.regionLevel === 'company' ? company : region;
    /*
      시공능력평가는 연 단위라 조회월(YYYYMM)이 아니라 평가연도를 넘긴다.

      **나머지는 지표마다 시점 정책이 다르다**(사용자 확정 2026-09-23).
      전에는 전 지표를 조회월 하나에 묶었는데, 그러면 원천이 더 최신을 갖고 있어도
      미분양(가장 늦게 나오는 지표)에 맞춰 한 달씩 뒤처진다 —
      실측: KB 매매지수는 202608 이 있는데 202607(1.839%)을 쓰고 있었다(골든도 202608 이다).
        · anchor : 조회월 그대로. 미분양주택수(기준)와 주민등록세대수(미분양과 맞춰야 비율이 성립)
        · latest : 시점을 넘기지 않는다 — 수집기가 원천의 **최신**을 찾는다
      골든 자가진단은 시점을 명시해 부르므로 영향받지 않는다.
    */
    const p = ind.regionLevel === 'company' ? rankYear
      : ind.periodPolicy === 'latest' ? null
      : period;

    if (ind.regionLevel === 'company' && !company) {
      return { indicatorId: ind.id, name: ind.name, sheet: ind.sheet, ok: false, reason: '시공사명 미입력' };
    }
    try {
      const env = await a.collect(ind, { region: target, period: p });
      const g = ind.golden;
      return {
        ...env, sheet: ind.sheet, ok: true,
        /*
         * 골든은 표본(경기도 광주시)에서만 의미가 있다.
         * 지역을 안 보고 대조하면 인천을 조회해도 "정답 99.4 → 불일치" 배지가 붙어
         * 멀쩡한 값이 틀린 것처럼 보인다.
         */
        golden: g && String(g.period) === String(env.period) && sameGolden(g.region, region, company)
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
