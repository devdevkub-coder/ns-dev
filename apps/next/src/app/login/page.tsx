import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginPageClient } from '@/app/login/LoginPageClient'

export const metadata: Metadata = {
  title: 'Login | NS Scrap ERP',
}

export default function LoginPage() {
  const devLogin = process.env.NODE_ENV === 'production'
    ? undefined
    : {
        identifier: process.env.DEV_LOGIN_IDENTIFIER ?? '',
        password: process.env.DEV_LOGIN_PASSWORD ?? '',
      }

  return (
    <Suspense>
      <LoginPageClient devLogin={devLogin} />
    </Suspense>
  )
}
