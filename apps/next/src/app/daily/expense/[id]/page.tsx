import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const metadata: Metadata = {
  title: 'รายละเอียดค่าใช้จ่าย | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string }>
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateOrDash(value: Date | null | undefined) {
  return value ? toDateOnly(value) : '-'
}

function text(value: string | null | undefined) {
  return String(value ?? '').trim() || '-'
}

function paidStatusLabel(value: string | null | undefined) {
  return String(value ?? '').toLowerCase() === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
  } catch (caught) {
    if (caught instanceof AuthContextError && caught.status === 404) notFound()
    throw caught
  }

  const { id } = await params
  const row = await prisma.expenses.findFirst({
    include: {
      accounts: true,
      branches: true,
      expense_categories: true,
    },
    where: {
      OR: [{ id }, { doc_no: id }],
    },
  })

  if (!row) notFound()

  const amount = toNumber(row.amount)
  const vat = toNumber(row.vat ?? row.vat_amount)
  const wht = toNumber(row.wht ?? row.wht_amount)
  const netAmount = toNumber(row.net_amount) || amount + vat - wht

  return (
    <section className="space-y-4">
      <PageTitleOverride title={`รายละเอียดค่าใช้จ่าย ${row.doc_no}`} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-4 shadow">
        <div>
          <h1 className="text-xl font-bold text-slate-900">รายละเอียดค่าใช้จ่าย</h1>
        </div>
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/daily/expense">
          กลับไปรายการค่าใช้จ่าย
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-md bg-red-50 p-3 shadow">
          <div className="text-xs text-red-700">Net Pay</div>
          <div className="text-lg font-bold text-red-800">{money(netAmount)}</div>
        </div>
        <div className="rounded-md bg-blue-50 p-3 shadow">
          <div className="text-xs text-blue-700">ยอดก่อน VAT</div>
          <div className="text-lg font-bold text-blue-800">{money(amount)}</div>
        </div>
        <div className="rounded-md bg-emerald-50 p-3 shadow">
          <div className="text-xs text-emerald-700">VAT</div>
          <div className="text-lg font-bold text-emerald-800">{money(vat)}</div>
        </div>
        <div className="rounded-md bg-amber-50 p-3 shadow">
          <div className="text-xs text-amber-700">WHT</div>
          <div className="text-lg font-bold text-amber-800">{money(wht)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailCard label="เลขที่เอกสาร" value={row.doc_no} />
        <DetailCard label="วันที่เอกสาร" value={dateOrDash(row.date)} />
        <DetailCard label="ครบกำหนด" value={dateOrDash(row.due_date)} />
        <DetailCard label="สถานะจ่าย" value={paidStatusLabel(row.paid_status)} />
        <DetailCard label="หมวดค่าใช้จ่าย" value={row.expense_categories?.name ?? text(row.category_id)} />
        <DetailCard label="ผู้รับเงิน" value={text(row.payee)} />
        <DetailCard label="บัญชีจ่าย" value={row.accounts?.name ?? text(row.account_id)} />
        <DetailCard label="สาขา" value={row.branches?.name ?? text(row.branch_id)} />
        <DetailCard label="เลขอ้างอิง" value={text(row.ref_doc_no)} />
        <DetailCard label="เลขใบกำกับภาษี" value={text(row.tax_invoice_no)} />
        <DetailCard label="รายละเอียด" value={text(row.description)} />
        <DetailCard label="หมายเหตุ" value={text(row.notes)} />
      </div>
    </section>
  )
}
