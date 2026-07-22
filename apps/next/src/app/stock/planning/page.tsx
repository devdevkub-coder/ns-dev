import type { Metadata } from 'next'
import { StockPlanningPageClient } from '@/components/stock/StockPlanningPageClient'

export const metadata: Metadata = { title: 'วางแผนสต๊อก vs PO Sell | NS Scrap ERP' }

export default function StockPlanningPage() {
  return <StockPlanningPageClient />
}
