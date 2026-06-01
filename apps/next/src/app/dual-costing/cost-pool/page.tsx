import type { Metadata } from 'next'
import { CostPoolPageClient } from '@/components/dual-costing/CostPoolPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'Cost Pool | NS Scrap ERP',
}

export default function CostPoolPage() {
  return (
    <>
      <PageTitleOverride subtitle="ติดตามต้นทุนคงเหลือต่อ lot ที่รอ match กับดีลขาย" title="Cost Pool" />
      <CostPoolPageClient />
    </>
  )
}
