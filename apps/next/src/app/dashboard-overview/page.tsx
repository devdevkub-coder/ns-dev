import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MainDashboardsPageClient } from '@/components/main/MainDashboardsPageClient'

export const metadata: Metadata = {
  title: 'Dashboard Overview | NS Scrap ERP',
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">กำลังโหลด...</div>}>
      <MainDashboardsPageClient mode="dashboard" />
    </Suspense>
  )
}
