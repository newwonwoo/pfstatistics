'use client';

/**
 * **엑셀의 메인 두 장 — 심사평점표 · 초기예상분양률(초기분양률 산정표).**
 *
 * 「엑셀 다운로드 받으니까 심사평점표랑 초기분양률 산정표는 메인으로 잡고 각잡고 그려야지.
 *  너무 있는 그대로 내리게 되었네」(사용자 지적 2026-10-01).
 * 전에는 두 표도 수집 시트와 같은 `writeTable`(머리줄 + 줄글 근거)로 내려 「원천 덤프」 처럼 읽혔다.
 * 이 두 장은 **심사 파일에 그대로 붙는 결론 문서**다 — 제목 · 사업장 정보 · 굵은 바깥선 ·
 * 병합한 구분 칸 · 강조한 결론 줄 · 인쇄 설정(A4 세로 · 한 장 너비)까지 갖춘다.
 *
 * 항목 순서는 원 평가표 시트 탭 순서를 따른다(골든 캡쳐 하단 탭 : 표지 · 종합 · 교통환경 · 주거편의 ·
 * 교육환경 · 규모 및 배치 · 평형구성 · 인근초기분양률 · 지역미분양 · 지역수요 …).
 * 원 「종합」·「표지」 시트는 캡쳐를 받지 못해 칸 배치까지 똑같지는 않다 — 원본 파일을 받으면 맞춘다.
 */
import { expectedRateOf } from '../src/lib/compare';
import { manualSummary } from '../src/lib/manual';
import { reviewScore, tableOf } from '../src/lib/scoring';
import { districtLabel } from './DistrictRow';

const FONT = '맑은 고딕';
const INK = 'FF1A1D21';
const MUTED = 'FF6B7280';
const HEAD = 'FFD9E1F2';     // 머리줄
const LABEL = 'FFF2F4F7';    // 정보 칸 이름
const SUM = 'FFFFF8D6';      // 결론 줄
const FINAL = 'FFFDECEA';    // 최종 결론
const thin = { style: 'thin', color: { argb: 'FF8C96A3' } };
const medium = { style: 'medium', color: { argb: 'FF1A1D21' } };

/** 원 평가표 탭 순서 — 이 순서로 줄을 세운다 */
const ORDER = ['교통환경', '주거편의', '교육환경', '규모 및 배치', '평형구성', '인근아파트 초기 분양률',
  '지역미분양', '지역수요', '지역경쟁력', '브랜드경쟁력', '주택담보대출금리', '부동산시장 소비심리지수'];

function cell(ws, r, c, value, { bold = false, size = 10, color = INK, fill = null, h = 'center', wrap = true, italic = false } = {}) {
  const x = ws.getCell(r, c);
  x.value = value == null ? '' : value;
  x.font = { name: FONT, size, bold, italic, color: { argb: color } };
  x.alignment = { horizontal: h, vertical: 'middle', wrapText: wrap };
  if (fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  return x;
}

function merge(ws, r1, c1, r2, c2, value, style) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  return cell(ws, r1, c1, value, style);
}

/** 표 영역 — 안쪽은 가는 선, 바깥은 굵은 선 */
function grid(ws, r1, c1, r2, c2) {
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      ws.getCell(r, c).border = {
        top: r === r1 ? medium : thin, bottom: r === r2 ? medium : thin,
        left: c === c1 ? medium : thin, right: c === c2 ? medium : thin,
      };
    }
  }
}

function title(ws, r, c1, c2, text, sub) {
  merge(ws, r, c1, r, c2, text, { bold: true, size: 16 });
  ws.getRow(r).height = 30;
  for (let c = c1; c <= c2; c += 1) ws.getCell(r, c).border = { bottom: { style: 'double', color: { argb: INK } } };
  if (sub) { merge(ws, r + 1, c1, r + 1, c2, sub, { size: 9, color: MUTED }); }
}

/**
 * 사업장 정보 — 이름 칸 / 값 칸 두 쌍씩.
 * `single` 이면 한 줄에 한 쌍(이름 c1~c1+1 · 값 c1+2~c1+5) — 첫 열이 좁은 시트(No. 열)용.
 * [초기예상분양률] 은 B 가 No.(폭 6)라 「사업\n장」 으로 꺾이고 「시공사」 가 평가내용(폭 44) 칸에 앉았다.
 */
function info(ws, r, c1, pairs, { single = false } = {}) {
  if (single) {
    pairs.forEach(([k, v], i) => {
      merge(ws, r + i, c1, r + i, c1 + 1, k, { bold: true, fill: LABEL });
      merge(ws, r + i, c1 + 2, r + i, c1 + 5, v, { h: 'left' });
      ws.getRow(r + i).height = 20;
    });
    grid(ws, r, c1, r + pairs.length - 1, c1 + 5);
    return r + pairs.length - 1;
  }
  for (let i = 0; i < pairs.length; i += 2) {
    const row = r + i / 2;
    const [[k1, v1], [k2, v2] = ['', '']] = [pairs[i], pairs[i + 1]];
    cell(ws, row, c1, k1, { bold: true, fill: LABEL });
    merge(ws, row, c1 + 1, row, c1 + 2, v1, { h: 'left' });
    cell(ws, row, c1 + 3, k2, { bold: true, fill: LABEL });
    merge(ws, row, c1 + 4, row, c1 + 5, v2, { h: 'left' });
    ws.getRow(row).height = 20;
  }
  const last = r + Math.ceil(pairs.length / 2) - 1;
  grid(ws, r, c1, last, c1 + 5);
  return last;
}

const page = (ws) => {
  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
};

/** 등급 칸에는 등급 낱말만 — 구간 글(「3.41 ~ 3.78 미만 · 열악」)은 평가내용 칸이 말한다 */
const gradeWord = (...texts) => texts.map(t => String(t ?? '').match(/매우양호|매우열악|양호|보통|열악/)?.[0]).find(Boolean) ?? '';

const won = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('ko-KR') : '');

/**
 * 두 장을 워크북 **맨 앞**에 만든다(먼저 addWorksheet 한 것이 앞 탭이다).
 */
export function writeMainSheets(wb, { data, facilities, manual, compare, rate, review, sheetInput, excl, manualSum }) {
  const ms = manualSum ?? manualSummary({ sheetInput: sheetInput ?? {}, data, facilities, manual });
  const { cmp, compScore, total, res } = expectedRateOf(compare, rate, excl, sheetInput, manual?.['사업지구']);
  const pct = res && !res.pending && total != null ? res.rate : null;
  const tainted = (ms.provisional?.length ?? 0) > 0;
  const rv = reviewScore({ manual: review ?? {}, rate: pct != null && !tainted ? pct : NaN });
  const site = facilities?.address ?? (compare?.addr ? `${data.region} ${compare.addr}` : data.region);
  const hh = sheetInput?.규모및배치?.총세대수;
  const series = rate?.series ?? '주택';
  const district = manual?.['사업지구'];
  const today = new Date().toLocaleDateString('ko-KR');
  const infoPairs = [
    ['사업장', site], ['시공사', data.company ?? ''],
    ['총 세대수', hh ? `${Number(hh).toLocaleString('ko-KR')} 세대` : '미입력'],
    ['주택 종류', series === '주택' ? '아파트 등 주택' : '오피스텔 · 도시형생활주택'],
    ['사업지구', districtLabel(district) ?? '미정'],
    ['통계 기준월 · 작성일', `${data.period} · ${today}`],
  ];

  /* ── 심사평점표 ───────────────────────────────────────── */
  {
    const t = tableOf('심사평점표');
    const ws = wb.addWorksheet('심사평점표', { views: [{ showGridLines: false }], properties: { tabColor: { argb: 'FF1D4ED8' } } });
    page(ws);
    [2, 18, 30, 8, 18, 9, 40].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    title(ws, 2, 2, 7, '심 사 평 점 표', 'PF 보증 심사 — 사업수지분석 · 시공자 사업수행능력');
    let r = info(ws, 5, 2, infoPairs) + 2;

    ['구분', '평가항목', '배점', '평가내용', '평점', '비고'].forEach((h, i) => cell(ws, r, 2 + i, h, { bold: true, fill: HEAD }));
    ws.getRow(r).height = 22;
    const top = r;
    r += 1;
    for (const g of rv.groups) {
      const g1 = r;
      for (const it of g.items) {
        cell(ws, r, 3, it.id, { h: 'left', bold: true });
        cell(ws, r, 4, it.max);
        const val = it.auto
          ? (pct != null && !tainted ? `${pct}%` : '')
          : (it.value == null || it.value === '' ? '' : `${it.value}${it.unit && !/위|등급/.test(String(it.value)) ? (it.unit === '%' ? '%' : ` ${it.unit}`) : ''}`);
        cell(ws, r, 5, val);
        cell(ws, r, 6, it.score ?? '', { bold: true, size: 11 });
        cell(ws, r, 7, [
          it.auto ? (pct != null && !tainted ? `초기예상분양률 ${pct}% ([초기예상분양률] 시트)` : tainted ? '판정 전 항목이 섞여 넘기지 않음' : '산정 대기') : '',
          it.forced ? '0점 처리' : '',
          !it.auto && typeof it.band === 'string' && it.band ? it.band : '',
        ].filter(Boolean).join(' · '), { h: 'left', size: 9 });
        ws.getRow(r).height = 20;
        r += 1;
      }
      merge(ws, g1, 2, r - 1, 2, `${g.label}\n(${g.max})`, { bold: true, fill: LABEL });
    }
    const sumTop = r;
    const foot = [
      ['합 계', rv.max, '', rv.total ?? '', rv.missing.length ? `미입력 : ${rv.missing.join(' · ')}` : '', SUM],
      ['감 점', '', rv.deduct != null ? '사고사망만인율' : '', rv.deduct != null ? -rv.deduct : '', t?.deduct?.known ?? '', null],
      ['종합평점', 100, '', rv.net ?? '', '합계 − 감점', SUM],
      ['심사등급', '', '', rv.gradeOf?.pending ? '' : (rv.gradeOf?.grade ?? ''), rv.gradeOf?.pending ? (rv.gradeOf?.text ?? '') : (rv.gradeOf?.label ?? ''), FINAL],
      ['보증료율', '', '', rv.gradeOf?.pending || rv.gradeOf?.reject ? '' : `${rv.gradeOf.fee}%`, rv.gradeOf?.reject ? '60점 미만 — 보증거절' : '심사등급에 따른 요율', FINAL],
    ];
    for (const [k, mx, v, sc, note, fill] of foot) {
      merge(ws, r, 2, r, 3, k, { bold: true, size: 11, fill });
      cell(ws, r, 4, mx, { bold: true, fill });
      cell(ws, r, 5, v, { fill, size: 9 });
      cell(ws, r, 6, sc, { bold: true, size: k === '보증료율' || k === '심사등급' ? 13 : 11, fill, color: fill === FINAL ? 'FFB3261E' : INK });
      cell(ws, r, 7, note, { h: 'left', size: 9, fill });
      ws.getRow(r).height = 22;
      r += 1;
    }
    grid(ws, top, 2, r - 1, 7);
    for (let c = 2; c <= 7; c += 1) ws.getCell(sumTop, c).border = { ...ws.getCell(sumTop, c).border, top: medium };
    r += 1;
    const notes = [
      rv.zero ? `※ 0점 처리 적용 — ${rv.zero.text}` : null,
      '※ 초기분양률(22)은 [초기예상분양률] 시트의 값을 배점으로 환산한 것이다.',
      '※ 사업수익률의 분양가는 Min(적정분양가, 예정분양가) — 적정분양가는 [비교사업장] 시트(심사지침 제16조)가 낸다.',
      '※ 공동시공 사업은 시공자별로 평점을 각각 내어 높은 쪽을 적용한다 — 이 표는 한 시공자 기준이다.',
    ].filter(Boolean);
    for (const n of notes) { merge(ws, r, 2, r, 7, n, { h: 'left', size: 9, color: n.includes('0점') ? 'FFB3261E' : MUTED }); r += 1; }
  }
  /*
    ── 초기예상분양률 (초기분양률 산정표) ─────────────────────
    **탭 이름은 「초기예상분양률」, 심사평점표 다음**(사용자 지적 2026-10-03 「종합 → 초기예상분양률 · 심사평점표가 먼저」).
    결론(심사평점표)을 먼저 펴고, 그 초기분양률(22)이 어디서 왔는지를 다음 장이 받친다.
  */
  {
    const ws = wb.addWorksheet('초기예상분양률', { views: [{ showGridLines: false }], properties: { tabColor: { argb: 'FFC00000' } } });
    page(ws);
    [2, 6, 26, 8, 44, 10, 9].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    title(ws, 2, 2, 7, '초기예상분양률 산정', '분양률 산정을 위한 평가기준 · 시트별 항목 점수 → 종합평가 점수 → 초기예상분양률');
    let r = info(ws, 5, 2, infoPairs, { single: true }) + 2;

    const head = ['No', '평가항목', '배점', '평가내용', '등급', '점수'];
    head.forEach((t, i) => cell(ws, r, 2 + i, t, { bold: true, fill: HEAD }));
    ws.getRow(r).height = 22;
    const top = r;
    r += 1;
    const byId = Object.fromEntries(ms.rows.map(x => [x.id, x]));
    const rows = [...ORDER.filter(id => byId[id]).map(id => byId[id]), ...ms.rows.filter(x => !ORDER.includes(x.id))];
    rows.forEach((x, i) => {
      cell(ws, r, 2, i + 1);
      cell(ws, r, 3, x.id, { h: 'left', bold: true });
      cell(ws, r, 4, x.max ?? '');
      cell(ws, r, 5, x.why ?? '', { h: 'left', size: 9 });
      cell(ws, r, 6, gradeWord(x.sc?.label, x.why));
      cell(ws, r, 7, x.score ?? '', { bold: true });
      ws.getRow(r).height = Math.min(48, 18 + Math.floor(String(x.why ?? '').length / 44) * 12);
      r += 1;
    });
    // 소계 · 분양가경쟁력 · 종합
    const sub = r;
    merge(ws, r, 2, r, 3, '분양가격지수 제외 항목 소계', { bold: true, fill: SUM });
    cell(ws, r, 4, rows.reduce((s, x) => s + (x.max ?? 0), 0), { bold: true, fill: SUM });
    cell(ws, r, 5, ms.override != null ? `내부망 평가표 값 직접 입력 (${ms.override})`
      : ms.missing.length ? `미입력 ${ms.missing.length}개 — ${ms.missing.join(' · ')}` : '전 항목 입력', { h: 'left', size: 9, fill: SUM });
    cell(ws, r, 6, '', { fill: SUM });
    cell(ws, r, 7, excl ?? '', { bold: true, fill: SUM });
    r += 1;
    cell(ws, r, 2, rows.length + 1);
    cell(ws, r, 3, '분양가경쟁력', { h: 'left', bold: true });
    cell(ws, r, 4, 15);
    cell(ws, r, 5, compScore != null
      ? `분양가격지수 ${cmp.index.toFixed(2)}${cmp.indexBasis === 'firstInDistrict' ? ' (사업지구 내 최초 분양 — 100 적용)' : ''}`
        + (cmp.avg != null ? ` · 비교사업장 평균 ${won(cmp.avg)}원/㎡` : '')
      : (cmp.sc?.text ?? '미산출'), { h: 'left', size: 9 });
    cell(ws, r, 6, gradeWord(cmp.sc?.label, ''));
    cell(ws, r, 7, compScore ?? '', { bold: true });
    r += 1;
    merge(ws, r, 2, r, 3, '종합평가 점수', { bold: true, size: 11, fill: SUM });
    cell(ws, r, 4, 100, { bold: true, fill: SUM });
    cell(ws, r, 5, total != null ? `${excl} + ${compScore} = ${total}` : '두 점수가 모두 있어야 냅니다', { h: 'left', fill: SUM });
    cell(ws, r, 6, '', { fill: SUM });
    cell(ws, r, 7, total ?? '', { bold: true, size: 12, fill: SUM });
    ws.getRow(r).height = 22;
    r += 1;
    merge(ws, r, 2, r, 3, '⇒ 초기예상분양률', { bold: true, size: 12, fill: FINAL, color: 'FFB3261E' });
    merge(ws, r, 4, r, 6, pct != null
      ? `${res.band} · ${res.series} 급간${res.capped ? ` · ${res.capped.from}% 에서 100세대 미만 60% 상한` : ''}`
        + (tainted ? ` · 판정 전 항목 섞임(${ms.provisional.map(p => p.id).join('·')}) — 심사평점표로 넘기지 않음` : '')
      : (res?.text ?? '산정 대기'), { h: 'left', fill: FINAL, size: 9 });
    cell(ws, r, 7, pct != null ? `${pct}%` : '', { bold: true, size: 14, fill: FINAL, color: 'FFB3261E' });
    ws.getRow(r).height = 28;
    grid(ws, top, 2, r, 7);
    // 결론 줄 위를 굵게 갈라 「여기부터 결론」 이 보이게
    for (let c = 2; c <= 7; c += 1) ws.getCell(sub, c).border = { ...ws.getCell(sub, c).border, top: medium };
    r += 2;

    // 급간표
    const bands = tableOf('초기예상분양률')?.series?.[series]?.bands ?? [];
    if (bands.length) {
      cell(ws, r, 2, '급간', { bold: true, fill: HEAD });
      cell(ws, r, 3, '종합평가 점수 → 분양률', { bold: true, fill: HEAD });
      const line = bands.map(b => `${b.label} → ${b.rate}%`).join('   ·   ');
      merge(ws, r, 4, r, 7, line, { h: 'left', size: 9 });
      grid(ws, r, 2, r, 7);
      ws.getRow(r).height = 34;
      r += 2;
    }
    const notes = [
      '※ 「인근아파트 초기 분양률(10)」 은 옆 단지를 조사해 매기는 입력 항목이고, 「초기예상분양률」 은 본건의 산정 결과다 — 서로 다른 값이다.',
      '※ 교통환경 · 주거편의는 항목 점수의 평균으로 등급을 내고, 평가표에는 그 등급의 대표점수를 적는다.',
      `※ 항목별 실측치와 증빙은 같은 파일의 시트별 탭에 있다. 이 초기예상분양률은 [심사평점표] 의 초기분양률(22) 배점${rv.presale && !rv.presale.pending ? ` ${rv.presale.score}점` : ''}이 된다.`,
    ];
    for (const t of notes) { merge(ws, r, 2, r, 7, t, { h: 'left', size: 9, color: MUTED }); r += 1; }
  }

}

const INPUT = 'FFFFFBE6';   // 넣은 값 칸
const INFLOW_TEXT = (v) => {
  const n = String(v ?? '').trim() === '' ? null : Number(v);
  if (n == null || !Number.isFinite(n)) return null;
  return n >= 2 ? { text: '2개 이상', score: 5 } : n === 1 ? { text: '1개', score: 3 } : { text: '없음', score: 1 };
};

/**
 * **수기입력 — 화면에서 손으로 넣는 칸만 폼으로**(사용자 지적 2026-10-03 「수기입력 탭은 완전 다른 내용이 나오고 있어.
 * 표는 빼고 위에 진짜 입력해야 하는 부분만 이쁘게」).
 * 전에는 분양가격지수 제외 항목 산출근거 표(자동 항목까지 12줄)를 내려 화면의 [수기입력] 탭과 딴판이었다 —
 * 그 표의 결론은 [초기예상분양률] 시트가 이미 말한다. 여기는 화면의 입력 ①·② 칸과 **같은 순서 · 같은 칸**이다.
 * 자동으로 정해지는 값(시공능력평가순위 등)은 넣는 칸이 아니라서 적지 않는다.
 */
export function writeManualSheet(wb, { data, facilities, manual, compare, review, sheetInput, manualSum }) {
  const si = sheetInput ?? {};
  const ms = manualSum ?? manualSummary({ sheetInput: si, data, facilities, manual });
  const rv = reviewScore({ manual: review ?? {}, rate: NaN });
  const companyRank = (data?.results ?? []).find(x => x.indicatorId === 'construction_capability_rank' && x.ok)?.value ?? null;
  const site = facilities?.address ?? (compare?.addr ? `${data.region} ${compare.addr}` : data.region);

  const ws = wb.addWorksheet('수기입력', { views: [{ showGridLines: false }], properties: { tabColor: { argb: 'FFB45309' } } });
  page(ws);
  [2, 16, 30, 16, 8, 26, 36].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 2, 2, 7, '수 기 입 력', '사업수지표 · 신용평가 · 사업계획승인서에서 옮겨 적은 값 — 점수는 [심사평점표] · [초기예상분양률] 시트가 씁니다');
  let r = info(ws, 5, 2, [
    ['사업장', site], ['시공사', data.company ?? ''],
    ['통계 기준월', data.period ?? ''], ['작성일', new Date().toLocaleDateString('ko-KR')],
  ]) + 2;

  /** 구획 머리 */
  const section = (text, note) => {
    merge(ws, r, 2, r, 4, text, { bold: true, size: 11.5, color: 'FFFFFFFF', fill: 'FF1F3A5F', h: 'left' });
    merge(ws, r, 5, r, 7, note ?? '', { size: 9, color: 'FFFFFFFF', fill: 'FF1F3A5F', h: 'right' });
    ws.getRow(r).height = 24;
    r += 1;
    ['구분', '항목', '입력값', '단위', '점수', '비고'].forEach((h, i) => cell(ws, r, 2 + i, h, { bold: true, fill: HEAD }));
    ws.getRow(r).height = 20;
    const head = r;
    r += 1;
    return head;
  };
  /** 넣는 칸 한 줄 — 비었으면 「미입력」 을 흐리게 */
  const field = (id, value, unit, score, note) => {
    const empty = value == null || String(value).trim() === '';
    cell(ws, r, 3, id, { h: 'left', bold: true });
    const num = Number(value);
    const c = cell(ws, r, 4, empty ? '미입력' : (Number.isFinite(num) && String(value).trim() !== '' ? num : value),
      { bold: !empty, italic: empty, color: empty ? MUTED : INK, fill: INPUT, h: 'right' });
    if (!empty && Number.isFinite(num)) c.numFmt = Number.isInteger(num) ? '#,##0' : '#,##0.00';
    cell(ws, r, 5, unit ?? '', { size: 9, color: MUTED });
    cell(ws, r, 6, score ?? '', { bold: true, color: 'FF15803D' });
    cell(ws, r, 7, note ?? '', { h: 'left', size: 9, color: MUTED });
    ws.getRow(r).height = 20;
    r += 1;
  };
  /** 결과 한 줄 — 넣은 값들로 난 점수 */
  const result = (text, score) => {
    merge(ws, r, 3, r, 5, text, { h: 'left', size: 9.5, fill: SUM });
    cell(ws, r, 6, score ?? '', { bold: true, size: 11, fill: SUM });
    cell(ws, r, 7, '', { fill: SUM });
    ws.getRow(r).height = 20;
    r += 1;
  };

  /* ── 입력 ① 심사평점표에 들어가는 값 ── */
  let top = section('입력 ①  심사평점표에 들어가는 값', '사업수지표 · 신용평가에서 옮겨 적는 원시값');
  for (const g of rv.groups) {
    const items = g.items.filter(it => !it.auto && !(it.id === '시공능력평가액순위' && companyRank != null));
    if (!items.length) continue;
    const g1 = r;
    for (const it of items) {
      field(it.id, it.value, it.unit ?? '', it.score != null ? `${typeof it.band === 'string' && it.band ? `${it.band} → ` : ''}${it.score}점` : '',
        `배점 ${it.max}`);
    }
    merge(ws, g1, 2, r - 1, 2, g.label, { bold: true, fill: LABEL });
  }
  {
    const g1 = r;
    const d = Number((review ?? {}).__deduct);
    const has = String((review ?? {}).__deduct ?? '').trim() !== '' && Number.isFinite(d);
    field('사고사망만인율 감점', has ? d : '', '점', has ? `−${d}점` : '', '0.5배 초과 ~ 1.0배 이하면 1점');
    merge(ws, g1, 2, r - 1, 2, '감점', { bold: true, fill: LABEL });
  }
  grid(ws, top - 1, 2, r - 1, 7);
  const notes1 = [
    companyRank != null ? `※ 시공능력평가순위는 맨 위에서 고른 시공사${data.company ? `(${data.company})` : ''}의 공시 순위 ${companyRank}위가 그대로 들어가 넣는 칸이 없습니다.` : null,
    '※ 초기분양률(22)은 이 앱이 산정한 초기예상분양률에서 나므로 넣는 칸이 없습니다.',
    rv.zero ? `※ 0점 처리 대상 — ${rv.zero.text}` : null,
  ].filter(Boolean);
  for (const n of notes1) { merge(ws, r, 2, r, 7, n, { h: 'left', size: 9, color: n.includes('0점') ? 'FFB3261E' : MUTED }); r += 1; }
  r += 1;

  /* ── 입력 ② 분양가격지수 제외 항목에 들어가는 값 ── */
  top = section('입력 ②  분양가격지수 제외 항목에 들어가는 값', '사업계획승인서 · 직접 조사한 값');
  const scaleSc = ms.formed?.[0]?.sc;
  const mixSc = ms.formed?.[1]?.sc;
  {
    const g1 = r;
    for (const p of scaleSc?.parts ?? []) {
      field(p.id, si.규모및배치?.[p.id], p.unit, p.score != null ? `${p.band} → ${p.score}점 ×${p.weight}` : '', '');
    }
    result(scaleSc?.pending ? (scaleSc.missing?.length === scaleSc.parts?.length ? '세 값을 넣으면 점수가 납니다' : scaleSc.text)
      : `가중평균 ${scaleSc?.avg} → ${scaleSc?.label}`, scaleSc?.pending ? '' : `${scaleSc?.score}점`);
    merge(ws, g1, 2, r - 1, 2, '규모 및 배치\n(배점 5)', { bold: true, fill: LABEL });
  }
  {
    const g1 = r;
    for (const w of tableOf('평형구성')?.weights ?? []) {
      field(w.id, si.평형구성?.[w.id], '세대', '', `가중치 ${w.weight}`);
    }
    result(mixSc?.pending ? mixSc.text : `총 ${mixSc?.total}세대 · 가중평균 ${mixSc?.value} → ${mixSc?.label}`, mixSc?.pending ? '' : `${mixSc?.score}점`);
    merge(ws, g1, 2, r - 1, 2, '평형구성\n(배점 5)', { bold: true, fill: LABEL });
  }
  {
    const g1 = r;
    const inf = INFLOW_TEXT(si.지역수요?.inflow);
    field('인구유입요인 개수', inf?.text ?? '', '', inf ? `${inf.score}점` : '', '신도시 · 혁신도시 · 기업도시 · 산업단지 등 — 주택보급률 점수와 평균해 지역수요 등급');
    merge(ws, g1, 2, r - 1, 2, '지역수요', { bold: true, fill: LABEL });
  }
  if (String(si.exclOverride ?? '').trim() !== '') {
    const g1 = r;
    field('분양가격지수 제외 항목 합계', si.exclOverride, '점', '', '내부망 평가표 값을 그대로 씀 — 자동 합계 대신 적용');
    merge(ws, g1, 2, r - 1, 2, '합계 직접 입력', { bold: true, fill: LABEL });
  }
  grid(ws, top - 1, 2, r - 1, 7);
  r += 1;
  const notes2 = [
    '※ 오피스텔 · 도시형생활주택은 1세대를 0.5세대로 환산합니다 · 용적률 · 건폐율은 사업계획승인서 또는 건축허가서 기준입니다.',
    '※ 평형별 세대수 합(환산)은 총세대수를 넘을 수 없습니다 — 넘으면 평형구성 점수를 내지 않습니다.',
    '※ 인근아파트 초기 분양률은 [초기예상분양률] 시트에서 조사합니다.',
  ];
  for (const n of notes2) { merge(ws, r, 2, r, 7, n, { h: 'left', size: 9, color: MUTED }); r += 1; }
}
