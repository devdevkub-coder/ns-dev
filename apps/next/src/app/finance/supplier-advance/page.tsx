import type { Metadata } from 'next'
import { SupplierAdvancePageClient } from '@/components/finance/SupplierAdvancePageClient'

export const metadata: Metadata = {
  title: 'Supplier Advance | NS Scrap ERP',
}

export default function SupplierAdvancePage() {
  return <SupplierAdvancePageClient />
}
