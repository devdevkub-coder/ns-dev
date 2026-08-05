import type { Metadata, Viewport } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { AppShell } from '@/components/layout/AppShell'
import { ThemeProvider } from '@/components/theme-provider'
import { FormSafetyProvider } from '@/components/ui/FormSafetyProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'NS Scrap ERP',
  description: 'NS Scrap ERP Next.js application shell',
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  width: 'device-width',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
          <FormSafetyProvider>
            <AppShell>{children}</AppShell>
          </FormSafetyProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  )
}
