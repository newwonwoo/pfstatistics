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

/**
 * 그 시트의 반경시설을 **실제로 수집했는가.**
 *
 * `distOf` 가 null 을 주는 경우가 둘인데 뜻이 정반대다 —
 *   ① 수집했는데 반경 안에 없다  → 부재. 구간표의 base(1점)가 맞다.
 *   ② 아직 수집하지 않았다      → **아직 모른다.** 점수를 내면 안 된다.
 * 둘을 구분하지 않아 수집도 안 한 주거편의·교육환경에 `1점 · 매우열악` 이 붙고 있었다(실측).
 * 판단요소마다 따로 판정해 평균을 내는 구조라, 판정 안 한 항목이 섞이면 평균이 통째로 틀어진다.
 *
 * 판정은 page.js 의 `poiDone()` 과 같은 기준을 쓴다 — 그 시트로 수집된 항목이 하나라도 있는가.
 * (0건으로 수집된 항목도 봉투는 남으므로 "수집했는데 0건" 은 여기서 참이 된다)
 */
const sheetGathered = (facilities, sheetId) =>
  Object.values(facilities?.facilities ?? {}).some((v) => v?.sheet === sheetId);

const NOT_GATHERED = (sheetId) => ({
  pending: true, text: `${sheetId} 반경시설을 아직 수집하지 않았습니다 — [${sheetId} 수집] 을 누르세요`,
});

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
  if (!sheetGathered(facilities, sheetId)) return NOT_GATHERED(sheetId);
  /* **무엇이 몇 m 라서 이 구간인지** 같이 적는다 — 구간 이름만으로는 검산이 안 된다(사용자 지적) */
  const measured = measuredOf(facilities, t);
  for (const rule of t.rules) {
    if (matches(rule, facilities)) {
      return { score: rule.score, label: rule.label, text: [measured, rule.text].filter(Boolean).join(' → '), measured, rule };
    }
  }
  return { score: t.base.score, label: t.base.label,
           text: [measured, t.base.text].filter(Boolean).join(' → '), measured, rule: null };
}

/** 그 구간표가 보는 시설들의 실제 거리 — "초등학교 343m · 중학교 780m" */
function measuredOf(facilities, t) {
  const labels = [...new Set([
    ...(t.members ?? []),
    ...(t.rules ?? []).flatMap(r => Object.values(r.all ?? {}).flat()),
  ])];
  const parts = labels.map(l => {
    const d = distOf(facilities, l);
    return `${l} ${d == null ? '부재' : `${d}m`}`;
  });
  return parts.length ? parts.join(' · ') : null;
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
  if (!sheetGathered(facilities, t.sheet ?? sheetId)) return NOT_GATHERED(t.sheet ?? sheetId);
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
  if (t.sheet && !sheetGathered(facilities, t.sheet)) return NOT_GATHERED(t.sheet);
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
  /* **실제 순위를 같이 돌려준다** — 근거 칸에 "1위 ~ 10위" 만 적히면 몇 위인지 알 수 없다(사용자 지적) */
  for (const rule of t.rules) {
    if (n <= rule.lte) return { score: rule.score, label: rule.label, text: `${n}위 · ${rule.text}`, applied: n, rule };
  }
  return { score: t.base.score, label: t.base.label, text: `${n}위 · ${t.base.text}`, applied: n, rule: null };
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
  if (raw === '' || raw == null || !Number.isFinite(n)) {
    return { pending: true, text: '원천값이 없어 점수를 낼 수 없습니다' };
  }
  /* 화면에 그대로 찍히는 값이라 자릿수를 정해둔다 — 0.05219235971198797% 는 읽을 수 없다 */
  const raw2 = n + (t.spread ?? 0);
  const applied = t.digits == null ? raw2 : Number(raw2.toFixed(t.digits));

  /* `lt` 로 적힌 표(주택담보대출금리)와 `gte` 로 적힌 표(지역경쟁력·소비심리지수)를 둘 다 받는다 */
  for (const rule of t.rules) {
    const hit = rule.lt != null ? applied < rule.lt
      : rule.gte != null ? applied >= rule.gte
      : true;
    if (hit) {
      return {
        score: rule.score, label: rule.label ?? rule.text, grade: rule.grade,
        text: rule.text ?? rule.label, applied, unit: t.unit, max: t.max,
        formula: t.formula, rule,
      };
    }
  }
  if (!t.base) return { pending: true, text: '구간표 범위를 벗어났습니다' };
  return { score: t.base.score, label: t.base.label, text: t.base.text, applied, formula: t.formula, rule: null };
}

/**
 * 개수 구간표 (지역수요의 인구유입요인).
 * 신도시·혁신도시·기업도시·산업단지 등 **요인의 개수**로 매긴다.
 * 원문에 4점·2점 행은 없다 — 2개 이상 5점 · 1개 3점 · 없음 1점 세 단계뿐이다.
 */
export function scoreCount(key, count) {
  const t = TABLE[key];
  if (!t || t.scope !== 'count') return null;
  const n = Number(count);
  if (count === '' || count == null || !Number.isFinite(n) || n < 0) {
    return { pending: true, text: '인구유입 요인 개수를 넣으세요 (없으면 0)' };
  }
  for (const rule of t.rules) {
    if (rule.gte == null || n >= rule.gte) {
      return { score: rule.score, label: rule.label, applied: n, max: t.max, rule };
    }
  }
  return { pending: true, text: '구간표 범위를 벗어났습니다' };
}

/**
 * **지역수요(5)** — 주택보급률과 인구유입요인을 각각 5점 척도로 매겨 **평균**을 내고,
 * 그 평균으로 등급을 정한다(교통환경·주거편의와 같은 구조).
 * 평가표에 적히는 점수는 평균이 아니라 **그 등급의 대표점수**다.
 *
 * **보급률은 낮을수록 높은 점수다** — 집이 모자란 곳이 수요가 있다는 뜻이라 방향이 뒤집혀 있다.
 *
 * @param {number} supplyRatio  주택보급률(%) — 원천에서 수집한 값
 * @param {number} inflow       인구유입 요인 개수 — 실무자 입력(원천 없음)
 */
export function scoreRegionDemand(supplyRatio, inflow) {
  const t = TABLE['지역수요'];
  if (!t) return null;
  const a = scoreBand('지역수요:주택보급률', supplyRatio);
  const b = scoreCount('지역수요:인구유입요인', inflow);
  const parts = [
    { name: '주택보급률', basis: supplyRatio == null ? null : `${supplyRatio}%`, sc: a },
    { name: '인구유입요인', basis: b?.pending ? null : `${inflow}개`, sc: b },
  ];
  const bad = parts.filter(p => !p.sc || p.sc.pending || !Number.isFinite(p.sc.score));
  if (bad.length) {
    const reasons = [...new Set(bad.map(p => p.sc?.text).filter(Boolean))];
    return { pending: true, text: reasons.length === 1 ? reasons[0]
      : `${bad.map(p => p.name).join(' · ')} 미입력 — 평균은 두 항목이 다 있어야 냅니다` };
  }
  const avg = (a.score + b.score) / 2;
  const band = gradeOf(avg);
  return {
    avg: Number(avg.toFixed(2)),
    score: band?.score ?? null,
    label: band?.label ?? '',
    max: t.max,
    text: `주택보급률 ${supplyRatio}% → ${a.score}점 · 인구유입요인 ${inflow}개 → ${b.score}점`
        + `　⇒　(${a.score} + ${b.score}) / 2 = ${Number(avg.toFixed(2))} → ${band?.label ?? ''} → ${band?.score ?? '?'}점`,
    parts,
  };
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
/** 그 시설의 최근접 거리 문구 — "343m" · "부재" · null(수집 전) */
const distText = (facilities, label) => {
  const v = facilities?.facilities?.[label];
  if (!v) return null;
  return v.nearest ? `${v.nearest.distance}m` : '부재';
};

/** 묶음 판정의 실측 — "대형마트 480m · 의료시설 부재" */
function groupText(sheetId, groupLabel, facilities) {
  const key = Object.keys(TABLE).find(
    (k) => TABLE[k].scope === 'group' && TABLE[k].sheet === sheetId && TABLE[k].group === groupLabel);
  const members = key ? (TABLE[key].members ?? []) : [];
  const parts = members.map(l => `${l} ${distText(facilities, l) ?? '수집 전'}`);
  return parts.length ? parts.join(' · ') : null;
}

export function scoreAverage(sheetId, { facilities, manual } = {}) {
  let parts = null;
  /* **실측치를 같이 들고 간다** — "지하철역 5" 만 적으면 몇 m 라서 5점인지 검산이 안 된다(사용자 지적) */
  const road = manual?.['6차선 왕복도로'];
  if (sheetId === '교통환경') {
    parts = [
      { name: '지하철역', basis: distText(facilities, '지하철역'), sc: scorePoi('지하철역', facilities) },
      { name: '6차선 왕복도로',
        basis: road?.name
          ? `${road.name} ${road.distance ?? '?'}m · 왕복 ${road.lanes || '?'}차선`
          : '도로 미선택',
        sc: scoreFacility('6차선 왕복도로', road) },
    ];
  } else if (sheetId === '주거편의') {
    parts = [
      { name: '상업·의료시설', basis: groupText(sheetId, '상업시설 및 의료시설', facilities),
        sc: scoreGroup(sheetId, '상업시설 및 의료시설', facilities) },
      { name: '문화·공공시설 및 공원', basis: groupText(sheetId, '공원, 문화, 공공시설', facilities),
        sc: scoreGroup(sheetId, '공원, 문화, 공공시설', facilities) },
    ];
  }
  if (!parts) return null;

  const bad = parts.filter(p => !p.sc || p.sc.pending || !Number.isFinite(p.sc.score));
  if (bad.length) {
    /* 사유가 하나뿐이면 그 사유를 그대로 쓴다 — "판정 전" 만 적으면 어디로 가야 하는지 모른다 */
    const reasons = [...new Set(bad.map(p => p.sc?.text).filter(Boolean))];
    return {
      pending: true,
      text: reasons.length === 1
        ? reasons[0]
        : `${bad.map(p => p.name).join(' · ')} 판정 전 — 평균은 전 항목이 판정돼야 냅니다`,
    };
  }
  const avg = parts.reduce((t, p) => t + p.sc.score, 0) / parts.length;
  const band = gradeOf(avg);
  /* 수기 입력을 아직 안 한 항목은 점수가 나와도 "확정" 이 아니다 — 평균 옆에 적어 둔다 */
  const unset = parts.filter(p => p.sc.reason === '도로 미선택' || p.sc.reason === '차선 수 미입력');
  return {
    avg: Number(avg.toFixed(2)),      // 평균점수 — 평가표의 "평균점수" 칸
    score: band?.score ?? null,       // 평가점수 — **등급 대표점수**이지 평균이 아니다
    label: band?.label ?? '',
    /*
     * **산술평균을 (a + b) / 2 꼴로 적는다**(사용자 요청 2026-09-17).
     * 전에는 "지하철역 5 + 6차선 왕복도로 4 ÷ 2" 라 괄호가 없어
     * 무엇을 무엇으로 나눈 것인지 눈으로 안 잡혔다.
     * 평균은 등급을 내는 값이고, **평가표에 적히는 점수는 그 등급의 대표점수**다 — 둘 다 적는다.
     */
    text: `${parts.map(p => `${p.name} ${p.basis ? `${p.basis} → ` : ''}${p.sc.score}점`).join(' · ')}`
        + `　⇒　(${parts.map(p => p.sc.score).join(' + ')}) / ${parts.length} = ${Number(avg.toFixed(2))}`
        + ` → ${band?.label ?? ''} → ${band?.score ?? '?'}점`,
    caution: unset.length ? `${unset.map(p => p.name).join(' · ')} 미입력 상태의 기본점수가 섞여 있습니다` : null,
    parts,
  };
}

/**
 * 종합평가 점수 → **초기예상분양률(%)**.
 *
 * 이 앱이 채우는 모든 시트가 결국 이 한 숫자를 내기 위한 근거다
 * (가이드북 머리글이 「분양률 산정을 위한 평가기준」, 실제 평가표 파일명이 「초기분양률 산정근거」).
 *
 * 오피스텔·도시형생활주택은 같은 점수에서 한 칸씩 낮다.
 * 100세대 미만 사업장은 60% 를 넘을 수 없다 — 넘으면 깎고 **깎았다는 사실을 남긴다**.
 *
 * @param {number} total       종합평가 점수 = 제외항목점수(A) + 분양가경쟁력 점수
 * @param {string} series      '주택' | '오피스텔'
 * @param {number} households  총 세대수 (100세대 미만 상한 판정용, 없으면 미적용)
 */
export function expectedSaleRate(total, { series = '주택', households = null } = {}) {
  const t = TABLE['초기예상분양률'];
  if (!t) return null;
  if (!Number.isFinite(total)) {
    return { pending: true, text: '종합평가 점수가 있어야 분양률을 냅니다' };
  }
  const s = t.series[series] ?? t.series['주택'];
  const band = s.bands.find(b => b.gte == null || total >= b.gte);
  if (!band) return { pending: true, text: '급간표 범위를 벗어났습니다' };

  let rate = band.rate;
  let capped = null;
  const n = Number(households);
  if (Number.isFinite(n) && n > 0 && n < t.cap.householdsUnder && rate > t.cap.maxRate) {
    capped = { from: rate, to: t.cap.maxRate, text: t.cap.text };
    rate = t.cap.maxRate;
  }
  return { rate, raw: band.rate, band: band.label, series: s.label, capped, total };
}

/**
 * 초기예상분양률(%) → **심사평점표 「초기분양률」 배점**.
 * 100% 22 · 90~100 21 · 80~90 19 · 70~80 16 · 60~70 13 · 50~60 10 · 50미만 0.
 */
export function scorePresaleRate(rate) {
  const t = TABLE['초기분양률배점'];
  if (!t) return null;
  if (!Number.isFinite(rate)) return { pending: true, text: '초기예상분양률이 있어야 점수를 냅니다' };
  const rule = t.rules.find(r => r.gte == null || rate >= r.gte);
  return { score: rule.score, label: rule.label, max: t.max, rule };
}

/**
 * 최종 심사평점표.
 *
 * **이 앱이 만든 초기예상분양률이 여기서 점수가 되어 최종 평점으로 들어간다.**
 * 사업성(사업수익률·누적DSCR·자기자금 투입규모)은 수동입력이다 — 사업수지표에서 나오는
 * 값이라 이 앱이 수집하는 원천에 없다.
 *
 * 0점 처리 규칙을 **자동으로 적용**한다:
 *   초기분양률 50% 미만 **또는** 누적DSCR 1.00 미만 → 두 항목 평점을 모두 0점.
 * 이건 실무자가 잊기 쉬운 연동이라 화면이 대신 걸어준다(적용됐다는 사실은 반드시 남긴다).
 *
 * @param {object} manual  수동입력 점수 { 사업수익률: 20, ... } 및 dscr 실측값
 * @param {number} rate    초기예상분양률(%) — 자동 산출값
 */
/** 항목 하나의 원시값 → 점수. 구간표는 좋은 것부터 적혀 있다 */
function bandScore(item, raw) {
  if (item.select) {
    const opt = item.select.options.find(o => o.id === raw);
    return opt ? { score: opt.score, label: opt.id } : null;
  }
  const b = item.band;
  if (!b) return null;
  const v = raw === '' || raw == null ? NaN : Number(raw);
  if (!Number.isFinite(v)) return null;
  const hit = b.bands.find(x =>
    (x.gte != null && v >= x.gte)
    || (x.lte != null && v <= x.lte)
    || (x.lt != null && v < x.lt)
    || (x.gte == null && x.lte == null && x.lt == null));
  if (!hit) return { below: true, text: b.belowText ?? '구간표 범위를 벗어났습니다' };
  return { score: hit.score, label: hit.label };
}

/** 종합평점 → 심사등급 · 보증료율 */
export function reviewGrade(net) {
  const t = TABLE['심사평점표']?.grade;
  if (!t?.bands) return null;
  if (!Number.isFinite(net)) return { pending: true, text: '종합평점이 나와야 등급이 정해집니다' };
  const b = t.bands.find(x => x.gte == null || net >= x.gte);
  return { grade: b.grade, fee: b.fee, label: b.label, reject: b.fee == null };
}

export function reviewScore({ manual = {}, rate = null } = {}) {
  const t = TABLE['심사평점표'];
  if (!t) return null;

  const presale = scorePresaleRate(Number.isFinite(rate) ? rate : NaN);
  const z = t.zeroRule;
  /* 이제 누적DSCR 은 실측값 자체를 받으므로 0점 처리 판정도 같은 값으로 한다 */
  const dscr = Number(manual['누적DSCR분석값'] ?? manual.__dscr);
  const lowRate = Number.isFinite(rate) && rate < z.rateUnder;
  const lowDscr = Number.isFinite(dscr) && dscr < z.dscrUnder;
  const zeroed = lowRate || lowDscr;

  const groups = t.groups.map(g => {
    const items = g.items.map(it => {
      const forced = zeroed && z.zeroItems.includes(it.id);
      let score = null;
      let from = null;
      let band = null;
      if (it.auto && it.id === '초기분양률') {
        score = presale?.pending ? null : presale.score;
      } else if (it.band || it.select) {
        /* 2026-09-16 전체 구간표 수령 — 원시값만 받아 점수를 낸다 */
        const r = bandScore(it, manual[it.id]);
        if (r?.below) { score = null; band = r.text; }
        else if (r) { score = r.score; band = r.label; }
      } else {
        const v = manual[it.id];
        score = v === '' || v == null ? null : Number(v);
        if (!Number.isFinite(score)) score = null;
      }
      if (forced && score != null) { from = score; score = 0; }
      else if (forced) { score = 0; }
      const over = score != null && score > it.max;
      /*
        `band` 를 판정 라벨 문자열로 덮어쓰는 바람에 구간표의 **단위가 사라졌다.**
        화면은 그걸 못 찾아 전부 `점수` 를 placeholder 로 썼고, 원시값(1.05 · 4.51% · 17위)을
        받는 칸에 "점수" 라고 적혀 점수를 넣게 유도했다 — 단위는 따로 들고 나간다.
      */
      return { ...it, score, forced, from, over, value: manual[it.id] ?? '',
               unit: it.band?.unit ?? null,
               band: it.auto ? presale?.label : band };
    });
    const max = items.reduce((s, i) => s + i.max, 0);
    const got = items.filter(i => i.score != null).reduce((s, i) => s + i.score, 0);
    const missing = items.filter(i => i.score == null).map(i => i.id);
    return { label: g.label, max, got, missing, items };
  });

  const max = groups.reduce((s, g) => s + g.max, 0);
  const total = groups.reduce((s, g) => s + g.got, 0);
  const missing = groups.flatMap(g => g.missing);
  const deduct = Number(manual.__deduct);
  const net = missing.length ? null : total - (Number.isFinite(deduct) ? deduct : 0);

  return {
    groups, max, total, missing,
    deduct: Number.isFinite(deduct) ? deduct : null,
    net,
    gradeOf: reviewGrade(net ?? NaN),
    presale,
    zero: zeroed ? { lowRate, lowDscr, text: z.text, items: z.zeroItems } : null,
    grade: t.grade,
  };
}

/** 값이 구간에 드는지 — gte 이상, lt 미만 */
const inBand = (b, v) => (b.gte == null || v >= b.gte) && (b.lt == null || v < b.lt);

/**
 * 가중평균 구간표 (규모 및 배치).
 *   (총세대수 점수 × 0.5) + (용적률 × 0.25) + (건폐율 × 0.25)
 * 가중평균을 **등급:5점척도** 로 등급 지은 뒤 그 등급의 대표점수를 쓴다 —
 * 교통환경·주거편의와 같은 규칙이다(평균값 자체가 점수가 아니다).
 *
 * @param {object} values { 총세대수, 용적률, 건폐율 }
 */
export function scoreWeighted(key, values = {}) {
  const t = TABLE[key];
  if (!t || t.scope !== 'weighted') return null;

  const parts = t.parts.map(p => {
    const raw = values?.[p.id];
    const v = raw === '' || raw == null ? NaN : Number(raw);
    if (!Number.isFinite(v)) return { ...p, value: null, score: null, band: null };
    const b = p.bands.find(x => inBand(x, v));
    return { ...p, value: v, score: b?.score ?? null, band: b?.label ?? null };
  });

  const missing = parts.filter(p => p.score == null).map(p => p.id);
  if (missing.length) {
    return { pending: true, parts, missing, text: `${missing.join(' · ')} 입력 필요` };
  }
  const avg = parts.reduce((s, p) => s + p.score * p.weight, 0);
  const g = gradeOf(avg);
  return {
    parts, avg: Number(avg.toFixed(3)), score: g?.score ?? null, label: g?.label ?? '',
    max: t.max, formula: t.formula,
    text: parts.map(p => `${p.id} ${p.score}×${p.weight}`).join(' + '),
  };
}

/**
 * 평형구성 — 평형별 세대수에 가중치를 걸어 가중평균을 낸다.
 * **작을수록 좋다** (작은 평형이 많을수록 팔린다).
 * 원문 산식 끝의 ×100 은 급간과 맞지 않아 빼고 쓴다 — config `_note` 참조.
 */
/**
 * **오피스텔·도시형생활주택은 1세대를 0.5세대로 환산한다**(규모및배치 원문 주석).
 * 그래서 평형별 세대수의 단순 합이 총세대수를 넘어도 틀린 것이 아닐 수 있다 —
 * 아파트 1,000 + 오피스텔 200 이면 총세대수는 1,100 인데 평형 합은 1,200 이다.
 * 넘었는지 가르려면 **같은 환산 기준**으로 재야 한다.
 */
const HALF_UNIT = '오피스텔·도시형생활주택';
export const convertedUnits = (counts = {}) =>
  (TABLE['평형구성']?.weights ?? []).reduce((s, w) => {
    const n = Number(counts?.[w.id]);
    return s + (Number.isFinite(n) && n > 0 ? n * (w.id === HALF_UNIT ? 0.5 : 1) : 0);
  }, 0);

/**
 * @param {object} counts    평형별 세대수
 * @param {number} capacity  규모및배치의 총세대수 — 넘으면 **점수를 내지 않는다**
 */
export function scoreUnitMix(counts = {}, capacity = null) {
  const t = TABLE['평형구성'];
  if (!t) return null;
  const rows = t.weights.map(w => {
    const raw = counts?.[w.id];
    const n = raw === '' || raw == null ? 0 : Number(raw);
    return { ...w, n: Number.isFinite(n) && n > 0 ? n : 0 };
  });
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) return { pending: true, rows, total: 0, text: '평형별 세대수를 입력하세요' };

  /*
    **총세대수를 넘으면 점수를 내지 않는다**(사용자 요청 2026-09-25 — 「못 넘게 해야겠다」).
    조용히 깎지 않는 이유는 어느 칸이 잘못됐는지 사람만 알기 때문이다 —
    깎으면 가중평균이 그럴듯하게 나와 틀린 채로 분양률까지 흘러간다.
  */
  const cap = Number(capacity);
  const conv = convertedUnits(counts);
  if (Number.isFinite(cap) && cap > 0 && conv > cap) {
    const half = rows.find(r => r.id === HALF_UNIT)?.n ?? 0;
    return {
      pending: true, rows, total, capacity: cap, converted: conv, over: Number((conv - cap).toFixed(1)),
      text: `평형별 합 ${half ? `${conv.toLocaleString()}세대(환산)` : `${total.toLocaleString()}세대`}`
        + ` 가 규모 및 배치의 총세대수 ${cap.toLocaleString()}세대를 ${(conv - cap).toLocaleString()}세대 넘습니다`
        + (half ? ` — 오피스텔·도시형생활주택 ${half.toLocaleString()}세대는 0.5세대로 환산했습니다` : ''),
    };
  }

  const value = rows.reduce((s, r) => s + r.n * r.weight, 0) / total;
  const b = t.bands.find(x => inBand(x, value));
  return {
    rows, total, value: Number(value.toFixed(3)),
    capacity: Number.isFinite(cap) && cap > 0 ? cap : null, converted: conv,
    score: b?.score ?? null, label: b?.label ?? '', max: t.max, formula: t.formula,
    text: rows.filter(r => r.n).map(r => `${r.id} ${r.n}×${r.weight}`).join(' + ') + ` ÷ ${total}`,
  };
}

/**
 * 인근아파트 초기 분양률(10) — **입력 항목**이다.
 * 옆 단지의 실제 분양률을 조사해 매긴다. 본건의 산정 결과인 초기예상분양률과 다른 값이다.
 * @param {string} special 'firstInDistrict'(수용·환지 지구내 최초분양) | 'none'(적용아파트 미존재)
 */
export function scoreNearbyPresale(rate, special = null) {
  const t = TABLE['인근초기분양률'];
  if (!t) return null;
  if (special) {
    const sp = t.special.find(x => x.id === special);
    if (sp) return { score: sp.score, label: sp.label, max: t.max, special: sp, text: sp.text };
  }
  const v = rate === '' || rate == null ? NaN : Number(rate);
  if (!Number.isFinite(v)) return { pending: true, max: t.max, text: '인근 단지의 초기분양률(%)을 입력하세요' };
  const rule = t.rules.find(r => r.gte == null || v >= r.gte);
  return { score: rule.score, label: rule.label, max: t.max, rule, text: `조사값 ${v}%` };
}

/** 구간표 원본을 그대로 꺼낸다 (화면에 근거를 적을 때) */
export const tableOf = (key) => TABLE[key] ?? null;

/** 구간표가 들어와 있는 항목인지 (없으면 화면에서 빗금을 유지한다) */
export const hasTable = (key) => Boolean(TABLE[key]);

/**
 * **목록에서 지운 시설을 판정에서도 뺀다**(사용자 요청 2026-09-17).
 *
 * 도로는 × 로 지울 수 있는데 상업·의료·공원·공공·문화는 못 지웠다.
 * 반경 안에 수십 곳이 잡히면 표가 못 읽히고, 심사 대상이 아닌 것도 섞인다.
 *
 * **화면에서만 지우면 안 된다.** 판정은 `nearest.distance` 로 나는데
 * 지운 것이 최근접이면 점수가 그대로 남아 "지웠는데 점수가 안 바뀐다" 가 된다.
 * 그래서 목록·최근접·건수를 한자리에서 다시 계산해 **시트·지도·엑셀이 같은 것을 본다.**
 *
 * @param {object} facilities  `/api/facilities` 응답
 * @param {object} manual      시설 라벨별 { hidden: [시설명…] }
 */
export function applyHidden(facilities, manual) {
  if (!facilities?.facilities) return facilities;
  const out = {};
  let touched = false;
  for (const [label, v] of Object.entries(facilities.facilities)) {
    const hidden = manual?.[label]?.hidden ?? [];
    if (!hidden.length || !Array.isArray(v.items)) { out[label] = v; continue; }
    const items = v.items.filter(it => !hidden.includes(it.name));
    if (items.length === v.items.length) { out[label] = v; continue; }
    touched = true;
    out[label] = {
      ...v,
      items,
      count: items.length,
      nearest: items.length
        ? items.reduce((a, b) => (Number(b.distance) < Number(a.distance) ? b : a))
        : null,
      hiddenCount: v.items.length - items.length,
    };
  }
  return touched ? { ...facilities, facilities: out } : facilities;
}
