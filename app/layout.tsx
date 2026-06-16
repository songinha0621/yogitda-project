import './globals.css'

export const metadata = {
  title: '요깄다 - 내가 찾던 핫딜, 할인',
  description: '내가 찾던 페이백, 할인 요깄다!',
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