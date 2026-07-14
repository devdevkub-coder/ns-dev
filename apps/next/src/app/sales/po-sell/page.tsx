import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PoSellPageClient } from '@/components/sales/PoSellPageClient'

export const metadata: Metadata = {
  title: 'PO Sell | NS Scrap ERP',
}

export default function PoSellPage() {
  return (
    <Suspense>
      <PoSellPageClient />
    </Suspense>
  )
}
