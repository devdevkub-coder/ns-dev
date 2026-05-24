import type { Metadata } from 'next'
import { WeightTicketsPageClient } from '@/components/daily/WeightTicketsPageClient'

export const metadata: Metadata = {
  title: 'ชั่งสินค้า (เข้า/ออก) | NS Scrap ERP',
}

export default function WeightTicketsPage() {
  return <WeightTicketsPageClient />
}
