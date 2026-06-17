import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const metadata: Metadata = {
  title: 'รายละเอียดอนุมัติจ่าย | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string[] }>
}

type TimelineEvent = {
  date: string
  details: string[]
  tone: 'blue' | 'emerald' | 'rose' | 'slate'
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

function statusLabel(status: string | null | undefined) {
  if (status === 'pending') return 'รออนุมัติ'
  if (status === 'approved') return 'รอจ่าย'
  if (status === 'paid') return 'จ่ายแล้ว'
  if (status === 'voided') return 'ยกเลิก'
  return status ?? '-'
}

function actionLabel(action: string) {
  if (action === 'approved') return 'อนุมัติ PMA'
  if (action === 'selected_for_payment') return 'เลือกเข้าจ่าย'
  if (action === 'paid') return 'จ่าย PMA แล้ว'
  if (action === 'voided_before_payment') return 'ยกเลิก PMA ก่อนจ่าย'
  if (action === 'reversed_by_payment_cancel') return 'คืน PMA จากการยกเลิก PMT'
  return action
}

function actionTone(action: string): TimelineEvent['tone'] {
  if (action === 'approved' || action === 'selected_for_payment') return 'blue'
  if (action === 'paid') return 'emerald'
  if (action === 'voided_before_payment' || action === 'reversed_by_payment_cancel') return 'rose'
  return 'slate'
}

function dotClass(tone: TimelineEvent['tone']) {
  if (tone === 'blue') return 'bg-blue-500'
  if (tone === 'emerald') return 'bg-emerald-500'
  if (tone === 'rose') return 'bg-rose-500'
  return 'bg-slate-500'
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

export default async function PaymentApprovalDetailPage({ params }: PageProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
  } catch (caught) {
    if (caught instanceof AuthContextError && caught.status === 404) notFound()
    throw caught
  }

  const { id } = await params
  const approvalDocNo = decodeURIComponent(id.join('/'))
  const approval = await prisma.payment_approvals.findFirst({
    where: { doc_no: approvalDocNo },
  })
  if (!approval) notFound()

  const [statusLogs, allocations] = await Promise.all([
    prisma.payment_approval_status_logs.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: { payment_approval_id: approval.id },
    }),
    prisma.payment_allocations.findMany({
      include: {
        payments: {
          select: {
            doc_no: true,
          },
        },
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: { payment_approval_id: approval.id },
    }),
  ])

  const timeline: TimelineEvent[] = [
    ...statusLogs.map((log) => ({
      date: dateTime(log.created_at),
      details: [
        log.from_status ? `สถานะ: ${statusLabel(log.from_status)} -> ${statusLabel(log.to_status)}` : `สถานะ: ${statusLabel(log.to_status)}`,
        `ยอดอนุมัติ: ${money(toNumber(log.approved_amount_snapshot))}`,
        log.payment_doc_no ? `PMT: ${log.payment_doc_no}` : '',
        log.note ? `หมายเหตุ: ${log.note}` : '',
        log.created_by ? `ผู้ทำรายการ: ${log.created_by}` : '',
      ].filter(Boolean),
      tone: actionTone(log.action),
      title: actionLabel(log.action),
    })),
    ...allocations.map((allocation) => ({
      date: dateTime(allocation.status === 'reversed' ? allocation.updated_at ?? allocation.created_at : allocation.created_at),
      details: [
        `PMT: ${allocation.payment_doc_no}`,
        allocation.source_doc_no_snapshot ? `เอกสารต้นทาง: ${allocation.source_doc_no_snapshot}` : '',
        `ยอดจัดสรร: ${money(toNumber(allocation.allocated_amount))}`,
      ].filter(Boolean),
      tone: allocation.status === 'reversed' ? 'rose' as const : 'emerald' as const,
      title: allocation.status === 'reversed' ? 'คืน allocation จาก PMT' : 'ผูก PMA เข้ากับ PMT',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date, 'th-TH'))

  return (
    <section className="space-y-4">
      <PageTitleOverride title={`รายละเอียดอนุมัติจ่าย ${approvalDocNo}`} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-4 shadow">
        <div>
          <h1 className="text-xl font-bold text-slate-900">รายละเอียดอนุมัติจ่าย / PMA</h1>
          <div className="mt-1 font-mono text-sm text-slate-500">{approvalDocNo}</div>
        </div>
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/purchase/payments?tab=history">
          กลับประวัติการจ่ายเงิน
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-md bg-blue-50 p-3 shadow">
          <div className="text-xs text-blue-700">ยอดอนุมัติ</div>
          <div className="text-lg font-bold text-blue-800">{money(toNumber(approval.approved_amount))}</div>
        </div>
        <div className="rounded-md bg-slate-50 p-3 shadow">
          <div className="text-xs text-slate-500">สถานะ</div>
          <div className="text-lg font-bold text-slate-900">{statusLabel(approval.status)}</div>
        </div>
        <div className="rounded-md bg-emerald-50 p-3 shadow">
          <div className="text-xs text-emerald-700">วันที่อนุมัติ</div>
          <div className="text-lg font-bold text-emerald-800">{dateOrDash(approval.approved_at)}</div>
        </div>
        <div className={approval.status === 'voided' ? 'rounded-md bg-rose-50 p-3 shadow' : 'rounded-md bg-slate-50 p-3 shadow'}>
          <div className={approval.status === 'voided' ? 'text-xs text-rose-700' : 'text-xs text-slate-500'}>วันที่ปิดรายการ</div>
          <div className={approval.status === 'voided' ? 'text-lg font-bold text-rose-800' : 'text-lg font-bold text-slate-900'}>
            {approval.status === 'voided' ? dateOrDash(approval.voided_at) : dateOrDash(approval.paid_at)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailCard label="เอกสารต้นทาง" value={approval.source_doc_no_snapshot ?? approval.source_id} />
        <DetailCard label="ประเภทต้นทาง" value={approval.source_type} />
        <DetailCard label="ผู้รับเงิน" value={approval.party_name_snapshot ?? '-'} />
        <DetailCard label="วิธีจ่ายปลายทาง" value={approval.destination_payment_method_snapshot ?? '-'} />
        <DetailCard label="ธนาคารปลายทาง" value={approval.destination_bank_name_snapshot ?? '-'} />
        <DetailCard label="เลขบัญชีปลายทาง" value={approval.destination_account_no_snapshot ?? '-'} />
        <DetailCard label="ผู้อนุมัติ" value={approval.approved_by ?? '-'} />
        <DetailCard label="เหตุผลยกเลิก" value={approval.void_reason ?? '-'} />
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">PMT ที่ใช้ PMA นี้</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
              <tr>
                <th className="p-2 text-left">PMT</th>
                <th className="p-2 text-right">ยอดจัดสรร</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((allocation) => (
                <tr key={allocation.allocation_key} className="border-t">
                  <td className="p-2 font-mono text-slate-800">{allocation.payment_doc_no}</td>
                  <td className="p-2 text-right font-medium">{money(toNumber(allocation.allocated_amount))}</td>
                </tr>
              ))}
              {allocations.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={2}>ยังไม่มี PMT allocation</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <section className="rounded-md bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">Timeline PMA</h2>
        <div className="space-y-4">
          {timeline.map((event, index) => (
            <div key={`${event.title}-${event.date}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-3 w-3 rounded-full ${dotClass(event.tone)}`} />
                {index < timeline.length - 1 ? <span className="mt-1 h-full w-px bg-slate-200" /> : null}
              </div>
              <div className="flex-1 rounded-md border border-slate-100 p-3">
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
          {timeline.length === 0 ? <div className="text-sm text-slate-500">ยังไม่มี timeline PMA</div> : null}
        </div>
      </section>
    </section>
  )
}
