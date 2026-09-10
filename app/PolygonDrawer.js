'use client';
import { useEffect, useRef, useState } from 'react';
import { T, mono } from './theme';
import { loadKakaoSdk } from './kakaoSdk';

/**
 * 사업지 폴리곤 그리기.
 *
 * 캡쳐의 파란 다각형이 사업지다. "탄벌동 203-4 외 57필지" 처럼 지번이 나열되지 않는 경우가
 * 많고 공터도 있어, 실무자가 지도에서 직접 찍는 편이 빠르다.
 * 여기서 그린 경계로 "사업지 반경 N 이내"를 판정한다(중심점이 아니라 경계 최단거리).
 */
const S = {
  box: { border: `1px solid ${T.line}`, borderRadius: 8, overflow: 'hidden', background: '#fff', marginBottom: 16 },
  bar: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${T.line}`, background: '#fafbfc', flexWrap: 'wrap' },
  name: { fontSize: 12.5, fontWeight: 700, color: T.ink2 },
  hint: { fontSize: 11.5, color: T.muted },
  btn: (on) => ({
    padding: '5px 12px', fontSize: 11.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
    border: `1px solid ${on ? T.accent : T.line}`,
    background: on ? T.accentSoft : '#fff',
    color: on ? T.accent : T.ink2,
  }),
  map: { width: '100%', height: 460 },
  fail: { padding: '32px 20px', textAlign: 'center', color: T.warn, fontSize: 12.5, background: T.warnSoft, lineHeight: 1.7 },
  foot: { padding: '8px 14px', fontSize: 11.5, color: T.muted, borderTop: `1px solid ${T.line}`, ...mono },
};

export default function PolygonDrawer({ center, polygon, onChange }) {
  const el = useRef(null);
  const state = useRef({ map: null, poly: null, dots: [] });
  const [pts, setPts] = useState(polygon ?? []);
  const [drawing, setDrawing] = useState(false);
  const [err, setErr] = useState(null);

  // 지도 1회 생성
  useEffect(() => {
    let dead = false;
    loadKakaoSdk().then((kakao) => {
      if (dead || !el.current || state.current.map) return;
      const c = new kakao.maps.LatLng(center.lat, center.lng);
      const map = new kakao.maps.Map(el.current, { center: c, level: 4 });
      new kakao.maps.Marker({ position: c, map });   // 대표지번
      state.current.map = map;
      state.current.kakao = kakao;

      kakao.maps.event.addListener(map, 'click', (e) => {
        if (!state.current.drawing) return;
        const ll = e.latLng;
        setPts(prev => [...prev, { lat: ll.getLat(), lng: ll.getLng() }]);
      });
    }).catch(e => !dead && setErr(e.message));
    return () => { dead = true; };
  }, [center.lat, center.lng]);

  // drawing 플래그를 리스너가 읽을 수 있게 ref 로도 들고 있는다
  useEffect(() => { state.current.drawing = drawing; }, [drawing]);

  // 꼭짓점이 바뀔 때마다 다시 그린다
  useEffect(() => {
    const { map, kakao } = state.current;
    if (!map || !kakao) return;

    state.current.poly?.setMap(null);
    state.current.dots.forEach(d => d.setMap(null));
    state.current.dots = [];

    if (pts.length) {
      state.current.dots = pts.map(p => new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(p.lat, p.lng), map, yAnchor: 0.5, xAnchor: 0.5,
        content: '<div style="width:9px;height:9px;border-radius:9px;background:#1b4fd8;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4)"></div>',
      }));
    }
    if (pts.length >= 3) {
      state.current.poly = new kakao.maps.Polygon({
        path: pts.map(p => new kakao.maps.LatLng(p.lat, p.lng)),
        strokeWeight: 2, strokeColor: '#1b4fd8', strokeOpacity: 0.95,
        fillColor: '#1b4fd8', fillOpacity: 0.22,
      });
      state.current.poly.setMap(map);
    }
    onChange?.(pts.length >= 3 ? pts : null);
  }, [pts]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={S.box}>
      <div style={S.bar}>
        <span style={S.name}>사업지 경계</span>
        <button style={S.btn(drawing)} onClick={() => setDrawing(d => !d)}>
          {drawing ? '그리기 중 — 지도 클릭' : '그리기 시작'}
        </button>
        <button style={S.btn(false)} onClick={() => setPts(p => p.slice(0, -1))} disabled={!pts.length}>
          한 점 취소
        </button>
        <button style={S.btn(false)} onClick={() => { setPts([]); setDrawing(false); }} disabled={!pts.length}>
          전체 지우기
        </button>
        <span style={S.hint}>
          {pts.length < 3
            ? '사업지 경계를 3점 이상 찍으면 경계 기준으로 거리를 잽니다.'
            : `${pts.length}점 — 경계 기준 판정`}
        </span>
      </div>

      {err ? <div style={S.fail}>지도를 불러오지 못했습니다.<br />{err}</div>
           : <div ref={el} style={S.map} />}

      <div style={S.foot}>
        {pts.length >= 3
          ? '경계 최단거리로 판정합니다 (사업지 안의 시설은 0m).'
          : '경계 미지정 — 대표지번 중심점 기준으로 판정합니다.'}
      </div>
    </div>
  );
}
