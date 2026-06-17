'use client'

import { useState } from 'react'
import { BillSwapHistoryPageClient } from '@/components/daily/BillSwapHistoryPageClient'
import { TransactionBillsPageClient } from '@/components/daily/TransactionBillsPageClient'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type PurchaseBillsTab = 'bills' | 'supplier-swap-history'

export function PurchaseBillsPageClient({ initialTab = 'bills' }: { initialTab?: PurchaseBillsTab }) {
  const [tab, setTab] = useState<PurchaseBillsTab>(initialTab)

  function switchTab(value: PurchaseBillsTab) {
    setTab(value)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', value === 'supplier-swap-history' ? '/purchase/bills?tab=supplier-swap-history' : '/purchase/bills')
    }
  }

  return (
    <section className="space-y-5">
      <Tabs className="gap-0" value={tab} onValueChange={(value) => switchTab(value as PurchaseBillsTab)}>
        <TabsList className="w-full" variant="line">
          <TabsTrigger value="bills" variant="line">บิลรับซื้อ</TabsTrigger>
          <TabsTrigger value="supplier-swap-history" variant="line">ประวัติเปลี่ยนบิล Supplier</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'bills' ? <TransactionBillsPageClient mode="purchase" /> : <BillSwapHistoryPageClient tableKey="purchase.bills.supplier-swap-history.v5" />}
    </section>
  )
}
