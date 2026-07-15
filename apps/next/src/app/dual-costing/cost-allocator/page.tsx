import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CostAllocatorPageClient } from '@/components/dual-costing/CostAllocatorPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'จัดสรรต้นทุน | NS Scrap ERP',
}

export default function CostAllocatorPage() {
  return (
    <>
      <PageTitleOverride title="จัดสรรต้นทุน" />
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">กำลังโหลด...</div>}>
        <CostAllocatorPageClient />
      </Suspense>
    </>
  )
}
