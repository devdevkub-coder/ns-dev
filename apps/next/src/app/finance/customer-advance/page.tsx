import type { Metadata } from 'next'
import { CustomerAdvancePageClient } from '@/components/finance/CustomerAdvancePageClient'

export const metadata: Metadata = {
  title: 'Customer Advance | NS Scrap ERP',
}

export default function CustomerAdvancePage() {
  return <CustomerAdvancePageClient />
}
