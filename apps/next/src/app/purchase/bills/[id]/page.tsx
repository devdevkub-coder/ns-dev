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
  amount?: number
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
  const bill = await prisma.purchase_bills.findUnique({
    include: {
      branches: true,
      purchase_bill_items: {
        include: {
          purchase_bill_po_allocations: {
            include: {
              po_buys: {
                select: {
                  doc_no: true,
                  id: true,
                },
              },
            },
          },
          purchase_bill_receipt_allocations: {
            include: {
              weight_ticket_product_summaries: {
                select: {
                  id: true,
                  line_count: true,
                  product_name: true,
                },
              },
              weight_tickets: {
                select: {
                  doc_no: true,
                  id: true,
                },
              },
            },
          },
        },
        orderBy: { line_no: 'asc' },
      },
      suppliers: true,
    },
    where: { id },
  })

  if (!bill) notFound()

  const paymentRows = await prisma.payments.findMany({
    include: { accounts: true },
    orderBy: [{ created_at: 'asc' }, { date: 'asc' }],
    where: {
      bill_id: id,
      NOT: { status: 'cancelled' },
    },
  })
  const voucherIds = [...new Set(paymentRows.map((payment) => payment.voucher_id).filter((voucherId): voucherId is string => Boolean(voucherId)))]
  const bankStatementRows = voucherIds.length > 0 ? await prisma.bank_statement.findMany({
    include: { accounts: true },
    orderBy: [{ created_at: 'asc' }, { date: 'asc' }],
    where: {
      ref_id: { in: voucherIds },
      ref_type: 'PMT',
    },
  }) : []

  const allocationRows = bill.purchase_bill_items.map((item, index) => {
    const receiptAllocation = item.purchase_bill_receipt_allocations[0] ?? null
    const poAllocation = item.purchase_bill_po_allocations[0] ?? null
    const allocatedGrossWeight = receiptAllocation ? toNumber(receiptAllocation.allocated_gross_weight) : toNumber(item.gross_weight)
    const allocatedDeductWeight = receiptAllocation ? toNumber(receiptAllocation.allocated_deduct_weight) : toNumber(item.deduct_weight)
    const allocatedQty = receiptAllocation ? toNumber(receiptAllocation.allocated_qty) : toNumber(item.qty)
    const receiptTicketDocNo = receiptAllocation?.weight_tickets.doc_no
      ?? sourceSnapshotValue(item.source_snapshot, 'receiptTicketDocNo')
      ?? '-'
    const receiptSummaryId = receiptAllocation?.weight_ticket_product_summary_id
      ?? sourceSnapshotValue(item.source_snapshot, 'receiptSummaryId')
      ?? '-'
    const receiptSummaryLabel = receiptAllocation?.weight_ticket_product_summaries
      ? `รวมจาก ${receiptAllocation.weight_ticket_product_summaries.line_count ?? 0} lot`
      : '-'
    const poDocNo = poAllocation?.po_buys.doc_no ?? item.po_buy_id ?? null

    return {
      amount: toNumber(item.amount),
      deductWeight: allocatedDeductWeight,
      grossWeight: allocatedGrossWeight,
      lineId: item.id,
      lineNo: item.line_no ?? index + 1,
      note: item.note ?? '',
      poDocNo,
      price: toNumber(item.price),
      productCode: item.product_code ?? '',
      productId: item.product_id ?? '',
      productName: item.display_name ?? item.product_name ?? item.product_id ?? '-',
      qty: allocatedQty,
      receiptSummaryId,
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

  const supplierName = bill.suppliers?.name ?? bill.supplier_id ?? '-'
  const subtotal = toNumber(bill.subtotal)
  const discount = toNumber(bill.discount_total ?? bill.discount)
  const vatAmount = toNumber(bill.vat_amount)
  const totalAmount = toNumber(bill.total_amount)
  const payableBalance = toNumber(bill.payable_balance)
  const paidAmount = toNumber(bill.paid_amount)
  const paymentEvents = Array.from(paymentRows.reduce((map, payment) => {
    const key = payment.voucher_id ?? payment.doc_no ?? payment.id
    const current = map.get(key) ?? {
      accountNames: new Set<string>(),
      amount: 0,
      bankFee: 0,
      date: toDateOnly(payment.date),
      docNo: payment.doc_no,
      notes: payment.notes ?? '',
      voucherId: payment.voucher_id ?? payment.id,
      withholdingTax: 0,
    }
    current.amount += toNumber(payment.amount)
    current.bankFee += toNumber(payment.bank_fee ?? payment.fee)
    current.withholdingTax += toNumber(payment.withholding_tax)
    map.set(key, current)
    return map
  }, new Map<string, {
    accountNames: Set<string>
    amount: number
    bankFee: number
    date: string
    docNo: string
    notes: string
    voucherId: string
    withholdingTax: number
  }>()).values()).map((event) => {
    bankStatementRows
      .filter((row) => row.ref_id === event.voucherId)
      .forEach((row) => event.accountNames.add(row.accounts?.name ?? row.account_id ?? '-'))
    return event
  })

  const timeline: TimelineEvent[] = [
    {
      date: bill.date ? toDateOnly(bill.date) : '-',
      details: [
        `เลขที่บิล ${bill.doc_no}`,
        `ผู้ขาย ${supplierName}`,
        `ยอดสุทธิ ${money(totalAmount)}`,
        `ผู้ทำ ${bill.created_by ?? '-'}`,
      ],
      title: 'สร้างบิลรับซื้อ',
      tone: 'blue',
    },
    ...paymentEvents.map((event) => ({
      amount: event.amount,
      date: event.date,
      details: [
        `เลขที่การชำระเงิน ${event.docNo}`,
        `ยอดจ่าย ${money(event.amount)}`,
        `WHT ${money(event.withholdingTax)}`,
        `Fee ${money(event.bankFee)}`,
        `บัญชี ${event.accountNames.size > 0 ? Array.from(event.accountNames).join(', ') : '-'}`,
        `หมายเหตุ ${event.notes || '-'}`,
      ],
      title: 'ชำระเงิน',
      tone: 'emerald' as const,
    })),
  ]

  if (bill.updated_at && bill.updated_by && bill.updated_by !== bill.created_by) {
    timeline.push({
      date: toDateOnly(bill.updated_at),
      details: [
        `ผู้แก้ไข ${bill.updated_by}`,
        `ยอดชำระแล้ว ${money(paidAmount)}`,
        `คงเหลือ ${money(payableBalance)}`,
      ],
      title: 'แก้ไขบิลล่าสุด',
      tone: 'amber',
    })
  }

  if (String(bill.status ?? '').toLowerCase().includes('cancel')) {
    timeline.push({
      date: bill.cancelled_at ? toDateOnly(bill.cancelled_at) : (bill.updated_at ? toDateOnly(bill.updated_at) : '-'),
      details: [
        `ผู้ยกเลิก ${bill.cancelled_by ?? bill.updated_by ?? '-'}`,
        `หมายเหตุ ${bill.cancel_note ?? '-'}`,
      ],
      title: 'ยกเลิกบิล',
      tone: 'rose',
    })
  } else if (payableBalance <= 0.01 && paidAmount > 0) {
    timeline.push({
      date: bill.updated_at ? toDateOnly(bill.updated_at) : '-',
      details: [
        `ยอดชำระแล้ว ${money(paidAmount)}`,
        `สถานะ ${purchaseBillStatusLabel(bill.status)}`,
      ],
      title: 'ชำระครบ',
      tone: 'slate',
    })
  }

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
          <Info label="รหัสผู้ขาย" value={bill.supplier_id ?? '-'} />
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
                    <div className="text-xs text-slate-500">{item.receiptSummaryId !== '-' ? item.receiptSummaryId : ''}</div>
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
