import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'

export const metadata: Metadata = {
  title: 'รายละเอียดบิลรับซื้อ | NS Scrap ERP',
}

type PageProps = {
  params: Promise<{ id: string }>
}

type PurchaseItem = {
  amount?: number
  deductWeight?: number
  discount?: number
  displayName?: string | null
  grossWeight?: number
  poBuyId?: string | null
  price?: number
  productCode?: string
  productId?: string
  productName?: string
  qty?: number
  salesPrice?: number
  unit?: string
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function purchaseSourceLabel(value: string | null | undefined) {
  if (value === 'PO_RECEIPT') return 'PO RECEIPT'
  if (value === 'MIXED') return 'ผสม Spot + PO'
  return 'SPOT BUY'
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
      purchase_channels: true,
      purchase_bill_items: { orderBy: { line_no: 'asc' } },
      suppliers: true,
      warehouses: true,
    },
    where: { id },
  })

  if (!bill) notFound()

  const items = purchaseBillItemRows(bill) as PurchaseItem[]
  const supplierName = bill.suppliers?.name ?? bill.supplier_id ?? '-'
  const subtotal = toNumber(bill.subtotal)
  const discount = toNumber(bill.discount_total ?? bill.discount)
  const vatAmount = toNumber(bill.vat_amount)
  const totalAmount = toNumber(bill.total_amount)
  const payableBalance = toNumber(bill.payable_balance)
  const paidAmount = toNumber(bill.paid_amount)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-sm text-slate-500">
            <Link className="hover:text-blue-700" href="/purchase/bills">บิลรับซื้อ</Link>
            <span className="mx-2">/</span>
            <span>{bill.doc_no}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">รายละเอียดบิลรับซื้อ {bill.doc_no}</h1>
          <p className="mt-1 text-sm text-slate-500">ข้อมูลผู้ขายดึงจาก master data ผู้ขาย และรายการสินค้าเป็นข้อมูลที่บันทึกในบิล</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" href="/purchase/bills">กลับรายการ</Link>
          <button className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600" disabled type="button">แก้ไขเร็ว ๆ นี้</button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Summary label="ยอดรวม" value={money(totalAmount)} />
        <Summary label="ค้างชำระ" tone="red" value={money(payableBalance)} />
        <Summary label="ชำระแล้ว" tone="emerald" value={money(paidAmount)} />
        <Summary label="สถานะ" value={bill.status ?? '-'} />
      </section>

      <section className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">ข้อมูลบิล</h2>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <Info label="เลขที่บิล" mono value={bill.doc_no} />
          <Info label="วันที่" value={toDateOnly(bill.date)} />
          <Info label="เลขอ้างอิง Supplier" mono value={bill.ref_no ?? '-'} />
          <Info label="ผู้ขาย" value={supplierName} />
          <Info label="รหัสผู้ขาย" mono value={bill.supplier_id ?? '-'} />
          <Info label="สาขา / คลัง" value={`${bill.branches?.name ?? '-'} / ${bill.warehouses?.name ?? '-'}`} />
          <Info label="ช่องทางซื้อ" value={bill.purchase_channels?.name ?? '-'} />
          <Info label="ประเภทบิล" value={bill.transaction_mode ?? 'STOCK'} />
          <Info label="ที่มา" value={purchaseSourceLabel(bill.purchase_source)} />
          <Info label="ทะเบียนรถ" value={bill.license_plate ?? '-'} />
          <Info label="เบอร์โทร" value={bill.contact_phone ?? '-'} />
          <Info label="ผู้ทำ" value={bill.created_by ?? '-'} />
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 text-base font-bold text-slate-800">รายการสินค้า</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">สินค้า</th>
                <th className="p-2 text-left">PO</th>
                <th className="p-2 text-right">Gross</th>
                <th className="p-2 text-right">หัก</th>
                <th className="p-2 text-right">สุทธิ</th>
                <th className="p-2 text-right">ราคา</th>
                <th className="p-2 text-right">ส่วนลด</th>
                <th className="p-2 text-right">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.productId ?? 'item'}-${index}`} className="border-t">
                  <td className="p-2">
                    <div className="font-medium text-slate-900">{item.displayName || item.productName || '-'}</div>
                    <div className="font-mono text-xs text-slate-500">{item.productCode || item.productId || '-'}</div>
                  </td>
                  <td className="p-2 font-mono text-xs">{item.poBuyId || 'Spot Buy'}</td>
                  <td className="p-2 text-right font-mono">{money(item.grossWeight)}</td>
                  <td className="p-2 text-right font-mono">{money(item.deductWeight)}</td>
                  <td className="p-2 text-right font-mono font-semibold">{money(item.qty)} {item.unit ?? ''}</td>
                  <td className="p-2 text-right font-mono">{money(item.price)}</td>
                  <td className="p-2 text-right font-mono">{money(item.discount)}</td>
                  <td className="p-2 text-right font-mono font-bold text-blue-700">{money(item.amount)}</td>
                </tr>
              ))}
              {items.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-3 text-base font-bold text-slate-800">VAT / ยอดรวม</h2>
          <div className="space-y-2 text-sm">
            <Line label="ยอดก่อนส่วนลด" value={money(subtotal)} />
            <Line label="ส่วนลดท้ายบิล" value={money(discount)} />
            <Line label="VAT" value={money(vatAmount)} />
            <Line strong label="ยอดสุทธิ" value={money(totalAmount)} />
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-3 text-base font-bold text-slate-800">ใบกำกับภาษี / หมายเหตุ</h2>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <Info label="ได้รับใบกำกับภาษี" value={bill.vat_invoice_received ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'} />
            <Info label="เลขที่ใบกำกับภาษี" mono value={bill.vat_invoice_no ?? '-'} />
            <Info label="วันที่ใบกำกับภาษี" value={bill.vat_invoice_date ? toDateOnly(bill.vat_invoice_date) : '-'} />
            <Info label="หมายเหตุ" value={bill.note ?? bill.notes ?? '-'} />
          </div>
        </div>
      </section>
    </div>
  )
}

function Summary({ label, tone = 'slate', value }: { label: string; tone?: 'emerald' | 'red' | 'slate'; value: string }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return <div className="rounded-lg bg-white p-4 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-xl font-bold ${color}`}>{value}</div></div>
}

function Info({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</div></div>
}

function Line({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return <div className={`flex justify-between gap-3 ${strong ? 'border-t pt-2 font-bold text-slate-900' : 'text-slate-700'}`}><span>{label}</span><span className="font-mono">{value}</span></div>
}
