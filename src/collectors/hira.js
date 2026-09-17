import { requireKey } from '../lib/env.js';
import { getJson } from '../lib/http.js';
import { distanceToPolygon, centroid, circumradius, haversine } from '../lib/geo.js';

/**
 * 건강보험심사평가원 병원정보서비스 — 의료시설 판정의 법정 근거.
 *
 * 카카오 카테고리는 진료과목("의료,건강 > 병원 > 정형외과")이라 종별을 못 가린다.
 * 30병상 넘는 정형외과병원이 걸러지고, 반대로 의원이 병원으로 잡힌다.
 * 심평원은 의료법 제3조의 **종별(clCdNm)** 을 그대로 주므로 이걸 기준으로 쓴다.
 *
 * 의료법 제3조 분류
 *   의원급  의원 · 치과의원 · 한의원          (30병상 미만)
 *   병원급  병원 · 치과병원 · 한방병원 ·
 *          요양병원 · 정신병원 · 종합병원 ·
 *          상급종합                          (30병상 이상)
 *          ※ 심평원 종별명은 "상급종합병원" 이 아니라 "상급종합" 이다
 *
 * 심사 기준은 **병원급 이상**(실무 확인).
 */
const BASE = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';

/*
 * 병원급 판정.
 *
 * 처음엔 "종별명이 병원으로 끝나면 병원급" 으로 뒀는데 **틀렸다.**
 * 심평원이 주는 종별명은 "상급종합병원" 이 아니라 **"상급종합"** 이다(실측).
 * 그 규칙으로는 전국 상급종합병원 47곳이 통째로 빠진다 — 가장 큰 병원들이.
 *
 * 그래서 의료법 제3조의 종별을 명시적으로 적는다.
 * 실측으로 확인한 종별: 상급종합 · 종합병원 · 병원 · 요양병원 · 치과병원 · 한방병원 ·
 *                      의원 · 치과의원 · 한의원 · 보건소 · 보건지소
 */
const HOSPITAL = new Set(['상급종합', '종합병원', '병원', '요양병원', '정신병원', '치과병원', '한방병원']);
const CLINIC = new Set(['의원', '치과의원', '한의원', '조산원']);

export const isHospitalGrade = (clCdNm) => {
  const n = String(clCdNm ?? '').trim();
  if (HOSPITAL.has(n)) return true;
  if (CLINIC.has(n)) return false;
  // 보건소·보건지소·보건진료소·보건의료원은 지역보건법 기관이라 의료법 종별이 아니다
  if (/^보건/.test(n)) return false;
  // 모르는 종별이 새로 생기면 말미로 가른다 (보루)
  return /병원$/.test(n);
};

/**
 * 좌표 반경내 의료기관 조회.
 * 심평원 API 가 xPos/yPos/radius 를 직접 지원한다(radius 단위: m, 최대 5000).
 */
export async function fetchNearby({ lat, lng, radius = 1500, rows = 300 }) {
  const key = requireKey('DATA_GO_KR_KEY').trim();
  const qs = new URLSearchParams({
    serviceKey: key, pageNo: '1', numOfRows: String(rows),
    xPos: String(lng), yPos: String(lat),
    radius: String(Math.min(5000, Math.round(radius))),
    _type: 'json',
  });
  const d = await getJson(`${BASE}?${qs}`);

  // 공공데이터포털은 오류를 본문에 담아 200 으로도 준다
  const err = d?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (err) throw new Error(`심평원(${err.returnReasonCode}): ${err.returnAuthMsg}`);
  const header = d?.response?.header;
  if (header && header.resultCode !== '00') throw new Error(`심평원: ${header.resultMsg}`);

  const items = d?.response?.body?.items?.item ?? [];
  return (Array.isArray(items) ? items : [items]).filter(Boolean).map(r => ({
    name: r.yadmNm,
    grade: r.clCdNm,            // 종별 (종합병원 / 병원 / 의원 …)
    gradeCode: r.clCd,
    address: r.addr,
    lat: Number(r.YPos), lng: Number(r.XPos),
    beds: r.hospUrl ? undefined : undefined,
  })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/**
 * 사업지 기준 의료시설(병원급) 수집.
 * 폴리곤이 있으면 경계 최단거리, 없으면 대표지번 중심점 기준.
 */
export async function collectMedical({ point, polygon = null, radius = 1500 }) {
  const ring = Array.isArray(polygon) && polygon.length >= 3 ? polygon : null;
  const origin = ring ? centroid(ring) : point;
  const pad = ring ? Math.ceil(circumradius(ring, origin)) : 0;

  const all = await fetchNearby({ lat: origin.lat, lng: origin.lng, radius: radius + pad });
  const hospitals = all.filter(r => isHospitalGrade(r.grade));

  const items = hospitals.map(r => ({
    name: r.name,
    distance: Math.round(ring ? distanceToPolygon(r, ring) : haversine(origin, r)),
    address: r.address,
    category: `의료기관 종별 > ${r.grade}`,   // 판정 근거를 증빙에 남긴다
    x: String(r.lng), y: String(r.lat),
  })).filter(i => i.distance <= radius).sort((a, b) => a.distance - b.distance);

  return {
    sheet: '주거편의', radius,
    basis: ring ? 'polygon' : 'point',
    /* 의료시설만 원천이 다르다 — 봉투가 그 사실을 들고 다녀야 화면·엑셀이 맞게 적는다 */
    source: {
      name: '건강보험심사평가원 병원정보서비스',
      detail: '의료법 제3조 종별(clCdNm) 기준 · 병원급 이상만 채택',
      filter: '병원급 = 상급종합 · 종합병원 · 병원 · 요양병원 · 정신병원 · 치과병원 · 한방병원',
    },
    count: items.length,
    nearest: items[0] ?? null,
    items,
    // "왜 부재인가"를 설명할 수 있어야 한다 — 제외된 것들의 종별 내역까지 남긴다
    excludedClinics: all.length - hospitals.length,
    excludedByGrade: Object.entries(
      all.filter(r => !isHospitalGrade(r.grade))
         .reduce((m, r) => ({ ...m, [r.grade ?? '?']: (m[r.grade ?? '?'] ?? 0) + 1 }), {}),
    ).sort((a, b) => b[1] - a[1]).map(([grade, n]) => `${grade} ${n}`).join(' · ') || null,
  };
}
