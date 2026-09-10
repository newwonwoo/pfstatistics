/** 재시도 + 타임아웃이 붙은 fetch. 공공 API는 간헐적으로 죽는다. */
export async function getJson(url, { headers = {}, timeout = 20000, retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      const res = await fetch(url, { headers, signal: ctl.signal });
      clearTimeout(t);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      try { return JSON.parse(text); }
      catch { throw new Error(`JSON 파싱 실패: ${text.slice(0, 200)}`); }
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * 2 ** i));
    }
  }
  throw lastErr;
}

/** 수집 결과 표준 봉투. 값만이 아니라 출처·조회조건·갱신일을 항상 같이 들고 다닌다. */
export function envelope({ indicatorId, name, region, period, value, unit, source, raw }) {
  return {
    indicatorId, name, region, period, value, unit,
    source: {
      org: source.org,
      citation: source.citation,      // 엑셀에 그대로 들어갈 "* 출처 :" 문구
      url: source.url ?? null,
      queryParams: source.queryParams ?? null,  // 재현용 조회조건
      dataUpdatedAt: source.dataUpdatedAt ?? null, // 원천 자료갱신일
    },
    collectedAt: new Date().toISOString(),
    raw,
  };
}
