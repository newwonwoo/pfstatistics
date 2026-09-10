# PF 보증심사 통계 자동수집 — 유지보수 노트

> 새 세션에서 이 파일을 먼저 읽을 것. 삽질을 반복하지 않기 위한 기록이다.

## 무엇을 만드는가

사업장 시군구를 넣으면 PF 보증심사에 필요한 **통계 수치와 증빙(캡쳐)** 을 원천에서 자동 수집한다.
실무자는 결과를 엑셀 평가표에 붙여넣는다. **심사 자체는 내부망에서 한다** — 이 앱은 자료수집 보조 도구다.

- 배포: https://pfstatistics.vercel.app/ (Vercel, 서울 리전 icn1)
- 브랜치: **`main` 에 직접 커밋·푸시** (사용자 승인 완료). 푸시하면 자동 배포된다.
- **사용자는 터미널을 쓰지 않는다.** 모든 조작은 웹앱이나 각 서비스 콘솔에서 되어야 한다.
  `npm run ...` 을 시키지 말 것.

## 골든 데이터셋 (가장 중요한 자산)

`docs/evidence-samples/` 의 캡쳐 11장은 참고자료가 아니라 **정답지**다.
표본: **경기도 광주시 탄벌동 203-4 외 57필지 / 시공사 제일건설(주)**

| 지표 | 시점 | 정답 |
|---|---|---|
| 미분양주택수 | 202607 | 93 호 |
| 주민등록세대수 | 202607 | 178,187 세대 |
| 주택보급률(경기) | 2024 | 99.4 % |
| 소비심리지수(경기도) | 202607 | 125.1 |
| CD(91일) | 최신 | 3.12 % |
| KB 매매지수 증감률 | 202608 | 0.341 % |
| 시공능력평가순위 | 2025 | 17 위 |

수집기를 고치면 반드시 이 값들이 재현되는지 확인한다. `/api/collect` 응답의 `golden.match` 로 자동 대조된다.

## 확정된 원천 파라미터 (다시 찾지 말 것)

### 키 불필요 — 내부 엔드포인트 역산
```
미분양주택수   GET stat.molit.go.kr/portal/stat/data.do
               ?formId=2082&styleNum=128&apprYn=Y&startDate=YYYYMM&endDate=YYYYMM
               formId 2082=시·군·구별 미분양현황 / 2080=규모별 / 5328=공사완료후 / 2086=종합
               응답 {"0":기준월,"1":시도,"2":시군구,"3":호수}  시도는 축약형("경기")

KB 매매지수    GET data-api.kbland.kr/bfmstat/weekMnthlyHuseTrnd/priceIndex
               ?매매전세코드=01&월간주간구분코드=01&메뉴코드=1&지역코드={시도코드}
               지역코드 없으면 시도 단위, 있으면 그 시도의 시군구 목록
               ※ 증감률 전용 엔드포인트 prcIndxFlxblRt 는 서버측 SQL 버그로 못 씀
                 → 지수 원본을 받아 (당월/전월-1)*100 로 직접 계산 (캡쳐와 소수3자리까지 일치)

CD(91일)       POST kofiabond.or.kr/proframeWeb/XMLSERVICES/  (Content-Type: application/xml)
               ProFrame XML: BIS-KOFIABOND / BISCDPSrchSO / selectCdpMain
               응답 val1=고시일 val2=오전 val3=오후
               ※ 기준일자 파라미터를 무시하고 최신 영업일만 준다 (과거 소급 미지원)
               화면경로는 메뉴서비스(BIS-COM/BISComMenuSO/selectMenuBIS, workGb=KOR)로 찾았다
```

### KOSIS (KOSIS_API_KEY 필요)
**itmId 와 objL1 을 둘 다 넘기지 않으면 통계표 ID 가 맞아도 `err 20` 이 난다.** 이것 때문에 오래 막혔다.
```
주민등록세대수  orgId=101 tblId=DT_1B040B3 itmId=T1        objL1=법정동코드앞5자리(광주시 41610) prdSe=M
주택보급률      orgId=116 tblId=DT_MLTM_2100
                itmId=13103871096T6 (보급률, 다가구 구분거처 반영)
                objL1=13102871096A.0011 (경기)  ← 일반 행정코드가 아니라 통계표 전용코드
소비심리지수    orgId=390 tblId=DT_39002_04 itmId=T1 objL1=K0205(경기도) prdSe=M
```
- 메타 조회는 `Param/statisticsParameterData.do` 가 아니라 **`statisticsData.do`** + `loadGubun`(ITM=1/OBJ=2/PRD=3)
- 탐색 창구: `/api/kosis?q=키워드` · `?orgId=&tblId=&meta=ITM` · `?orgId=&tblId=&period=&itmId=&objL1=`
  **키가 배포 환경에만 있으므로 통계표 탐색은 이 엔드포인트로 원격 수행한다.**

### 카카오 (KAKAO_REST_KEY / JS키)
```
지하철역 SW8 1km · 상업 MT1+"백화점"키워드 1.5km
문화 CT1 1km · 공공 PO3 1km · 공원 키워드"공원" 1km · 학교 SC4 500m/1km(이름필터)
6차선 왕복도로는 POI 가 아님 → 도로명주소 도로구간DB(차로수) 필요. 현재 수기입력.
```
**상호가 아니라 카카오 분류(category_name)로 걸러야 한다.** 상호로 거르면
"밧데리백화점"이 상업시설로, 동물병원이 의료시설로 잡힌다(실제 광주시 조회에서 확인).

### 의료시설 — 카카오 아님. 심평원 (DATA_GO_KR_KEY 필요)
카카오 카테고리 말단은 **진료과목**("의료,건강 > 병원 > 정형외과")이라 의료법상 종별을 못 가린다.
30병상 넘는 전문병원이 걸러지고 의원이 병원으로 잡힌다.
```
GET apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList
    ?serviceKey=&xPos=경도&yPos=위도&radius=미터(최대5000)&_type=json
```
**심사 기준은 병원급 이상**(사용자 확정). 의료법 제3조:
- 병원급 = 종합병원·병원·요양병원·정신병원·치과병원·한방병원·상급종합병원 (30병상 이상)
- 의원급 = 의원·치과의원·한의원 (30병상 미만) → 제외

판정은 코드표가 아니라 **종별명(clCdNm) 말미**로 한다 — "병원"으로 끝나면 병원급,
"의원"으로 끝나면 의원급. 코드 체계가 바뀌어도 안 깨진다.
캡쳐가 1.5km "부재"인데 의원·치과가 15건 잡혔던 것이 이 기준의 근거다.

### 시공능력평가순위
연 1회(8월) 공시라 API 불필요. 엑셀을 `data/constructor-rank.json` 으로 적재해 커밋한다.
상호 표기차((주)/㈜/주식회사/공백)를 정규화해 매칭한다.

## 겪은 함정들

| 증상 | 진짜 원인 |
|---|---|
| KOSIS `err 20` | tblId 는 맞는데 **itmId/objL1 누락** |
| KOSIS `err 11` | 키 오탈자가 아니라 **오픈API 활용신청 미승인**. 승인되니 바로 풀렸다 |
| 카카오 `403 disabled OPEN_MAP_AND_LOCAL` | 키 문제 아님. 콘솔 **제품 설정 > 카카오맵 OFF**. REST·JS 가 한 서비스로 묶여있다 |
| 카카오 JS 키가 "없음" | 환경변수 이름 불일치(`KAKAO_JS_KEY` vs `NEXT_PUBLIC_...`). **`/api/config` 가 서버에서 내려주도록 해결** |
| curl 은 되는데 노드는 안 됨 (반대도) | 이 샌드박스의 curl 이 일부 국내 호스트에서 프록시 문제를 일으킨다. **판정은 Node `fetch` 로 할 것** |
| 로컬에서 새 빌드가 안 보임 | 옛 `next start` 프로세스가 포트를 잡고 있었다. 다른 포트로 띄워 확인 |
| 배포 직후 옛 응답 | Vercel 전파에 ~1분. 바로 검증하지 말 것 |
| **베르셀 배포가 조용히 멈춤** | `.gitignore` 에 `.next/` `node_modules/` 가 빠져 빌드산출물이 커밋되고 있었다(추적 304개, 195MB). 낡은 `.next`·`BUILD_ID` 가 섞여 빌드가 깨진다. **로컬 빌드는 멀쩡한데 배포만 안 되면 이걸 먼저 의심할 것** |
| 배포본이 최신인지 모르겠음 | `/api/config` 의 `commit` 필드로 확인한다. 같은 검증을 반복하지 말 것 |
| KOSIS `err 30` "활용신청 안 함" | **거짓말이다. 실제 뜻은 "해당 시점 자료 없음".** 같은 키로 2024는 되고 2025/2026만 실패하는 걸로 확인. 연 단위 지표는 최근 연도부터 되짚어 조회한다. 이 통계표는 범위조회(start≠end)도 거부한다 |
| 카카오 403 이 안 풀림 | **앱이 여러 개였다.** 에러 본문의 `App(이름)` 이 실제 판정 대상이다. 도메인·제품설정을 다른 앱에 해두면 소용없다 |
| 공공데이터포털 `SERVICE_KEY_IS_NOT_REGISTERED` | 키 문제가 아니라 **그 API 를 활용신청 안 한 것**. 포털 키는 API 마다 따로 신청해야 한다 |
| 한글이 든 `git commit -m` 실패 | 괄호·특수문자가 셸에서 깨진다. `git commit -F 파일` 로 넘길 것 |

## 구조

```
config/indicators.json   지표 카탈로그 (원천·파라미터·골든값·원문링크) — 단일 진실공급원
src/collectors/          molit · kb · kofia · kosis · constructor · kakao · hira(의료시설)
src/lib/                 http(재시도·표준봉투) · env · region(시군구코드) · geo(폴리곤거리)
app/api/                 collect · facilities · kosis(탐색) · health(키진단) · config(JS키·배포커밋)
                         selftest(골든 재현 감시, 매일 09시 cron, 실패시 503)
app/                     page · SheetTabs · SheetView · EvidenceCard · RadiusMap · Overview
                         PolygonDrawer(사업지 경계) · kakaoSdk · storage/SavedList(브라우저 보관)
                         exportExcel(ExcelJS, 시트별 표+캡쳐이미지) · SourceHealth(원천 상태배지)
tools/                   헤드리스 캡쳐/지도 — 로컬 배치 전용. 웹앱 번들에 넣지 말 것
docs/evidence-samples/   골든 캡쳐 11장
```

수집 결과는 **표준 봉투**로 통일한다 — 값만이 아니라 `citation`(엑셀에 넣을 출처문구) ·
`queryParams`(재현용 조회조건) · `dataUpdatedAt`(원천 갱신일) · `viewUrl`(원문화면) 을 항상 동반한다.

## 완료 (되돌리지 말 것)

- **사업지 폴리곤** — 지도에서 직접 그리고 **경계 최단거리**로 판정(사용자 확정).
  실측 차이: 초등학교 457m→343m, 공원 183m→71m, 공공시설 280m→149m. 100m 넘게 벌어진다.
  경계 미지정이면 대표지번 중심점 기준. 결과의 `basis`(polygon/point)로 구분된다.
- **POI 시트 3종은 표 구조가 다르다**(캡쳐대로). 하나로 합치지 말 것.
  교통환경 `flat` · 주거편의 `grouped`(2개 그룹+묶음라벨) · 교육환경 `dual`(500m/1km 2단)
- 브라우저 보관(localStorage, 서버 저장 없음) · 엑셀 내보내기 · 원천 감시 배지

## 미결 사항

- **심평원 활용신청 대기** — `SERVICE_KEY_IS_NOT_REGISTERED`.
  data.go.kr/data/15001698 활용신청만 하면 코드 수정 없이 동작한다.
  실패해도 나머지 시설은 살고 의료시설 칸에 사유가 표시되므로 오판은 안 난다.
- **평가기준 구간표 미수령** → 평가점수/평가 칸은 빗금 처리. 집계는 범위 밖(사용자 지시).
- **인근초기분양률 시트는 범위에서 제외**(사용자 결정).
- 6차선 왕복도로 자동판정 (도로명주소 전자지도 SHP, data.go.kr/data/15050413).
- CD금리 과거 소급조회 (필요해지면 ECOS 721Y001/2010000 로 백필).

## 작업 원칙

1. **분석 → 설계 → 개발 → 검증 → 피드백** 순서를 지킨다.
2. 추측한 코드/ID 를 config 에 넣지 않는다. 넣으려면 골든값으로 실제 검증하고 `verified: true` 를 단다.
3. 커밋 전 `npx next build` 로 컴파일 확인. 푸시 후 `/api/collect` 로 실제 검증.
4. 사용자에게 터미널 명령을 시키지 않는다.
5. **"찾았다" 와 "실제로 된다" 를 구분해서 말한다.** 매핑을 찾은 것과 호출이 성공한 것은 다르다.
6. 원천이 이상한 값을 주면 **캡쳐(정답지)와 대조해 해석을 의심한다.**
   의료시설 15건은 버그가 아니라 "의원급은 의료시설이 아니다" 라는 신호였다.
