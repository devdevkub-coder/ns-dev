import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { DailyExpensePageClient } from '@/components/daily/DailyExpensePageClient'

export const metadata: Metadata = {
  title: 'Dashboard ค่าใช้จ่าย | NS Scrap ERP',
}

export default function DailyExpenseDashboardPage() {
  return (
    <>
      <PageTitleOverride
        subtitle="สรุปแต่ละหมวดเทียบเดือนย้อนหลัง และตรวจหาความผิดปกติเทียบค่าเฉลี่ย"
        title="Dashboard ค่าใช้จ่าย"
      />
      <DailyExpensePageClient dashboardOnly />
    </>
  )
}
