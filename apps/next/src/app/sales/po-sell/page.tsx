import type { Metadata } from 'next'
import { PoSellPageClient } from '@/components/sales/PoSellPageClient'

export const metadata: Metadata = {
  title: 'PO Sell | NS Scrap ERP',
}

export default function PoSellPage() {
  return <PoSellPageClient />
}
