import type { Metadata } from 'next'
import { MainDashboardsPageClient } from '@/components/main/MainDashboardsPageClient'

export const metadata: Metadata = {
  title: 'Dashboard Overview | NS Scrap ERP',
}

export default function Page() {
  return <MainDashboardsPageClient mode="dashboard" />
}
