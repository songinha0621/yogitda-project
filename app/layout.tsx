import './globals.css'

export const metadata = {
  title: '쌓인다 - 내가 찾던 핫딜, 할인',
  description: '내가 찾던 할인, 페이백이 쌓인다!',
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