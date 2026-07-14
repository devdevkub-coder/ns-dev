import type { Metadata } from 'next'
import { CostPoolPageClient } from '@/components/dual-costing/CostPoolPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'กองต้นทุน | NS Scrap ERP',
}

export default function CostPoolPage() {
  return (
    <>
      <PageTitleOverride title="กองต้นทุน" />
      <CostPoolPageClient />
    </>
  )
}
