import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FcdLedgerPageClient } from '@/components/finance/foreign/FcdLedgerPageClient'

export const metadata: Metadata = {
  title: 'FCD Ledger | NS Scrap ERP',
}

export default function FcdLedgerPage() {
  return (
    <Suspense>
      <FcdLedgerPageClient />
    </Suspense>
  )
}
