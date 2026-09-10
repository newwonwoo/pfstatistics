'use client';
import { useEffect, useState } from 'react';
import { T, mono } from './theme';

/**
 * 원천 상태 배지.
 *
 * 통계누리·KB·금투협은 비공식 내부 엔드포인트라 사이트 개편 시 조용히 깨진다.
 * 골든값 재현 검사 결과를 화면 상단에 늘 띄워, 틀린 값이 심사에 흘러드는 걸 막는다.
 */
const S = {
  bar: (bad) => ({
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '8px 14px', borderRadius: 7, marginBottom: 14, fontSize: 12,
    background: bad ? T.errSoft : T.okSoft,
    border: `1px solid ${bad ? '#f0c4c1' : '#c7e9d5'}`,
    color: bad ? T.err : T.ok,
  }),
  dot: (bad) => ({ width: 7, height: 7, borderRadius: 7, background: bad ? T.err : T.ok }),
  strong: { fontWeight: 700 },
  meta: { marginLeft: 'auto', color: T.muted, fontSize: 11, ...mono },
  item: { fontSize: 11.5 },
};

export default function SourceHealth() {
  const [r, setR] = useState(null);

  useEffect(() => {
    fetch('/api/selftest')
      .then(res => res.json())
      .then(setR)
      .catch(() => setR({ healthy: false, summary: '점검 실패', failures: [] }));
  }, []);

  if (!r) return null;
  const bad = !r.healthy;

  return (
    <div style={S.bar(bad)}>
      <span style={S.dot(bad)} />
      <span style={S.strong}>
        {bad ? '원천 점검 실패' : '원천 정상'}
      </span>
      <span>{r.summary}</span>
      {bad && r.failures?.slice(0, 3).map(f => (
        <span key={f.indicatorId} style={S.item}>· {f.name}: {f.reason?.slice(0, 60)}</span>
      ))}
      <span style={S.meta}>
        {r.checkedAt ? new Date(r.checkedAt).toLocaleString('ko-KR') : ''}
      </span>
    </div>
  );
}
