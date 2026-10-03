/**
 * **비교단지의 사업부지 — 정보만 보여 주고 고르는 것은 실무자다**(사용자 지적 2026-10-03
 * 「그걸 왜 자동화를 하려고 해 정보만 표출해주고 유저가 선택하게 하는거잖아」).
 *
 * 처음엔 청약홈 표시 + 사업지구 이름으로 민간/공공/수용/환지를 **판정**했다 — 그런데 개발방식(수용/환지)은
 * 어느 원천에도 필드가 없고, 공공택지도 필지 단위로는 원천만으로 못 가른다(주택법 제2조 제24호).
 * 그래서 **원천이 말하는 사실만 한 줄로** 만들고(이 파일), 고르기는 화면 칩(민간 · 공공 · 환지 · 수용)이 받는다.
 *
 * 재료
 *   ① 청약홈 공고의 공공택지 표시(`landFlags` — 공공주택지구 · 대규모 택지개발지구 · 수도권 민영 공공주택지구)
 *   ② 그 단지 좌표의 사업지구(`/api/district` — 택지정보시스템 사업지구경계 · 필지 토지이용계획)
 */
export const LAND_CHOICES = ['민간', '공공', '환지', '수용'];

/** /api/district 응답에서 보여 줄 것만 남긴다 — 보관(localStorage)에 통째로 넣지 않는다 */
export function slimDistrict(d) {
  if (!d || d.error) return { error: d?.error ?? '응답 없음' };
  const pick = (c) => ({
    name: c.detail?.name ?? c.name, law: c.law, operator: c.operator,
    status: c.status, period: c.detail?.period ?? null,
  });
  return { zones: (d.candidates ?? []).map(pick), landUse: d.landUse ?? [] };
}

const zoneText = (z) => [
  `${z.name}${z.law ? ` (${z.law})` : ''}`,
  z.operator ? `시행 ${z.operator}` : null,
  z.period ? `사업기간 ${z.period}` : null,
  z.status ?? null,
].filter(Boolean).join(' · ');

/**
 * 원천이 말하는 사실 한 줄 — **판정하지 않는다.**
 * @param {object} a  비교단지(청약홈 봉투)
 * @param {object} d  slimDistrict 결과
 */
export function landInfoOf(a = {}, d) {
  const parts = [];
  if (a.landFlags?.length) parts.push(`청약홈 공고 : ${a.landFlags.join(' · ')}`);
  if (d?.error) parts.push(`사업지구 조회 실패 — ${d.error}`);
  for (const z of d?.zones ?? []) parts.push(`사업지구 : ${zoneText(z)}`);
  if (d?.landUse?.length) parts.push(`토지이용계획 : ${d.landUse.join(' · ')}`);
  return parts.length ? parts.join(' / ') : '청약홈 공공택지 표시 · 사업지구 · 토지이용계획 모두 없음';
}
