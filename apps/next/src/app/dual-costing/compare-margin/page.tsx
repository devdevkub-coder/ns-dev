import type { Metadata } from 'next'
import { CompareMarginPageClient } from '@/components/dual-costing/CompareMarginPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'Compare Deal vs Stock | NS Scrap ERP',
}

export default function CompareMarginPage() {
  return (
    <>
      <PageTitleOverride subtitle="เทียบผลกำไรจาก deal costing กับ stock costing เพื่อการบริหาร" title="Compare Deal vs Stock" />
      <CompareMarginPageClient />
    </>
  )
}
