'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { openPurchaseBillPrint } from '@/lib/purchase-bill-print'
import type { PurchaseBillDetail } from '@/lib/server/purchase-bill-detail'

export function PurchaseBillPrintButton({ bill }: { bill: PurchaseBillDetail }) {
  const [isPrinting, setIsPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function printBill() {
    setIsPrinting(true)
    setError(null)
    try {
      await openPurchaseBillPrint(bill)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เปิดใบพิมพ์บิลรับซื้อไม่ได้')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button className="gap-2 font-normal" disabled={isPrinting} type="button" variant="outline" onClick={() => void printBill()}>
        <Printer className="size-4" />
        {isPrinting ? 'กำลังเตรียมใบพิมพ์...' : 'พิมพ์บิลรับซื้อ'}
      </Button>
      {error ? <div className="max-w-xs text-right text-xs text-red-600">{error}</div> : null}
    </div>
  )
}
