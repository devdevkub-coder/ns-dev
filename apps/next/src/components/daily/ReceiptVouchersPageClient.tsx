'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type VoucherItem = {
  amount?: number | string | null
  description?: string | null
  id?: string | null
  price?: number | string | null
  qty?: number | string | null
}

type ReceiptVoucherRow = {
  amountInWords: string
  createdAt?: string
  createdBy?: string
  date: string
  docNo: string
  id: string
  items?: unknown
  licensePlate: string
  note: string
  payerSignerName?: string
  paymentMethod?: string
  purchaseBillDocNo: string
  purchaseBillId?: string
  receiverSignerName?: string
  salesPerson?: string
  sellerAddress?: string
  sellerName: string
  sellerPhone: string
  sellerTaxId: string
  totalAmount: number
  totalQty: number
  updatedAt?: string
  updatedBy?: string
}

export function ReceiptVouchersPageClient() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [rows, setRows] = useState<ReceiptVoucherRow[]>([])
  const [search, setSearch] = useState('')
  const [printingRow, setPrintingRow] = useState<ReceiptVoucherRow | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<{ rows: ReceiptVoucherRow[] }>('/api/purchase/receipt-vouchers')
      setRows(payload.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดใบสำคัญรับเงินไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!printingRow) return
    const timer = window.setTimeout(() => window.print(), 200)
    return () => window.clearTimeout(timer)
  }, [printingRow])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => !query || `${row.docNo} ${row.purchaseBillDocNo} ${row.sellerName} ${row.sellerTaxId}`.toLowerCase().includes(query))
  }, [rows, search])

  const totals = useMemo(() => ({
    amount: filteredRows.reduce((sum, row) => sum + row.totalAmount, 0),
    qty: filteredRows.reduce((sum, row) => sum + row.totalQty, 0),
  }), [filteredRows])

  return (
    <>
      <section className="space-y-4 print:hidden">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 p-3 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">🧾 ใบสำคัญรับเงิน (Receipt Voucher)</h2>
          <p className="mt-1 text-sm text-slate-600">ใช้ออกให้ Supplier บุคคลธรรมดาเซ็นรับเงิน (กรณีไม่มีใบเสร็จของ Supplier) — ดึงข้อมูลจากบิลซื้อ + แก้ไขส่วนที่ขาดได้ + พิมพ์ออกได้</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <input className="min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="ค้นเลขที่ / ชื่อผู้รับ / เลขบิลซื้อ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-60" disabled type="button">+ สร้างใบสำคัญรับเงิน</button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Kpi label="จำนวนเอกสาร" value={filteredRows.length.toLocaleString('th-TH')} tone="blue" />
          <Kpi label="น้ำหนักรวม (กก.)" value={formatMoney(totals.qty)} tone="slate" />
          <Kpi label="จำนวนเงินรวม" value={formatMoney(totals.amount)} tone="emerald" />
          <Kpi label="มีบิลอ้างอิง" value={filteredRows.filter((row) => row.purchaseBillDocNo).length.toLocaleString('th-TH')} tone="violet" />
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">เลขที่</th>
                <th className="p-2 text-left">วันที่</th>
                <th className="p-2 text-left">ผู้รับเงิน</th>
                <th className="p-2 text-left">เลขประจำตัวผู้เสียภาษี</th>
                <th className="p-2 text-left">บิลซื้อ</th>
                <th className="p-2 text-right">น้ำหนัก (กก.)</th>
                <th className="p-2 text-right">จำนวนเงิน</th>
                <th className="p-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && filteredRows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-blue-50/30">
                  <td className="p-2 text-xs font-semibold text-slate-700">{row.docNo}</td>
                  <td className="p-2">{formatDateDisplay(row.date)}</td>
                  <td className="p-2 font-medium text-slate-800">{row.sellerName || '-'}</td>
                  <td className="p-2 text-xs text-slate-500">{row.sellerTaxId || '-'}</td>
                  <td className="p-2 text-xs">{row.purchaseBillDocNo || '-'}</td>
                  <td className="p-2 text-right">{formatMoney(row.totalQty)}</td>
                  <td className="p-2 text-right font-semibold text-emerald-700">{formatMoney(row.totalAmount)}</td>
                  <td className="space-x-2 whitespace-nowrap p-2 text-right">
                    <button className="text-xs font-semibold text-purple-600 hover:underline" type="button" onClick={() => setPrintingRow(row)}>🖨 พิมพ์</button>
                    <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60" disabled type="button">จัดการ</button>
                    <button className="text-xs text-red-400" disabled type="button">🗑 ลบ</button>
                  </td>
                </tr>
              ))}
              {!isLoading && filteredRows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={8}>ยังไม่มีใบสำคัญรับเงิน — กดปุ่มด้านบนเพื่อสร้างใหม่</td></tr> : null}
            </tbody>
            <tfoot className="bg-slate-100 font-semibold">
              <tr>
                <td className="p-2 text-right" colSpan={5}>รวม</td>
                <td className="p-2 text-right">{formatMoney(totals.qty)}</td>
                <td className="p-2 text-right text-emerald-700">{formatMoney(totals.amount)}</td>
                <td className="p-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {printingRow ? <PrintPreview row={printingRow} onClose={() => setPrintingRow(null)} /> : null}
    </>
  )
}

function Kpi({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'slate' | 'violet'; value: string }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    slate: 'border-slate-200 bg-white text-slate-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }
  return <div className={`rounded-md border p-3 shadow-sm ${tones[tone]}`}><div className="text-xs font-semibold text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>
}

function PrintPreview({ onClose, row }: { onClose: () => void; row: ReceiptVoucherRow }) {
  const items = normalizeItems(row)
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white print:static print:overflow-visible">
      <div className="flex items-center justify-between bg-slate-800 p-2 text-white print:hidden">
        <span className="text-sm">พรีวิวพิมพ์ — ใบสำคัญรับเงิน {row.docNo}</span>
        <div className="flex gap-2">
          <button className="rounded-md bg-blue-500 px-3 py-1 text-xs" type="button" onClick={() => window.print()}>🖨 พิมพ์</button>
          <button className="rounded-md bg-red-500 px-3 py-1 text-xs" type="button" onClick={onClose}>ปิด</button>
        </div>
      </div>
      <div className="mx-auto max-w-[210mm] bg-white p-8 text-black" style={{ fontFamily: "'Noto Sans Thai', Arial, sans-serif", fontSize: '14px' }}>
        <div className="mb-4 border-b-2 border-gray-300 pb-3">
          <div className="text-lg font-bold">NS Scrap ERP</div>
          <div className="mt-1 text-xs">ข้อมูลบริษัทจาก Company Profile จะแสดงในใบพิมพ์ฉบับ production เมื่อเชื่อม company profile payload กับ preview นี้</div>
        </div>
        <div className="mb-3 text-center text-2xl font-bold underline">ใบสำคัญรับเงิน</div>
        <div className="mb-3 text-right text-sm"><b>วันที่</b> {formatDateDisplay(row.date)}</div>
        <div className="mb-4 space-y-1 text-sm">
          <div><b>ข้าพเจ้า</b> {row.sellerName || '-'} <span className="ml-4"><b>เลขประจำตัวผู้เสียภาษี</b> {row.sellerTaxId || '-'}</span></div>
          <div><b>ที่อยู่</b> {row.sellerAddress || '-'}</div>
          <div><b>เบอร์โทร:</b> {row.sellerPhone || '-'} <span className="ml-3"><b>ทะเบียน</b> {row.licensePlate || '-'}</span> <span className="ml-3"><b>ช่องทางติดต่อ Sale:</b> {row.salesPerson || '-'}</span></div>
          <div className="mt-2"><b>อ้างอิงบิลซื้อ</b> {row.purchaseBillDocNo || '-'}</div>
        </div>
        <div className="mb-1 font-semibold">รายการมีดังต่อไปนี้</div>
        <table className="mb-3 w-full border-collapse text-sm" style={{ border: '1px solid #000' }}>
          <thead>
            <tr className="bg-gray-100" style={{ borderBottom: '1px solid #000' }}>
              <th className="border-r border-black p-1 text-center">ลำดับ</th>
              <th className="border-r border-black p-1 text-left">รายการ</th>
              <th className="border-r border-black p-1 text-right">จำนวน/กก.</th>
              <th className="border-r border-black p-1 text-right">ราคา/บาท</th>
              <th className="p-1 text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {(items.length ? items : [{ amount: row.totalAmount, description: row.purchaseBillDocNo || row.docNo, id: 'summary', price: row.totalQty ? row.totalAmount / row.totalQty : row.totalAmount, qty: row.totalQty }]).map((item, index) => (
              <tr key={item.id ?? index} style={{ borderBottom: '1px solid #ccc' }}>
                <td className="border-r border-gray-300 p-1 text-center">{index + 1}</td>
                <td className="border-r border-gray-300 p-1">{item.description || '-'}</td>
                <td className="border-r border-gray-300 p-1 text-right">{formatMoney(toNumber(item.qty))}</td>
                <td className="border-r border-gray-300 p-1 text-right">{formatMoney(toNumber(item.price))}</td>
                <td className="p-1 text-right">{formatMoney(toNumber(item.amount))}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid #000' }}>
              <td className="p-1 text-xs italic text-gray-700" colSpan={2}>{row.note ? <><b>หมายเหตุ**</b> {row.note}</> : null}</td>
              <td className="p-1 text-right font-bold">{formatMoney(row.totalQty)}</td>
              <td />
              <td className="p-1 text-right font-bold">{formatMoney(row.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mb-6 text-sm"><b>จำนวนเงิน (ตัวอักษร)</b> {row.amountInWords || '-'}</div>
        <div className="mb-4 mt-12 grid grid-cols-2 gap-8 text-sm">
          <div className="text-center">
            <div className="mx-auto border-b border-gray-500" style={{ width: '70%' }}>&nbsp;</div>
            <div className="mt-1">ชื่อ......................................(ผู้จ่ายเงิน)</div>
            <div className="text-xs">( {row.payerSignerName || '-'} )</div>
          </div>
          <div className="text-center">
            <div className="mx-auto border-b border-gray-500" style={{ width: '70%' }}>&nbsp;</div>
            <div className="mt-1">ชื่อ......................................(ผู้รับเงิน)</div>
            <div className="text-xs">( {row.receiverSignerName || row.sellerName || '-'} )</div>
          </div>
        </div>
        <div className="mt-4 text-xs">
          <div><b>{row.paymentMethod || 'รับเงินสด'}</b></div>
          <div className="mt-1">หมายเหตุ : แนบสำเนาบัตรประชาชนผู้รับเงิน (เราเป็นผู้ประกอบอาชีพขายสินค้า/ให้บริการอย่างแท้จริง)</div>
        </div>
      </div>
    </div>
  )
}

function normalizeItems(row: ReceiptVoucherRow): VoucherItem[] {
  if (!Array.isArray(row.items)) return []
  return row.items.filter((item): item is VoucherItem => Boolean(item) && typeof item === 'object')
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
