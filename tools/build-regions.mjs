/**
 * 시도·시군구 기준표 생성 — data/regions.json
 *
 * 왜 별도 API 를 안 쓰나:
 *  - 공공데이터포털 법정동코드 API 는 키 발급·활용신청이 또 필요하다(사용자 부담).
 *  - 이미 쓰고 있는 통계누리 미분양(formId 2082)이 전국 시군구를 **전부** 준다
 *    (실측 229개 / 17개 시도 · 울릉군·옹진군·군위군 포함).
 *  - 무엇보다 **미분양 수집기와 표기가 같아진다** — 화면에서 고른 시군구가
 *    그대로 수집 조회조건이 되므로 표기차로 0건이 나는 일이 없다.
 *
 * 행정구역 개편은 몇 년에 한 번이라 커밋해두고 필요할 때 다시 돌린다.
 * (사용자는 터미널을 쓰지 않는다 — 이 스크립트는 유지보수용이다)
 */
import { writeFileSync } from 'node:fs';

const URL_ = (ym) =>
  `https://stat.molit.go.kr/portal/stat/data.do?formId=2082&styleNum=128&apprYn=Y&startDate=${ym}&endDate=${ym}`;

/** 통계누리는 시도를 축약형으로 준다. 정식 명칭은 고정 17개라 표로 둔다. */
const SIDO = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
  광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도',
  제주: '제주특별자치도',
};

const ym = process.argv[2] ?? '202506';
const j = await (await fetch(URL_(ym))).json();
const rows = j.data ?? [];
if (!rows.length) throw new Error('통계누리 응답이 비었습니다');

const order = [];
const byShort = new Map();
for (const r of rows) {
  const short = r['1'], sgg = r['2'];
  if (!short || !sgg || sgg === '계') continue;
  if (!byShort.has(short)) { byShort.set(short, new Set()); order.push(short); }
  byShort.get(short).add(sgg);
}

const sido = order.map((short) => {
  const name = SIDO[short];
  if (!name) throw new Error(`정식 시도명을 모르는 축약형: ${short}`);
  // 세종은 하위 시군구가 없다 (통계누리는 "세종시" 한 줄로 준다)
  const list = short === '세종' ? [] : [...byShort.get(short)];
  return { short, name, sgg: list };
});

const total = sido.reduce((s, x) => s + x.sgg.length, 0);
writeFileSync(
  new URL('../data/regions.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10),
                   source: `stat.molit.go.kr formId=2082 (${ym})`, count: total, sido }, null, 2) + '\n',
);
console.log(`시도 ${sido.length} · 시군구 ${total}`);
