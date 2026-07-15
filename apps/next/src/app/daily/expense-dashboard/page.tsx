import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { DailyExpensePageClient } from '@/components/daily/DailyExpensePageClient'

export const metadata: Metadata = {
  title: 'แดชบอร์ดค่าใช้จ่าย | NS Scrap ERP',
}

export default function DailyExpenseDashboardPage() {
  return (
    <>
      <PageTitleOverride
        title="แดชบอร์ดค่าใช้จ่าย"
      />
      <DailyExpensePageClient dashboardOnly />
    </>
  )
}
