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
  /* within : 그 시설 하나의 최근접 거리로 판정 (지하철역) */
  if (rule.within != null) {
    const d = distOf(facilities, members?.[0]);
    return d != null && d <= rule.within;
  }
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
 * POI 단위 점수 (지하철역처럼 그 시설 하나의 거리로 판정하는 것).
 *
 * 2026-09-16 가이드북 원문으로 "존재" 구간을 받아 pending 을 풀었다.
 * 100m/300m/500m/1km = 5/4/3/2점, 1km 부재 = 1점 — 6차선 왕복도로와 같은 표다.
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

/**
 * 여러 항목 점수의 **평균값**을 등급으로 바꾼다.
 *
 * 가이드북은 교통환경·주거편의를 "항목별로 평가 후 평균값 적용" 이라고 적는다.
 * 그래서 상업·의료에 7점 행이 있어도 평균을 내면 5점 척도 안에 들어온다.
 */
export function gradeOf(avg) {
  const t = TABLE['등급:5점척도'];
  if (!t || !Number.isFinite(avg)) return null;
  for (const b of t.bands) {
    if ((b.gt == null || avg > b.gt) && (b.lte == null || avg <= b.lte)) return b;
  }
  return null;
}

/**
 * 순위 구간표 (브랜드경쟁력).
 * 규칙은 좋은 것부터 적혀 있고 `lte` 는 "그 순위 이내" 다.
 */
export function scoreRank(key, rank) {
  const t = TABLE[key];
  if (!t || t.scope !== 'rank') return null;
  const n = Number(rank);
  if (!Number.isFinite(n) || n <= 0) return { pending: true, text: '시공능력평가순위를 조회하지 못했습니다' };
  for (const rule of t.rules) {
    if (n <= rule.lte) return { score: rule.score, label: rule.label, text: rule.text, rule };
  }
  return { score: t.base.score, label: t.base.label, text: t.base.text, rule: null };
}

/**
 * 값 구간표 (주택담보대출금리).
 * `spread` 가 있으면 원천값에 더해 평가값을 만든다 — CD(91일) + 가산금리 1.57%.
 * @returns applied 는 실제로 구간에 대본 값(=평가값)이다. 화면에 그대로 보여준다.
 */
export function scoreBand(key, raw) {
  const t = TABLE[key];
  if (!t || t.scope !== 'band') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return { pending: true, text: '원천값이 없어 점수를 낼 수 없습니다' };
  const applied = n + (t.spread ?? 0);
  for (const rule of t.rules) {
    if (applied < rule.lt) {
      return { score: rule.score, label: rule.label, text: rule.text, applied, formula: t.formula, rule };
    }
  }
  return { score: t.base.score, label: t.base.label, text: t.base.text, applied, formula: t.formula, rule: null };
}

/**
 * 시트 평균점수 — 가이드북의 "항목별로 평가 후 **평균값** 적용".
 *
 *   교통환경 = (지하철역 + 6차선 왕복도로) / 2
 *   주거편의 = (상업·의료 + 문화·공공·공원) / 2
 *
 * **평가표에 적히는 평가점수는 평균값이 아니라 그 등급의 대표점수다.**
 * 골든 캡쳐 01: 1 + 4 → 평균 2.5 → 보통 → 평가점수 **3점** (2.5 가 아니다).
 * 골든 캡쳐 02: 1 + 2 → 평균 1.5 → 열악 → 평가점수 **2점**.
 * 평균을 그대로 점수 칸에 넣으면 총점 합산이 소수로 어긋난다.
 *
 * 한 항목이라도 판정이 안 되면 평균을 내지 않는다 — 빠진 항목을 0 으로 치면
 * "아직 모르는 점수" 가 "아주 나쁜 점수" 로 둔갑한다.
 */
export function scoreAverage(sheetId, { facilities, manual } = {}) {
  let parts = null;
  if (sheetId === '교통환경') {
    parts = [
      { name: '지하철역', sc: scorePoi('지하철역', facilities) },
      { name: '6차선 왕복도로', sc: scoreFacility('6차선 왕복도로', manual?.['6차선 왕복도로']) },
    ];
  } else if (sheetId === '주거편의') {
    parts = [
      { name: '상업·의료시설', sc: scoreGroup(sheetId, '상업시설 및 의료시설', facilities) },
      { name: '문화·공공시설 및 공원', sc: scoreGroup(sheetId, '공원, 문화, 공공시설', facilities) },
    ];
  }
  if (!parts) return null;

  const bad = parts.filter(p => !p.sc || p.sc.pending || !Number.isFinite(p.sc.score));
  if (bad.length) {
    return { pending: true, text: `${bad.map(p => p.name).join(' · ')} 판정 전 — 평균은 전 항목이 판정돼야 냅니다` };
  }
  const avg = parts.reduce((t, p) => t + p.sc.score, 0) / parts.length;
  const band = gradeOf(avg);
  /* 수기 입력을 아직 안 한 항목은 점수가 나와도 "확정" 이 아니다 — 평균 옆에 적어 둔다 */
  const unset = parts.filter(p => p.sc.reason === '도로 미선택' || p.sc.reason === '차선 수 미입력');
  return {
    avg: Number(avg.toFixed(2)),      // 평균점수 — 평가표의 "평균점수" 칸
    score: band?.score ?? null,       // 평가점수 — **등급 대표점수**이지 평균이 아니다
    label: band?.label ?? '',
    text: `${parts.map(p => `${p.name} ${p.sc.score}`).join(' + ')} ÷ ${parts.length}`,
    caution: unset.length ? `${unset.map(p => p.name).join(' · ')} 미입력 상태의 기본점수가 섞여 있습니다` : null,
    parts,
  };
}

/** 구간표 원본을 그대로 꺼낸다 (화면에 근거를 적을 때) */
export const tableOf = (key) => TABLE[key] ?? null;

/** 구간표가 들어와 있는 항목인지 (없으면 화면에서 빗금을 유지한다) */
export const hasTable = (key) => Boolean(TABLE[key]);
