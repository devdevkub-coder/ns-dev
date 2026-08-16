'use client'

import { useEffect, useState } from 'react'
import { useActionConfirmation } from '@/components/ui/FormSafetyProvider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdvancePaymentsPageClient } from '@/components/purchase-flow/AdvancePaymentsPageClient'
import { CustomerAdvanceForm } from '@/components/purchase-flow/CustomerAdvanceForm'

type AdvanceTab = 'payment' | 'receipt'

function tabFromLocation(): AdvanceTab {
  return new URLSearchParams(window.location.search).get('tab') === 'receipt' ? 'receipt' : 'payment'
}

export function AdvancePaymentsTabbedPageClient() {
  const [activeTab, setActiveTab] = useState<AdvanceTab>('payment')
  const { requestNavigation } = useActionConfirmation()

  useEffect(() => {
    const syncFromLocation = () => setActiveTab(tabFromLocation())
    syncFromLocation()
    window.addEventListener('popstate', syncFromLocation)
    return () => window.removeEventListener('popstate', syncFromLocation)
  }, [])

  const changeTab = (value: string) => {
    const nextTab: AdvanceTab = value === 'receipt' ? 'receipt' : 'payment'
    if (nextTab === activeTab) return
    requestNavigation(() => {
      const url = new URL(window.location.href)
      if (nextTab === 'receipt') url.searchParams.set('tab', 'receipt')
      else url.searchParams.delete('tab')
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
      setActiveTab(nextTab)
    })
  }

  return (
    <Tabs value={activeTab} onValueChange={changeTab}>
      <div className="border-b border-slate-200">
        <TabsList className="w-full sm:w-auto" variant="line" aria-label="ประเภทเงินล่วงหน้า">
          <TabsTrigger className="flex-1 sm:flex-none" value="payment" variant="line">
            จ่ายเงินล่วงหน้า
          </TabsTrigger>
          <TabsTrigger className="flex-1 sm:flex-none" value="receipt" variant="line">
            รับเงินล่วงหน้า
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="payment">
        <AdvancePaymentsPageClient />
      </TabsContent>
      <TabsContent value="receipt">
        <CustomerAdvanceForm />
      </TabsContent>
    </Tabs>
  )
}
