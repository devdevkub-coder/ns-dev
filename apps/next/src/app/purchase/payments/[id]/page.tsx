import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const metadata: Metadata = {
  title: 'รายละเอียดการจ่ายเงิน | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string }>
}

type TimelineEvent = {
  date: string
  details: string[]
  tone: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate'
  title: string
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateOrDash(value: Date | null | undefined) {
  return value ? toDateOnly(value) : '-'
}

function dateTime(value: Date | null | undefined) {
  return value ? value.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
}

function paymentStatusLabel(status: string | null | undefined) {
  if (status === 'cancelled') return 'ยกเลิก'
  if (status === 'active') return 'เสร็จสิ้น'
  return status ?? '-'
}

function paymentActionLabel(action: string) {
  if (action === 'posted') return 'บันทึก PMT'
  if (action === 'bank_posted') return 'บันทึกบัญชีจ่าย'
  if (action === 'cancelled') return 'ยกเลิก PMT'
  if (action === 'bank_reversed') return 'คืนรายการบัญชีจ่าย'
  return action
}

function paymentActionTone(action: string): TimelineEvent['tone'] {
  if (action === 'posted' || action === 'bank_posted') return 'emerald'
  if (action === 'cancelled' || action === 'bank_reversed') return 'rose'
  return 'slate'
}

function dotClass(tone: TimelineEvent['tone']) {
  if (tone === 'blue') return 'bg-blue-500'
  if (tone === 'emerald') return 'bg-emerald-500'
  if (tone === 'amber') return 'bg-amber-500'
  if (tone === 'rose') return 'bg-rose-500'
  return 'bg-slate-500'
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

export default async function PaymentDetailPage({ params }: PageProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
  } catch (caught) {
    if (caught instanceof AuthContextError && caught.status === 404) notFound()
    throw caught
  }

  const { id } = await params
  const documentId = decodeURIComponent(id)
  const payments = await prisma.payments.findMany({
    include: {
      accounts: true,
      payment_approvals: {
        select: {
          doc_no: true,
          source_doc_no_snapshot: true,
        },
      },
      suppliers: true,
    },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    where: {
      OR: [
        { voucher_id: documentId },
        { doc_no: documentId },
      ],
    },
  })

  if (payments.length === 0) notFound()

  const firstPayment = payments[0]!
  const voucherKey = firstPayment.voucher_id ?? firstPayment.doc_no
  const [statusLogs, allocations, accountSplits] = await Promise.all([
    prisma.payment_status_logs.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: {
        OR: [
          { payment_voucher_id: voucherKey },
          { payment_doc_no: firstPayment.doc_no },
        ],
      },
    }),
    prisma.payment_allocations.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: { payment_voucher_id: voucherKey },
    }),
    prisma.payment_account_splits.findMany({
      include: { accounts: true },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: { payment_voucher_id: voucherKey },
    }),
  ])

  const amount = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const withholdingTax = payments.reduce((sum, payment) => sum + toNumber(payment.withholding_tax), 0)
  const fee = payments.reduce((sum, payment) => sum + toNumber(payment.fee ?? payment.bank_fee), 0)
  const netAmount = payments.reduce((sum, payment) => sum + toNumber(payment.net_amount), 0)
  const status = payments.some((payment) => payment.status === 'cancelled') ? 'cancelled' : 'active'

  const timeline: TimelineEvent[] = [
    ...statusLogs.map((log) => ({
      date: dateTime(log.created_at),
      details: [
        log.from_status ? `สถานะ: ${paymentStatusLabel(log.from_status)} -> ${paymentStatusLabel(log.to_status)}` : `สถานะ: ${paymentStatusLabel(log.to_status)}`,
        `ยอดจ่าย: ${money(toNumber(log.amount_snapshot))}`,
        `สุทธิ: ${money(toNumber(log.net_amount_snapshot))}`,
        log.note ? `หมายเหตุ: ${log.note}` : '',
        log.created_by ? `ผู้ทำรายการ: ${log.created_by}` : '',
      ].filter(Boolean),
      tone: paymentActionTone(log.action),
      title: paymentActionLabel(log.action),
    })),
    ...allocations.map((allocation) => ({
      date: dateTime(allocation.created_at),
      details: [
        `PMA: ${allocation.payment_approval_doc_no}`,
        allocation.source_doc_no_snapshot ? `เอกสารต้นทาง: ${allocation.source_doc_no_snapshot}` : '',
        `ยอดจัดสรร: ${money(toNumber(allocation.allocated_amount))}`,
        `สถานะ allocation: ${allocation.status}`,
      ].filter(Boolean),
      tone: allocation.status === 'reversed' ? 'rose' as const : 'blue' as const,
      title: allocation.status === 'reversed' ? 'Reverse PMA allocation' : 'ผูก PMA เข้ากับ PMT',
    })),
    ...accountSplits.map((split) => ({
      date: dateTime(split.status === 'reversed' ? split.updated_at ?? split.created_at : split.created_at),
      details: [
        `บัญชี: ${split.account_name_snapshot ?? split.accounts?.name ?? '-'}`,
        split.account_code_snapshot ?? split.accounts?.code ? `รหัสบัญชี: ${split.account_code_snapshot ?? split.accounts?.code}` : '',
        split.bank_statement_doc_no ? `รายการธนาคาร: ${split.bank_statement_doc_no}` : '',
        `ยอด: ${money(toNumber(split.amount))}`,
      ].filter(Boolean),
      tone: split.status === 'reversed' ? 'rose' as const : 'emerald' as const,
      title: split.status === 'reversed' ? 'Reverse bank split' : 'บันทึก bank split',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date, 'th-TH'))

  return (
    <section className="space-y-4">
      <PageTitleOverride title={`รายละเอียดการจ่ายเงิน ${firstPayment.doc_no}`} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-4 shadow">
        <div>
          <h1 className="text-xl font-bold text-slate-900">รายละเอียดการจ่ายเงิน / PMT</h1>
          <div className="mt-1 text-sm text-slate-500">{firstPayment.doc_no}</div>
        </div>
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/purchase/payment-history">
          กลับประวัติการจ่ายเงิน
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-md bg-blue-50 p-3 shadow">
          <div className="text-xs text-blue-700">ยอดจ่าย</div>
          <div className="text-lg font-bold text-blue-800">{money(amount)}</div>
        </div>
        <div className="rounded-md bg-amber-50 p-3 shadow">
          <div className="text-xs text-amber-700">WHT</div>
          <div className="text-lg font-bold text-amber-800">{money(withholdingTax)}</div>
        </div>
        <div className="rounded-md bg-slate-50 p-3 shadow">
          <div className="text-xs text-slate-500">Bank Fee</div>
          <div className="text-lg font-bold text-slate-900">{money(fee)}</div>
        </div>
        <div className={status === 'cancelled' ? 'rounded-md bg-rose-50 p-3 shadow' : 'rounded-md bg-emerald-50 p-3 shadow'}>
          <div className={status === 'cancelled' ? 'text-xs text-rose-700' : 'text-xs text-emerald-700'}>สุทธิ / สถานะ</div>
          <div className={status === 'cancelled' ? 'text-lg font-bold text-rose-800' : 'text-lg font-bold text-emerald-800'}>{money(netAmount)} · {paymentStatusLabel(status)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailCard label="เลขที่ PMT" value={firstPayment.doc_no} />
        <DetailCard label="Voucher ID" value={voucherKey} />
        <DetailCard label="วันที่จ่าย" value={dateOrDash(firstPayment.date)} />
        <DetailCard label="ผู้ขาย" value={firstPayment.suppliers?.name ?? '-'} />
        <DetailCard label="วิธีจ่าย" value={firstPayment.method ?? '-'} />
        <DetailCard label="หมายเหตุ" value={firstPayment.notes ?? '-'} />
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-slate-900">PMA ที่จ่ายใน PMT นี้</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">PMA</th>
                <th className="p-2 text-left">เอกสารต้นทาง</th>
                <th className="p-2 text-right">ยอดจัดสรร</th>
                <th className="p-2 text-left">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((allocation) => (
                <tr key={allocation.allocation_key} className="border-t">
                  <td className="p-2 font-mono text-blue-700">
                    <Link href={`/purchase/payment-approvals/${encodeURIComponent(allocation.payment_approval_doc_no)}`}>{allocation.payment_approval_doc_no}</Link>
                  </td>
                  <td className="p-2 font-mono">{allocation.source_doc_no_snapshot ?? '-'}</td>
                  <td className="p-2 text-right font-medium">{money(toNumber(allocation.allocated_amount))}</td>
                  <td className="p-2">{allocation.status === 'reversed' ? 'reversed' : 'active'}</td>
                </tr>
              ))}
              {allocations.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={4}>ยังไม่มี PMA allocation</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-slate-900">บัญชีที่ใช้ทำจ่าย</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">บัญชี</th>
                <th className="p-2 text-left">รายการธนาคาร</th>
                <th className="p-2 text-right">ยอด</th>
                <th className="p-2 text-left">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {accountSplits.map((split) => (
                <tr key={split.split_key} className="border-t">
                  <td className="p-2">{split.account_name_snapshot ?? split.accounts?.name ?? '-'}</td>
                  <td className="p-2 font-mono">{split.bank_statement_doc_no ?? '-'}</td>
                  <td className="p-2 text-right font-medium">{money(toNumber(split.amount))}</td>
                  <td className="p-2">{split.status}</td>
                </tr>
              ))}
              {accountSplits.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={4}>ยังไม่มีข้อมูลบัญชีจ่าย</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <section className="rounded-md bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">Timeline PMT</h2>
        <div className="space-y-4">
          {timeline.map((event, index) => (
            <div key={`${event.title}-${event.date}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-3 w-3 rounded-full ${dotClass(event.tone)}`} />
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
          {timeline.length === 0 ? <div className="text-sm text-slate-500">ยังไม่มี timeline PMT</div> : null}
        </div>
      </section>
    </section>
  )
}
