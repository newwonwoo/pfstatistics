/**
 * 화면이 쓰는 JSON 읽기 — **한 곳에서** 한다.
 *
 * `await res.json()` 을 그대로 쓰면 본문이 JSON 이 아닐 때
 * `Unexpected token 'u', "upstream r"... is not valid JSON` 이 **그대로 화면에 뜬다**
 * (실측 2026-09-24 — 비교사업장 수집 중 게이트웨이가 502 HTML/텍스트를 돌려준 경우).
 * 실무자에게 저 문장은 아무 뜻도 없고, 무엇을 해야 하는지도 말하지 않는다.
 *
 * 원천이 준 사유가 있으면 그것을 쓰고, 없으면 **사람이 읽을 수 있는 말**로 바꾼다.
 */
export async function fetchJson(url, init, onError = null) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('네트워크가 끊겼습니다 — 잠시 뒤 다시 시도하세요');
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아니다 */ }

  if (json == null) {
    /* 본문이 JSON 이 아니다 — 대개 프록시·게이트웨이가 끼어든 것이다 */
    throw new Error(res.ok
      ? '원천 응답을 읽지 못했습니다 — 잠시 뒤 다시 시도하세요'
      : `원천에 닿지 못했습니다 (${res.status}) — 잠시 뒤 다시 시도하세요`);
  }
  if (!res.ok) throw new Error(onError?.(res, json) ?? json.error ?? `요청이 실패했습니다 (${res.status})`);
  return json;
}
