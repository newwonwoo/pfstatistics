/**
 * 인구유입요인 — 지역수요(5) 의 반쪽.
 *
 * **어느 원천에도 없다.** 신도시·혁신도시·기업도시·산업단지 등 요인의 개수를 사람이 센다.
 * 구간표가 **세 단계뿐**이라(2개↑ 5점 · 1개 3점 · 없음 1점 — 4점·2점 행은 원문에 없다)
 * 「없음 / 1개 / 2개 이상」 칩으로 정확히 덮인다. 숫자를 자유롭게 받으면 3개·4개를 구분해
 * 넣게 되지만 점수는 2개 이상과 같다.
 *
 * 두 자리(지역수요 시트 표 · 수기입력 A 합산표)에서 같은 값을 고르므로
 * **선택 판정은 이 한 곳만 본다** — 두 군데서 따로 적으면 「2개 이상」 의 뜻이 갈린다.
 */
export const INFLOW_CHOICES = [['0', '없음'], ['1', '1개'], ['2', '2개 이상']];

export function inflowOn(value, choice) {
  const n = String(value ?? '').trim() === '' ? null : Number(value);
  if (n == null || !Number.isFinite(n)) return false;
  return choice === '2' ? n >= 2 : n === Number(choice);
}
