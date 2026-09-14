import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600;

/**
 * 최신 조회월 자동 판정.
 *
 * 조회월을 사람이 치게 하면 안 된다 — 원천마다 공표 시차가 다르고,
 * 실무자가 이번 달을 넣으면 "자료 없음"이 난다(실측: 2026-09 기준 미분양 최신은 202607).
 * 통계누리 미분양이 이 앱에서 가장 시차가 큰 월 단위 지표라 이걸 기준으로 잡는다.
 */
const URL_ = (ym) =>
  `https://stat.molit.go.kr/portal/stat/data.do?formId=2082&styleNum=128&apprYn=Y&startDate=${ym}&endDate=${ym}`;

const shift = (d, n) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};

export async function GET() {
  const now = new Date();
  const tried = [];
  for (let i = 0; i < 8; i++) {
    const ym = shift(now, i);
    tried.push(ym);
    try {
      const j = await (await fetch(URL_(ym), { cache: 'no-store' })).json();
      if ((j.data ?? []).length) {
        return NextResponse.json({
          ym,
          source: '국토교통부 통계누리 미분양주택현황(시·군·구)',
          note: '이 앱에서 공표 시차가 가장 큰 월 단위 지표 기준',
          tried,
        });
      }
    } catch { /* 다음 달로 계속 되짚는다 */ }
  }
  return NextResponse.json({ error: '최신 조회월을 판정하지 못했습니다', tried }, { status: 502 });
}
