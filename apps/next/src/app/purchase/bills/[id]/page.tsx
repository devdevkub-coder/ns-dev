import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { PurchaseBillPrintButton } from '@/components/purchase-flow/PurchaseBillPrintButton'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getPurchaseBillDetail, type PurchaseBillDetailTimelineEvent } from '@/lib/server/purchase-bill-detail'

export const metadata: Metadata = {
  title: 'รายละเอียดบิลรับซื้อ | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string }>
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  })
}

function statusTextClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'paid') return 'text-emerald-700'
  if (normalized === 'partial') return 'text-cyan-700'
  if (['cancelled', 'cancelled_supplier_swap'].includes(normalized)) return 'text-slate-500'
  return 'text-amber-700'
}

function toneDotClass(tone: PurchaseBillDetailTimelineEvent['tone']) {
  if (tone === 'blue') return 'bg-blue-500'
  if (tone === 'emerald') return 'bg-emerald-500'
  if (tone === 'amber') return 'bg-amber-500'
  if (tone === 'rose') return 'bg-rose-500'
  return 'bg-slate-500'
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
  const bill = await getPurchaseBillDetail(decodeURIComponent(id))
  if (!bill) notFound()

  return (
    <div className="min-h-full bg-slate-100 px-2 py-4 sm:px-4">
      <PageTitleOverride breadcrumbLabel={bill.docNo} title={`รายละเอียดบิลรับซื้อ - ${bill.docNo}`} />
      <div className="mx-auto max-w-6xl rounded-md bg-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">รายละเอียดบิลรับซื้อ {bill.docNo}</h1>
            <p className="mt-1 text-sm text-slate-500">{bill.supplierName}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <PurchaseBillPrintButton bill={bill} />
            <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" href="/purchase/bills">กลับรายการ</Link>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <section className="grid gap-3 md:grid-cols-4">
            <Summary label="ยอดรวม" value={money(bill.totalAmount)} />
            <Summary label="ค้างชำระ" tone="red" value={money(bill.payableBalance)} />
            <Summary label="ชำระแล้ว" tone="emerald" value={money(bill.paidAmount)} />
            <Summary label="สถานะการชำระเงิน" value={bill.statusLabel} />
          </section>

          <section className="rounded-md border border-slate-200 p-4">
            <h2 className="mb-3 text-base font-bold text-slate-800">ข้อมูลบิล</h2>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <Info label="เลขที่บิล" value={bill.docNo} />
              <Info label="วันที่สร้างรายการ" value={bill.date} />
              <Info label="ผู้ขาย" value={bill.supplierName} />
              <Info label="รหัสผู้ขาย" value={bill.supplierCode} />
              <Info label="สาขา/คลัง" value={bill.branchName} />
              <Info label="ประเภทบิล" value={bill.transactionMode} />
              <Info label="สถานะการชำระเงิน" value={bill.statusLabel} />
              <Info label="ผู้ทำ" value={bill.createdBy} />
              <Info label="อ้างอิงจากใบรับของ" value={bill.receiptDocNos.join(', ') || '-'} />
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-4">
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
                  {bill.productSummaries.map((item) => (
                    <tr key={item.productId || item.productName} className="border-t border-slate-200">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-slate-900">{item.productName}</div>
                        <div className="text-xs text-slate-500">{[item.productCode || null, `${item.lineCount} allocation`].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">{item.receiptDocNos.join(', ') || '-'}</td>
                      <td className="px-3 py-2 align-top text-slate-700">
                        <div>{item.sourceKinds.join(' + ') || '-'}</div>
                        <div className="text-xs text-slate-500">{item.poDocNos.join(', ') || 'Spot Buy'}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(item.grossWeight)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(item.deductWeight)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{money(item.qty)} {item.unit}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{money(item.amount)}</td>
                    </tr>
                  ))}
                  {bill.productSummaries.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={7}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-4">
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
                  {bill.allocationRows.map((item) => (
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
                      <td className="px-3 py-2 align-top text-slate-900">{item.receiptSummaryLabel}</td>
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
                  {bill.allocationRows.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={9}>ไม่มีรายการ allocation ในบิล</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-4">
              <h2 className="mb-3 text-base font-bold text-slate-800">VAT / ยอดรวม</h2>
              <div className="space-y-2 text-sm">
                <Line label="ยอดก่อนส่วนลด" value={money(bill.subtotal)} />
                <Line label="ส่วนลดท้ายบิล" value={money(bill.discount)} />
                <Line label="VAT" value={money(bill.vatAmount)} />
                <Line strong label="ยอดสุทธิ" value={money(bill.totalAmount)} />
              </div>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <h2 className="mb-3 text-base font-bold text-slate-800">ใบกำกับภาษี / หมายเหตุ</h2>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <Info label="ได้รับใบกำกับภาษี" value={bill.vatInvoiceReceived ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'} />
                <Info label="เลขที่ใบกำกับภาษี" value={bill.vatInvoiceNo} />
                <Info label="วันที่ใบกำกับภาษี" value={bill.vatInvoiceDate} />
                <Info label="หมายเหตุ" value={bill.note || '-'} />
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-700">ประวัติ PB</h2>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusTextClass(bill.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                ล่าสุด: {bill.statusLabel}
              </span>
            </div>
            <PurchaseBillTimeline events={bill.timeline} status={bill.status} statusLabel={bill.statusLabel} />
          </section>
        </div>
      </div>
    </div>
  )
}

function PurchaseBillTimeline({ events, status, statusLabel }: { events: PurchaseBillDetailTimelineEvent[]; status: string; statusLabel: string }) {
  const timelineEvents = events.length > 0
    ? events
    : [{
        action: 'current_status',
        actor: '-',
        createdAt: '',
        details: [`สถานะ ${statusLabel}`],
        id: 'current-status',
        status,
        statusLabel,
        title: 'สถานะปัจจุบัน',
        tone: 'slate' as const,
        transitionText: statusLabel,
      }]

  return (
    <div className="space-y-3">
      {timelineEvents.map((event, index) => (
        <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
          <div className="pt-1 text-right text-xs text-slate-500">
            <div>{formatDateTime(event.createdAt)}</div>
            <div className="mt-1 truncate text-[11px]">{event.actor}</div>
          </div>
          <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
            <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${index === 0 ? toneDotClass(event.tone) : 'bg-slate-300'}`} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-slate-800">{event.title}</div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusTextClass(event.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                {event.statusLabel}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{event.transitionText}</div>
            <div className="mt-2 grid gap-1 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
              {event.details.map((detail) => <div key={detail}>{detail}</div>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Summary({ label, tone = 'slate', value }: { label: string; tone?: 'emerald' | 'red' | 'slate'; value: string }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return <div className="rounded-md bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-xl font-bold ${color}`}>{value}</div></div>
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
