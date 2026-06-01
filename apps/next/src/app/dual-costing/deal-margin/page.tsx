import type { Metadata } from 'next'
import { DealMarginPageClient } from '@/components/dual-costing/DealMarginPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'Deal Margin Report | NS Scrap ERP',
}

export default function DealMarginPage() {
  return (
    <>
      <PageTitleOverride subtitle="วิเคราะห์กำไรต่อดีลจาก matched revenue และต้นทุนจริง" title="Deal Margin Report" />
      <DealMarginPageClient />
    </>
  )
}
