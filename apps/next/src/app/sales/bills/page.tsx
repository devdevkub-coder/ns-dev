import { Suspense } from 'react'
import type { Metadata } from 'next'
import { TransactionBillsPageClient } from '@/components/daily/TransactionBillsPageClient'

export const metadata: Metadata = {
  title: 'บิลขาย | NS Scrap ERP',
}

export default function SalesBillsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">กำลังโหลด...</div>}>
      <TransactionBillsPageClient mode="sales" />
    </Suspense>
  )
}
