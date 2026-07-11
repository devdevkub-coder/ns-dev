import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginPageClient } from '@/app/login/LoginPageClient'

export const metadata: Metadata = {
  title: 'Login | NS Scrap ERP',
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageClient />
    </Suspense>
  )
}
