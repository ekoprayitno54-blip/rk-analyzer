import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RK Analyzer • SPBU & LPG',
  description: 'Rekonsiliasi rekening koran, setoran, dan tebusan SPBU/LPG'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
