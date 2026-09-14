import REGIONS from '../../data/regions.json' with { type: 'json' };

/**
 * "인천광역시 연수구" · "인천 연수구 송도동 397-2" → "인천" (시도 축약형)
 *
 * KOSIS 시도 단위 통계표는 지역코드가 통계표 전용이라 시도별 표를 들고 있어야 한다.
 * 그 표의 키를 축약형으로 두는 이유: 원천마다 "인천" / "인천광역시" 가 섞여 나온다.
 */
export function sidoShort(region) {
  const t = String(region ?? '').trim();
  if (!t) return null;
  // 정식 명칭이 앞에 오는 경우 ("인천광역시 연수구")
  const full = REGIONS.sido.find(s => t.startsWith(s.name));
  if (full) return full.short;
  // 축약형이 앞에 오는 경우 ("인천 연수구")
  const abbr = REGIONS.sido.find(s => t.startsWith(s.short));
  return abbr ? abbr.short : null;
}

/** "인천 연수구 송도동 397-2" → { sido: '인천광역시', sgg: '연수구' } */
export function matchRegion(address) {
  const t = String(address ?? '').trim();
  if (!t) return null;
  const entry = REGIONS.sido.find(s => t.startsWith(s.name)) ?? REGIONS.sido.find(s => t.startsWith(s.short));
  if (!entry) return null;
  const rest = t.slice(t.startsWith(entry.name) ? entry.name.length : entry.short.length).trim();
  const sgg = entry.sgg.find(g => rest.startsWith(g)) ?? '';
  return { sido: entry.name, sgg };
}

/**
 * KOSIS 시도 단위 통계표가 쓰는 시도 키.
 *
 * 2026 전남·광주 통합으로 행정구역은 "전남광주통합특별시" 하나가 됐지만
 * KOSIS 두 통계표(주택보급률·소비심리지수)는 **아직 광주/전남을 따로 집계한다**
 * (objL1=ALL 실측 확인). 그래서 시군구로 어느 쪽인지 가른다.
 * 옛 광주광역시 5개 구는 확정된 사실이라 추측이 아니다.
 */
const OLD_GWANGJU = ['동구', '서구', '남구', '북구', '광산구'];

export function statSido(region) {
  const short = sidoShort(region);
  if (short !== '전남광주') return short;
  const m = matchRegion(region);
  if (!m?.sgg) return null;          // 시도만으로는 못 가린다 — 값을 내지 말고 실패시킨다
  return OLD_GWANGJU.includes(m.sgg) ? '광주' : '전남';
}
