'use client';
import { useState } from 'react';
import { T, mono } from './theme';
import { districtFloor } from '../src/lib/scoring';

/**
 * **사업지구 줄** — 주소 칸 바로 아래에서 「이 사업지가 수용·환지 사업지구 안인가, 지구면적은」 을 확정한다.
 *
 * 교통환경·주거편의에는 단서가 있다 — 수용·환지 방식 사업지구는 **지구면적별로 등급 하한**이 선다
 * (500만㎡↑ 매우양호 · 100만㎡↑ 양호 이상 · 50만㎡↑ 보통 이상 · 그 밖 열악 이상).
 * 그래서 **주소를 고르는 자리에서** 같이 고른다(사용자 지시 2026-09-28 — 「주소 검색하는 그리드에서」).
 *
 * · 원천이 면적을 주면 **바로 보여 준다**(택지정보시스템 사업지구경계 — 경계에서 계산).
 *   **지구단위계획구역은 후보로 내지 않는다** — 계획 구역이지 사업지구가 아니다(사용자 지적 2026-09-28).
 * · 원천에 없으면 **직접 입력**한다.
 * · 개발방식(수용/환지)은 원천에 필드가 없다 — 이름으로 추정해 미리 골라 둘 뿐, 확정은 사람이 한다.
 *
 * 값은 `manual['사업지구']` 에 둔다 — 6차선 도로 판정처럼 **수기 판정**이고, 보관·엑셀·점수가 이미 그 길로 흐른다.
 *   { status: 'yes'|'no'|null, pick: 후보id|'custom'|'none', name, area, areaBasis, source, auto, scan }
 */
const S = {
  row: (need) => ({
    marginTop: 12, padding: '11px 14px', borderRadius: 8,
    border: need ? '2px solid #d98324' : `1px solid ${T.line}`,
    background: need ? '#fffaf2' : '#fbfcfd',
  }),
  head: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 12.5, fontWeight: 800, color: T.ink },
  sub: { fontSize: 11.5, color: T.muted },
  must: { padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 800, background: '#fdecd8', color: '#8a5008' },
  chips: { display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9, alignItems: 'center' },
  yes: { fontSize: 11.5, fontWeight: 700, color: T.muted, marginLeft: 8 },
  /* 고른 상태는 옅게(accentSoft + 밑줄) — 실행 버튼과 섞이지 않게 */
  chip: (on) => ({
    padding: '6px 12px', fontSize: 12, fontWeight: on ? 800 : 600, borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : '#fff',
    color: on ? T.accent : T.ink2, textDecoration: on ? 'underline' : 'none', textUnderlineOffset: 3,
    display: 'inline-flex', gap: 6, alignItems: 'baseline',
  }),
  area: { ...mono, fontWeight: 800 },
  facts: { fontSize: 12, color: T.ink2, marginTop: 8, lineHeight: 1.7 },
  dates: { display: 'block', ...mono, color: T.ink2 },
  tagAuto: { fontSize: 10, fontWeight: 800, color: T.ok, background: T.okSoft, padding: '1px 6px', borderRadius: 3 },
  line2: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 12 },
  lab: { fontSize: 11, fontWeight: 700, color: T.muted },
  input: (need) => ({
    padding: '6px 9px', fontSize: 13, borderRadius: 6, width: 150, textAlign: 'right', ...mono,
    border: need ? '2px solid #d98324' : `1px solid ${T.line}`, background: need ? '#fffaf2' : '#fff',
  }),
  nameInput: { padding: '6px 9px', fontSize: 13, borderRadius: 6, width: 220, border: `1px solid ${T.line}` },
  floor: (lift) => ({
    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 800,
    background: lift ? T.okSoft : '#f1f3f5', color: lift ? T.ok : T.ink2,
  }),
  basis: { fontSize: 11.5, color: T.muted, marginTop: 7, lineHeight: 1.55 },
  warn: { fontSize: 11.5, color: T.warn, marginTop: 7, lineHeight: 1.55 },
};

const fmt = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)).toLocaleString('ko-KR') : '');

export default function DistrictRow({ value, loading, error, onChange, onRetry }) {
  const v = value ?? {};
  const scan = v.scan ?? null;
  const cands = scan?.candidates ?? [];
  const [draft, setDraft] = useState(null);   // 면적 입력 중인 글자 (쉼표 포함)

  const choose = (patch) => onChange({ ...v, auto: false, ...patch });
  const pickCand = (c) => choose({
    status: 'yes', pick: c.id, name: c.name, area: c.area, areaBasis: c.areaBasis, source: c.source,
  });
  const fl = districtFloor(v);
  const needPick = v.status == null;
  const needArea = v.status === 'yes' && !(Number(v.area) > 0);
  const cur = cands.find(c => c.id === v.pick);

  return (
    <div style={S.row(needPick || needArea)} data-district-row>
      <div style={S.head}>
        {/*
          **「해당 없음」 이 무엇에 해당하지 않는지 말하지 않았다**(사용자 지적 2026-09-28 「해당이 뭐냐」).
          줄 제목을 질문으로 바꾸고 답을 [아니오 — 사업지구 밖] / 예 — [이 지구] 로 단다.
        */}
        <span style={S.title}>이 사업지가 수용·환지 방식 사업지구 안에 있습니까?</span>
        {(needPick || needArea) && <span style={S.must}>필수</span>}
        {/* 자동으로 골랐다는 표시는 제목 줄에 — 버튼 줄 끝에 두니 버튼으로 보였다 */}
        {v.auto && v.status && <span style={S.tagAuto}>원천에서 자동 선택 — 다르면 바꾸세요</span>}
        <span style={S.sub}>
          안에 있으면 지구면적에 따라 교통환경·주거편의의 최저 등급이 정해집니다
        </span>
      </div>

      {loading && <div style={S.basis}>택지정보시스템 · 도시계획정보 · 토지이용계획에서 찾는 중…</div>}
      {error && (
        <div style={S.warn}>
          원천 조회 실패 — {error}{' '}
          <button style={S.chip(false)} onClick={onRetry}>다시 찾기</button>{' '}
          아래에서 직접 고르거나 입력하세요.
        </div>
      )}

      <div style={S.chips}>
        <button style={S.chip(v.status === 'no')} onClick={() => choose({ status: 'no', pick: 'none', name: null, area: null, areaBasis: null, source: null })}>
          아니오 — 사업지구 밖
        </button>
        <span style={S.yes}>예 — 이 지구 안 :</span>
        {cands.map(c => (
          <button key={c.id} style={S.chip(v.pick === c.id)} onClick={() => pickCand(c)}
            title={`${c.source} · ${c.areaBasis}`}>
            <span>{c.name}</span>
            <span style={S.area}>{fmt(c.area)}㎡</span>
            {(c.detail?.completed || c.status) && (
              <span style={{ fontSize: 10.5, color: T.muted, fontWeight: 600 }}>
                {c.detail?.completed ? `준공${c.status === '준공' ? '' : '(예정)'} ${c.detail.completed}` : c.status}
              </span>
            )}
          </button>
        ))}
        <button style={S.chip(v.pick === 'custom')}
          onClick={() => choose({ status: 'yes', pick: 'custom', name: v.pick === 'custom' ? v.name : '', area: v.pick === 'custom' ? v.area : null, areaBasis: '직접 입력', source: '실무자 입력' })}>
          {cands.length ? '목록에 없음 · 직접 입력' : '직접 입력'}
        </button>
      </div>

      {/*
        **판정하지 않고 사실만 보여 준다**(사용자 지시 2026-09-29 「준공여부로 따지지 말고 그냥 정보 있으면 보여줘.
        언제 땅 시행 완료시기만 보여줘 그럼 판단할수있어」). 고르기 전에 읽혀야 하므로 칩 바로 아래, 지구마다 한 줄.
      */}
      {cands.map(c => c.detail && (
        <div key={c.id} style={S.facts}>
          <b>{c.name}</b>
          {c.detail.law && <> · {c.detail.law}</>}
          {c.detail.newtown && <> · {c.detail.newtown}</>}
          {c.detail.stage && <> · {c.detail.stage}</>}
          {c.operator && <span style={{ color: T.muted }}> · 시행 {c.operator}</span>}
          <span style={S.dates}>
            지구지정 {c.detail.designated ?? '—'} · 개발계획 {c.detail.devPlan ?? '—'} · 실시계획 {c.detail.execPlan ?? '—'} ·{' '}
            <b style={{ color: T.ink }}>준공{c.detail.stage === '준공' ? '' : '(예정)'} {c.detail.completed ?? '—'}</b>
          </span>
        </div>
      ))}

      {v.status === 'yes' && (
        <div style={S.line2}>
          {v.pick === 'custom' && (
            <>
              <span style={S.lab}>지구명</span>
              <input style={S.nameInput} value={v.name ?? ''} placeholder="지구명"
                onChange={(e) => choose({ name: e.target.value })} />
            </>
          )}
          <span style={S.lab}>지구면적</span>
          <input style={S.input(needArea)} inputMode="numeric" placeholder="입력"
            value={draft ?? fmt(v.area)}
            onFocus={() => setDraft(fmt(v.area))}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value.replace(/[^\d.]/g, ''));
              choose({ area: n > 0 ? n : null, areaBasis: n > 0 && cur && n !== cur.area ? '직접 수정' : v.areaBasis });
            }}
            onBlur={() => setDraft(null)} />
          <span style={S.lab}>㎡</span>
          {fl ? (
            <span style={S.floor(fl.score >= 4)}>
              교통환경·주거편의 최저 등급 : {fl.floor}{fl.score < 5 ? ' 이상' : ''} ({fl.score}점)
            </span>
          ) : needArea ? <span style={{ ...S.sub, color: '#8a5008' }}>면적을 넣으면 최저 등급이 정해집니다</span> : null}
        </div>
      )}

      {/* 무엇을 근거로 골랐는지 — 원천·면적 계산 방법·추정한 개발방식 */}
      {v.status === 'yes' && cur && (
        <div style={S.basis}>
          {/* 레이어 ID(lt_c_…)는 화면에 쓰지 않는다 — 괄호 앞 이름만 */}
          {String(cur.source).replace(/\(.*\)$/, '')} · 면적은 {v.areaBasis ?? cur.areaBasis}
          {cur.law && cur.method && <> · {cur.law} — {cur.method} 방식</>}
        </div>
      )}
      {/* 사업지구경계에는 없는데 필지 토지이용계획이 사업지구라고 하면 — 면적은 원천에 없으니 직접 넣게 한다 */}
      {scan && cands.length === 0 && scan.landUseKind && (
        <div style={S.warn}>
          필지 토지이용계획상 {scan.landUseKind.kind} 안입니다 — 사업지구경계 원천에 이 지구가 없어 면적을 모릅니다.
          안에 있다면 [직접 입력] 으로 지구면적을 넣으세요.
        </div>
      )}
      {scan && (
        <div style={S.basis}>
          {scan.landUse?.length
            ? <>필지 토지이용계획 : {scan.landUse.join(' · ')}</>
            : cands.length === 0 ? '사업지구경계 · 토지이용계획 어디에도 사업지구가 잡히지 않았습니다' : null}
          {scan.errors?.length > 0 && <> · 일부 원천 실패({scan.errors.length})</>}
        </div>
      )}
    </div>
  );
}

/**
 * 원천 결과로 **처음 값**을 정한다 — 이미 사람이 고른 값이 있으면 건드리지 않는다.
 *   · 사업지구가 잡히면 → **고르지 않는다** — 지정일~준공(예정)일을 보여 주고 실무자가 고른다
 *   · 원천 세 곳 모두 아무것도 없으면 → 「아니오 — 사업지구 밖」 을 미리 고른다
 *   · 토지이용계획만 사업지구라고 하면(경계 원천에 없는 도시개발구역 등) → **고르지 않는다** — 면적을 사람이 넣는다
 */
export function initialDistrict(scan, key) {
  const base = { scan, key, auto: true };
  /*
    **사업지구가 잡히면 미리 고르지 않는다**(사용자 지시 2026-09-29 「준공여부로 따지지 말고 그냥 정보 있으면 보여줘」).
    전에는 「공공 시행자면 예」 · 「준공이면 아니오」 를 미리 골랐는데 둘 다 규정 원문 없이 만든 규칙이었다.
    지정일~준공(예정)일을 칩 아래에 보여 주고 실무자가 고른다.
    원천 어디에도 사업지구가 없을 때만 「아니오 — 사업지구 밖」 을 미리 고른다(판단할 거리가 없다).
  */
  if (scan?.nothing) return { ...base, status: 'no', pick: 'none' };
  return { ...base, status: null, pick: null, auto: false };
}

/** 접힌 요약 줄·다른 단계에서 쓰는 한 줄 표기 */
export function districtLabel(v) {
  if (!v || v.status == null) return null;
  if (v.status === 'no') return '수용·환지 사업지구 밖';
  const fl = districtFloor(v);
  const done = v.scan?.candidates?.find(c => c.id === v.pick)?.detail?.completed;
  return `${v.name || '사업지구'} ${fmt(v.area) || '?'}㎡${done ? ` (준공 ${done})` : ''}${fl ? ` · 최저 ${fl.floor}` : ''}`;
}
