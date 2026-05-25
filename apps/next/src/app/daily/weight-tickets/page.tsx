import type { Metadata } from 'next'
import { WeightTicketsPageClient } from '@/components/daily/WeightTicketsPageClient'

export const metadata: Metadata = {
  title: 'ชั่งสินค้า / รับ-ส่งของ | NS Scrap ERP',
}

export default function WeightTicketsPage() {
  return <WeightTicketsPageClient />
}
