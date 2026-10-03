export const metadata = {
  title: 'PF보증 심사평가 시뮬레이터',
  description: '사업장 주소로 PF보증 심사 통계·증빙을 모으고 초기예상분양률 · 심사평점표까지 산정합니다',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
