'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { openSalesBillPrint } from '@/lib/sales-bill-print'
import type { SalesBillDetail } from '@/lib/server/sales-bill-detail'

export function SalesBillPrintButton({ bill }: { bill: SalesBillDetail }) {
  const [isPrinting, setIsPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function printBill() {
    setIsPrinting(true)
    setError(null)
    try {
      await openSalesBillPrint(bill)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เปิดใบพิมพ์บิลขายไม่ได้')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button className="gap-2 font-normal" disabled={isPrinting} type="button" variant="outline" onClick={() => void printBill()}>
        <Printer className="size-4" />
        {isPrinting ? 'กำลังเตรียมใบพิมพ์...' : 'พิมพ์บิลขาย'}
      </Button>
      {error ? <div className="max-w-xs text-right text-xs text-red-600">{error}</div> : null}
    </div>
  )
}
