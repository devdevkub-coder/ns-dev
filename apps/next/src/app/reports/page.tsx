import type { Metadata } from 'next'
import { ReportsIndexPageClient } from '@/app/reports/ReportsIndexPageClient'

export const metadata: Metadata = {
  title: 'รายงานทั้งหมด | NS Scrap ERP',
}

export default function ReportsPage() {
  return <ReportsIndexPageClient />
}
