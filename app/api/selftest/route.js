import { NextResponse } from 'next/server';
import cat from '../../../config/indicators.json' with { type: 'json' };
import * as molit from '../../../src/collectors/molit.js';
import * as kb from '../../../src/collectors/kb.js';
import * as kofia from '../../../src/collectors/kofia.js';
import * as kosis from '../../../src/collectors/kosis.js';
import * as constructor from '../../../src/collectors/constructor.js';
import { checkScoringGolden } from '../../../src/lib/goldenScoring.js';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ADAPTERS = { molit, kb, kofia, kosis, constructor };

/**
 * 자가진단 — 골든값 재현 검사.
 *
 * 통계누리·KB·금투협은 공식 API 가 아니라 화면 뒤의 내부 엔드포인트다.
 * 사이트가 개편되면 **에러 없이 값만 조용히 틀려질 수 있고**, 그게 최악이다.
 * 그래서 캡쳐에서 확인된 정답값을 매번 다시 뽑아 대조한다.
 *
 * 판정
 *   pass      정답과 일치
 *   MISMATCH  값이 달라짐 → 원천 변경 의심. 즉시 확인 필요
 *   error     호출 자체 실패 → 엔드포인트 변경/차단 의심
 *   skipped   골든값이 없는 지표(CD금리처럼 매일 변하는 값)
 */
export async function GET() {
  // 고정 정답이 있거나, 범위 점검 대상인 지표
  const targets = cat.indicators.filter(i =>
    (i.golden?.value != null || i.golden?.sanityRange) && ADAPTERS[i.source.adapter]?.collect);

  const checks = await Promise.all(targets.map(async (ind) => {
    const g = ind.golden;
    const base = { indicatorId: ind.id, name: ind.name, org: ind.source.org, expected: g.value, period: g.period };

    try {
      const r = await ADAPTERS[ind.source.adapter].collect(ind, {
        region: g.region, period: g.period ? String(g.period) : String(new Date().getFullYear()) + '01',
      });
      const v = Number(r.value);
      const common = { ...base, actual: r.value, dataUpdatedAt: r.source?.dataUpdatedAt ?? null };

      /*
       * CD금리처럼 매 영업일 변하는 값은 고정 정답과 대조할 수 없다.
       * 그대로 두면 매일 경고가 떠서 진짜 이상을 놓치게 되므로,
       * "값이 살아있고 상식적인 범위인가"로 감시한다.
       */
      if (g.sanityRange) {
        const [lo, hi] = g.sanityRange;
        const ok = Number.isFinite(v) && v >= lo && v <= hi;
        return { ...common, status: ok ? 'pass' : 'MISMATCH', mode: 'range', expected: `${lo}~${hi}`,
          ...(ok ? {} : { reason: `범위(${lo}~${hi}) 밖 값 ${r.value}. 원천 변경 의심` }) };
      }

      const ok = Math.abs(v - Number(g.value)) < 0.005;
      return { ...common, status: ok ? 'pass' : 'MISMATCH', mode: 'golden',
        ...(ok ? {} : { reason: `정답 ${g.value} → 실제 ${r.value}. 원천 변경 의심` }) };
    } catch (e) {
      return { ...base, status: 'error', reason: String(e.message).split('\n')[0] };
    }
  }));

  const fail = checks.filter(c => c.status === 'MISMATCH' || c.status === 'error');
  /*
    **원천만 감시하면 반쪽이다.** 값을 맞게 받아와도 구간표가 틀리면 점수가 조용히 틀린다 —
    골든 평가표를 이 앱의 판정 함수로 다시 내어 한 줄씩 대조한다.
  */
  const scoring = checkScoringGolden();
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    healthy: fail.length === 0 && scoring.healthy,
    summary: `${checks.filter(c => c.status === 'pass').length}/${checks.length} 정상 · ${scoring.summary}`,
    failures: [...fail, ...scoring.failures.map(f => ({ name: f.name, reason: `정답 ${f.expected} → 실제 ${f.actual}` }))],
    scoring,
    checks,
  }, { status: fail.length ? 503 : 200 });   // 감시도구가 상태코드로 판별할 수 있게
}
