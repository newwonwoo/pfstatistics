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
  next: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '10px 14px', borderTop: `1px solid ${T.line}`, background: '#fafbfc',
  },
  foot2: { fontSize: 11.5, color: T.muted, flex: 1, minWidth: 220 },
  /* 경계를 다 찍으면 곧바로 누를 수 있는 버튼 — 못 누를 때는 사유를 글자로 보여준다 */
  go: (on) => ({
    padding: '8px 16px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    cursor: on ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
    background: on ? '#1b4fd8' : '#f1f3f5', color: on ? '#fff' : '#767e8a',
    border: `1px solid ${on ? '#1b4fd8' : '#e2e5ea'}`,
  }),
  ready: (ok) => ({
    padding: '7px 13px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    background: ok ? T.okSoft : '#f1f3f5', color: ok ? T.ok : T.muted,
    border: `1px solid ${ok ? '#c7e9d5' : T.line}`,
  }),
};

export default function PolygonDrawer({ center, polygon, onChange, busy, autoDraw = false, pendingSheet,
  onCollect = null, onConfirm = null, onRedraw = null, done = false, doneHint = null }) {
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

  /*
   * "경계 기준" 을 고르고 왔으면 바로 그릴 수 있어야 한다.
   * [그리기 시작] 을 한 번 더 누르게 하면 거기서 흐름이 끊긴다.
   */
  useEffect(() => {
    if (!autoDraw) return;
    setDrawing(true);
    el.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [autoDraw]);

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
          {pts.length >= 3 ? `${pts.length}점 — 경계 기준 판정`
            : '3점 이상 찍으면 경계 최단거리로 잽니다 (실측 100m 넘게 차이납니다)'}
        </span>
      </div>

      {err ? <div style={S.fail}>지도를 불러오지 못했습니다.<br />{err}</div>
           : <div ref={el} data-map="사업지 경계" style={S.map} />}

      {/*
        그리고 나서 뭘 해야 하는지가 안 보이면 안 된다.
        다음 동작(수집)을 지도 바로 아래에 붙여 둔다.
      */}
      <div style={S.next}>
        <span style={S.foot2}>
          {pts.length >= 3
            ? `경계 ${pts.length}점 지정됨 — 경계 최단거리로 판정합니다 (사업지 안의 시설은 0m)`
            : drawing
              ? '지도를 클릭해 사업지 모서리를 찍으세요 (3점 이상)'
              : '[그리기 시작] 을 누르고 지도에서 사업지 모서리를 찍으세요'}
        </span>
        {/*
          **안내문이 가리키는 버튼이 화면에 없었다**(사용자 지적 2026-09-17).
          "「이 경계로 수집」 을 누르세요" 라고 적어놓고 정작 그 이름의 버튼은 어디에도 없었고,
          실제로는 674px 위 단계 줄의 [반경시설 수집] 을 다시 눌러야 했다.
          **수집 버튼을 두 군데 두지 않는다**는 규칙은 지킨다 —
          이 버튼은 경계 기준을 고른 **그 순간에만** 있고, 수집이 끝나면 사라진다.
          단계 줄 버튼은 이 흐름을 *시작한* 버튼이고, 이건 그 흐름을 *끝내는* 버튼이다.
        */}
        {/*
          **경계 그리기를 끝맺는 버튼이 없었다**(사용자 요청 2026-09-24).
          점을 다 찍어도 "이제 뭘 하지" 가 화면에 없었다 — 다음 할 일([통계 수집])은
          674px 위 단계 줄에 있는데 그리로 시선을 보내는 것이 아무것도 없었다.
          **[경계 확정]** 으로 이 흐름을 끝내고, 끝나면 다음 단계를 말해준다.
          확정한 뒤에도 고칠 수 있어야 하므로 **[다시 그리기]** 를 같은 자리에 둔다.

          수집 흐름에서 들어온 경우([반경시설 수집] → 경계)는 그 흐름을 끝내는 버튼이
          [이 경계로 … 수집] 이다 — 그때는 그쪽이 우선이다(버튼을 두 개 세우지 않는다).
        */}
        {onCollect ? (
          <button style={S.go(pts.length >= 3 && !busy)}
            disabled={pts.length < 3 || !!busy}
            title={pts.length < 3 ? `경계를 ${3 - pts.length}점 더 찍어야 누를 수 있습니다` : ''}
            onClick={onCollect}>
            {busy ? '수집 중…'
              : pts.length >= 3 ? `이 경계로 ${pendingSheet ?? '반경시설'} 수집`
              : `경계를 ${3 - pts.length}점 더 찍으세요`}
          </button>
        ) : done ? (
          <>
            <span style={S.ready(true)}>✓ 경계 {pts.length}점 확정됨{doneHint ? ` — ${doneHint}` : ''}</span>
            {onRedraw && (
              <button style={S.btn(false)} onClick={onRedraw}>다시 그리기</button>
            )}
          </>
        ) : onConfirm ? (
          <button style={S.go(pts.length >= 3)}
            disabled={pts.length < 3}
            title={pts.length < 3 ? `경계를 ${3 - pts.length}점 더 찍어야 누를 수 있습니다` : ''}
            onClick={onConfirm}>
            {pts.length >= 3 ? `경계 ${pts.length}점 확정` : `경계를 ${3 - pts.length}점 더 찍으세요`}
          </button>
        ) : (
          <span style={S.ready(pts.length >= 3)}>
            {busy ? '수집 중…'
              : pts.length >= 3 ? `경계 ${pts.length}점 지정됨 — 경계 기준으로 잽니다`
              : '경계 그리기는 선택입니다 — 안 그리면 대표지번 중심으로 잽니다'}
          </span>
        )}
      </div>
    </div>
  );
}
