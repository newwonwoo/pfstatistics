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

/** members 중 radius 안에 있는 것의 개수 */
function countWithin(facilities, radius, members) {
  return members.filter((l) => {
    const d = distOf(facilities, l);
    return d != null && d <= radius;
  }).length;
}

/**
 * 규칙 하나가 맞는지.
 *   all   : {반경: [시설명…]} — 전부 그 반경 안에 있어야 한다 (교육환경)
 *   count : {radius, atLeast} — members 중 몇 개가 그 반경 안에 있는가 (주거편의)
 */
function matches(rule, facilities, members) {
  if (rule.all) {
    return Object.entries(rule.all).every(([r, labels]) => allWithin(facilities, Number(r), labels));
  }
  if (rule.count) {
    return countWithin(facilities, rule.count.radius, members ?? []) >= rule.count.atLeast;
  }
  return true;
}

/**
 * 시트 단위 점수 (교육환경처럼 시설 조합으로 판정하는 것)
 * @returns {{score:number,label:string,rule:object|null}|null} 구간표가 없으면 null
 */
export function scoreSheet(sheetId, facilities) {
  const t = TABLE[sheetId];
  if (!t || t.scope !== 'sheet' || !facilities) return null;
  for (const rule of t.rules) {
    if (matches(rule, facilities)) return { score: rule.score, label: rule.label, text: rule.text, rule };
  }
  return { score: t.base.score, label: t.base.label, text: t.base.text, rule: null };
}

/**
 * 그룹 단위 점수 (주거편의의 두 묶음).
 * 아직 구간표를 못 받은 경우는 `pending` 으로 돌려 화면에서 빗금을 유지한다 —
 * 아래 구간 규칙이 대신 걸려 **더 낮은 점수가 조용히 매겨지는 것**을 막아야 한다.
 */
export function scoreGroup(sheetId, groupLabel, facilities) {
  const key = Object.keys(TABLE).find(
    (k) => TABLE[k].scope === 'group' && TABLE[k].sheet === sheetId && TABLE[k].group === groupLabel);
  const t = key ? TABLE[key] : null;
  if (!t || !facilities) return null;
  for (const rule of t.rules) {
    if (!matches(rule, facilities, t.members)) continue;
    if (rule.pending) return { pending: true, text: rule.text };
    return { score: rule.score, label: rule.label, text: rule.text, rule };
  }
  return { score: t.base.score, label: t.base.label, text: t.base.text, rule: null };
}

/**
 * POI 단위 점수 (지하철역처럼 그 시설 하나의 존재 여부로 판정하는 것).
 *
 * 지하철역은 골든 캡쳐에서 **부재일 때 1점**만 확인됐다.
 * 역이 있을 때의 구간은 아직 못 받았으므로 `pending` 으로 돌려 빗금을 유지한다 —
 * 추정해서 채우면 틀린 점수가 조용히 매겨진다.
 */
export function scorePoi(label, facilities) {
  const t = TABLE[label];
  if (!t || t.scope !== 'poi' || !facilities) return null;
  for (const rule of t.rules) {
    if (!matches(rule, facilities, [label])) continue;
    if (rule.pending) return { pending: true, text: rule.text };
    return { score: rule.score, label: rule.label, text: rule.text, rule };
  }
  return { score: t.base.score, label: t.base.label, text: t.base.text, rule: null };
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

/**
 * 행렬 구간표 (분양가경쟁력).
 *
 * 분양가격지수(행) × 분양가격지수 제외 항목 점수 A(열) 로 점수가 정해진다.
 * 지수가 **낮을수록** 좋은 점수다 — 본건이 주변보다 싸면 분양 가능성이 높다.
 *
 * @param {number} index  분양가격지수 = 본건 ÷ 비교평균 × 100
 * @param {number} excl   분양가격지수 제외 항목 점수(A) — 내부망 평가표에서 가져온다
 */
export function scoreMatrix(key, index, excl) {
  const t = TABLE[key];
  if (!t || t.scope !== 'matrix') return null;
  if (!Number.isFinite(index)) return { pending: true, text: '본건 분양가와 비교사업장 평균이 있어야 지수를 냅니다' };
  if (!Number.isFinite(excl)) return { pending: true, text: '분양가격지수 제외 항목 점수(A) 를 입력하세요' };

  const inBand = (b, v) =>
    (b.gte == null || v >= b.gte) && (b.lt == null || v < b.lt);
  const ri = t.rows.findIndex(r => inBand(r, index));
  const ci = t.cols.findIndex(c => inBand(c, excl));
  if (ri < 0 || ci < 0) return { pending: true, text: '구간표 범위를 벗어났습니다' };

  const score = t.scores[ri][ci];
  return {
    score,
    label: t.labels?.[String(score)] ?? '',
    row: t.rows[ri].label,
    col: t.cols[ci].label,
    text: `분양가격지수 ${t.rows[ri].label} · 제외항목점수 ${t.cols[ci].label}`,
  };
}

/** 구간표가 들어와 있는 항목인지 (없으면 화면에서 빗금을 유지한다) */
export const hasTable = (key) => Boolean(TABLE[key]);
