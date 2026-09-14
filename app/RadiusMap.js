'use client';
import { useEffect, useRef, useState } from 'react';
import { T } from './theme';
import { loadKakaoSdk } from './kakaoSdk';
import { captureMap } from './captureMap';

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

export default function RadiusMap({ title, center, radius, markers = [], caption, defaultMapType = 'ROADMAP' }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);
  const [mapType, setMapType] = useState(defaultMapType);

  useEffect(() => {
    let dead = false;
    loadKakaoSdk().then((kakao) => {
      if (dead || !el.current) return;
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
      for (const m of markers) {
        const p = new kakao.maps.LatLng(m.lat, m.lng);
        new kakao.maps.Marker({ position: p, map });
        new kakao.maps.CustomOverlay({
          position: p, map, yAnchor: 2.1,
          content: `<div style="background:#fff;border:2px solid #333;padding:2px 7px;border-radius:3px;
            font:600 12px 'Malgun Gothic',sans-serif;white-space:nowrap">${m.name}</div>`,
        });
      }
      map.setBounds(circle.getBounds());
      setReady(true);
    }).catch(e => !dead && setErr(e.message));
    return () => { dead = true; };
  }, [center.lat, center.lng, radius, markers]);

  async function savePng() {
    const url = await captureMap(el.current);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = `${title}_반경${radius}m.png`; a.click();
  }

  return (
    <div style={S.box}>
      <div style={S.bar}>
        <span style={S.name}>{title} · 반경 {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}</span>
        <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
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
          {ready && <button style={S.btn} onClick={savePng}>PNG 저장</button>}
        </span>
      </div>
      {err
        ? <div style={S.fallback}>
            지도를 불러오지 못했습니다.<br />{err}
          </div>
        : <div ref={el} data-map={title} style={S.map} />}
      {caption && <div style={S.cap}>{caption}</div>}
    </div>
  );
}
