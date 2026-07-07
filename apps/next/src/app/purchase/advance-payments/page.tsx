import type { Metadata } from 'next'
import { AdvancePaymentsTabbedPageClient } from '@/components/purchase-flow/AdvancePaymentsTabbedPageClient'

export const metadata: Metadata = {
  title: 'เงินล่วงหน้า / มัดจำ | NS Scrap ERP',
}

export default function AdvancePaymentsPage() {
  return <AdvancePaymentsTabbedPageClient />
}
