'use client'

import { useState } from 'react'
import { MoneyMovementPageClient } from '@/components/daily/MoneyMovementPageClient'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdvancePaymentsPageClient } from '@/components/purchase-flow/AdvancePaymentsPageClient'

type AdvanceTab = 'payment' | 'receipt'

export function AdvancePaymentsTabbedPageClient() {
  const [activeTab, setActiveTab] = useState<AdvanceTab>('payment')

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdvanceTab)}>
      <div className="border-b border-slate-200">
        <TabsList variant="line" aria-label="ประเภทเงินล่วงหน้า">
          <TabsTrigger value="payment" variant="line">
            จ่ายเงินล่วงหน้า
          </TabsTrigger>
          <TabsTrigger value="receipt" variant="line">
            รับเงินล่วงหน้า
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="payment">
        <AdvancePaymentsPageClient />
      </TabsContent>
      <TabsContent value="receipt">
        <MoneyMovementPageClient mode="receipt" />
      </TabsContent>
    </Tabs>
  )
}
