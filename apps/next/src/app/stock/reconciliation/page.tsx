import type { Metadata } from 'next'
import { StockReconciliationPageClient } from '@/components/stock/StockReconciliationPageClient'

export const metadata: Metadata = {
  title: 'Stock Reconciliation | NS Scrap ERP',
}

export default function StockReconciliationPage() {
  return <StockReconciliationPageClient />
}
