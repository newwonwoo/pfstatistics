import { NextResponse } from 'next/server';
import STORE from '../../../data/constructor-rank.json' with { type: 'json' };

export const runtime = 'nodejs';

/**
 * 시공사 검색.
 *
 * 명부가 연도별 2,800여 건이라 브라우저 번들에 실으면 안 된다(3개 연도 1.7MB).
 * 서버에서 찾아 상위 몇 건만 내려준다.
 *
 * 상호 표기가 제각각이라((주)/㈜/주식회사/공백) 정규화해서 비교한다 —
 * 공시 원본도 "현대건설(주)" 와 "주식회사 포스코이앤씨" 가 섞여 있다.
 */
const YEARS = Object.keys(STORE).sort();
const LATEST = YEARS.at(-1);

const norm = (s) => String(s ?? '').replace(/\(주\)|\(유\)|㈜|주식회사|\s+/g, '');

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const year = STORE[q.get('year')] ? q.get('year') : LATEST;
  const set = STORE[year];
  const k = norm(q.get('q') ?? '');
  const limit = Math.min(Number(q.get('limit')) || 20, 50);

  let rows = set.rows;
  if (k) {
    // 앞에서 맞는 상호를 먼저 — "제일" 로 치면 제일건설이 위에 와야 한다
    const starts = [], has = [];
    for (const r of rows) {
      const n = norm(r.상호);
      if (n.startsWith(k)) starts.push(r);
      else if (n.includes(k)) has.push(r);
    }
    rows = [...starts, ...has];
  }
  const total = rows.length;

  return NextResponse.json({
    year, years: YEARS, latest: LATEST,
    source: { file: set.sourceFile, url: set.sourceUrl, title: set.sourceTitle, ingestedAt: set.ingestedAt },
    count: set.count, total,
    rows: rows.slice(0, limit).map(r => ({ 상호: r.상호, 순위: r.순위, 지역: r.지역, 평가액: r.평가액 })),
  });
}
