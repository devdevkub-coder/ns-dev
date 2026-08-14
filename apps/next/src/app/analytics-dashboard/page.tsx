import { Suspense } from 'react'
import { MainDashboardsPageClient } from '@/components/main/MainDashboardsPageClient'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">กำลังโหลด...</div>}>
      <MainDashboardsPageClient mode="analytics-dashboard" />
    </Suspense>
  )
}
