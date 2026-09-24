/**
 * 원천이 실제로 가진 **최신 조회월**을 판정한다.
 *
 * 조회월을 사람이 치게 하면 안 된다 — 원천마다 공표 시차가 다르고,
 * 실무자가 이번 달을 넣으면 "자료 없음" 이 난다(실측: 2026-09 기준 미분양 최신은 202607).
 * 통계누리 미분양이 이 앱에서 가장 시차가 큰 월 단위 지표라 이걸 기준으로 잡는다.
 *
 * **`periodPolicy` 를 넣은 뒤에도 이 값은 필요하다**(2026-09-24 확인).
 * `latest` 인 지표(KB·소비심리·주택보급률)는 시점을 안 넘기면 제 최신을 찾지만,
 * `anchor` 인 **미분양·주민등록세대수는 같은 달이어야 미분양비율이 성립**한다 —
 * 그 둘을 묶어주는 것이 이 값이다. 그래서 화면에서 입력칸은 없애되 값은 서버가 구한다.
 */
const URL_ = (ym) =>
  `https://stat.molit.go.kr/portal/stat/data.do?formId=2082&styleNum=128&apprYn=Y&startDate=${ym}&endDate=${ym}`;

const shift = (d, n) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** 한 시간은 같은 답이다 — 수집 한 번에 여러 번 불릴 수 있다 */
let cache = null;

export async function latestPeriod() {
  if (cache && Date.now() - cache.at < 3600_000) return cache.val;
  const now = new Date();
  const tried = [];
  for (let i = 0; i < 8; i++) {
    const ym = shift(now, i);
    tried.push(ym);
    try {
      const j = await (await fetch(URL_(ym), { cache: 'no-store' })).json();
      if ((j.data ?? []).length) {
        const val = {
          ym,
          source: '국토교통부 통계누리 미분양주택현황(시·군·구)',
          note: '이 앱에서 공표 시차가 가장 큰 월 단위 지표 기준',
          tried,
        };
        cache = { at: Date.now(), val };
        return val;
      }
    } catch { /* 다음 달로 계속 되짚는다 */ }
  }
  return { ym: null, tried, error: '최신 조회월을 판정하지 못했습니다' };
}
