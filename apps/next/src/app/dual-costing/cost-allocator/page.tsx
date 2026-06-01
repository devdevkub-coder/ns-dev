import type { Metadata } from 'next'
import { CostAllocatorPageClient } from '@/components/dual-costing/CostAllocatorPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'Cost Allocator | NS Scrap ERP',
}

export default function CostAllocatorPage() {
  return (
    <>
      <PageTitleOverride subtitle="เลือกดีลขายและ preview การหยิบต้นทุนจาก Cost Pool" title="Cost Allocator" />
      <CostAllocatorPageClient />
    </>
  )
}
