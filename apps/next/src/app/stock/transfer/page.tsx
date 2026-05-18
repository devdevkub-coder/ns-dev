import type { Metadata } from 'next'
import { StockTransferPageClient } from '@/components/daily/StockTransferPageClient'

export const metadata: Metadata = {
  title: 'โอนสินค้าระหว่างสาขา | NS Scrap ERP',
}

export default function StockTransferPage() {
  return <StockTransferPageClient />
}
