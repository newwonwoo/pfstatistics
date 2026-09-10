/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['xlsx'],
  // 수집기는 순수 fetch 기반이라 서버리스에서 그대로 돈다.
  // playwright 는 베르셀 서버리스에서 실행 불가하므로 번들에서 제외한다.
  // (증빙 캡쳐는 브라우저에서 html-to-image 로 처리)
  outputFileTracingExcludes: {
    '*': ['./node_modules/playwright/**', './node_modules/playwright-core/**', './out/**'],
  },
  // 시공능력평가 순위표는 런타임에 fs 로 읽으므로 배포 번들에 포함시킨다
  outputFileTracingIncludes: {
    '/api/collect': ['./data/constructor-rank.json', './config/indicators.json'],
  },
};
