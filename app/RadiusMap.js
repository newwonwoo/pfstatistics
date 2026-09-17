'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from './theme';
import { loadKakaoSdk } from './kakaoSdk';
import { captureMap, composeMap, captureRoadview } from './captureMap';
import { bufferPolygon } from '../src/lib/geo';

/**
 * 반경원 지도 — 캡쳐 01·02·05 의 그 그림.
 *
 * 카카오맵 JS SDK 는 원래 브라우저용이라 헤드리스로 돌릴 이유가 없다.
 * 여기서 직접 그리고, 저장할 때만 캔버스로 PNG 를 뽑는다.
 *
 * 필요한 것: NEXT_PUBLIC_KAKAO_JS_KEY + 카카오 콘솔 플랫폼>Web 에 이 도메인 등록.
 */
const S = {
  box: { border: `1px solid ${T.line}`, borderRadius: 8, overflow: 'hidden', background: '#fff' },
  bar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${T.line}`, background: '#fafbfc' },
  name: { fontSize: 12.5, fontWeight: 700, color: T.ink2 },
  btn: { padding: '5px 11px', fontSize: 11.5, fontWeight: 700, border: `1px solid ${T.line}`, background: '#fff', borderRadius: 5, cursor: 'pointer', color: T.ink2 },
  btnOn: { borderColor: T.accent, background: T.accentSoft, color: T.accent },
  /*
   * **지도를 크게 쓴다**(사용자 요청 2026-09-17).
   * 420px 에서는 축소돼 시설명을 못 읽었다 — 증빙으로 붙였을 때 확인이 안 된다.
   * 크기를 키우면 같은 축척에서 타일이 더 들어와 실제 정보량 자체가 는다.
   */
  map: { width: '100%', height: 640 },
  fallback: { padding: '36px 20px', textAlign: 'center', color: T.warn, fontSize: 12.5, background: T.warnSoft, lineHeight: 1.7 },
  cap: { padding: '9px 14px', fontSize: 11.5, color: T.muted, borderTop: `1px solid ${T.line}` },
};

/**
 * 지도 타입.
 * 6차선 왕복도로는 실무가 **위성사진으로 차선을 세어** 판정한다(사용자 확인).
 * 그래서 판정용 지도는 위성+라벨(하이브리드)을 기본으로 준다 — 도로명도 같이 보여야 하기 때문.
 */
const MAP_TYPES = [
  { id: 'ROADMAP', label: '일반' },
  { id: 'HYBRID',  label: '위성+라벨' },
  { id: 'SKYVIEW', label: '위성' },
];

/**
 * 반경별 최대 축소 한계.
 * 카카오는 축소하면 상호 라벨을 감춘다. 반경원 전체를 맞추면 너무 멀어져
 * "무슨 시설인지" 가 안 보인다 — 증빙으로 못 쓴다.
 * 그래서 사업지와 판정 대상 시설이 들어올 만큼만 확대하고, 그보다 멀어지지 않게 막는다.
 */
const MAX_LEVEL = { 300: 3, 500: 4, 1000: 5, 1500: 6 };
/** 이름표를 다는 최대 개수 — 넘으면 서로 겹쳐 못 읽는다 */
/*
 * **이름은 전부 단다**(사용자 요청). 겹침은 개수로 막던 것을
 * 자리잡기(placeLabel)가 자리를 못 찾으면 그 하나만 포기하는 방식으로 바꿨다 —
 * 지도가 커져 자리가 늘었으므로 대부분 다 들어온다.
 */
const LABEL_MAX = 999;

const levelCapFor = (r) => MAX_LEVEL[r] ?? (r <= 300 ? 3 : r <= 500 ? 4 : r <= 1000 ? 5 : 6);

export default function RadiusMap({ title, center, radius, markers = [], polygon = null, caption, defaultMapType = 'ROADMAP', roadview = false, roadviewOpen = false, roadviewAt = null, radiusBasis }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);
  const [mapType, setMapType] = useState(defaultMapType);
  const [saving, setSaving] = useState(null);   // null | 'busy' | 실패사유
  const rvEl = useRef(null);
  const rvRef = useRef(null);
  const [rvOn, setRvOn] = useState(false);
  const [rvMsg, setRvMsg] = useState(null);

  const mkey = JSON.stringify(markers);
  const pkey = JSON.stringify(polygon);
  const hasPoly = (polygon?.length ?? 0) >= 3;

  /*
   * 반경 기준.
   * 판정은 경계 최단거리로 하는데 그림만 대표지번 중심의 원이면 둘이 어긋난다.
   * (실측: 1km 기준에서 중심원이 모든 방향으로 100~181m 작았다)
   * 경계가 있으면 경계에서 radius 만큼 떨어진 선을 그리는 것을 기본으로 한다.
   */
  // 기준은 시트 상단에서 고른다 (지도 안쪽 버튼은 아무도 못 찾았다)
  const basis = hasPoly ? (radiusBasis ?? 'polygon') : 'point';

  const ring = useMemo(
    () => (basis === 'polygon' && hasPoly ? bufferPolygon(polygon, radius) : null),
    [basis, hasPoly, pkey, radius],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rkey = ring ? `poly${radius}` : `pt${radius}`;

  useEffect(() => {
    let dead = false;
    loadKakaoSdk().then((kakao) => {
      if (dead || !el.current) return;
      el.current.innerHTML = '';        // 다시 만들 때 이전 지도가 남지 않게
      const c = new kakao.maps.LatLng(center.lat, center.lng);
      const map = new kakao.maps.Map(el.current, {
        center: c, level: 6,
        mapTypeId: kakao.maps.MapTypeId[defaultMapType] ?? kakao.maps.MapTypeId.ROADMAP,
      });
      mapRef.current = { map, kakao };
      // 위성 타일 위에서도 보이도록 선을 굵고 밝게, 채움은 옅게
      const paint = { strokeWeight: 3, strokeColor: '#FFEB3B', strokeOpacity: 1, strokeStyle: 'solid',
                      fillColor: '#CE93D8', fillOpacity: 0.18 };
      const area = ring
        ? new kakao.maps.Polygon({ ...paint, path: ring.map(p => new kakao.maps.LatLng(p.lat, p.lng)) })
        : new kakao.maps.Circle({ ...paint, center: c, radius });
      area.setMap(map);
      const areaBounds = () => {
        if (!ring) return area.getBounds();
        const b = new kakao.maps.LatLngBounds();
        for (const p of ring) b.extend(new kakao.maps.LatLng(p.lat, p.lng));
        return b;
      };
      new kakao.maps.Marker({ position: c, map });   // 사업지
      if (polygon?.length >= 3) {
        // 판정 기준이 경계면 화면에도 경계를 보여야 한다 (캡쳐와 화면을 같게)
        new kakao.maps.Polygon({
          map, path: polygon.map(p => new kakao.maps.LatLng(p.lat, p.lng)),
          strokeWeight: 2, strokeColor: '#1b4fd8', strokeOpacity: 0.95,
          fillColor: '#1b4fd8', fillOpacity: 0.22,
        });
      }
      /*
       * 표에 있는 시설은 지도에도 전부 찍는다. 번호는 표의 # 와 같게 맞춘다.
       * 다만 라벨을 전부 띄우면 서로 겹쳐 아무것도 못 읽는다 —
       * 가까운 것부터 LABEL_MAX 개만 이름을 달고, 나머지는 번호로 표에서 찾게 한다.
       */
      markers.forEach((m, i) => {
        const p = new kakao.maps.LatLng(m.lat, m.lng);
        const no = m.no ?? i + 1;
        /*
         * `faint` 는 **도로가 지나는 자리**를 잇는 점이다 — 시설이 아니라 자취라
         * 번호도 라벨도 달지 않는다. 번호를 달면 표의 # 와 어긋나 읽는 사람을 헷갈리게 한다.
         */
        if (m.faint) {
          new kakao.maps.CustomOverlay({
            position: p, map, yAnchor: 0.5, zIndex: 2,
            content: `<div style="width:11px;height:11px;border-radius:11px;background:#1b4fd8;opacity:.55;
              border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.3)"></div>`,
          });
          return;
        }
        new kakao.maps.CustomOverlay({
          position: p, map, yAnchor: 1, zIndex: 3,
          content: `<div style="width:24px;height:24px;border-radius:24px;background:${i === 0 ? '#1b4fd8' : '#EA4335'};
            border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;
            font:700 12px 'Malgun Gothic',sans-serif;display:flex;align-items:center;justify-content:center">${no}</div>`,
        });
        if (i < LABEL_MAX) {
          // 같은 높이에 다 걸면 서로 덮는다. 높이를 엇갈려 겹침을 줄인다.
          new kakao.maps.CustomOverlay({
            position: p, map, yAnchor: 2.4 + (i % 3) * 0.95, zIndex: 4,
            content: `<div style="background:#fff;border:2px solid #111;padding:2px 8px;border-radius:4px;
              font:700 12px 'Malgun Gothic',sans-serif;white-space:nowrap;
              box-shadow:0 1px 4px rgba(0,0,0,.35)">${no}. ${m.name}${m.distance != null ? ` · ${m.distance}m` : ''}</div>`,
          });
        }
      });
      /*
       * 확대 결정.
       * 판정 대상(사업지 + 최근접 시설)이 들어오게 맞추되,
       * 라벨이 보이는 수준보다 더 멀어지지 않게 한계를 건다.
       */
      const cap = levelCapFor(radius);
      if (markers.length) {
        const bounds = new kakao.maps.LatLngBounds();
        bounds.extend(c);
        for (const m of markers) bounds.extend(new kakao.maps.LatLng(m.lat, m.lng));
        map.setBounds(bounds, 60, 60, 60, 60);       // 여백을 줘서 라벨이 잘리지 않게
        // 한 곳뿐이면 라벨이 보이게 확대를 당기고, 여러 곳이면 다 담기는 쪽을 택한다
        if (markers.length <= 1 && map.getLevel() > cap) map.setLevel(cap);
      } else {
        // 시설이 없으면(부재) 반경원 전체를 보여줘야 "이 범위에 없다" 가 증명된다
        map.setBounds(areaBounds());
        if (map.getLevel() > cap + 1) map.setLevel(cap + 1);
      }
      /*
       * 차선 수는 위성사진으로 세기 어렵다 — 가로수·그림자·차량에 가린다.
       * 로드뷰로 보면 바로 세진다. 지도를 클릭하면 그 지점 로드뷰로 옮긴다.
       */
      kakao.maps.event.addListener(map, 'click', (e) => {
        if (rvRef.current) moveRoadview(kakao, e.latLng);
      });
      setReady(true);
    }).catch(e => !dead && setErr(e.message));
    return () => { dead = true; };
  // markers/polygon 은 렌더마다 새 배열이라 그대로 넣으면 지도가 매번 다시 만들어진다.
  // 내용이 같으면 다시 만들지 않도록 문자열로 비교한다.
  }, [center.lat, center.lng, radius, mkey, pkey, rkey, defaultMapType]);   // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * 캡쳐 등록.
   * 지도 DOM 을 html-to-image 로 뜨는 건 타일 CORS 때문에 계속 실패했다.
   * 좌표는 이미 알고 있으니 타일만 같은 출처로 받아 캔버스에 직접 합성한다.
   */
  useEffect(() => {
    const node = el.current;
    if (!node || !ready || !mapRef.current) return;
    node.__capture = (opts) => composeMap(node, {
      map: mapRef.current.map,
      kakao: mapRef.current.kakao,
      center, radius, markers, polygon, title, radiusRing: ring,
      ...opts,
    });
    return () => { if (node) delete node.__capture; };
  }, [ready, center.lat, center.lng, radius, mkey, pkey, rkey, title, mapType]);   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 클릭 지점에서 가장 가까운 로드뷰로 옮긴다.
   * 반경을 넓혀가며 찾는다 — 사업지가 도로에서 떨어져 있으면 가까운 곳엔 파노라마가 없다.
   */
  function moveRoadview(kakao, position, radii = [60, 150, 350, 800]) {
    if (!rvRef.current) return;
    const client = new kakao.maps.RoadviewClient();
    const tryAt = (i) => {
      if (i >= radii.length) {
        setRvMsg(`반경 ${radii.at(-1)}m 안에 로드뷰가 없습니다 — 지도에서 도로 위를 클릭해 보세요`);
        return;
      }
      client.getNearestPanoId(position, radii[i], (panoId) => {
        if (!panoId) { tryAt(i + 1); return; }
        setRvMsg('지도를 클릭하면 그 지점 로드뷰로 이동합니다. 왕복 6차선 = 편도 3차로입니다.');
        try { rvRef.current.setPanoId(panoId, position); }
        catch (e) { setRvMsg(`로드뷰 표시 실패: ${e.message}`); }
      });
    };
    tryAt(0);
  }

  function toggleRoadview() {
    if (rvOn) { setRvOn(false); rvRef.current = null; setRvMsg(null); return; }
    setRvOn(true);
    setRvMsg('로드뷰를 불러오는 중…');
  }

  /*
   * 로드뷰 생성은 **DOM 이 붙은 뒤** 해야 한다.
   * setTimeout(0) 으로 맞추던 것이 React 커밋보다 먼저 돌아 조용히 실패하곤 했다.
   * rvOn 이 true 가 된 뒤의 이 효과에서 만들면 순서가 보장된다.
   */
  useEffect(() => {
    if (!rvOn) return;
    const m = mapRef.current;
    if (!m || !rvEl.current) { setRvMsg('지도가 아직 준비되지 않았습니다'); return; }
    const { kakao } = m;
    if (!kakao?.maps?.Roadview) {
      setRvMsg('이 카카오맵 SDK 빌드에 로드뷰가 없습니다 (콘솔에서 카카오맵 제품 사용을 확인하세요)');
      return;
    }
    try {
      rvRef.current = new kakao.maps.Roadview(rvEl.current);
      const at = roadviewAt ?? center;
      moveRoadview(kakao, new kakao.maps.LatLng(at.lat, at.lng));
    } catch (e) {
      setRvMsg(`로드뷰 생성 실패: ${e.message}`);
    }
  }, [rvOn, center.lat, center.lng]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 차선 판정용 지도는 로드뷰가 본체다 — 눌러야 보이면 못 쓴다
  useEffect(() => {
    if (ready && roadview && roadviewOpen) setRvOn(true);
  }, [ready, roadview, roadviewOpen]);

  // 도로 후보에서 고르면 그 지점 로드뷰로 옮긴다 (거기서 차선을 센다)
  useEffect(() => {
    const m = mapRef.current;
    if (!roadviewAt || !m) return;
    const ll = new m.kakao.maps.LatLng(roadviewAt.lat, roadviewAt.lng);
    m.map.setCenter(ll);
    if (!rvOn) { setRvOn(true); return; }       // 생성 효과가 이어서 이 지점으로 간다
    moveRoadview(m.kakao, ll);
  }, [roadviewAt?.lat, roadviewAt?.lng]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** 로드뷰 PNG — 되는지 안 되는지 앱이 직접 시도해서 알린다 */
  function saveRoadviewPng() {
    try {
      const url = captureRoadview(rvEl.current);
      const a = document.createElement('a');
      a.href = url; a.download = `${title}_로드뷰.png`; a.click();
      setRvMsg('로드뷰를 PNG 로 저장했습니다.');
    } catch (e) {
      setRvMsg(String(e.message));
    }
  }

  async function savePng() {
    setSaving('busy');
    try {
      const url = await captureMap(el.current);
      if (!url) throw new Error('캡쳐 결과가 비었습니다');
      const a = document.createElement('a');
      a.href = url; a.download = `${title}_반경${radius}m.png`; a.click();
      setSaving(null);
    } catch (e) {
      // 조용히 실패하면 "버튼이 안 먹는다"로 보인다. 사유를 남긴다.
      setSaving(String(e.message).slice(0, 120));
    }
  }

  return (
    <div style={S.box}>
      <div style={S.bar}>
        <span style={S.name}>{title} · 반경 {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}</span>
        <span style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
          <button style={S.btn} title="확대"
            onClick={() => mapRef.current?.map.setLevel(mapRef.current.map.getLevel() - 1)}>＋</button>
          <button style={S.btn} title="축소"
            onClick={() => mapRef.current?.map.setLevel(mapRef.current.map.getLevel() + 1)}>－</button>
          {MAP_TYPES.map(t => (
            <button
              key={t.id}
              style={{ ...S.btn, ...(mapType === t.id ? S.btnOn : null) }}
              onClick={() => {
                const m = mapRef.current;
                if (!m) return;
                // SKYVIEW/HYBRID 는 위성 타일. HYBRID 는 도로명 라벨이 함께 나온다.
                m.map.setMapTypeId(m.kakao.maps.MapTypeId[t.id]);
                setMapType(t.id);
              }}
            >{t.label}</button>
          ))}
          {ready && roadview && (
            <button style={{ ...S.btn, ...(rvOn ? S.btnOn : null) }} onClick={toggleRoadview}>
              {rvOn ? '로드뷰 닫기' : '로드뷰'}
            </button>
          )}
          {ready && (
            <button style={S.btn} onClick={savePng} disabled={saving === 'busy'}>
              {saving === 'busy' ? '캡쳐 중…' : 'PNG 저장'}
            </button>
          )}
        </span>
      </div>
      {err
        ? <div style={S.fallback}>
            지도를 불러오지 못했습니다.<br />{err}
          </div>
        : <div ref={el} data-map={title} style={S.map} />}
      {rvOn && (
        <>
          <div ref={rvEl} style={{ width: '100%', height: 340, borderTop: `1px solid ${T.line}` }} />
          <div style={{ ...S.cap, background: T.accentSoft, color: T.accent, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 240 }}>{rvMsg ?? '로드뷰'}</span>
            {/* 타일 CORS 여부는 밖에서 확인이 안 된다 — 눌러서 실제 결과를 본다 */}
            <button style={S.btn} onClick={saveRoadviewPng}>로드뷰 PNG 저장</button>
          </div>
        </>
      )}
      {saving && saving !== 'busy' && (
        <div style={{ ...S.cap, background: T.errSoft, color: T.err }}>
          캡쳐 실패: {saving}
        </div>
      )}
      {caption && <div style={S.cap}>{caption}</div>}
      {hasPoly && (
        <div style={S.cap}>
          {basis === 'polygon'
            ? `노란 선 = 사업지 경계에서 ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} — 판정선과 같은 선입니다`
            : `노란 원 = 대표지번 중심 기준 — 판정(경계 최단거리)과 다릅니다. [경계기준] 을 누르세요`}
        </div>
      )}
    </div>
  );
}
