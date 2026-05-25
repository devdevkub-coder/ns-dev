import type { Metadata } from 'next'
import { WeightTicketListPageClient } from '@/components/daily/WeightTicketListPageClient'

export const metadata: Metadata = {
  title: 'รายการใบรับ-ส่งของ | NS Scrap ERP',
}

export default function WeightTicketListPage() {
  return <WeightTicketListPageClient />
}
