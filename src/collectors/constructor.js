import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { envelope } from '../lib/http.js';

/**
 * 시공능력평가순위.
 *
 * 대한건설협회 공시는 연 1회(8월)뿐이라 실시간 API 가 의미없다.
 * **공시 원본 엑셀을 그대로 적재한다** — tools/build-constructor-rank.mjs 가
 * 협회 공시자료 게시판에서 받아 토건(토목건축공사업) 시트를 뽑는다.
 * (2024~2026, 연도별 2,800여 건)
 *
 * ingest() 는 손으로 받은 엑셀을 올릴 때를 위해 남겨둔다.
 * 헤더명만 맞으면 열 순서가 달라도 읽는다.
 */
const STORE = 'data/constructor-rank.json';

/** 헤더 별칭 — 실무 엑셀은 표기가 제각각이라 넉넉히 받는다 */
const ALIAS = {
  상호:   ['상호', '상호명', '업체명', '회사명', '건설사'],
  순위:   ['순위', '시공능력평가순위', '평가순위', '순위(위)'],
  지역:   ['지역', '소재지', '시도'],
  업종:   ['업종', '업종명'],
  업종코드: ['업종코드'],
  등록번호: ['등록번호'],
  법인등록번호: ['법인등록번호', '법인번호'],
  사업자등록번호: ['사업자등록번호', '사업자번호'],
  평가액: ['시공능력평가액', '평가액', '토목건축공사업'],
};

const normalize = s => String(s ?? '').replace(/\s|\(주\)|\(유\)|주식회사/g, '').trim();

function pick(row, field) {
  for (const a of ALIAS[field] ?? [field]) {
    for (const k of Object.keys(row)) {
      if (String(k).replace(/\s/g, '') === a.replace(/\s/g, '')) return row[k];
    }
  }
  return null;
}

/**
 * 엑셀/CSV → 정규화 JSON 적재.
 * @param {string} filePath  업로드된 .xlsx / .xls / .csv
 * @param {string} year      평가연도 (예: '2025')
 */
export function ingest(filePath, year) {
  // SheetJS 는 CJS 라 ESM 에서 readFile 이 안 잡힌다. 버퍼로 직접 넘긴다.
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (!raw.length) throw new Error(`빈 시트: ${filePath}`);

  const rows = raw.map(r => ({
    상호: pick(r, '상호'),
    순위: Number(String(pick(r, '순위') ?? '').replace(/[^0-9]/g, '')) || null,
    지역: pick(r, '지역'),
    업종: pick(r, '업종'),
    업종코드: pick(r, '업종코드'),
    등록번호: pick(r, '등록번호'),
    법인등록번호: pick(r, '법인등록번호'),
    사업자등록번호: pick(r, '사업자등록번호'),
    평가액: pick(r, '평가액'),
  })).filter(r => r.상호 && r.순위);

  if (!rows.length) {
    throw new Error(`상호/순위 컬럼을 찾지 못했습니다. 실제 헤더: ${Object.keys(raw[0]).join(', ')}`);
  }

  const store = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : {};
  store[year] = {
    year,
    sourceFile: path.basename(filePath),
    ingestedAt: new Date().toISOString(),
    count: rows.length,
    rows,
  };
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  return { year, count: rows.length, sample: rows.slice(0, 3), skipped: raw.length - rows.length };
}

/*
 * 명부가 1.7MB 라 호출마다 다시 읽으면 비교사업장 한 번에 수십 MB 를 파싱한다.
 * 파일이 바뀌지 않는 한 한 번만 읽는다(연 1회 공시라 런타임 중 바뀌지 않는다).
 */
let storeCache = null;
function readStore() {
  if (!fs.existsSync(STORE)) throw new Error('적재된 순위표 없음 — tools/build-constructor-rank.mjs');
  if (!storeCache) storeCache = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  return storeCache;
}

export function lookup(company, year) {
  const store = readStore();
  // 연도를 안 주면 적재된 공시 중 최신을 쓴다 (화면에서 평가연도를 받지 않는다)
  const y = (year && store[year]) ? year : Object.keys(store).sort().at(-1);
  const set = store[y];
  if (!set) throw new Error(`${y}년 순위표 미적재. 적재된 연도: ${Object.keys(store).join(', ')}`);
  const target = normalize(company);
  // 정확일치 → 부분일치 순으로 찾는다 ((주) 표기 차이 흡수)
  return {
    year: y, sourceFile: set.sourceFile, sourceUrl: set.sourceUrl ?? null,
    hit: set.rows.find(r => normalize(r.상호) === target)
      ?? set.rows.find(r => normalize(r.상호).includes(target) || target.includes(normalize(r.상호)))
      ?? null,
  };
}

export async function collect(indicator, { region: company, period }) {
  const { year, sourceFile, sourceUrl, hit } = lookup(company, period);
  if (!hit) throw new Error(`"${company}" 순위표(${year})에 없음`);
  return envelope({
    indicatorId: indicator.id, name: indicator.name,
    region: hit.상호, period: year, value: hit.순위, unit: indicator.unit,
    source: {
      org: '대한건설협회 협회공시',
      citation: `${year}년도 종합건설사업자 시공능력평가액 공시 · 토목건축공사업 ${hit.순위}위`,
      url: sourceUrl ?? null,
      queryParams: { 업종: hit.업종, 지역: hit.지역, 등록번호: hit.등록번호 },
      dataUpdatedAt: year,
      viewUrl: indicator.source.viewUrl ?? null,
      uploadedFile: sourceFile,
    },
    raw: hit,
  });
}
