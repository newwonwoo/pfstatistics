'use client';
import { useEffect, useRef, useState } from 'react';
import { T } from './theme';

/**
 * 반경원 지도 — 캡쳐 01·02·05 의 그 그림.
 *
 * 카카오맵 JS SDK 는 원래 브라우저용이라 헤드리스로 돌릴 이유가 없다.
 * 여기서 직접 그리고, 저장할 때만 캔버스로 PNG 를 뽑는다.
 *
 * 필요한 것: NEXT_PUBLIC_KAKAO_JS_KEY + 카카오 콘솔 플랫폼>Web 에 이 도메인 등록.
 */
const JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

let sdkPromise = null;
function loadSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저 전용'));
  if (window.kakao?.maps) return Promise.resolve(window.kakao);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (!JS_KEY) return reject(new Error('NEXT_PUBLIC_KAKAO_JS_KEY 미설정'));
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    s.onerror = () => reject(new Error('카카오맵 SDK 로드 실패 — 콘솔 > 플랫폼 > Web 에 이 도메인이 등록됐는지 확인하세요'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

const S = {
  box: { border: `1px solid ${T.line}`, borderRadius: 8, overflow: 'hidden', background: '#fff' },
  bar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${T.line}`, background: '#fafbfc' },
  name: { fontSize: 12.5, fontWeight: 700, color: T.ink2 },
  btn: { padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: `1px solid ${T.line}`, background: '#fff', borderRadius: 5, cursor: 'pointer', color: T.ink2 },
  map: { width: '100%', height: 420 },
  fallback: { padding: '36px 20px', textAlign: 'center', color: T.warn, fontSize: 12.5, background: T.warnSoft, lineHeight: 1.7 },
  cap: { padding: '9px 14px', fontSize: 11.5, color: T.muted, borderTop: `1px solid ${T.line}` },
};

export default function RadiusMap({ title, center, radius, markers = [], caption }) {
  const el = useRef(null);
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    loadSdk().then((kakao) => {
      if (dead || !el.current) return;
      const c = new kakao.maps.LatLng(center.lat, center.lng);
      const map = new kakao.maps.Map(el.current, { center: c, level: 6 });
      const circle = new kakao.maps.Circle({
        center: c, radius,
        strokeWeight: 2, strokeColor: '#7B1FA2', strokeOpacity: 0.9, strokeStyle: 'solid',
        fillColor: '#CE93D8', fillOpacity: 0.35,
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
    const { toPng } = await import('html-to-image');
    const url = await toPng(el.current, { pixelRatio: 2, backgroundColor: '#fff' });
    const a = document.createElement('a');
    a.href = url; a.download = `${title}_반경${radius}m.png`; a.click();
  }

  return (
    <div style={S.box}>
      <div style={S.bar}>
        <span style={S.name}>{title} · 반경 {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}</span>
        {ready && <button style={S.btn} onClick={savePng}>PNG 저장</button>}
      </div>
      {err
        ? <div style={S.fallback}>
            지도를 불러오지 못했습니다.<br />{err}
          </div>
        : <div ref={el} style={S.map} />}
      {caption && <div style={S.cap}>{caption}</div>}
    </div>
  );
}
