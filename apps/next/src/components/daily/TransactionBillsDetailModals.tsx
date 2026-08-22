import { useEffect, useMemo, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { SegmentedFilterButton } from '@/components/ui/SegmentedFilterButton'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { normalizePurchaseBillPrintText, normalizePurchaseBillPrintUnit } from '@/lib/purchase-bill-print'
import { parsePurchaseBillRemark } from '@/lib/purchase-bill-print-layout'
import { calculatePurchaseBillPostAdvanceTotals } from '@/lib/purchase-advance'
import type { PurchaseBillFormValues } from '@/lib/purchase-bill'
import type { SalesBillDetail } from '@/lib/server/sales-bill-detail'

type BillRow = {
  advanceAllocatedAmount?: number
  advanceAllocatedSubtotalAmount?: number
  advanceConsumedAmount?: number
  advancePaymentDocNo?: string
  advancePaymentId?: string
  branchId?: string
  branchName?: string
  canCancel?: boolean
  canEdit?: boolean
  createdAt?: string
  createdBy?: string
  customerAdvanceDocNo?: string
  customerName?: string
  date: string
  discountTotal?: number
  docNo: string
  editLockedReason?: string | null
  grossProfit?: number
  hasVat?: boolean
  id: string
  subtotal?: number
  items?: Array<Partial<PurchaseBillFormValues['items'][number]> & {
    amount?: number
    lineNo?: number
    netAmount?: number
    netWeight?: number
    productCode?: string
    productName?: string
    unit?: string
  }>
  itemCount: number
  hasActiveApproval?: boolean
  hasActivePayment?: boolean
  licensePlate?: string
  lockedReason?: string | null
  note?: string
  paidAmount?: number
  paymentWorkflowStatus?: string
  paymentDocNos?: string[]
  payableBalance?: number
  purchaseSource?: string
  purchaseChannelId?: string
  receiptDocNos?: string[]
  receivableBalance?: number
  receivedAmount?: number
  refNo?: string
  poBuyId?: string
  salesId?: string
  status: string
  supplierId?: string
  supplierName?: string
  totalAmount?: number
  transactionMode?: string
  updatedAt?: string
  updatedBy?: string
  vatInvoiceNo?: string
  vatInvoiceDate?: string
  vatInvoiceReceived?: boolean
  vatInvoiceIssued?: boolean
  vatRatePercent?: number
  warehouseId?: string
  warehouseName?: string
  wtoDocumentDate?: string
}


function isCancelledBillStatus(status: string | null | undefined) {
  return status === 'cancelled' || status === 'cancelled_supplier_swap'
}

function isCorrectableTradingDetailItem(item: SalesBillDetail['items'][number]) {
  return !item.deliveryTicketDocNo && item.sourceType.includes('Trading')
}

type PurchaseBillDetailTimelineEvent = {
  action: string
  actor: string
  createdAt: string
  details: string[]
  id: string
  status: string
  statusLabel: string
  title: string
  tone: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate'
  transitionText: string
}


type PurchaseBillDetail = {
  advanceAllocatedAmount: number
  advanceConsumedAmount: number
  advanceAllocatedSubtotalAmount: number
  advanceAllocatedVatAmount: number
  advancePaymentDocNo: string
  advancePaymentInvoiceNo: string
  advancePaymentVatType: string
  advancePaymentVatTypeLabel: string
  allocationRows: Array<{
    amount: number
    deductWeight: number
    grossWeight: number
    lineId: string
    lineNo: number
    note: string
    poDocNo: string | null
    price: number
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptSummaryLabel: string
    receiptTicketDocNo: string | null
    receiptVehicleNo: string
    sourceLabel: string
    sourceType: string
    unit: string
  }>
  editForm: PurchaseBillFormValues
  branchId: string
  branchName: string
  createdBy: string
  date: string
  discount: number
  docNo: string
  hasVat: boolean
  licensePlate: string
  note: string
  paidAmount: number
  payableBalance: number
  productSummaries: Array<{
    amount: number
    deductWeight: number
    grossWeight: number
    lineCount: number
    poDocNos: string[]
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptDocNos: string[]
    sourceKinds: string[]
    unit: string
  }>
  receiptDocNos: string[]
  status: string
  statusLabel: string
  subtotal: number
  supplierAddress: string
  supplierCode: string
  supplierTaxId: string
  supplierName: string
  timeline: PurchaseBillDetailTimelineEvent[]
  totalAmount: number
  transactionMode: string
  updatedAt: string
  vatAmount: number
  vatInvoiceDate: string
  vatInvoiceNo: string
  vatInvoiceReceived: boolean
  vatRatePercent: number
  vatType: string
  warehouseName: string
  refNo: string
  salesName: string
}


function formatPurchaseBillDetailRemark(value: string | null | undefined) {
  const remark = parsePurchaseBillRemark(value ?? '')
  if (remark.kind === 'numbered') {
    return remark.items.map((item, index) => `${index + 1}. ${normalizePurchaseBillPrintText(item)}`).join('\n')
  }
  return normalizePurchaseBillPrintText(remark.text || '-')
}

type Option = {
  active?: boolean | null
  bankAccounts?: Array<{
    accountName: string
    accountNo: string
    bankName: string
    branchCode: string
    code: string
    isPrimary: boolean
    paymentMethod: string
  }>
  branchIds?: string[]
  advanceDate?: string | null
  amount?: number | null
  branch_id?: string | null
  code?: string | null
  customer_id?: string | null
  id: string
  label?: string | null
  line_id?: string | null
  lockedAmount?: number | null
  lockedQty?: number | null
  marketScope?: string | null
  name: string
  product_id?: string | null
  remainingAmount?: number | null
  remainingQty?: number | null
  sales_id?: string | null
  sales_name?: string | null
  sourceLineNo?: number | null
  status?: string | null
  subtotalAmount?: number | null
  supplier_id?: string | null
  supplier_name?: string | null
  type?: string | null
  unitPrice?: number | null
  unit?: string | null
  vatAmount?: number | null
  vatType?: string | null
}

type SortKey = 'date' | 'docNo' | 'itemCount' | 'name' | 'outstanding' | 'refNo' | 'status' | 'totalAmount' | 'transactionMode' | 'updatedBy' | 'warehouse' | 'wtoDocumentDate'
type SortDirection = 'asc' | 'desc'

function PurchaseBillDetailModal({
  detail,
  docNo,
  error,
  isLoading,
  isPrinting,
  onCancel,
  onClose,
  onEdit,
  onPrint,
}: {
  detail: PurchaseBillDetail | null
  docNo: string
  error: string | null
  isLoading: boolean
  isPrinting: boolean
  onCancel: () => void
  onClose: () => void
  onEdit: () => void
  onPrint: (detail: PurchaseBillDetail) => void
}) {
  const detailTitle = detail?.docNo ?? docNo
  const detailPartyName = detail ? `${detail.supplierCode ? `[${detail.supplierCode}] ` : ''}${detail.supplierName}` : '-'
  const detailPreAdvanceTotals = detail
    ? calculatePurchaseBillPostAdvanceTotals({
        advanceBaseAllocatedAmount: 0,
        discountAmount: detail.discount,
        hasVat: detail.hasVat,
        subtotalAmount: detail.subtotal,
        vatRatePercent: detail.vatRatePercent,
        vatType: detail.vatType,
      })
    : null
  const detailPostAdvanceTotals = detail
    ? calculatePurchaseBillPostAdvanceTotals({
        advanceBaseAllocatedAmount: detail.advanceAllocatedSubtotalAmount || detail.advanceConsumedAmount,
        discountAmount: detail.discount,
        hasVat: detail.hasVat,
        subtotalAmount: detail.subtotal,
        vatRatePercent: detail.vatRatePercent,
        vatType: detail.vatType,
      })
    : null
  const detailVatLabel = detail ? `VAT ${detail.vatRatePercent || 7}%` : 'VAT'
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="purchase-bill-detail-title" className="max-h-[90vh] max-w-6xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md shrink-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle id="purchase-bill-detail-title" className="truncate text-white">รายละเอียดบิลรับซื้อ {detailTitle}</DialogTitle>
            <DialogDescription className="truncate text-xs text-slate-300">{detailPartyName}</DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {detail ? (
              <Button className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={isPrinting} type="button" variant="outline" onClick={() => onPrint(detail)}>
                <Printer className="size-4" />
                {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
              </Button>
            ) : null}
            {detail && !isCancelledBillStatus(detail.status) ? (
              <>
                <Button className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" type="button" variant="outline" onClick={onEdit}>แก้ไข</Button>
                <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onCancel}>ยกเลิก</Button>
              </>
            ) : null}
            <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50">

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดรายละเอียดบิลรับซื้อ</div>
        ) : error ? (
          <div className="p-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          </div>
        ) : detail ? (
          <div className="space-y-4 p-4 text-sm">
            {/* ข้อมูลทั่วไป */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">ข้อมูลเอกสาร</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <DetailItem label="เลขที่บิล" value={detail.docNo} />
                <DetailItem label="วันที่รับของตาม WTI" value={formatDateDisplay(detail.date)} />
                <DetailItem label="สาขา/คลัง" value={detail.branchName || '-'} />
                <DetailItem label="ประเภทบิล" value={detail.transactionMode || '-'} />
                <DetailItem label="ผู้ทำรายการ" value={detail.createdBy || '-'} />
                <DetailItem className="col-span-2 sm:col-span-3" label="อ้างอิงใบรับของ WTI" value={detail.receiptDocNos.join(', ') || '-'} />
              </div>
            </div>

            {/* สถานะและการชำระเงิน */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">สถานะและการชำระเงิน</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <div className="flex flex-col py-1">
                  <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">สถานะบิล</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${workflowStatusBadgeClass(detail.status)}`}>
                      <span className="size-1.5 rounded-full bg-current" />
                      {detail.statusLabel}
                    </span>
                  </div>
                </div>
                <DetailItem label="ยอดเงินสุทธิ" value={`${formatMoney(detail.totalAmount)} บาท`} />
                <DetailItem label="ชำระแล้ว" value={`${formatMoney(detail.paidAmount)} บาท`} />
                <DetailItem label="ยอดคงเหลือค้างจ่าย" value={`${formatMoney(detail.payableBalance)} บาท`} />
                {detail.advancePaymentDocNo ? (
                  <>
                    <DetailItem className="col-span-2 sm:col-span-4" label="เอกสารเงินล่วงหน้า / มัดจำ" value={`${detail.advancePaymentDocNo}${detail.advancePaymentInvoiceNo ? ` · INV ${detail.advancePaymentInvoiceNo}` : ''}`} />
                  </>
                ) : null}
                {detailPreAdvanceTotals ? (
                  <>
                    <DetailItem label="ยอดรวมรายการ" value={`${formatMoney(detail.subtotal)} บาท`} />
                    <DetailItem label="หักส่วนลด" value={`${formatMoney(detail.discount)} บาท`} />
                    {detail.advancePaymentDocNo ? (
                      <DetailItem label="หัก ADV/มัดจำก่อน VAT" value={`${formatMoney(detail.advanceAllocatedSubtotalAmount || detail.advanceConsumedAmount)} บาท`} />
                    ) : null}
                    <DetailItem
                      label={detail.hasVat ? 'ยอดที่ต้องจ่ายก่อน VAT' : 'ยอดที่ต้องจ่าย'}
                      value={`${formatMoney(detailPostAdvanceTotals?.taxableBaseAmount ?? detailPreAdvanceTotals.taxableBaseAmount)} บาท`}
                    />
                    {detail.hasVat ? (
                      <DetailItem label={detailVatLabel} value={`${formatMoney(detailPostAdvanceTotals?.vatAmount ?? detailPreAdvanceTotals.vatAmount)} บาท`} />
                    ) : null}
                    <DetailItem
                      className="col-span-2 sm:col-span-4"
                      label={detail.hasVat ? 'ยอดสุทธิรวม VAT ที่ต้องจ่าย' : 'ยอดสุทธิที่ต้องจ่าย'}
                      value={`${formatMoney(detailPostAdvanceTotals?.totalAmount ?? detail.totalAmount)} บาท`}
                    />
                  </>
                ) : null}
              </div>
            </div>

            {/* สรุปต่อสินค้า */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">สรุปต่อสินค้า</div>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="ns-table w-full min-w-[880px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                      <th className="px-3 py-2 text-left font-medium">ใบรับของ</th>
                      <th className="px-3 py-2 text-left font-medium">ที่มา</th>
                      <th className="px-3 py-2 text-right font-medium">น้ำหนัก</th>
                      <th className="px-3 py-2 text-center font-medium">หน่วย</th>
                      <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.productSummaries.map((item) => (
                      <tr key={item.productId || item.productName} className="border-t border-slate-200">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">{item.productName}</div>
                          <div className="text-xs text-slate-500">{[item.productCode || null, `${item.lineCount} allocation`].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center align-top font-mono text-slate-700">{item.receiptDocNos.join(', ') || '-'}</td>
                        <td className="px-3 py-2 align-top text-slate-700">
                          <div>{item.sourceKinds.join(' + ') || '-'}</div>
                          <div className="whitespace-nowrap text-xs text-slate-500">{item.poDocNos.join(', ') || 'Spot Buy'}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(item.qty)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-center font-medium">{normalizePurchaseBillPrintUnit(item.unit)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                    {detail.productSummaries.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={6}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            {/* รายละเอียด allocation */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">รายละเอียด allocation รายแถว</div>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="ns-table w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                      <th className="px-3 py-2 text-center font-medium">ใบรับของ WTI</th>
                      <th className="px-3 py-2 text-left font-medium">PO / ที่มา</th>
                      <th className="px-3 py-2 text-right font-medium">น้ำหนักหลัก</th>
                      <th className="px-3 py-2 text-right font-medium">หักสิ่งเจือปน</th>
                      <th className="px-3 py-2 text-right font-medium">น้ำหนักสุทธิ</th>
                      <th className="px-3 py-2 text-center font-medium">หน่วย</th>
                      <th className="px-3 py-2 text-right font-medium">ราคา/กก.</th>
                      <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.allocationRows.map((item) => (
                      <tr key={item.lineId} className="border-t border-slate-200">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">{item.productName}</div>
                          <div className="text-xs text-slate-500">{[item.productCode || null, `line ${item.lineNo}`].filter(Boolean).join(' · ')}</div>
                          {item.note ? <div className="mt-1 whitespace-pre-line text-xs text-slate-500">{formatPurchaseBillDetailRemark(item.note)}</div> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center align-top font-mono">
                          <div className="text-slate-900">{item.receiptTicketDocNo}</div>
                          <div className="text-xs text-slate-500">{item.receiptSummaryLabel}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-slate-900">{item.sourceLabel}</div>
                          <div className="text-xs text-slate-500">{item.poDocNo ? 'ตัดตาม PO' : 'รับแบบ Spot Buy'}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.grossWeight)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.deductWeight)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(item.qty)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-center font-medium">{normalizePurchaseBillPrintUnit(item.unit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.price)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                    {detail.allocationRows.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={9}>ไม่มีรายการ allocation ในบิล</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 border-b border-slate-100/80 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">ใบกำกับภาษี / หมายเหตุ</div>
              <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <DetailItem label="ได้รับใบกำกับภาษี" value={detail.vatInvoiceReceived ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'} />
                <DetailItem label="เลขที่ใบกำกับภาษี" value={detail.vatInvoiceNo || '-'} />
                <DetailItem label="วันที่ใบกำกับภาษี" value={detail.vatInvoiceDate ? formatDateDisplay(detail.vatInvoiceDate) : '-'} />
                <DetailItem label="หมายเหตุ" value={detail.note || '-'} />
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-700">ประวัติ PB</div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${workflowStatusBadgeClass(detail.status)}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  ล่าสุด: {detail.statusLabel}
                </span>
              </div>
              <PurchaseBillDetailTimeline detail={detail} />
            </div>
          </div>
        ) : null}

        </div>

      </DialogContent>
    </Dialog>
  )
}

function SalesBillDetailModal({
  detail,
  docNo,
  error,
  isLoading,
  isPrinting,
  onCancel,
  tradingCostSources,
  onClose,
  onCorrectTradingAllocations,
  onEdit,
  onPrint,
}: {
  detail: SalesBillDetail | null
  docNo: string
  error: string | null
  isLoading: boolean
  isPrinting: boolean
  onCancel: () => void
  tradingCostSources: Option[]
  onClose: () => void
  onCorrectTradingAllocations: (docNo: string, allocations: Array<{ salesLineNo: number; tradingCostSourceId: string }>, note: string) => Promise<void>
  onEdit: () => void
  onPrint: (detail: SalesBillDetail) => void
}) {
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctionSources, setCorrectionSources] = useState<Record<number, string>>({})
  const [isCorrecting, setIsCorrecting] = useState(false)
  const [showCorrection, setShowCorrection] = useState(false)
  const correctableTradingItems = useMemo(() => (
    detail?.transactionMode === 'TRADING'
      ? detail.items.filter(isCorrectableTradingDetailItem)
      : []
  ), [detail])
  const canCorrectTradingAllocation = Boolean(
    detail
    && !isCancelledBillStatus(detail.status)
    && correctableTradingItems.length > 0
  )

  useEffect(() => {
    if (!canCorrectTradingAllocation) {
      setShowCorrection(false)
      setCorrectionSources({})
      setCorrectionNote('')
      setCorrectionError(null)
      return
    }
    setCorrectionSources(Object.fromEntries(correctableTradingItems.map((item) => {
      const sourceType = item.sourceType.toUpperCase()
      const sourceDocNo = item.tradingSourceDocNo
      const sourceLineNo = item.tradingSourceLineNo ?? 1
      const sourceId = !sourceDocNo
        ? ''
        : sourceType.includes('COST SOURCE')
          ? `SRC:${sourceDocNo}:1`
          : `PB:${sourceDocNo}:${sourceLineNo}`
      return [item.lineNo, sourceId]
    })))
    setCorrectionError(null)
  }, [canCorrectTradingAllocation, correctableTradingItems])

  const submitCorrection = async () => {
    if (!detail) return
    setCorrectionError(null)
    const allocations = correctableTradingItems.map((item) => ({
      salesLineNo: item.lineNo,
      tradingCostSourceId: correctionSources[item.lineNo] ?? '',
    }))
    if (allocations.some((allocation) => !allocation.tradingCostSourceId)) {
      setCorrectionError('เลือก Trading Cost Source ให้ครบทุกรายการ Trading')
      return
    }
    if (!correctionNote.trim()) {
      setCorrectionError('กรอกเหตุผลการแก้ไข allocation')
      return
    }
    setIsCorrecting(true)
    try {
      await onCorrectTradingAllocations(detail.docNo, allocations, correctionNote.trim())
      setShowCorrection(false)
      setCorrectionNote('')
    } catch (caught) {
      setCorrectionError(caught instanceof Error ? caught.message : 'แก้ไข Trading allocation ไม่สำเร็จ')
    } finally {
      setIsCorrecting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="sales-bill-detail-title" className="max-h-[90vh] max-w-6xl overflow-hidden rounded-md !p-0 flex flex-col bg-slate-900 border-0 outline-none focus:outline-none" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md shrink-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle id="sales-bill-detail-title" className="truncate text-white">รายละเอียดบิลขาย {detail?.docNo ?? docNo}</DialogTitle>
            <DialogDescription className="truncate text-xs text-slate-300">
              {detail ? `${detail.customerCode ? `[${detail.customerCode}] ` : ''}${detail.customerName}` : docNo}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {detail ? (
              <Button className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={isPrinting} type="button" variant="outline" onClick={() => onPrint(detail)}>
                <Printer className="size-4" />
                {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
              </Button>
            ) : null}
            {detail && !isCancelledBillStatus(detail.status) ? (
              <>
                <Button className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" type="button" variant="outline" onClick={onEdit}>แก้ไข</Button>
                <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onCancel}>ยกเลิก</Button>
              </>
            ) : null}
            <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดรายละเอียดบิลขาย</div>
          ) : error ? (
            <div className="p-4">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            </div>
          ) : detail ? (
            <div className="space-y-4 p-4 text-sm">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลเอกสาร</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <DetailItem label="เลขที่บิล" value={detail.docNo} />
                <DetailItem label="วันที่เอกสาร" value={formatDateDisplay(detail.date)} />
                <DetailItem label="วันที่ครบกำหนด" value={detail.dueDate ? formatDateDisplay(detail.dueDate) : '-'} />
                <DetailItem label="สาขา/คลัง" value={[detail.branchName, detail.warehouseName].filter((value) => value && value !== '-').join(' / ') || '-'} />
                <DetailItem label="ช่องทางขาย" value={detail.channelName || '-'} />
                {detail.exportOrderNo ? <DetailItem label="เลขที่ order ส่งออก" value={detail.exportOrderNo} /> : null}
                <DetailItem label="ประเภทบิล" value={detail.transactionMode || '-'} />
                <DetailItem label="ผู้ขาย" value={detail.salesName || '-'} />
                <DetailItem label="ผู้ทำรายการ" value={detail.createdBy || '-'} />
                <DetailItem className="col-span-2 sm:col-span-3" label="อ้างอิงใบส่งของ WTO" value={detail.deliveryDocNos.join(', ') || '-'} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">สถานะและการรับเงิน</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <div className="flex flex-col py-1">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">สถานะรับเงิน</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadgeClass(detail.status)}`}>
                      <span className="size-1.5 rounded-full bg-current" />
                      {detail.statusLabel}
                    </span>
                  </div>
                </div>
                <DetailItem label="ยอดเงินสุทธิ" value={`${formatMoney(detail.totalAmount)} บาท`} />
                <DetailItem label="รับแล้ว" value={`${formatMoney(detail.receivedAmount || detail.paidAmount)} บาท`} />
                <DetailItem label="ยอดคงเหลือค้างรับ" value={`${formatMoney(detail.receivableBalance)} บาท`} />
                {detail.customerAdvanceDocNo ? (
                  <DetailItem className="col-span-2 sm:col-span-4" label="หักมัดจำ / เงินล่วงหน้า Customer" value={detail.customerAdvanceDocNo} />
                ) : null}
              </div>
            </div>

            {detail.readModelWarning ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {detail.readModelWarning}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-800">รายการสินค้า / Source</div>
                {canCorrectTradingAllocation ? (
                  <Button className="h-9 px-3 text-xs font-normal" type="button" variant="outline" onClick={() => setShowCorrection((current) => !current)}>
                    {showCorrection ? 'ซ่อนแก้ allocation' : 'แก้ Trading allocation'}
                  </Button>
                ) : null}
              </div>
              {canCorrectTradingAllocation && showCorrection ? (
                <div className="mb-3 rounded-md border border-purple-100 bg-purple-50 p-3">
                  <div className="grid gap-3">
                    <div className="text-xs font-semibold text-purple-800">แก้เฉพาะ Cost Source ของบิลขาย Trading</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {correctableTradingItems.map((item) => {
                        const selectedSourceId = correctionSources[item.lineNo] ?? ''
                        const sourceOptions = tradingCostSources.filter((source) => {
                          if (selectedSourceId === source.id) return true
                          if (source.active === false) return false
                          const sameProduct = source.product_id === item.productId || source.product_id === item.productCode
                          return sameProduct && ((source.remainingQty ?? 0) > 0.0001 || (source.remainingAmount ?? 0) > 0.01)
                        })
                        const comboboxOptions = sourceOptions.map((source) => ({
                          id: source.id,
                          label: source.label ?? source.name,
                          searchText: [source.name, source.label, source.supplier_name].filter(Boolean).join(' '),
                        }))
                        if (selectedSourceId && !comboboxOptions.some((source) => source.id === selectedSourceId)) {
                          comboboxOptions.unshift({
                            id: selectedSourceId,
                            label: item.sourceLabel || selectedSourceId,
                            searchText: [item.sourceLabel, item.productCode, item.productName].filter(Boolean).join(' '),
                          })
                        }
                        return (
                          <div key={`correction-${item.lineNo}`} className="rounded-md bg-white p-2">
                            <div className="mb-1 text-xs font-semibold text-slate-700">Line {item.lineNo}: {item.productName}</div>
                            <SearchCombobox
                              hideLabel
                              inputClassName="h-10 text-sm"
                              inputId={`sales-bill-correction-source-${item.lineNo}`}
                              label={`Trading Cost Source line ${item.lineNo}`}
                              options={comboboxOptions}
                              placeholder="เลือก Trading PB / Cost Source"
                              value={selectedSourceId}
                              onChange={(value) => setCorrectionSources((current) => ({ ...current, [item.lineNo]: value }))}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="sales-bill-correction-note">เหตุผลการแก้ไข</label>
                      <textarea
                        className="min-h-20 w-full rounded-md border border-slate-300 bg-[var(--ns-manual-entry-bg)] px-3 py-2 text-sm"
                        id="sales-bill-correction-note"
                        value={correctionNote}
                        onChange={(event) => setCorrectionNote(event.target.value)}
                      />
                    </div>
                    {correctionError ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{correctionError}</div> : null}
                    <div className="flex justify-end">
                      <Button className="font-normal" disabled={isCorrecting} type="button" onClick={() => void submitCorrection()}>
                        {isCorrecting ? 'กำลังบันทึก...' : 'บันทึก allocation correction'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="ns-table w-full min-w-[1240px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                      <th className="px-3 py-2 text-center font-medium">ใบส่งของ WTO</th>
                      <th className="px-3 py-2 text-left font-medium">PO / ที่มา</th>
                      <th className="px-3 py-2 text-right font-medium">Gross</th>
                      <th className="px-3 py-2 text-right font-medium">หัก</th>
                      <th className="px-3 py-2 text-right font-medium">จำนวนสุทธิ</th>
                      <th className="px-3 py-2 text-right font-medium">ต้นทุน/หน่วย</th>
                      <th className="px-3 py-2 text-right font-medium">ราคาขาย/หน่วย</th>
                      <th className="px-3 py-2 text-right font-medium">ส่วนลด</th>
                      <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => {
                      const sourceProductCode = item.sourceProductCode?.trim() ?? ''
                      const salesProductCode = item.productCode?.trim() ?? ''
                      const isSeparatedFromSource = Boolean(sourceProductCode && salesProductCode && sourceProductCode !== salesProductCode)
                      return (
                        <tr key={`${item.lineNo}-${item.productCode}-${item.deliveryLineId}`} className="border-t border-slate-200">
                          <td className="px-3 py-2 align-top">
                            <div className="font-medium text-slate-900">{item.productName}</div>
                            <div className="text-xs text-slate-500">{[item.productCode || null, `line ${item.lineNo}`].filter(Boolean).join(' · ')}</div>
                            {isSeparatedFromSource ? (
                              <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold leading-snug text-amber-800">
                                คัดแยกจาก: {item.sourceProductName} ({item.sourceProductCode})
                              </div>
                            ) : null}
                            {item.note ? <div className="mt-1 text-xs text-slate-500">{item.note}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-center align-top font-mono">
                            <div className="text-slate-900">{item.deliveryTicketDocNo || '-'}</div>
                            <div className="text-xs text-slate-500">{item.deliveryVehicleNo || '-'}</div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="text-slate-900">{item.sourceLabel || '-'}</div>
                            <div className="text-xs text-slate-500">{item.sourceType || '-'}</div>
                            {item.matchedCogs > 0 ? <div className="mt-1 text-xs text-red-600">Matched COGS {formatMoney(item.matchedCogs)}</div> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.grossWeight)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.deductWeight)}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(item.qty || item.netWeight)} {item.unit}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.unitCostSnapshot == null ? '-' : formatMoney(item.unitCostSnapshot)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.price)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.discount)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(item.amount)}</td>
                        </tr>
                      )
                    })}
                    {detail.items.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={10}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 border-b border-slate-100/80 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">ใบกำกับภาษี / หมายเหตุ</div>
              <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <DetailItem label="ออกใบกำกับภาษี" value={detail.vatInvoiceIssued ? 'ออกแล้ว' : 'ยังไม่ได้ออก'} />
                <DetailItem label="เลขที่ใบกำกับภาษี" value={detail.vatInvoiceNo || '-'} />
                <DetailItem label="วันที่ใบกำกับภาษี" value={detail.vatInvoiceDate ? formatDateDisplay(detail.vatInvoiceDate) : '-'} />
                <DetailItem label="หมายเหตุ" value={detail.note || '-'} />
              </div>
            </div>

            <div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-700">ประวัติสถานะ SB</div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadgeClass(detail.status)}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    ล่าสุด: {detail.statusLabel}
                  </span>
                </div>
                <SalesBillDetailTimeline detail={detail} />
              </div>
            </div>
          </div>
        ) : null}
        </div>

      </DialogContent>
    </Dialog>
  )
}

function PurchaseBillDetailTimeline({ detail }: { detail: PurchaseBillDetail }) {
  const timelineEvents = detail.timeline.length > 0
    ? detail.timeline
    : [{
        action: 'current_status',
        actor: '-',
        createdAt: '',
        details: [`สถานะ ${detail.statusLabel}`],
        id: 'current-status',
        status: detail.status,
        statusLabel: detail.statusLabel,
        title: 'สถานะปัจจุบัน',
        tone: 'slate' as const,
        transitionText: detail.statusLabel,
      }]

  return (
    <div className="space-y-3">
      {timelineEvents.map((event, index) => (
        <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
          <div className="pt-1 text-right text-xs text-slate-500">
            <div>{formatDateTime(event.createdAt)}</div>
            <div className="mt-1 truncate text-xs">{event.actor}</div>
          </div>
          <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
            <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${index === 0 ? purchaseBillTimelineDotClass(event.tone) : 'bg-slate-300 dark:bg-slate-500'}`} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-slate-800">{event.title}</div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${workflowStatusBadgeClass(event.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                {event.statusLabel}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{event.transitionText}</div>
            <div className="mt-2 grid gap-1 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
              {event.details.map((detailLine) => <div key={detailLine}>{detailLine}</div>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SalesBillDetailTimeline({ detail }: { detail: SalesBillDetail }) {
  const timelineEvents = detail.timeline.length > 0
    ? detail.timeline
    : [{
        action: 'current_status',
        actor: '-',
        createdAt: '',
        details: [`สถานะ ${detail.statusLabel}`],
        id: 'current-status',
        status: detail.status,
        statusLabel: detail.statusLabel,
        title: 'สถานะปัจจุบัน',
        tone: 'slate' as const,
        transitionText: detail.statusLabel,
      }]
  const sourceFactsEventIndex = timelineEvents.length - 1

  return (
    <div className="space-y-3">
      {timelineEvents.map((event, index) => (
        <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
          <div className="pt-1 text-right text-xs text-slate-500">
            <div>{formatDateTime(event.createdAt)}</div>
            <div className="mt-1 truncate text-xs">{event.actor}</div>
          </div>
          <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
            <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${index === 0 ? purchaseBillTimelineDotClass(event.tone) : 'bg-slate-300 dark:bg-slate-500'}`} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-slate-800">{event.title}</div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadgeClass(event.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                {event.statusLabel}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{event.transitionText}</div>
            <div className="mt-2 grid gap-1 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
              {event.details.map((detailLine) => <div key={detailLine}>{detailLine}</div>)}
            </div>
            {index === sourceFactsEventIndex ? <SalesBillSourceUsageTimelineTable facts={detail.sourceUsageFacts} /> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function SalesBillSourceUsageTimelineTable({ facts }: { facts: SalesBillDetail['sourceUsageFacts'] }) {
  return (
    <details className="mt-3 rounded-md border border-slate-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-blue-700">
        ต้นทางสินค้าและต้นทุน {facts.length > 0 ? `${facts.length} รายการ` : ''}
      </summary>
      {facts.length === 0 ? (
        <div className="border-t border-slate-100 px-3 py-3 text-center text-xs text-slate-500">ยังไม่มีข้อมูลต้นทางสินค้าและต้นทุนสำหรับบิลนี้</div>
      ) : (
        <div className="max-h-[360px] overflow-auto border-t border-slate-100">
          <table className="ns-table w-full min-w-[760px] text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">รายการ</th>
                <th className="px-3 py-2 text-center font-medium">ต้นทาง</th>
                <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน/COGS</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {facts.map((fact) => (
                <tr key={fact.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <div className="font-medium text-slate-900">{fact.title}</div>
                    <div className="text-slate-500">{[fact.type, fact.productName !== '-' ? fact.productName : null, fact.lineNo ? `line ${fact.lineNo}` : null].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-top font-mono text-xs text-slate-700">{fact.docNo || '-'}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">{fact.qty ? `${formatMoney(fact.qty)} ${fact.unit}` : '-'}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">{fact.amount ? formatMoney(fact.amount) : '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-top">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${fact.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{fact.status}</span>
                    <div className="mt-1 text-xs text-slate-400">{formatDateTime(fact.createdAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}

function purchaseBillTimelineDotClass(tone: PurchaseBillDetailTimelineEvent['tone']) {
  if (tone === 'blue') return 'bg-blue-500'
  if (tone === 'emerald') return 'bg-emerald-500'
  if (tone === 'amber') return 'bg-amber-500'
  if (tone === 'rose') return 'bg-rose-500'
  return 'bg-slate-500'
}

function PlainDetail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-900">{value}</div></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium">{value}</div></div>
}

function Segment({ current, label, onClick, value }: { current: string; label: string; onClick: (value: string) => void; value: string }) {
  const active = current === value
  return <SegmentedFilterButton active={active} type="button" onClick={() => onClick(value)}>{label}</SegmentedFilterButton>
}

function SegmentMulti({
  current,
  label,
  onClick,
  values,
}: {
  current: string[]
  label: string
  onClick: (value: string[]) => void
  values: string[]
}) {
  const active = values.length === 0
    ? current.length === 0
    : values.every((value) => current.includes(value))
  return (
    <SegmentedFilterButton
      active={active}
      type="button"
      onClick={() => {
        if (values.length === 0) {
          onClick([])
          return
        }
        onClick(active ? current.filter((item) => !values.includes(item)) : Array.from(new Set([...current, ...values])))
      }}
    >
      {label}
    </SegmentedFilterButton>
  )
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase()
  if (['paid', 'received', 'complete', 'completed'].includes(normalized)) return 'text-emerald-700'
  if (['partial', 'partially_paid'].includes(normalized)) return 'text-blue-700'
  if (['cancelled', 'cancelled_supplier_swap', 'void', 'reversed'].includes(normalized)) return 'text-slate-500'
  if (['pending', 'unpaid', 'unreceived', 'open', 'draft'].includes(normalized)) return 'text-amber-700'
  return 'text-slate-700'
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    cancelled: 'ยกเลิก',
    cancelled_supplier_swap: 'ยกเลิก/เปลี่ยนผู้ขาย',
    complete: 'เสร็จสิ้น',
    completed: 'เสร็จสิ้น',
    converted: 'เปิดบิลแล้ว',
    draft: 'Draft',
    paid: 'เสร็จสิ้น',
    pending: 'รอเปิดบิล',
    partial: 'ชำระเงินบางส่วน',
    partially_paid: 'ชำระเงินบางส่วน',
    received: 'เสร็จสิ้น',
    unreceived: 'ยังไม่รับเงิน',
    unpaid: 'ยังไม่ชำระเงิน',
  }
  return labels[status.toLowerCase()] ?? status
}

function workflowStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'paid') return 'text-emerald-700'
  if (normalized === 'partial_paid') return 'text-cyan-700'
  if (normalized === 'pending_payment') return 'text-blue-700'
  if (['cancelled', 'cancelled_supplier_swap'].includes(normalized)) return 'text-slate-500'
  return 'text-amber-700'
}

function workflowStatusText(status: string) {
  const labels: Record<string, string> = {
    cancelled: 'ยกเลิก',
    cancelled_supplier_swap: 'ยกเลิก/เปลี่ยนผู้ขาย',
    paid: 'เสร็จสิ้น',
    partial_paid: 'ชำระบางส่วน',
    pending_approval: 'ยังไม่อนุมัติ',
    pending_payment: 'รอจ่าย',
  }
  return labels[status.toLowerCase()] ?? status
}

function transactionModeLabel(mode: string | null | undefined) {
  if (mode === 'STOCK') return 'สต็อก'
  if (mode === 'TRADING') return 'ซื้อมาขายไป'
  return mode || '-'
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear() + 543
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function formatUserDisplayName(value?: string | null) {
  if (!value || value === '-') return '-'
  if (value.includes('@')) {
    const prefix = value.split('@')[0]
    return prefix || value
  }
  return value
}

function SortHeader({ activeKey, align, className, direction, label, onSort, resizeProps, sortKey }: { activeKey: SortKey; align: 'center' | 'left' | 'right'; className?: string; direction: SortDirection; label: string; onSort: (key: SortKey) => void; resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>; sortKey: SortKey }) {
  return (
    <ResizableTableHead
      activeSortKey={activeKey}
      align={align}
      className={className}
      direction={direction}
      label={label}
      resizeProps={resizeProps}
      sortKey={sortKey}
      onSort={onSort}
    />
  )
}



function formatBranchWarehouse(row: BillRow) {
  const branch = row.branchName?.trim()
  const warehouse = row.warehouseName?.trim()

  if (!branch) return warehouse || '-'
  if (!warehouse || warehouse === '-') return branch

  const normalizedBranch = normalizeBranchWarehouseName(branch)
  const normalizedWarehouse = normalizeBranchWarehouseName(warehouse)
  const normalizedWarehouseWithoutPrefix = normalizeBranchWarehouseName(warehouse.replace(/^คลัง/, ''))

  if (normalizedWarehouse === normalizedBranch || normalizedWarehouseWithoutPrefix === normalizedBranch) return branch

  return `${branch} / ${warehouse}`
}

function normalizeBranchWarehouseName(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
}

function StepBadge({ children }: { children: ReactNode; tone: 'amber' | 'blue' | 'emerald' | 'purple' }) {
  return <span className="flex size-6 items-center justify-center rounded-md-full border border-slate-200 bg-white text-xs text-slate-700">{children}</span>
}

function RadioCard({ active, disabled = false, label, note, onClick }: { active: boolean; disabled?: boolean; label: string; note: string; onClick: () => void }) {
  return (
    <button className={`rounded-md border-2 p-3 text-left transition ${active ? 'border-slate-700 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`} disabled={disabled} type="button" onClick={onClick}>
      <div className="font-bold">{label}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </button>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800 break-words">{value}</div>
    </div>
  )
}

export {
  PurchaseBillDetailModal,
  SalesBillDetailModal,
  PurchaseBillDetailTimeline,
  SalesBillDetailTimeline,
  SalesBillSourceUsageTimelineTable,
  Segment,
  SegmentMulti,
  statusBadgeClass,
  workflowStatusBadgeClass,
  statusText,
  workflowStatusText,
  transactionModeLabel,
  formatDateTime,
  formatUserDisplayName,
  SortHeader,
  formatBranchWarehouse,
  StepBadge,
  RadioCard,
  DetailItem,
  isCancelledBillStatus,
  type BillRow,
  type PurchaseBillDetail,
  type Option,
  type SortKey,
  type SortDirection,
  type PurchaseBillDetailTimelineEvent,
}
