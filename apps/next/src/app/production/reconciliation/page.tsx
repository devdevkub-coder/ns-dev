import type { Metadata } from 'next'
import { ProductionReconciliationPageClient } from '@/components/production/ProductionReconciliationPageClient'

export const metadata: Metadata = {
  title: 'Production Reconciliation | NS Scrap ERP',
}

export default function ProductionReconciliationPage() {
  return <ProductionReconciliationPageClient />
}
