import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'NS Scrap ERP',
  description: 'NS Scrap ERP Next.js application shell',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
