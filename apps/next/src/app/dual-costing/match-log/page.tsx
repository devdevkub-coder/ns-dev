import type { Metadata } from 'next'
import { MatchLogPageClient } from '@/components/dual-costing/MatchLogPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export const metadata: Metadata = {
  title: 'Match Log | NS Scrap ERP',
}

export default function MatchLogPage() {
  return (
    <>
      <PageTitleOverride subtitle="บันทึกการ match ต้นทุนเพื่อ audit และตรวจสอบย้อนหลัง" title="Match Log" />
      <MatchLogPageClient />
    </>
  )
}
