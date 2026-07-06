import type { Metadata } from 'next'
import { WeightTicketDashboardPageClient } from '@/components/daily/WeightTicketDashboardPageClient'

export const metadata: Metadata = {
  title: 'Dashboard ใบรับ-ส่งของ | NS Scrap ERP',
}

export default function WeightTicketDashboardPage() {
  return <WeightTicketDashboardPageClient />
}
