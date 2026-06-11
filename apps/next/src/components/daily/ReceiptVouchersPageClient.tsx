'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
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
type ReceiptVoucherColumnKey = 'action' | 'date' | 'docNo' | 'licensePlate' | 'purchaseBillDocNo' | 'sellerName' | 'sellerTaxId' | 'totalAmount' | 'totalQty'

const receiptVoucherColumns: Array<ResizableColumnDefinition<ReceiptVoucherColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'sellerName', defaultWidth: 190, minWidth: 140 },
  { key: 'sellerTaxId', defaultWidth: 170, minWidth: 130 },
  { key: 'purchaseBillDocNo', defaultWidth: 150, minWidth: 120 },
  { key: 'licensePlate', defaultWidth: 130, minWidth: 110 },
  { key: 'totalQty', defaultWidth: 140, minWidth: 120 },
  { key: 'totalAmount', defaultWidth: 140, minWidth: 120 },
  { key: 'action', defaultWidth: 150, minWidth: 140 },
]

export function ReceiptVouchersPageClient() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [printingRow, setPrintingRow] = useState<ReceiptVoucherRow | null>(null)
  const [rows, setRows] = useState<ReceiptVoucherRow[]>([])
  const [search, setSearch] = useState('')
  const columnResize = useResizableColumns('daily.receipt-vouchers', receiptVoucherColumns)

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

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, pageSize, search])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      const inDateRange = (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo)
      if (!inDateRange) return false
      if (!query) return true
      return `${row.docNo} ${row.purchaseBillDocNo} ${row.sellerName} ${row.sellerTaxId} ${row.licensePlate}`.toLowerCase().includes(query)
    })
  }, [dateFrom, dateTo, rows, search])

  const totals = useMemo(() => ({
    amount: filteredRows.reduce((sum, row) => sum + row.totalAmount, 0),
    qty: filteredRows.reduce((sum, row) => sum + row.totalQty, 0),
    withPurchaseBill: filteredRows.filter((row) => row.purchaseBillDocNo).length,
  }), [filteredRows])

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasActiveFilter = Boolean(search || dateFrom || dateTo)

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <>
      <section className="space-y-4 print:hidden">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <KpiCard label="จำนวนเอกสาร" tone="slate" value={totalRows.toLocaleString('th-TH')} />
          <KpiCard label="น้ำหนักรวม (กก.)" tone="blue" value={formatMoney(totals.qty)} />
          <KpiCard label="จำนวนเงินรวม" tone="emerald" value={formatMoney(totals.amount)} />
          <KpiCard label="มีบิลอ้างอิง" tone="violet" value={totals.withPurchaseBill.toLocaleString('th-TH')} />
        </div>

        <div className="rounded-md bg-white p-3 shadow">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[260px] flex-1 rounded-md"
              placeholder="ค้นเลขที่ / ชื่อผู้รับ / เลขบิลซื้อ / ทะเบียน..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="text-xs text-slate-500">วันที่:</span>
            <DatePickerInput id="receipt-vouchers-date-from" value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="receipt-vouchers-date-to" value={dateTo} onChange={setDateTo} />
            {hasActiveFilter ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
            <Button disabled type="button">+ สร้างใบสำคัญรับเงิน</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
          <div className="flex flex-wrap items-center gap-2">
            {columnResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>Set col to default</Button> : null}
            <Select
              aria-label="จำนวนรายการต่อหน้า"
              className="h-9 w-auto px-2 py-1"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              <option value={10}>10 / หน้า</option>
              <option value={25}>25 / หน้า</option>
              <option value={50}>50 / หน้า</option>
              <option value={100}>100 / หน้า</option>
            </Select>
            <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
            <span className="px-1">หน้า {currentPage} / {totalPages}</span>
            <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
          </div>
        </div>

        <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {receiptVoucherColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}
          </colgroup>
          <TableHeader>
            <tr>
              <ResizableTableHead label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="ผู้รับเงิน" resizeProps={columnResize.getResizeHandleProps('sellerName', 'ผู้รับเงิน')} />
              <ResizableTableHead label="เลขประจำตัวผู้เสียภาษี" resizeProps={columnResize.getResizeHandleProps('sellerTaxId', 'เลขประจำตัวผู้เสียภาษี')} />
              <ResizableTableHead label="บิลซื้อ" resizeProps={columnResize.getResizeHandleProps('purchaseBillDocNo', 'บิลซื้อ')} />
              <ResizableTableHead label="ทะเบียน" resizeProps={columnResize.getResizeHandleProps('licensePlate', 'ทะเบียน')} />
              <ResizableTableHead align="right" label="น้ำหนัก (กก.)" resizeProps={columnResize.getResizeHandleProps('totalQty', 'น้ำหนัก (กก.)')} />
              <ResizableTableHead align="right" label="จำนวนเงิน" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'จำนวนเงิน')} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><td className="p-8 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></TableRow> : null}
            {!isLoading && pagedRows.map((row) => (
              <TableRow key={row.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.docNo}</td>
                <td className="whitespace-nowrap p-2">{formatDateDisplay(row.date)}</td>
                <td className="p-2 font-medium text-slate-800">{row.sellerName || '-'}</td>
                <td className="p-2 text-xs text-slate-500">{row.sellerTaxId || '-'}</td>
                <td className="p-2 text-xs text-slate-700">{row.purchaseBillDocNo || '-'}</td>
                <td className="p-2 text-xs text-slate-600">{row.licensePlate || '-'}</td>
                <TableNumberCell value={formatMoney(row.totalQty)} />
                <TableNumberCell strong value={formatMoney(row.totalAmount)} />
                <td className="whitespace-nowrap p-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60" type="button" onClick={() => setPrintingRow(row)}>
                      <Printer className="size-3" />
                      พิมพ์
                    </button>
                    <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled type="button">แก้ไข</button>
                    <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled type="button">ยกเลิก</button>
                  </div>
                </td>
              </TableRow>
            ))}
            {!isLoading && totalRows === 0 ? <TableRow><td className="p-8 text-center text-slate-400" colSpan={9}>ยังไม่มีใบสำคัญรับเงิน</td></TableRow> : null}
          </TableBody>
        </Table>
      </section>

      {printingRow ? <PrintPreview row={printingRow} onClose={() => setPrintingRow(null)} /> : null}
    </>
  )
}

function KpiCard({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'slate' | 'violet'; value: string }) {
  const tones = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    slate: 'text-slate-800',
    violet: 'text-violet-700',
  }
  return (
    <div className="rounded-md bg-white p-3 shadow">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${tones[tone]}`}>{value}</div>
    </div>
  )
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
