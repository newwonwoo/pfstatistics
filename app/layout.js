export const metadata = {
  title: 'PF 보증심사 통계 자동수집',
  description: '시군구를 입력하면 심사에 필요한 통계와 증빙을 자동으로 수집합니다',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
