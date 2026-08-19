import type { Metadata } from 'next'
import { Suspense } from 'react'
import { WarehouseKpiPageClient } from './WarehouseKpiPageClient'

export const metadata: Metadata = {
  title: 'ประเมิน KPI โกดัง | NS Scrap ERP',
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">กำลังโหลด...</div>}>
      <WarehouseKpiPageClient />
    </Suspense>
  )
}
