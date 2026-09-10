# 베르셀 배포

## 1. 프로젝트 연결

1. https://vercel.com/new
2. **Import Git Repository** → `newwonwoo/pfstatistics` 선택
3. Framework Preset: **Next.js** (자동 인식)
4. Branch: `claude/pf-guarantee-stats-webapp-dn63gy`
5. **Deploy**

## 2. 환경변수 등록 (필수)

Vercel > 프로젝트 > **Settings > Environment Variables** 에 아래를 넣는다.
Production / Preview / Development 모두 체크할 것.

| Name | 용도 | 발급 |
|---|---|---|
| `KOSIS_API_KEY` | 세대수·주택보급률·소비심리지수 | https://kosis.kr/openapi/ |
| `KAKAO_REST_KEY` | 반경 시설검색 | https://developers.kakao.com/console/app |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 지도 렌더 (**브라우저에서 쓰므로 `NEXT_PUBLIC_` 접두사 필수**) | 같은 콘솔 · JavaScript 키 |
| `ECOS_API_KEY` | (선택) CD금리 과거 시계열 백필 | https://ecos.bok.or.kr/api/ |

> 카카오 JS 키는 **플랫폼 > Web > 사이트 도메인**에 배포된 베르셀 도메인
> (`https://<프로젝트>.vercel.app`)을 등록해야 지도가 뜬다. 로컬 테스트용으로
> `http://localhost:3000` 도 같이 넣어두면 편하다.

키를 추가한 뒤에는 **Redeploy** 해야 반영된다.

## 3. 리전

`vercel.json` 에서 `icn1`(서울)로 고정했다.
원천이 전부 국내(통계누리·KB·금투협·KOSIS)라 미국 리전이면 왕복 지연이 크다.

## 4. 서버리스 제약과 대응

| 제약 | 대응 |
|---|---|
| **Playwright/Chromium 실행 불가** (용량·바이너리 제약) | 증빙 캡쳐를 브라우저에서 `html-to-image` 로 생성. 실무자가 화면에서 확인 후 저장하므로 오히려 낫다. `src/evidence/capture.js`(헤드리스)는 로컬 배치용으로만 유지 |
| **파일시스템 쓰기 불가** | 시공능력평가 순위표는 `data/constructor-rank.json` 을 **레포에 커밋**해서 배포한다. 갱신 시 로컬에서 `npm run ingest-rank` 후 커밋·푸시 (연 1회라 충분) |
| 함수 실행시간 기본 10초 | `vercel.json` 에서 60초로 상향 (원천 여러 곳을 순회) |

## 5. 로컬 실행

```bash
cp .env.example .env      # 키 입력
npm install
npm run dev               # http://localhost:3000
npm run doctor            # 키·도달성·지표 준비도 점검
```
