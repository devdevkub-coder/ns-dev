import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const metadata: Metadata = {
  title: 'รายละเอียดบิลรับซื้อ | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string }>
}

type TimelineEvent = {
  date: string
  details: string[]
  title: string
  tone?: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate'
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function purchaseBillStatusLabel(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'unpaid') return 'ยังไม่ชำระเงิน'
  if (normalized === 'partial') return 'ชำระเงินบางส่วน'
  if (normalized === 'paid') return 'เสร็จสิ้น'
  if (normalized === 'cancelled') return 'ยกเลิก'
  return status ?? '-'
}

function purchaseBillHistoryActionLabel(action: string | null | undefined) {
  switch (String(action ?? '').toLowerCase()) {
    case 'created':
      return 'สร้างบิลรับซื้อ'
    case 'edited':
      return 'แก้ไขบิลรับซื้อ'
    case 'payment_recorded':
      return 'บันทึกการชำระเงิน'
    case 'payment_reversed':
      return 'ยกเลิกการชำระเงิน'
    case 'cancelled':
      return 'ยกเลิกบิล'
    default:
      return 'อัปเดตสถานะบิล'
  }
}

function purchaseBillHistoryTone(action: string | null | undefined): TimelineEvent['tone'] {
  switch (String(action ?? '').toLowerCase()) {
    case 'created':
      return 'blue'
    case 'edited':
      return 'amber'
    case 'payment_recorded':
      return 'emerald'
    case 'payment_reversed':
    case 'cancelled':
      return 'rose'
    default:
      return 'slate'
  }
}

function historyMetaValue(meta: unknown, key: string) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  return (meta as Record<string, unknown>)[key]
}

function sourceSnapshotValue(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

export default async function PurchaseBillDetailPage({ params }: PageProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
  } catch (caught) {
    if (caught instanceof AuthContextError && caught.status === 404) notFound()
    throw caught
  }

  const { id } = await params
  const bill = await prisma.purchase_bills.findFirst({
    include: {
      branches: true,
      purchase_bill_status_logs: {
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      },
      purchase_bill_items: {
        include: {
          purchase_bill_po_allocations: {
            include: {
              po_buys: {
                select: {
                  doc_no: true,
                },
              },
            },
          },
          purchase_bill_receipt_allocations: {
            include: {
              weight_ticket_product_summaries: {
                select: {
                  line_count: true,
                  product_name: true,
                },
              },
              weight_tickets: {
                select: {
                  doc_no: true,
                },
              },
            },
          },
        },
        orderBy: { line_no: 'asc' },
      },
      suppliers: true,
    },
    where: {
      doc_no: id,
    },
  })

  if (!bill) notFound()

  const allocationRows = bill.purchase_bill_items.map((item, index) => {
    const receiptAllocation = item.purchase_bill_receipt_allocations
    const poAllocation = item.purchase_bill_po_allocations
    const allocatedGrossWeight = receiptAllocation ? toNumber(receiptAllocation.allocated_gross_weight) : toNumber(item.gross_weight)
    const allocatedDeductWeight = receiptAllocation ? toNumber(receiptAllocation.allocated_deduct_weight) : toNumber(item.deduct_weight)
    const allocatedQty = receiptAllocation ? toNumber(receiptAllocation.allocated_qty) : toNumber(item.qty)
    const receiptTicketDocNo = receiptAllocation?.weight_tickets.doc_no
      ?? sourceSnapshotValue(item.source_snapshot, 'receiptTicketDocNo')
      ?? '-'
    const lineNo = item.line_no ?? index + 1
    const receiptSummaryLabel = receiptAllocation?.weight_ticket_product_summaries
      ? `รวมจาก ${receiptAllocation.weight_ticket_product_summaries.line_count ?? 0} lot · ${receiptAllocation.weight_ticket_product_summaries.product_name ?? '-'}`
      : '-'
    const poDocNo = poAllocation?.po_buys.doc_no ?? null

    return {
      amount: toNumber(item.amount),
      deductWeight: allocatedDeductWeight,
      grossWeight: allocatedGrossWeight,
      lineId: `${bill.doc_no}:${lineNo}`,
      lineNo,
      note: item.note ?? '',
      poDocNo,
      price: toNumber(item.price),
      productCode: item.product_code ?? '',
      productId: item.product_code ?? item.display_name ?? item.product_name ?? `${bill.doc_no}:line-${lineNo}`,
      productName: item.display_name ?? item.product_name ?? '-',
      qty: allocatedQty,
      receiptSummaryLabel,
      receiptTicketDocNo,
      sourceLabel: poDocNo ?? 'Spot Buy',
      sourceType: poDocNo ? 'PO Buy' : 'Spot Buy',
      unit: item.unit ?? 'กก.',
    }
  })

  const productSummaries = Array.from(allocationRows.reduce((map, row) => {
    const key = row.productId || row.productName
    const current = map.get(key) ?? {
      amount: 0,
      deductWeight: 0,
      grossWeight: 0,
      lineCount: 0,
      poDocNos: new Set<string>(),
      productCode: row.productCode,
      productId: row.productId,
      productName: row.productName,
      qty: 0,
      receiptDocNos: new Set<string>(),
      sourceKinds: new Set<string>(),
      unit: row.unit,
    }
    current.amount += row.amount
    current.deductWeight += row.deductWeight
    current.grossWeight += row.grossWeight
    current.lineCount += 1
    current.qty += row.qty
    current.sourceKinds.add(row.sourceType)
    if (row.poDocNo) current.poDocNos.add(row.poDocNo)
    if (row.receiptTicketDocNo && row.receiptTicketDocNo !== '-') current.receiptDocNos.add(row.receiptTicketDocNo)
    map.set(key, current)
    return map
  }, new Map<string, {
    amount: number
    deductWeight: number
    grossWeight: number
    lineCount: number
    poDocNos: Set<string>
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptDocNos: Set<string>
    sourceKinds: Set<string>
    unit: string
  }>()).values())

  const supplierName = bill.suppliers?.name ?? '-'
  const subtotal = toNumber(bill.subtotal)
  const discount = toNumber(bill.discount_total ?? bill.discount)
  const vatAmount = toNumber(bill.vat_amount)
  const totalAmount = toNumber(bill.total_amount)
  const payableBalance = toNumber(bill.payable_balance)
  const paidAmount = toNumber(bill.paid_amount)
  const timeline: TimelineEvent[] = bill.purchase_bill_status_logs.map((log) => {
    const amount = historyMetaValue(log.meta, 'amount')
    const accountCode = historyMetaValue(log.meta, 'accountCode')
    const accountName = historyMetaValue(log.meta, 'accountName')
    const discount = historyMetaValue(log.meta, 'discount')
    const fee = historyMetaValue(log.meta, 'fee')
    const paymentDocNo = historyMetaValue(log.meta, 'paymentDocNo')
    const transactionMode = historyMetaValue(log.meta, 'transactionMode')
    const voucherId = historyMetaValue(log.meta, 'voucherId')
    const withholdingTax = historyMetaValue(log.meta, 'withholdingTax')
    const details = [
      `สถานะ ${log.from_status && log.from_status !== log.to_status
        ? `${purchaseBillStatusLabel(log.from_status)} -> ${purchaseBillStatusLabel(log.to_status)}`
        : purchaseBillStatusLabel(log.to_status)}`,
      `ผู้ทำ ${log.created_by ?? '-'}`,
    ]
    if (typeof paymentDocNo === 'string' && paymentDocNo) details.push(`เลขที่การชำระเงิน ${paymentDocNo}`)
    if (typeof voucherId === 'string' && voucherId) details.push(`Voucher ${voucherId}`)
    if (typeof amount === 'number') details.push(`ยอดจ่าย ${money(amount)}`)
    if (typeof withholdingTax === 'number') details.push(`WHT ${money(withholdingTax)}`)
    if (typeof discount === 'number') details.push(`ส่วนลด ${money(discount)}`)
    if (typeof fee === 'number') details.push(`Fee ${money(fee)}`)
    if ((typeof accountName === 'string' && accountName) || (typeof accountCode === 'string' && accountCode)) {
      details.push(`บัญชี ${[typeof accountCode === 'string' && accountCode ? accountCode : null, typeof accountName === 'string' && accountName ? accountName : null].filter(Boolean).join(' - ')}`)
    }
    if (typeof transactionMode === 'string' && transactionMode) details.push(`โหมด ${transactionMode}`)
    if (log.note) details.push(`หมายเหตุ ${log.note}`)
    return {
      date: toDateOnly(log.created_at),
      details,
      title: purchaseBillHistoryActionLabel(log.action),
      tone: purchaseBillHistoryTone(log.action),
    }
  })

  return (
    <div className="space-y-4">
      <PageTitleOverride breadcrumbLabel={bill.doc_no} title={`รายละเอียดบิลรับซื้อ - ${bill.doc_no}`} />
      <div className="flex flex-wrap justify-start gap-2">
        <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" href="/purchase/bills">กลับรายการ</Link>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Summary label="ยอดรวม" value={money(totalAmount)} />
        <Summary label="ค้างชำระ" tone="red" value={money(payableBalance)} />
        <Summary label="ชำระแล้ว" tone="emerald" value={money(paidAmount)} />
        <Summary label="สถานะการชำระเงิน" value={purchaseBillStatusLabel(bill.status)} />
      </section>

      <section className="rounded-md bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">ข้อมูลบิล</h2>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <Info label="เลขที่บิล" value={bill.doc_no} />
          <Info label="วันที่สร้างรายการ" value={bill.date ? toDateOnly(bill.date) : '-'} />
          <Info label="ผู้ขาย" value={supplierName} />
          <Info label="รหัสผู้ขาย" value={bill.suppliers?.code ?? '-'} />
          <Info label="สาขา/คลัง" value={bill.branches?.name ?? '-'} />
          <Info label="ประเภทบิล" value={bill.transaction_mode ?? 'STOCK'} />
          <Info label="สถานะการชำระเงิน" value={purchaseBillStatusLabel(bill.status)} />
          <Info label="ผู้ทำ" value={bill.created_by ?? '-'} />
          <Info label="อ้างอิงจากใบรับของ" value={Array.from(new Set(allocationRows.map((row) => row.receiptTicketDocNo).filter((value) => value && value !== '-'))).join(', ') || '-'} />
        </div>
      </section>

      <section className="rounded-md bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">สรุปต่อสินค้า</h2>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                <th className="px-3 py-2 text-left font-medium">ใบรับของ</th>
                <th className="px-3 py-2 text-left font-medium">ที่มา</th>
                <th className="px-3 py-2 text-right font-medium">Gross ที่ตัดรวม</th>
                <th className="px-3 py-2 text-right font-medium">หักที่ตัดรวม</th>
                <th className="px-3 py-2 text-right font-medium">น้ำหนักที่ตัดรวม</th>
                <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {productSummaries.map((item) => (
                <tr key={item.productId || item.productName} className="border-t border-slate-200">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-900">{item.productName}</div>
                    <div className="text-xs text-slate-500">{[item.productCode || null, `${item.lineCount} allocation`].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{Array.from(item.receiptDocNos).join(', ') || '-'}</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    <div>{Array.from(item.sourceKinds).join(' + ') || '-'}</div>
                    <div className="text-xs text-slate-500">{Array.from(item.poDocNos).join(', ') || 'Spot Buy'}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.grossWeight)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.deductWeight)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(item.qty)} {item.unit}</td>
                  <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{money(item.amount)}</td>
                </tr>
              ))}
              {productSummaries.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={7}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">รายละเอียด allocation รายแถว</h2>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                <th className="px-3 py-2 text-left font-medium">ใบรับของ WTI</th>
                <th className="px-3 py-2 text-left font-medium">สรุปจาก WTI</th>
                <th className="px-3 py-2 text-left font-medium">PO / ที่มา</th>
                <th className="px-3 py-2 text-right font-medium">Gross ที่ตัด</th>
                <th className="px-3 py-2 text-right font-medium">หักที่ตัด</th>
                <th className="px-3 py-2 text-right font-medium">น้ำหนักที่ตัดจากใบรับของ</th>
                <th className="px-3 py-2 text-right font-medium">ราคา/กก.</th>
                <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {allocationRows.map((item) => (
                <tr key={item.lineId} className="border-t border-slate-200">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-900">{item.productName}</div>
                    <div className="text-xs text-slate-500">{[item.productCode || null, `line ${item.lineNo}`].filter(Boolean).join(' · ')}</div>
                    {item.note ? <div className="mt-1 text-xs text-slate-500">{item.note}</div> : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-slate-900">{item.receiptTicketDocNo}</div>
                    <div className="text-xs text-slate-500">{item.sourceType}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-slate-900">{item.receiptSummaryLabel}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-slate-900">{item.sourceLabel}</div>
                    <div className="text-xs text-slate-500">{item.poDocNo ? 'ตัดตาม PO' : 'รับแบบ Spot Buy'}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.grossWeight)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.deductWeight)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(item.qty)} {item.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.price)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{money(item.amount)}</td>
                </tr>
              ))}
              {allocationRows.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={9}>ไม่มีรายการ allocation ในบิล</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md bg-white p-4 shadow">
          <h2 className="mb-3 text-base font-bold text-slate-800">VAT / ยอดรวม</h2>
          <div className="space-y-2 text-sm">
            <Line label="ยอดก่อนส่วนลด" value={money(subtotal)} />
            <Line label="ส่วนลดท้ายบิล" value={money(discount)} />
            <Line label="VAT" value={money(vatAmount)} />
            <Line strong label="ยอดสุทธิ" value={money(totalAmount)} />
          </div>
        </div>
        <div className="rounded-md bg-white p-4 shadow">
          <h2 className="mb-3 text-base font-bold text-slate-800">ใบกำกับภาษี / หมายเหตุ</h2>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <Info label="ได้รับใบกำกับภาษี" value={bill.vat_invoice_received ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'} />
            <Info label="เลขที่ใบกำกับภาษี" value={bill.vat_invoice_no ?? '-'} />
            <Info label="วันที่ใบกำกับภาษี" value={bill.vat_invoice_date ? toDateOnly(bill.vat_invoice_date) : '-'} />
            <Info label="หมายเหตุ" value={bill.note ?? bill.notes ?? '-'} />
          </div>
        </div>
      </section>

      <section className="rounded-md bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">Timeline บิลรับซื้อ</h2>
        <div className="space-y-4">
          {timeline.map((event, index) => (
            <div key={`${event.title}-${event.date}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-3 w-3 rounded-full ${
                  event.tone === 'blue'
                    ? 'bg-blue-500'
                    : event.tone === 'emerald'
                      ? 'bg-emerald-500'
                      : event.tone === 'amber'
                        ? 'bg-amber-500'
                        : event.tone === 'rose'
                          ? 'bg-rose-500'
                          : 'bg-slate-500'
                }`} />
                {index < timeline.length - 1 ? <span className="mt-1 h-full w-px bg-slate-200" /> : null}
              </div>
              <div className="flex-1 rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">{event.title}</div>
                  <div className="text-xs text-slate-500">{event.date}</div>
                </div>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  {event.details.map((detail) => <div key={detail}>{detail}</div>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Summary({ label, tone = 'slate', value }: { label: string; tone?: 'emerald' | 'red' | 'slate'; value: string }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return <div className="rounded-md bg-white p-4 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-xl font-bold ${color}`}>{value}</div></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-900">{value}</div></div>
}

function Line({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className={`flex items-center justify-between ${strong ? 'text-base font-semibold text-slate-900' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
