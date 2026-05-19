import type { Metadata } from 'next'
import { TradingDashboardPageClient } from '@/components/trading/TradingDashboardPageClient'

export const metadata: Metadata = {
  title: 'Trading Dashboard | NS Scrap ERP',
}

export default function TradingDashboardPage() {
  return <TradingDashboardPageClient />
}
