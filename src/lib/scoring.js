import TABLE from '../../config/scoring.json' with { type: 'json' };

/**
 * 평가점수 산정.
 *
 * 구간표는 `config/scoring.json` 에만 둔다 — 코드에 숫자를 흩어놓으면
 * 기준이 바뀔 때 어디를 고쳐야 하는지 알 수 없게 된다.
 *
 * 규칙은 점수가 높은 것부터 적어두고 위에서부터 먼저 맞는 것을 채택한다.
 * 그래서 "동시만족이면 가장 높은 점수" 가 자동으로 지켜진다.
 * 아무것도 안 맞으면 base (기본 1점).
 */

/** 그 시설의 최근접 거리(m). 없으면 null */
const distOf = (facilities, label) => facilities?.facilities?.[label]?.nearest?.distance ?? null;

/** labels 전부가 radius 안에 있는가 */
function allWithin(facilities, radius, labels) {
  return labels.every((l) => {
    const d = distOf(facilities, l);
    return d != null && d <= radius;
  });
}

/** 규칙 하나가 맞는지 — `all` 은 {반경: [시설명…]} 을 모두 만족해야 한다 */
function matches(rule, facilities) {
  if (!rule.all) return true;
  return Object.entries(rule.all).every(([r, labels]) => allWithin(facilities, Number(r), labels));
}

/**
 * 시트 단위 점수 (교육환경처럼 시설 조합으로 판정하는 것)
 * @returns {{score:number,label:string,rule:object|null}|null} 구간표가 없으면 null
 */
export function scoreSheet(sheetId, facilities) {
  const t = TABLE[sheetId];
  if (!t || t.scope !== 'sheet' || !facilities) return null;
  for (const rule of t.rules) {
    if (matches(rule, facilities)) return { score: rule.score, label: rule.label, rule };
  }
  return { score: t.base.score, label: t.base.label, rule: null };
}

/**
 * 시설 단위 점수 (6차선 왕복도로처럼 거리 구간으로 판정하는 것)
 * @param {object} value  수기 판정값 { distance, lanes }
 */
export function scoreFacility(label, value) {
  const t = TABLE[label];
  if (!t || t.scope !== 'facility') return null;

  // 전제조건(왕복 6차선 이상)을 못 넘으면 구간을 따지지 않는다
  const need = t.requires?.lanesAtLeast;
  if (need != null && !((value?.lanes ?? 0) >= need)) {
    return { ...t.base, reason: (value?.lanes ?? 0) === 0 ? '차선 수 미입력' : `왕복 ${value.lanes}차선 — ${need}차선 미만` };
  }
  const d = value?.distance;
  if (d == null) return { ...t.base, reason: '도로 미선택' };

  for (const rule of t.rules) {
    if (d <= rule.within) {
      return { score: rule.score, label: rule.label, reason: `${d}m — ${rule.within}m 이내` };
    }
  }
  const last = t.rules.at(-1)?.within;
  return { ...t.base, reason: `${d}m — ${last}m 초과` };
}

/** 구간표가 들어와 있는 항목인지 (없으면 화면에서 빗금을 유지한다) */
export const hasTable = (key) => Boolean(TABLE[key]);
