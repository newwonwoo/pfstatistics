'use client';
import { useEffect, useRef, useState } from 'react';
import { T } from './theme';
import { loadKakaoSdk } from './kakaoSdk';
import { captureMap, composeMap } from './captureMap';

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
  map: { width: '100%', height: 420 },
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
const levelCapFor = (r) => MAX_LEVEL[r] ?? (r <= 300 ? 3 : r <= 500 ? 4 : r <= 1000 ? 5 : 6);

export default function RadiusMap({ title, center, radius, markers = [], polygon = null, caption, defaultMapType = 'ROADMAP' }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);
  const [mapType, setMapType] = useState(defaultMapType);
  const [saving, setSaving] = useState(null);   // null | 'busy' | 실패사유

  const mkey = JSON.stringify(markers);
  const pkey = JSON.stringify(polygon);

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
      const circle = new kakao.maps.Circle({
        center: c, radius,
        // 위성 타일 위에서도 보이도록 선을 굵고 밝게, 채움은 옅게
        strokeWeight: 3, strokeColor: '#FFEB3B', strokeOpacity: 1, strokeStyle: 'solid',
        fillColor: '#CE93D8', fillOpacity: 0.18,
      });
      circle.setMap(map);
      new kakao.maps.Marker({ position: c, map });   // 사업지
      if (polygon?.length >= 3) {
        // 판정 기준이 경계면 화면에도 경계를 보여야 한다 (캡쳐와 화면을 같게)
        new kakao.maps.Polygon({
          map, path: polygon.map(p => new kakao.maps.LatLng(p.lat, p.lng)),
          strokeWeight: 2, strokeColor: '#1b4fd8', strokeOpacity: 0.95,
          fillColor: '#1b4fd8', fillOpacity: 0.22,
        });
      }
      for (const m of markers) {
        const p = new kakao.maps.LatLng(m.lat, m.lng);
        new kakao.maps.Marker({ position: p, map });
        new kakao.maps.CustomOverlay({
          position: p, map, yAnchor: 2.2,
          // 축소 상태에서도 무엇인지 읽혀야 한다. 거리까지 같이 박는다.
          content: `<div style="background:#fff;border:2px solid #111;padding:3px 9px;border-radius:4px;
            font:700 13px 'Malgun Gothic',sans-serif;white-space:nowrap;
            box-shadow:0 1px 4px rgba(0,0,0,.35)">${m.name}${m.distance != null ? ` · ${m.distance}m` : ''}</div>`,
        });
      }
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
        if (map.getLevel() > cap) map.setLevel(cap);
      } else {
        // 시설이 없으면(부재) 반경원 전체를 보여줘야 "이 범위에 없다" 가 증명된다
        map.setBounds(circle.getBounds());
        if (map.getLevel() > cap + 1) map.setLevel(cap + 1);
      }
      setReady(true);
    }).catch(e => !dead && setErr(e.message));
    return () => { dead = true; };
  // markers/polygon 은 렌더마다 새 배열이라 그대로 넣으면 지도가 매번 다시 만들어진다.
  // 내용이 같으면 다시 만들지 않도록 문자열로 비교한다.
  }, [center.lat, center.lng, radius, mkey, pkey, defaultMapType]);   // eslint-disable-line react-hooks/exhaustive-deps

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
      center, radius, markers, polygon, title,
      ...opts,
    });
    return () => { if (node) delete node.__capture; };
  }, [ready, center.lat, center.lng, radius, mkey, pkey, title, mapType]);   // eslint-disable-line react-hooks/exhaustive-deps

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
      {saving && saving !== 'busy' && (
        <div style={{ ...S.cap, background: T.errSoft, color: T.err }}>
          캡쳐 실패: {saving}
        </div>
      )}
      {caption && <div style={S.cap}>{caption}</div>}
    </div>
  );
}
