/**
 * **비교단지의 사업부지 — 민간 / 공공 / 수용 / 환지**(사용자 요청 2026-10-03 「택지는 사업부지로 칼럼명을 바꾸고
 * 그 값은 민간/공공/환지/수용 으로 나눠서 · 공공/환지/수용이면 상세 내역 칼럼 · 해당사항 없으면 대시」).
 *
 * 재료는 둘이다.
 *   ① 청약홈 공고의 공공택지 표시(`landFlags` — 공공주택지구 · 대규모 택지개발지구 · 수도권 민영 공공주택지구)
 *   ② 그 단지 좌표의 사업지구(`/api/district` — 택지정보시스템 사업지구경계 · 필지 토지이용계획)
 *
 * 판정 순서
 *   공공  ① 표시가 있거나, ② 사업지구가 택지개발사업 · 공공주택지구(공공이 시행하는 공공택지)
 *   수용  ② 사업지구의 근거법이 수용 방식만 쓰는 사업(산업단지 · 혁신도시 · 기업도시 · 경제자유구역 …)
 *   수용·환지  ② 도시개발구역 — 도시개발법은 수용 · 환지 · 혼용이 다 되는데 **어느 방식인지 원천에 필드가 없다**
 *   민간  ① 표시도 없고 ② 사업지구도 없다
 *   미확인  ② 조회가 실패했다
 *
 * 「전부 N 이라고 민간택지가 아니다」(도시개발구역·산업단지는 청약홈 표시 칸이 없다) 는 함정을
 * ② 사업지구 조회가 메운다. 그래도 개발방식은 **지구 이름·근거법으로 추정한 값**이라 상세 칸에 근거를 같이 적는다.
 */
const PUBLIC_KINDS = ['택지개발사업', '공공주택지구'];

const zoneText = (z) => [
  z.name,
  z.law ? `(${z.law})` : null,
  z.operator ? `시행 ${z.operator}` : null,
  z.period ? `사업기간 ${z.period}` : null,
  z.status ?? null,
].filter(Boolean).join(' · ').replace(' · (', ' (');

/** /api/district 응답에서 판정에 쓰는 것만 남긴다 — 보관(localStorage)에 통째로 넣지 않는다 */
export function slimDistrict(d) {
  if (!d || d.error) return { error: d?.error ?? '응답 없음' };
  const pick = (c) => ({
    name: c.detail?.name ?? c.name, kind: c.kind, law: c.law, method: c.method,
    operator: c.operator, status: c.status, period: c.detail?.period ?? null,
  });
  return {
    zones: (d.candidates ?? []).map(pick),
    landUse: d.landUse ?? [],
    landUseKind: d.landUseKind ?? null,
  };
}

/**
 * @param {object} a  비교단지(청약홈 봉투)
 * @param {object|undefined} d  slimDistrict 결과 — 없으면 아직 조회 전
 * @returns {{ type: string|null, detail: string }}
 */
export function siteLandOf(a = {}, d) {
  const flags = a.landFlags ?? [];
  const z = d?.zones?.find(c => c.kind) ?? d?.zones?.[0] ?? null;
  const zt = z ? zoneText(z) : null;
  const lu = d?.landUseKind ?? null;
  const luText = d?.landUse?.length ? `토지이용계획 : ${d.landUse.join(' · ')}` : null;

  if (flags.length || (z && PUBLIC_KINDS.includes(z.kind)) || (!z && lu && PUBLIC_KINDS.includes(lu.kind))) {
    return { type: '공공', detail: [flags.length ? `청약홈 공고 : ${flags.join(' · ')}` : null, zt ?? luText].filter(Boolean).join(' / ') };
  }
  if (z || lu) {
    const method = z?.method ?? lu?.method;
    const text = zt ?? luText;
    if (method === '수용') return { type: '수용', detail: `${text} — 근거법상 수용 방식` };
    return { type: '수용·환지', detail: `${text} — 수용·환지 중 어느 방식인지 원천에 없어 확인 필요` };
  }
  if (d && !d.error) return { type: '민간', detail: '-' };
  if (d?.error) return { type: '미확인', detail: `사업지구 조회 실패 — ${d.error}` };
  return { type: null, detail: '' };
}
