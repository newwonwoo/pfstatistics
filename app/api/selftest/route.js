import { NextResponse } from 'next/server';
import cat from '../../../config/indicators.json' with { type: 'json' };
import * as molit from '../../../src/collectors/molit.js';
import * as kb from '../../../src/collectors/kb.js';
import * as kofia from '../../../src/collectors/kofia.js';
import * as kosis from '../../../src/collectors/kosis.js';
import * as constructor from '../../../src/collectors/constructor.js';

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
  const targets = cat.indicators.filter(i => i.golden?.value != null && ADAPTERS[i.source.adapter]?.collect);

  const checks = await Promise.all(targets.map(async (ind) => {
    const g = ind.golden;
    const base = { indicatorId: ind.id, name: ind.name, org: ind.source.org, expected: g.value, period: g.period };

    // CD금리처럼 시점이 흘러가는 값은 고정 정답과 대조할 수 없다
    if (!g.period) return { ...base, status: 'skipped', reason: '시점 고정값 아님' };

    try {
      const r = await ADAPTERS[ind.source.adapter].collect(ind, { region: g.region, period: String(g.period) });
      const ok = Math.abs(Number(r.value) - Number(g.value)) < 0.005;
      return {
        ...base, actual: r.value,
        status: ok ? 'pass' : 'MISMATCH',
        dataUpdatedAt: r.source?.dataUpdatedAt ?? null,
        ...(ok ? {} : { reason: `정답 ${g.value} → 실제 ${r.value}. 원천 변경 의심` }),
      };
    } catch (e) {
      return { ...base, status: 'error', reason: String(e.message).split('\n')[0] };
    }
  }));

  const fail = checks.filter(c => c.status === 'MISMATCH' || c.status === 'error');
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    healthy: fail.length === 0,
    summary: `${checks.filter(c => c.status === 'pass').length}/${checks.length} 정상`,
    failures: fail,
    checks,
  }, { status: fail.length ? 503 : 200 });   // 감시도구가 상태코드로 판별할 수 있게
}
