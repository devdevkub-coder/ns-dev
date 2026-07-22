'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { formatMoney } from '@/lib/daily'
import { getErrorMessage } from '@/lib/api-client'

export type StockReturnOption = {
  pendingOutKey: string
  pendingQty: number
  productCode: string
  productName: string
  salesBillDocNos: string[]
  sourceLineNo: number | null
  warehouseName: string
  weightTicketDocNo: string
}

export type StockReturnPayload = {
  options: StockReturnOption[]
}

export function WeightTicketStockReturnDialog({
  open,
  ticketDocNo,
  onClose,
  onCompleted,
}: {
  open: boolean
  ticketDocNo: string
  onClose: () => void
  onCompleted?: () => Promise<void> | void
}) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isReturningPendingOutKey, setIsReturningPendingOutKey] = useState<string | null>(null)
  const [options, setOptions] = useState<StockReturnOption[]>([])
  const [qtyByPendingOut, setQtyByPendingOut] = useState<Record<string, string>>({})
  const [reasonByPendingOut, setReasonByPendingOut] = useState<Record<string, string>>({})
  const [salesBillByPendingOut, setSalesBillByPendingOut] = useState<Record<string, string>>({})

  const loadOptions = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(ticketDocNo)}/stock-returns`, { cache: 'no-store' })
      if (!response.ok) throw new Error(await response.text())
      const payload = await response.json() as StockReturnPayload
      setOptions(payload.options)
      setQtyByPendingOut(Object.fromEntries(payload.options.map((option) => [option.pendingOutKey, String(option.pendingQty)])))
      setReasonByPendingOut({})
      setSalesBillByPendingOut(Object.fromEntries(payload.options.map((option) => [option.pendingOutKey, option.salesBillDocNos[0] ?? ''])))
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลด pending_out สำหรับรับของคืนไม่ได้'))
    } finally {
      setIsLoading(false)
    }
  }, [ticketDocNo])

  useEffect(() => {
    if (!open || !ticketDocNo) return
    void loadOptions()
  }, [loadOptions, open, ticketDocNo])

  async function submitReturn(option: StockReturnOption) {
    setError('')
    const salesBillDocNo = salesBillByPendingOut[option.pendingOutKey]?.trim()
    if (!salesBillDocNo) {
      setError(`เลือกบิลขายที่ต้องรับคืนของ ${option.productName}`)
      return
    }
    const returnedQty = Number(qtyByPendingOut[option.pendingOutKey] ?? 0)
    if (!Number.isFinite(returnedQty) || returnedQty < 0) {
      setError('กรอกน้ำหนักที่ชั่งคืนเป็นตัวเลขที่ไม่ติดลบ')
      return
    }
    if (returnedQty > option.pendingQty + 0.0001) {
      setError(`น้ำหนักรับคืนของ ${option.productName} เกิน pending_out ${formatMoney(option.pendingQty)} กก.`)
      return
    }
    const lossQty = Math.max(0, option.pendingQty - returnedQty)
    const reason = reasonByPendingOut[option.pendingOutKey]?.trim() ?? ''
    if (lossQty > 0.0001 && !reason) {
      setError(`รับคืน ${option.productName} ขาด ${formatMoney(lossQty)} กก. ต้องกรอกเหตุผลส่วนต่าง`)
      return
    }

    setIsReturningPendingOutKey(option.pendingOutKey)
    try {
      const response = await fetch(`/api/sales/bills/${encodeURIComponent(salesBillDocNo)}/stock-return`, {
        body: JSON.stringify({
          note: null,
          pendingOutKey: option.pendingOutKey,
          reason: reason || null,
          returnedQty,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
      await loadOptions()
      await onCompleted?.()
    } catch (caught) {
      setError(getErrorMessage(caught, 'รับของคืนไม่สำเร็จ'))
    } finally {
      setIsReturningPendingOutKey(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose()
    }}>
      <DialogContent hideClose aria-labelledby="wto-stock-return-title" className="max-h-[90vh] max-w-6xl overflow-hidden rounded-md !p-0 flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none">
        <DialogHeader className="rounded-t-md bg-slate-900 px-5 py-4 text-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <DialogTitle id="wto-stock-return-title" className="truncate text-white">รับของคืนจากใบส่งของ</DialogTitle>
              <DialogDescription className="truncate font-mono text-xs text-slate-300">{ticketDocNo}</DialogDescription>
            </div>
            <Button className="h-9 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
          {error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
          {isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">กำลังโหลดรายการ pending_out</div>
          ) : options.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">ไม่มี pending_out ที่ต้องรับคืน</div>
          ) : (
            <>
            <div className="space-y-3 lg:hidden">
              {options.map((option) => {
                const returnedQty = Number(qtyByPendingOut[option.pendingOutKey] ?? option.pendingQty)
                const lossQty = Math.max(0, option.pendingQty - (Number.isFinite(returnedQty) ? returnedQty : 0))
                const requiresReason = lossQty > 0.0001
                return (
                  <div key={option.pendingOutKey} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{option.productName}</div>
                        <div className="mt-1 text-xs text-slate-500">{[option.productCode, option.sourceLineNo ? `line ${option.sourceLineNo}` : null].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-slate-500">{option.warehouseName || '-'}</div>
                    </div>

                    <div className="mt-3 space-y-3 text-sm">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">บิลขาย</label>
                        {option.salesBillDocNos.length > 1 ? (
                          <Select
                            className="h-10 w-full px-2"
                            value={salesBillByPendingOut[option.pendingOutKey] ?? ''}
                            onChange={(event) => setSalesBillByPendingOut((current) => ({ ...current, [option.pendingOutKey]: event.target.value }))}
                          >
                            {option.salesBillDocNos.map((docNo) => <option key={docNo} value={docNo}>{docNo}</option>)}
                          </Select>
                        ) : (
                          <div className="font-mono text-slate-700">{option.salesBillDocNos[0] ?? '-'}</div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-slate-500">pending_out</div>
                          <div className="mt-1 font-semibold tabular-nums text-amber-700">{formatMoney(option.pendingQty)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">ส่วนต่างขาด</div>
                          <div className={`mt-1 font-semibold tabular-nums ${requiresReason ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(lossQty)}</div>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">น้ำหนักชั่งคืนจริง</label>
                        <input
                          className={`h-10 w-full rounded-md border px-2 text-right tabular-nums ${requiresReason ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-white'}`}
                          min="0"
                          max={option.pendingQty}
                          step="0.01"
                          type="number"
                          value={qtyByPendingOut[option.pendingOutKey] ?? ''}
                          onChange={(event) => setQtyByPendingOut((current) => ({ ...current, [option.pendingOutKey]: event.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">เหตุผลส่วนต่าง <span className="text-red-600">*</span></label>
                        <textarea
                          className={`min-h-[88px] w-full resize-y rounded-xl border px-2 py-2 ${requiresReason && !reasonByPendingOut[option.pendingOutKey]?.trim() ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'}`}
                          placeholder={requiresReason ? 'ระบุเหตุผลส่วนต่าง' : '-'}
                          required={requiresReason}
                          value={reasonByPendingOut[option.pendingOutKey] ?? ''}
                          onChange={(event) => setReasonByPendingOut((current) => ({ ...current, [option.pendingOutKey]: event.target.value }))}
                        />
                      </div>

                      <Button
                        className="h-10 w-full text-sm font-normal"
                        disabled={isReturningPendingOutKey === option.pendingOutKey}
                        type="button"
                        onClick={() => void submitReturn(option)}
                      >
                        {isReturningPendingOutKey === option.pendingOutKey ? 'กำลังบันทึก...' : 'บันทึกรับคืน'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white lg:block">
              <table className="ns-table w-full min-w-[900px] table-fixed text-xs">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[18%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                    <th className="px-3 py-2 text-left font-medium">คลัง</th>
                    <th className="px-3 py-2 text-left font-medium">บิลขาย</th>
                    <th className="px-3 py-2 text-right font-medium">pending_out</th>
                    <th className="px-3 py-2 text-right font-medium">น้ำหนักชั่งคืนจริง</th>
                    <th className="px-3 py-2 text-right font-medium">ส่วนต่างขาด</th>
                    <th className="px-3 py-2 text-left font-medium">เหตุผลส่วนต่าง <span className="text-red-600">*</span></th>
                    <th className="px-3 py-2 text-right font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {options.map((option) => {
                    const returnedQty = Number(qtyByPendingOut[option.pendingOutKey] ?? option.pendingQty)
                    const lossQty = Math.max(0, option.pendingQty - (Number.isFinite(returnedQty) ? returnedQty : 0))
                    const requiresReason = lossQty > 0.0001
                    return (
                      <tr key={option.pendingOutKey} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{option.productName}</div>
                          <div className="text-slate-500">{[option.productCode, option.sourceLineNo ? `line ${option.sourceLineNo}` : null].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{option.warehouseName || '-'}</td>
                        <td className="px-3 py-2">
                          {option.salesBillDocNos.length > 1 ? (
                            <Select
                              className="h-10 w-full px-2"
                              value={salesBillByPendingOut[option.pendingOutKey] ?? ''}
                              onChange={(event) => setSalesBillByPendingOut((current) => ({ ...current, [option.pendingOutKey]: event.target.value }))}
                            >
                              {option.salesBillDocNos.map((docNo) => <option key={docNo} value={docNo}>{docNo}</option>)}
                            </Select>
                          ) : (
                            <span className="font-mono text-slate-700">{option.salesBillDocNos[0] ?? '-'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-700">{formatMoney(option.pendingQty)}</td>
                        <td className="px-3 py-2">
                          <input
                            className={`w-full rounded-xl border px-2 py-2 text-right tabular-nums ${requiresReason ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-white'}`}
                            min="0"
                            max={option.pendingQty}
                            step="0.01"
                            type="number"
                            value={qtyByPendingOut[option.pendingOutKey] ?? ''}
                            onChange={(event) => setQtyByPendingOut((current) => ({ ...current, [option.pendingOutKey]: event.target.value }))}
                          />
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${requiresReason ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(lossQty)}</td>
                        <td className="px-3 py-2">
                          <textarea
                            className={`min-h-[72px] w-full resize-y rounded-xl border px-2 py-2 ${requiresReason && !reasonByPendingOut[option.pendingOutKey]?.trim() ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'}`}
                            placeholder={requiresReason ? 'ระบุเหตุผลส่วนต่าง' : '-'}
                            required={requiresReason}
                            value={reasonByPendingOut[option.pendingOutKey] ?? ''}
                            onChange={(event) => setReasonByPendingOut((current) => ({ ...current, [option.pendingOutKey]: event.target.value }))}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <TableActionButton
                            disabled={isReturningPendingOutKey === option.pendingOutKey}
                            busy={isReturningPendingOutKey === option.pendingOutKey}
                            label="รับของคืน"
                            menu={<TableActionMenuItem onSelect={() => void submitReturn(option)}>รับของคืน</TableActionMenuItem>}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
