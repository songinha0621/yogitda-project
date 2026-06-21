import './globals.css'

export const metadata = {
  title: '할인모아 - 내가 찾던 핫딜,할인을 힌곳에',
  description: '내가 찾던 할인, 페이백을 모으다',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  )
}