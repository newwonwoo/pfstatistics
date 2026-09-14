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
