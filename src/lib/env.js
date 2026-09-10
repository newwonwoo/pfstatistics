import fs from 'node:fs';
import path from 'node:path';

/** .env 를 읽어 process.env 에 주입 (외부 의존성 없이) */
export function loadEnv(root = process.cwd()) {
  const f = path.join(root, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ISSUE_URL = {
  KOSIS_API_KEY: 'https://kosis.kr/openapi/',
  DATA_GO_KR_KEY: 'https://www.data.go.kr/',
  ECOS_API_KEY: 'https://ecos.bok.or.kr/api/',
  KAKAO_REST_KEY: 'https://developers.kakao.com/',
};

/** 키가 없으면 무엇을 어디서 발급받는지 알려주고 멈춘다 */
export function requireKey(name) {
  const v = process.env[name];
  if (!v) {
    const e = new Error(`${name} 미설정 — 발급: ${ISSUE_URL[name] ?? '?'}`);
    e.code = 'NO_KEY';
    e.keyName = name;
    throw e;
  }
  return v;
}

export const KEY_NAMES = Object.keys(ISSUE_URL);
export { ISSUE_URL };
