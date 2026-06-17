import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { advancePaymentStatusLabel } from '@/lib/server/advance-payments'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const metadata: Metadata = {
  title: 'รายละเอียดเงินมัดจำ | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string }>
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function labelStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').trim()
  return normalized ? advancePaymentStatusLabel(normalized) : '-'
}

function dateOrDash(value: Date | null | undefined) {
  return value ? toDateOnly(value) : '-'
}

function text(value: string | null | undefined) {
  return String(value ?? '').trim() || '-'
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

export default async function AdvancePaymentDetailPage({ params }: PageProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
  } catch (caught) {
    if (caught instanceof AuthContextError && caught.status === 404) notFound()
    throw caught
  }

  const { id } = await params
  const row = await prisma.supplier_advance_payments.findFirst({
    include: {
      accounts: true,
      branches: true,
      supplier_advance_allocations: {
        select: {
          allocation_key: true,
          allocated_amount: true,
          created_at: true,
          id: true,
          purchase_bills: {
            select: {
              doc_no: true,
              id: true,
            },
          },
          purchase_bill_id: true,
        },
        orderBy: { created_at: 'asc' },
      },
      suppliers: true,
    },
    where: {
      doc_no: id,
    },
  })

  if (!row) notFound()

  const amount = toNumber(row.amount)
  const allocatedAmount = toNumber(row.allocated_amount)
  const remainingAmount = toNumber(row.remaining_amount)

  return (
    <section className="space-y-4">
      <PageTitleOverride title={`รายละเอียดเงินมัดจำ ${row.doc_no}`} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-4 shadow">
        <div>
          <h1 className="text-xl font-bold text-slate-900">รายละเอียดเงินมัดจำ / ADV</h1>
        </div>
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/purchase/advance-payments">
          กลับไปรายการ ADV
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-md bg-blue-50 p-3 shadow">
          <div className="text-xs text-blue-700">ยอดมัดจำ</div>
          <div className="text-lg font-bold text-blue-800">{money(amount)}</div>
        </div>
        <div className="rounded-md bg-emerald-50 p-3 shadow">
          <div className="text-xs text-emerald-700">ใช้หักแล้ว</div>
          <div className="text-lg font-bold text-emerald-800">{money(allocatedAmount)}</div>
        </div>
        <div className="rounded-md bg-amber-50 p-3 shadow">
          <div className="text-xs text-amber-700">คงเหลือ</div>
          <div className="text-lg font-bold text-amber-800">{money(remainingAmount)}</div>
        </div>
        <div className="rounded-md bg-slate-50 p-3 shadow">
          <div className="text-xs text-slate-500">สถานะ</div>
          <div className="text-lg font-bold text-slate-900">{labelStatus(row.status)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailCard label="เลขที่เอกสาร" value={row.doc_no} />
        <DetailCard label="วันที่เอกสาร" value={dateOrDash(row.advance_date)} />
        <DetailCard label="สาขา" value={row.branches?.name ?? '-'} />
        <DetailCard label="ผู้ขาย" value={row.suppliers?.name ?? '-'} />
        <DetailCard label="เลขเอกสารชั่งใหญ่" value={text(row.large_scale_doc_no)} />
        <DetailCard label="ทะเบียนรถ" value={text(row.plate_no)} />
        <DetailCard label="สินค้า" value={text(row.product_name)} />
        <DetailCard label="ราคา/กก." value={money(toNumber(row.price_per_kg))} />
        <DetailCard label="น้ำหนักเข้า" value={money(toNumber(row.weight_in))} />
        <DetailCard label="น้ำหนักออก" value={money(toNumber(row.weight_out))} />
        <DetailCard label="น้ำหนักสุทธิ" value={money(toNumber(row.net_weight))} />
        <DetailCard label="หมายเหตุ" value={text(row.remark)} />
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">ประวัติการนำ ADV ไปหักบิล</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
              <tr>
                <th className="p-2 text-left">วันที่</th>
                <th className="p-2 text-left">บิลรับซื้อ</th>
                <th className="p-2 text-right">ยอดที่หัก</th>
              </tr>
            </thead>
            <tbody>
              {row.supplier_advance_allocations.map((allocation) => (
                <tr key={allocation.allocation_key} className="border-t">
                  <td className="p-2">{dateOrDash(allocation.created_at)}</td>
                  <td className="p-2">
                    {allocation.purchase_bills ? (
                      <Link className="text-blue-700 hover:underline" href={`/purchase/bills/${allocation.purchase_bills.doc_no}`}>
                        {allocation.purchase_bills.doc_no}
                      </Link>
                    ) : '-'}
                  </td>
                  <td className="p-2 text-right font-medium">{money(toNumber(allocation.allocated_amount))}</td>
                </tr>
              ))}
              {row.supplier_advance_allocations.length === 0 ? (
                <tr>
                  <td className="p-6 text-center text-slate-500" colSpan={3}>ยังไม่มีประวัติการหักบิล</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
