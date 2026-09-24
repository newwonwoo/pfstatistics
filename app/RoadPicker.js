'use client';
import { useEffect, useState } from 'react';
import { T } from './theme';
import { scoreFacility } from '../src/lib/scoring';

/**
 * 6차선 왕복도로 — 주변 도로 후보에서 고른다.
 *
 * 도로는 POI 가 아니라 장소검색으로 안 나와 도로명까지 손으로 쳐야 했다.
 * 사업지 둘레를 훑어 후보를 주고, 고르면 지도가 그 지점 로드뷰로 간다.
 * 상관없는 도로는 ×로 지운다 — 지우면 아래 것이 올라온다.
 *
 * 차로수는 어떤 원천에도 없다. 로드뷰로 세어 숫자만 넣으면 판정이 끝난다.
 */
const S = {
  box: { border: `1px solid ${T.line}`, borderRadius: 8, background: '#fff', padding: '12px 14px', marginBottom: 10 },
  head: { fontSize: 12.5, fontWeight: 700, marginBottom: 8 },
  note: { fontSize: 11, color: T.muted, fontWeight: 400, lineHeight: 1.55, display: 'block', marginTop: 4 },
  row: (on) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', marginBottom: 5, borderRadius: 6,
    border: `1px solid ${on ? T.accent : T.line}`,
    background: on ? T.accentSoft : '#fff',
  }),
  pick: { flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 },
  name: { fontSize: 12.5, fontWeight: 700, color: T.ink },
  badge: (rank) => ({
    fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
    background: rank === 0 ? '#e7f0ff' : rank === 1 ? T.okSoft : '#f1f3f5',
    color: rank === 0 ? T.accent : rank === 1 ? T.ok : T.muted,
  }),
  hint: { fontSize: 11, color: T.muted, flex: 1, minWidth: 110 },
  dist: { fontSize: 11.5, fontWeight: 700, color: T.ink2, whiteSpace: 'nowrap' },
  del: { border: 0, background: 'none', color: T.muted, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 4px' },
  msg: { fontSize: 11.5, color: T.muted, padding: '6px 0' },
  mapTag: { marginLeft: 8, fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentSoft, border: `1px solid #c8d5fb`, padding: '2px 8px', borderRadius: 4 },
  applied: { fontSize: 10.5, fontWeight: 700, color: T.ok, background: T.okSoft, border: `1px solid #c7e9d5`, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' },
  applyBar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8, padding: '10px 12px', borderRadius: 6, background: T.accentSoft, border: `1px solid ${T.accent}` },
  applyTxt: { flex: 1, minWidth: 200, fontSize: 12, color: T.ink2 },
  applyBtn: { padding: '8px 16px', borderRadius: 6, border: 0, background: T.accent, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  undo: { border: 0, background: 'none', color: T.accent, cursor: 'pointer', fontSize: 11.5, textDecoration: 'underline', padding: 0 },
  more: { border: '1px solid #e2e5ea', background: '#fff', color: T.ink2, cursor: 'pointer', fontSize: 11.5,
          borderRadius: 5, padding: '4px 10px', alignSelf: 'flex-start' },

  lanes: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 6, background: '#f7f9fb', border: `1px solid ${T.line}`, flexWrap: 'wrap' },
  lbl: { fontSize: 12, fontWeight: 700, color: T.ink2 },
  step: { width: 28, height: 28, borderRadius: 5, border: `1px solid ${T.lineStrong}`, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: T.ink2 },
  num: { width: 46, textAlign: 'center', fontSize: 15, fontWeight: 800, color: T.ink },
  quick: { display: 'flex', gap: 0, border: `1px solid ${T.lineStrong}`, borderRadius: 6, overflow: 'hidden' },
  quickBtn: (on) => ({
    width: 34, padding: '5px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', border: 0,
    background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink2,
    boxShadow: on ? `inset 0 -2px 0 ${T.accent}` : 'none',
  }),
  check: { display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 12px', alignSelf: 'stretch', cursor: 'pointer' },
  checkBox: { width: 16, height: 16, cursor: 'pointer', accentColor: T.accent },
  bulk: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '4px 0 8px' },
  bulkNote: { fontSize: 11.5, color: T.ink2 },
  bulkBtn: { padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
             border: `1px solid ${T.line}`, background: '#fff', color: T.ink2 },
  verdict: (ok) => ({
    marginLeft: 'auto', fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 5,
    background: ok ? T.okSoft : T.warnSoft, color: ok ? T.ok : T.warn,
    border: `1px solid ${ok ? '#c7e9d5' : '#f0dcb4'}`,
  }),
};

/** 구간표(config/scoring.json)로 점수를 낸다 */
export const roadScore = (m) => scoreFacility('6차선 왕복도로', m);

/**
 * **목록에 없는 것이 지도에 있으면 안 된다**(사용자 지적 2026-09-24).
 * 전에는 지도가 「대로·로 전부」 를 제 규칙으로 찍어, 목록에서 지우거나 접은 것과 갈렸다.
 * 이제 **체크한 것만** 지도(와 엑셀 지도)에 나간다 — 화면과 지도가 같은 함수를 본다.
 *
 * **기본값을 「대로·로 전부」로 두었더니 그것대로 문제였다**(사용자 지적 2026-09-24, 두 번째).
 * 도로를 점이 아니라 **선**으로 그리기 시작하면서 34곳이 지도를 뒤덮었다 —
 * 핀 시절엔 점 34개라 견뎠지만 선 34줄은 사업지가 어디인지도 안 보인다.
 * 그래서 손대지 않았을 때의 기본은 **가까운 대로·로 5곳**이다.
 * 고를 만큼은 보이되 덮이지는 않는 수다. 더 보려면 체크하면 된다.
 */
export const DEFAULT_SHOWN = 5;

/** 지도에 나갈 도로명 집합 — 화면·지도·엑셀이 이 하나만 본다 */
export function shownSet(value, rows) {
  const dismissed = value?.dismissed ?? [];
  const list = value?.shown;
  if (Array.isArray(list)) return new Set(list.filter(n => !dismissed.includes(n)));
  return new Set((rows ?? [])
    .filter(r => !dismissed.includes(r.name) && r.rank <= 1)
    .slice(0, DEFAULT_SHOWN)
    .map(r => r.name));
}

/** 한 줄만 볼 때 — 목록이 크면 `shownSet` 을 한 번 만들어 쓸 것 */
export const roadShown = (value, r, rows = null) => shownSet(value, rows).has(r.name);

export default function RoadPicker({ coord, radius = 300, polygon = null, value, onChange, onRoads, onPreview }) {
  const [rows, setRows] = useState(null);
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(null);
  const dismissed = value?.dismissed ?? [];
  // 고르는 것과 적용하는 것을 나눈다 — 눌러보며 로드뷰로 확인한 뒤 [적용] 해야
  // 평가표와 지도에 박힌다. 누르자마자 반영되면 되돌리기가 번거롭다.
  const [sel, setSel] = useState(null);

  /* 배열을 그대로 의존성에 넣으면 렌더마다 새 배열이라 계속 다시 훑는다 */
  const polyKey = JSON.stringify(polygon ?? null);

  useEffect(() => {
    if (!coord?.x || !coord?.y) return;
    let dead = false;
    setRows(null); setSrc(null); setErr(null);
    // 구간표의 가장 먼 구간(1km)까지 훑는다. 조금 더 봐야 경계 밖도 눈에 들어온다
    /* 경계가 있으면 경계 최단거리로 잰다 — 중심점 기준이면 도로가 붙어 있어도 멀게 나온다 */
    const poly = (polygon?.length >= 3)
      ? `&poly=${polygon.map(pt => `${pt.lng},${pt.lat}`).join(';')}` : '';
    fetch(`/api/roads?x=${coord.x}&y=${coord.y}&radius=${Math.round(radius * 1.2)}${poly}`)
      .then(r => r.json())
      .then(j => {
        if (dead) return;
        if (j.error) { setErr(j.error); return; }
        setRows(j.roads ?? []);
        setSrc(j.source ?? null);
        /* 지도에 그릴 수 있게 위로 올린다 — 원천(선형/격자)도 같이 올려야 문구가 갈린다 */
        onRoads?.(j.roads ?? [], j.source ?? null);
      })
      .catch(e => !dead && setErr(e.message));
    return () => { dead = true; };
  }, [coord?.x, coord?.y, radius, polyKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * **기본은 대로·로만 편다**(사용자 지적 2026-09-17).
   * 실측(성동구 용답동 1km): 후보 53곳 중 대로 2 · 로 8 · 길/번길 43.
   * 6차선이 될 수 있는 것은 사실상 대로·로뿐인데 길이 43줄을 먹어 목록이 못 읽힌다.
   */
  const [showSmall, setShowSmall] = useState(false);
  const set = (patch) => onChange?.({ ...(value ?? {}), ...patch });
  const kept = (rows ?? []).filter(r => !dismissed.includes(r.name));
  const smallCount = kept.filter(r => r.rank > 1).length;
  const visible = showSmall ? kept : kept.filter(r => r.rank <= 1);
  // 지도에 찍히는 것은 큰 도로(대로·로)만 — 길·번길까지 찍으면 핀에 덮인다
  const shown = shownSet(value, rows);
  const lanes = value?.lanes ?? 0;
  const verdict = scoreFacility('6차선 왕복도로', value);

  return (
    <div style={S.box}>
      <div style={S.head}>
        반경 {Math.round(radius * 1.2)}m 도로 후보 — 판정 대상을 고르세요
        {shown.size > 0 && (
          <span style={S.mapTag}>
            아래 지도에 {shown.size}곳 표시 중
            {!Array.isArray(value?.shown) && kept.filter(r => r.rank <= 1).length > shown.size
              ? ` (기본 — 가까운 대로·로 ${DEFAULT_SHOWN}곳)` : ''}
          </span>
        )}
        <span style={S.note}>
          법정 도로 유형 기준 (도로명주소법 시행령 §3) — 대로 = 폭 40m↑ <b>또는</b> 왕복 8차로↑ ·
          로 = 폭 12~40m <b>또는</b> 왕복 2~7차로 · 길 = 그 밖의 도로.
          다만 같은 영 §8②1 단서가 <b>대로↔로, 로↔길을 바꿔 쓸 수 있게</b> 열어두었고
          도로명은 구간 설정 시점 기준이라, <b>이름으로 차로수를 단정할 수 없습니다.</b>
          아래 로드뷰로 세어 차선 수만 넣으면 판정됩니다.
          <br />{src?.method === 'geometry' ? (
            <>
              <b>거리는 {rows?.[0]?.basis === 'polygon' ? '사업지 경계' : '대표지번 중심'}에서
              도로 선까지의 최단거리</b>입니다 — 도로의 실제 선형 좌표를 받아 잽니다(±5m).
              지도에 <b>도로가 선으로</b> 그려지므로 배지 거리와 그림이 어긋나지 않습니다.
              <br />출처 : {src.name}
            </>
          ) : (
            <>
              <b>거리는 {rows?.[0]?.basis === 'polygon' ? '사업지 경계' : '대표지번 중심'}에서 격자로 훑은
              표본점까지</b>입니다 — 도로 중심선이 아니라 <b>그 도로에 접한 필지</b>입니다.
              큰 필지(골프장·공장·학교)에서는 도로와 크게 어긋날 수 있습니다.
              ± 가 격자 간격, 곧 거리의 오차 한계입니다.
              {src?.fellBack ? <><br /><b style={{ color: T.warn }}>{src.fellBack}</b></> : null}
            </>
          )}
        </span>
      </div>

      {err && <div style={{ ...S.msg, color: T.warn }}>도로명 조회 실패: {err}</div>}
      {!rows && !err && <div style={S.msg}>주변 도로를 훑는 중…</div>}
      {rows?.length === 0 && <div style={S.msg}>주변에서 도로명을 찾지 못했습니다.</div>}

      <div style={S.bulk}>
        <span style={S.bulkNote}>
          지도·엑셀에 <b>{shown.size}곳</b> 표시 중
        </span>
        <button style={S.bulkBtn}
          onClick={() => set({ shown: kept.filter(r => r.rank <= 1).map(r => r.name) })}>
          대로·로 전체 ({kept.filter(r => r.rank <= 1).length})
        </button>
        <button style={S.bulkBtn} onClick={() => set({ shown: [] })}>모두 해제</button>
        {smallCount > 0 && (
          <button style={{ ...S.more, margin: 0 }} onClick={() => setShowSmall(v => !v)}>
            {showSmall ? `길·번길 ${smallCount}곳 접기` : `길·번길 ${smallCount}곳 더 보기`}
          </button>
        )}
      </div>

      {visible.map(r => {
        const applied = value?.name === r.name;
        const on = applied || sel?.name === r.name;
        // 어느 점수 구간에 드는지 미리 보여준다 (6차선이라고 가정한 값)
        const band = scoreFacility('6차선 왕복도로', { distance: r.distance, lanes: 6 });
        return (
          <div key={r.name} style={S.row(on)}>
            {/*
              **체크 영역은 넓게**(사용자 요청) — 작은 네모만 누를 수 있으면 잘 안 눌린다.
              label 로 감싸 체크박스 + 그 둘레 패딩까지 클릭 영역이 된다.
              행의 나머지(도로 이름·거리)는 기존대로 로드뷰를 옮기는 자리다 — 둘을 겹치지 않는다.
            */}
            <label style={S.check} title={`지도·엑셀에 ${shown.has(r.name) ? '표시 중' : '표시하지 않음'}`}>
              <input type="checkbox" style={S.checkBox} checked={shown.has(r.name)}
                onChange={() => {
                  const cur = (rows ?? []).filter(x => roadShown(value, x)).map(x => x.name);
                  const next = cur.includes(r.name) ? cur.filter(n => n !== r.name) : [...cur, r.name];
                  set({ shown: next });
                }} />
            </label>
            <button
              style={S.pick}
              onClick={() => { setSel(r); onPreview?.(r); }}
            >
              <span style={S.name}>{r.name}</span>
              <span style={S.badge(r.rank)}>{r.grade}</span>
              {applied && <span style={S.applied}>적용됨</span>}
              <span style={S.hint}>{r.hint ?? ''}</span>
              <span style={{ ...S.dist, color: band.score > 1 ? T.ink2 : T.muted }}
                    title={`${r.basis === 'polygon' ? '사업지 경계' : '대표지번 중심'}에서 잰 거리입니다.`
                      + ` 격자로 ${r.precision ?? '?'}m 간격으로 훑었으므로 그만큼 오차가 있습니다`
                      + ' — 도로 중심선이 아니라 그 도로에 접한 지점까지입니다'}>
                {r.distance}m
                {r.precision != null && (
                  <span style={{ color: T.muted, fontWeight: 400 }}> ±{r.precision}</span>
                )}
                {' · '}6차선이면 {band.score}점
              </span>
            </button>
            <button
              style={S.del}
              title="이 도로를 목록에서 지웁니다"
              onClick={() => {
                if (sel?.name === r.name) setSel(null);
                set({
                dismissed: [...dismissed, r.name],
                // 지운 것이 고른 것이면 선택도 푼다
                ...(value?.name === r.name ? { name: null, distance: null } : {}),
              }); }}
            >×</button>
          </div>
        );
      })}

      {sel && sel.name !== value?.name && (
        <div style={S.applyBar}>
          <span style={S.applyTxt}>
            <b>{sel.name}</b> · {sel.distance}m — 로드뷰로 확인했으면 적용하세요
          </span>
          <button
            style={S.applyBtn}
            onClick={() => {
              /*
                적용한 도로가 지도에 없으면 판정 근거가 안 보인다 — 체크를 같이 켠다.
                **아직 체크를 손대지 않았으면 적용한 도로만 남긴다** — 판정 근거가 그 한 줄이라
                증빙 지도에 다른 후보가 같이 그려져 있을 이유가 없다.
                이미 골라둔 것이 있으면 **지우지 않는다**(조용히 비우면 고른 것이 날아간다).
              */
              const cur = Array.isArray(value?.shown) ? [...shown] : [];
              set({
                name: sel.name, distance: sel.distance, x: sel.x, y: sel.y,
                /*
                  **거리를 무엇으로 쟀는지 값과 같이 들고 간다.**
                  엑셀 증빙은 화면 상태만 받으므로, 여기서 안 실으면
                  출처 줄이 「카카오 좌표→주소 역산」으로 박힌 채 나간다(실제로 그랬다).
                */
                source: src?.name ?? null,
                method: src?.method ?? null,
                precision: sel.precision ?? null,
                shown: cur.includes(sel.name) ? cur : [...cur, sel.name],
                // 도로가 바뀌면 차선 수는 다시 센다 — 앞 도로 값을 물려받으면 판정이 틀린다
                lanes: 0,
              });
              setSel(null);
            }}
          >이 도로로 적용</button>
        </div>
      )}

      {dismissed.length > 0 && (
        <button style={S.undo} onClick={() => set({ dismissed: [] })}>
          숨긴 도로 {dismissed.length}개 되돌리기
        </button>
      )}

      {value?.name && (
        <div style={S.lanes}>
          <span style={S.lbl}>{value.name} · 왕복</span>
          {/*
            **＋ 를 여섯 번 눌러야 6차선이 됐다.** 게다가 같은 화면(교통환경 시트)의 지도 바에도
            글자가 똑같은 [＋][－] 가 있어(확대·축소) 어느 쪽이 차선인지 헷갈렸다 —
            실측 점검에서 확대만 여섯 번 되고 차선은 0 인 채로 넘어갔다.
            왕복 차선은 실무상 2·4·6·8 로 떨어지므로 **한 번에 고르게** 하고,
            스테퍼는 그 사이 값(3·5·10)을 위해 남기되 글자를 지도 버튼과 다르게 한다.
          */}
          <span style={S.quick}>
            {[2, 4, 6, 8].map(n => (
              <button key={n} style={S.quickBtn(lanes === n)} onClick={() => set({ lanes: n })}>{n}</button>
            ))}
          </span>
          <button style={S.step} title="한 차선 줄이기"
            onClick={() => set({ lanes: Math.max(0, lanes - 1) })}>▼</button>
          <span style={S.num}>{lanes || '?'}</span>
          <button style={S.step} title="한 차선 늘리기"
            onClick={() => set({ lanes: lanes + 1 })}>▲</button>
          <span style={S.lbl}>차선</span>
          <span style={{ fontSize: 11, color: T.muted }}>로드뷰로 세어 넣으세요</span>
          <span style={S.verdict(verdict.score > 1)}>
            {verdict.score}점 · {verdict.label}
            <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.85 }}>({verdict.reason})</span>
          </span>
        </div>
      )}
    </div>
  );
}
