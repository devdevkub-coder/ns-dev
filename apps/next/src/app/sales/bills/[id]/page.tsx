import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { formatMoney } from '@/lib/daily'
import { AuthContextError, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getSalesBillDetail } from '@/lib/server/sales-bill-detail'

export const metadata: Metadata = {
  title: 'รายละเอียดบิลขาย | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string }>
}

function statusTextClass(status: string) {
  const normalized = status.toLowerCase()
  if (['received', 'paid'].includes(normalized)) return 'text-emerald-700'
  if (normalized === 'partial') return 'text-cyan-700'
  if (['cancelled', 'canceled'].includes(normalized)) return 'text-slate-500'
  return 'text-amber-700'
}

export default async function SalesBillDetailPage({ params }: PageProps) {
  let branchCodes: string[] | null = null
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    branchCodes = getBranchCodeIntersection(context)
  } catch (caught) {
    if (caught instanceof AuthContextError && caught.status === 404) notFound()
    throw caught
  }

  const { id } = await params
  const bill = await getSalesBillDetail(decodeURIComponent(id), { allowedBranchCodes: branchCodes })
  if (!bill) notFound()

  const receivedAmount = bill.receivedAmount || bill.paidAmount

  return (
    <div className="min-h-full bg-slate-100 px-2 py-4 sm:px-4">
      <PageTitleOverride breadcrumbLabel={bill.docNo} title={`รายละเอียดบิลขาย - ${bill.docNo}`} />
      <div className="mx-auto max-w-6xl rounded-md bg-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">รายละเอียดบิลขาย {bill.docNo}</h1>
            <p className="mt-1 text-sm text-slate-500">{bill.customerName}</p>
          </div>
          <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" href="/sales/bills">กลับรายการ</Link>
        </div>

        <div className="space-y-4 p-4">
          <section className="grid gap-3 md:grid-cols-4">
            <Summary label="ยอดรวม" value={formatMoney(bill.totalAmount)} />
            <Summary label="ค้างรับ" tone="red" value={formatMoney(bill.receivableBalance)} />
            <Summary label="รับแล้ว" tone="emerald" value={formatMoney(receivedAmount)} />
            <Summary label="สถานะรับเงิน" value={bill.statusLabel} />
          </section>

          <section className="rounded-md border border-slate-100 p-4">
            <h2 className="mb-3 text-base font-bold text-slate-800">ข้อมูลบิล</h2>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <Info label="เลขที่บิล" value={bill.docNo} />
              <Info label="วันที่เอกสาร" value={bill.date} />
              <Info label="วันที่ครบกำหนด" value={bill.dueDate || '-'} />
              <Info label="ลูกค้า" value={bill.customerName} />
              <Info label="รหัสลูกค้า" value={bill.customerCode} />
              <Info label="สาขา/คลัง" value={[bill.branchName, bill.warehouseName].filter((value) => value && value !== '-').join(' / ') || '-'} />
              <Info label="ช่องทางขาย" value={bill.channelName || '-'} />
              <Info label="ประเภทบิล" value={bill.transactionMode || '-'} />
              <Info label="ผู้ขาย" value={bill.salesName || '-'} />
              <Info label="ผู้ทำรายการ" value={bill.createdBy || '-'} />
              <Info label="อ้างอิงใบส่งของ WTO" value={bill.deliveryDocNos.join(', ') || '-'} />
              <Info label="สถานะรับเงิน" value={bill.statusLabel} />
            </div>
          </section>

          <section className="rounded-md border border-slate-100 p-4">
            <h2 className="mb-3 text-base font-bold text-slate-800">รายการสินค้า</h2>
            <div className="overflow-x-auto rounded-md border border-slate-100">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                    <th className="px-3 py-2 text-left font-medium">ที่มา</th>
                    <th className="px-3 py-2 text-left font-medium">WTO / รถ</th>
                    <th className="px-3 py-2 text-right font-medium">Gross</th>
                    <th className="px-3 py-2 text-right font-medium">หัก</th>
                    <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                    <th className="px-3 py-2 text-right font-medium">ราคา/หน่วย</th>
                    <th className="px-3 py-2 text-right font-medium">ส่วนลด</th>
                    <th className="px-3 py-2 text-right font-medium">ยอดขาย</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((item) => (
                    <tr key={item.lineNo} className="border-t border-slate-100">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-slate-900">{item.productName}</div>
                        <div className="text-xs text-slate-500">{[item.productCode || null, `line ${item.lineNo}`].filter(Boolean).join(' · ')}</div>
                        {item.note ? <div className="mt-1 text-xs text-slate-500">{item.note}</div> : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-slate-900">{item.sourceLabel || '-'}</div>
                        <div className="text-xs text-slate-500">{item.sourceType || '-'}</div>
                        {item.matchedCogs > 0 ? <div className="mt-1 text-xs text-red-600">Matched COGS {formatMoney(item.matchedCogs)}</div> : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div>{item.deliveryTicketDocNo || '-'}</div>
                        <div className="text-xs text-slate-500">{item.deliveryVehicleNo || '-'}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.grossWeight)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.deductWeight)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(item.qty || item.netWeight)} {item.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.price)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.discount)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(item.amount)}</td>
                    </tr>
                  ))}
                  {bill.items.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={9}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-slate-100 p-4">
              <h2 className="mb-3 text-base font-bold text-slate-800">VAT / ยอดรวม</h2>
              <div className="space-y-2 text-sm">
                <Line label="ยอดก่อนส่วนลด" value={formatMoney(bill.subtotal)} />
                <Line label="ส่วนลดท้ายบิล" value={formatMoney(bill.discount)} />
                <Line label="VAT" value={formatMoney(bill.vatAmount)} />
                <Line strong label="ยอดสุทธิ" value={formatMoney(bill.totalAmount)} />
              </div>
            </div>
            <div className="rounded-md border border-slate-100 p-4">
              <h2 className="mb-3 text-base font-bold text-slate-800">ใบกำกับภาษี / หมายเหตุ</h2>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <Info label="ออกใบกำกับภาษี" value={bill.vatInvoiceIssued ? 'ออกแล้ว' : 'ยังไม่ได้ออก'} />
                <Info label="เลขที่ใบกำกับภาษี" value={bill.vatInvoiceNo || '-'} />
                <Info label="วันที่ใบกำกับภาษี" value={bill.vatInvoiceDate || '-'} />
                <Info label="หมายเหตุ" value={bill.note || '-'} />
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-700">สถานะ SB</h2>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusTextClass(bill.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                ล่าสุด: {bill.statusLabel}
              </span>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                {(bill.timeline.length > 0 ? bill.timeline : [{
                  actor: '-',
                  createdAt: '',
                  details: [`สถานะ ${bill.statusLabel}`],
                  id: 'current-status',
                  status: bill.status,
                  statusLabel: bill.statusLabel,
                  title: 'สถานะปัจจุบัน',
                  transitionText: bill.statusLabel,
                }]).map((event, index) => (
                  <div key={event.id} className="grid grid-cols-[96px_1fr] gap-3">
                    <div className="pt-1 text-right text-xs text-slate-500">
                      <div>{formatDateTime(event.createdAt)}</div>
                      <div className="mt-1 truncate text-xs">{event.actor}</div>
                    </div>
                    <div className="relative border-l border-slate-100 pb-4 pl-4 last:pb-0">
                      <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${index === 0 ? 'bg-blue-500' : 'bg-slate-300'}`} />
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-slate-800">{event.title}</div>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusTextClass(event.status)}`}>
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
              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-700">Source usage facts</h3>
                {bill.sourceUsageFacts.length === 0 ? (
                  <div className="rounded-md bg-white p-4 text-center text-xs text-slate-500">ยังไม่มี usage fact สำหรับบิลนี้</div>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-md border border-slate-100 bg-white">
                    <table className="w-full min-w-[620px] text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">รายการ</th>
                          <th className="px-3 py-2 text-left font-medium">เอกสาร</th>
                          <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                          <th className="px-3 py-2 text-right font-medium">มูลค่า/COGS</th>
                          <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.sourceUsageFacts.map((fact) => (
                          <tr key={fact.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium text-slate-900">{fact.title}</div>
                              <div className="text-slate-500">{[fact.type, fact.productName !== '-' ? fact.productName : null, fact.lineNo ? `line ${fact.lineNo}` : null].filter(Boolean).join(' · ')}</div>
                            </td>
                            <td className="px-3 py-2 align-top font-mono text-xs text-slate-700">{fact.docNo || '-'}</td>
                            <td className="px-3 py-2 text-right align-top tabular-nums">{fact.qty ? `${formatMoney(fact.qty)} ${fact.unit}` : '-'}</td>
                            <td className="px-3 py-2 text-right align-top tabular-nums">{fact.amount ? formatMoney(fact.amount) : '-'}</td>
                            <td className="px-3 py-2 align-top">
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${fact.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{fact.status}</span>
                              <div className="mt-1 text-xs text-slate-400">{formatDateTime(fact.createdAt)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
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

function formatDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
