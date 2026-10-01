import { pickComparables, guaranteeSetOf, presaleCandidates, pickPresale, similarityOf, baseRadius } from './similar.js';

/**
 * **선정기준 사례해설 재현 검사.**
 *
 * 규정 원문에는 사례해설(EX)이 붙어 있다 — 그것이 곧 정답지다.
 * 각 사례를 가상의 단지로 그대로 옮겨 `src/lib/similar.js` 가 원문과 같은 곳을 고르는지 대조한다.
 * 자가진단(`/api/selftest`)이 매일 돌리므로, 선정 규칙을 건드린 커밋이 사례와 어긋나면 그날 드러난다.
 */

/* 본건 — 아파트 / 500~999세대 / 50위 이내 / 민간택지 */
const SITE = { houseType: '아파트', sizeBand: '500~999세대', rankBand: '50위 이내', landType: '민간택지' };
/* 일치 개수를 원하는 대로 만든다 — 앞에서부터 n개 항목만 본건과 같게 */
const ITEMS = ['houseType', 'sizeBand', 'rankBand', 'landType'];
const OTHER = { houseType: '기타', sizeBand: '1,000세대 이상', rankBand: '300위 밖', landType: '공공택지' };
function apt(id, n, timing, years = timing === '1년 이내 분양개시' ? 0.5 : timing === '분양 진행중' ? 2 : 4, extra = {}) {
  const a = { manageNo: id, name: id, kind: '아파트', timing, years, distance: 500 };
  ITEMS.forEach((k, i) => { a[k] = i < n ? SITE[k] : OTHER[k]; });
  return { ...a, ...extra };
}
const same = (got, want) => JSON.stringify([...got].sort()) === JSON.stringify([...want].sort());

export function checkSelectionRules() {
  const out = [];
  const chk = (name, got, want) => out.push({
    name, actual: JSON.stringify(got), expected: JSON.stringify(want),
    status: same(got, want) ? 'pass' : 'MISMATCH',
  });
  const A = (items) => pickComparables(items, SITE, 'price').ids;
  const C = (items) => pickComparables(items, SITE, 'guarantee').ids;

  /* ── A. 분양가경쟁력(15) 사례해설 ── */
  chk('A-EX1 분양중 2개 · 준공 3개 → 준공',
    A([apt('분양중', 2, '분양 진행중'), apt('준공', 3, '준공')]), ['준공']);
  chk('A-EX2 분양중 3개 · 준공 4개 → 둘 다',
    A([apt('분양중', 3, '분양 진행중'), apt('준공', 4, '준공')]), ['분양중', '준공']);
  chk('A-EX3 1년이내 4·3·2개 → 4·3개 둘',
    A([apt('일치4', 4, '1년 이내 분양개시'), apt('일치3', 3, '1년 이내 분양개시'), apt('일치2', 2, '1년 이내 분양개시')]),
    ['일치4', '일치3']);
  chk('A-EX4 1년이내 3 · 분양중 3 · 준공 4 → 1년이내',
    A([apt('1년이내', 3, '1년 이내 분양개시'), apt('분양중', 3, '분양 진행중'), apt('준공', 4, '준공')]), ['1년이내']);
  chk('A-비고2 공공분양·10년 경과 제외',
    A([apt('공공', 4, '준공', 4, { publicSale: true }), apt('11년', 4, '준공', 11), apt('정상', 2, '준공')]), ['정상']);

  /* ── C. 분양보증 대상 — A 에 「5년 이내 분양개시 우선」 한 줄 ── */
  chk('C 5년 이내 우선 — 준공 7년(3개) · 분양중 2년(3개) → 분양중',
    C([apt('준공7년', 3, '준공', 7), apt('분양중2년', 3, '분양 진행중', 2)]), ['분양중2년']);
  chk('A 는 같은 경우 둘 다',
    A([apt('준공7년', 3, '준공', 7), apt('분양중2년', 3, '분양 진행중', 2)]), ['준공7년', '분양중2년']);
  chk('C 5년 이내가 없으면 그대로',
    C([apt('준공7년', 3, '준공', 7), apt('준공8년', 3, '준공', 8)]), ['준공7년', '준공8년']);
  chk('C 수동 선택에도 같은 한 줄',
    guaranteeSetOf([apt('준공7년', 2, '준공', 7), apt('분양중2년', 2, '분양 진행중', 2)]).set.map(a => a.manageNo), ['분양중2년']);

  /* ── B. 인근아파트 초기 분양률(10) 사례해설 ── */
  const B = (items) => {
    const f = presaleCandidates(items, SITE);
    return f.stage === 'none' ? ['최하위'] : pickPresale(f.rows).ids;
  };
  chk('B-EX1 1년이내 없음 · 분양중 1개 → 그 1개',
    B([apt('분양중', 1, '분양 진행중'), apt('준공', 4, '준공')]), ['분양중']);
  chk('B-EX2 1년이내 3개(4·3·3) → 4개 일치 1곳',
    B([apt('일치4', 4, '1년 이내 분양개시'), apt('일치3a', 3, '1년 이내 분양개시'), apt('일치3b', 3, '1년 이내 분양개시')]),
    ['일치4']);
  chk('B-EX3 1년이내 3개(4·4·3) → 4개 일치 2곳(평균)',
    B([apt('일치4a', 4, '1년 이내 분양개시'), apt('일치4b', 4, '1년 이내 분양개시'), apt('일치3', 3, '1년 이내 분양개시')]),
    ['일치4a', '일치4b']);
  chk('B 준공만 있으면 → 최하위 배점',
    B([apt('준공', 4, '준공')]), ['최하위']);
  chk('B 유형 불일치(오피스텔)는 대상 아님',
    B([apt('오피', 4, '1년 이내 분양개시', 0.5, { kind: '오피스텔' })]), ['최하위']);

  /* 공통 — 거리 기본값 · 유사도 셈 */
  chk('거리 수도권 1km · 그 밖 2km', [baseRadius('경기 광주시'), baseRadius('충남 천안시')], [1000, 2000]);
  chk('유사도 미상은 일치로 세지 않는다', [similarityOf(SITE, { houseType: '아파트' }).n], [1]);
  chk('아파트↔주상복합은 주택유형 일치', [similarityOf({ houseType: '주상복합' }, { houseType: '아파트' }).n], [1]);

  const failures = out.filter(o => o.status !== 'pass');
  return { healthy: failures.length === 0, summary: `선정기준 사례 ${out.length - failures.length}/${out.length}`, failures, checks: out };
}
