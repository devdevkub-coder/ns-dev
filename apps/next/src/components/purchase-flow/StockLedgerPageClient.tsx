'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import type { StockOption } from '@/lib/stock'

type StockLedgerPayload = {
  movementTypes: string[]
  page: number
  pageSize: number
  reference: { branches: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: StockLedgerRow[]
  summary: { count: number; negativeCount: number; pageCount: number; qtyIn: number; qtyOut: number; valueIn: number; valueOut: number }
  total: number
}

type StockLedgerRow = {
  branchName: string
  counterpartyName: string
  date: string
  id: string
  lotNo: string
  movementType: string
  notAvailableForSale: boolean
  note: string
  outputCategory: string
  productCode: string
  productId: string
  productName: string
  qtyIn: number
  qtyOut: number
  refId: string
  refNo: string
  refType: string
  runningBalanceByProduct: number
  unitCost: number
  valueIn: number
  valueOut: number
  warehouseName: string
}

export function StockLedgerPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [balanceMode, setBalanceMode] = useState<'product' | 'warehouse'>('product')
  const [branchId, setBranchId] = useState('')
  const [data, setData] = useState<StockLedgerPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [movementType, setMovementType] = useState('')
  const [negativeOnly, setNegativeOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [productId, setProductId] = useState('')
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<StockLedgerRow | null>(null)
  const [toDate, setToDate] = useState('')

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ balanceMode, page: String(page), pageSize: '80' })
      if (branchId) params.set('branchId', branchId)
      if (fromDate) params.set('from', fromDate)
      if (movementType) params.set('movementType', movementType)
      if (productId) params.set('productId', productId)
      if (toDate) params.set('to', toDate)
      if (negativeOnly) params.set('negativeOnly', 'true')
      const payload = await dailyFetchJson<StockLedgerPayload>(`/api/stock/ledger?${params.toString()}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Stock Ledger ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [balanceMode, branchId, fromDate, movementType, negativeOnly, page, productId, toDate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const savedMode = window.localStorage.getItem('ns_erp_sl_balance_mode')
    if (savedMode === 'product' || savedMode === 'warehouse') setBalanceMode(savedMode)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('ns_erp_sl_balance_mode', balanceMode)
  }, [balanceMode])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => !query || `${row.refNo} ${row.productCode} ${row.productName} ${row.counterpartyName} ${row.branchName} ${row.warehouseName}`.toLowerCase().includes(query))
  }, [data?.rows, search])

  function exportXlsx() {
    const params = new URLSearchParams({ balanceMode, format: 'xlsx', page: '1', pageSize: '500' })
    if (branchId) params.set('branchId', branchId)
    if (fromDate) params.set('from', fromDate)
    if (movementType) params.set('movementType', movementType)
    if (productId) params.set('productId', productId)
    if (toDate) params.set('to', toDate)
    window.location.href = `/api/stock/ledger?${params.toString()}`
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 80)))

  return (
    <section>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="min-w-[260px] max-w-md flex-1 rounded-md border px-3 py-2 text-sm" value={productId} onChange={(event) => { setPage(1); setProductId(event.target.value) }}>
          <option value="">🔍 พิมพ์รหัส/ชื่อสินค้า — เลือกดูสต๊อก...</option>
          {(data?.reference.products ?? []).filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ${item.name}` : item.name}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
          <option value="">🏢 ทุกสาขา</option>
          {(data?.reference.branches ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={movementType} onChange={(event) => { setPage(1); setMovementType(event.target.value) }}>
          <option value="">⚙ ทุกประเภท</option>
          {(data?.movementTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <DatePickerInput className="w-[130px]" title="จากวันที่" value={fromDate} onChange={(value) => { setPage(1); setFromDate(value) }} />
        <span className="text-slate-400">→</span>
        <DatePickerInput className="w-[130px]" title="ถึงวันที่" value={toDate} onChange={(value) => { setPage(1); setToDate(value) }} />
        {productId || branchId || movementType || fromDate || toDate || negativeOnly ? <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={() => { setBranchId(''); setFromDate(''); setMovementType(''); setNegativeOnly(false); setPage(1); setProductId(''); setSearch(''); setToDate('') }}>✕ ล้าง</button> : null}
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs" title="โหมดคำนวณ Running Balance">
          <button className={`px-3 py-2 font-bold ${balanceMode === 'product' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`} title="คำนวณยอดต่อสินค้าเท่านั้น (ตรงกับหน้า Stock Balance + Drilldown)" type="button" onClick={() => { setPage(1); setBalanceMode('product') }}>📦 ต่อสินค้า</button>
          <button className={`border-l border-slate-300 px-3 py-2 font-bold ${balanceMode === 'warehouse' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`} title="คำนวณยอดต่อสินค้า × สาขา × คลัง" type="button" onClick={() => { setPage(1); setBalanceMode('warehouse') }}>🏢 ต่อคลัง</button>
        </div>
        <button className={negativeOnly ? 'flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-md' : 'flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-200'} type="button" onClick={() => { setPage(1); setNegativeOnly(!negativeOnly) }}>
          <span>⚠ ติดลบ</span><span className={negativeOnly ? 'rounded-md bg-white px-1.5 py-0.5 text-[10px] text-red-700' : 'rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] text-white'}>{data?.summary.negativeCount ?? 0}</span>
        </button>
        <button className="rounded-md bg-purple-100 px-3 py-2 text-xs font-bold text-purple-700 opacity-60" disabled title="ต้องออกแบบ audit/backup/rollback ก่อนเปิดใช้งาน" type="button">🧹 ล้าง Dup</button>
        <button className="rounded-md bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 opacity-60" disabled title="ต้องออกแบบ audit/backup/rollback ก่อนเปิดใช้งาน" type="button">🗑 ล้าง Orphan</button>
        <button className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white" type="button" onClick={exportXlsx}>📥 .xlsx</button>
        <span className="ml-auto rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-500">📊 พบ <b>{rows.length}</b> รายการ</span>
      </div>
      {movementType ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="text-base">⚠</span>
          <div><b>คุณกำลังกรองประเภท {movementType}</b> — ⚖️ <b>คงเหลือ</b> เป็นยอดสะสมจากทุกประเภท เพื่อให้ตรง ledger running balance</div>
        </div>
      ) : null}
      <div className="mb-3 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-64 flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหาเลขเอกสาร / สินค้า / คู่ค้า / สาขา" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => void loadData()}>Refresh</button>
          <span className="text-xs text-slate-500">เข้า {formatMoney(data?.summary.qtyIn ?? 0)} / ออก {formatMoney(data?.summary.qtyOut ?? 0)}</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="w-[90px] whitespace-nowrap p-2 text-left">วันที่</th>
              <th className="w-[120px] whitespace-nowrap p-2 text-left">เลขบิล</th>
              <th className="min-w-[200px] p-2 text-left">ผู้ขาย / ผู้ซื้อ</th>
              <th className="w-[130px] whitespace-nowrap p-2 text-left">ประเภท</th>
              <th className="min-w-[180px] p-2 text-left">สินค้า</th>
              <th className="w-[85px] p-2 text-right">เข้า</th>
              <th className="w-[85px] p-2 text-right">ออก</th>
              <th className="w-[110px] whitespace-nowrap bg-blue-100 p-2 text-right">⚖️ คงเหลือ</th>
              <th className="w-[100px] p-2 text-right">ต้นทุน/น.</th>
              <th className="w-[100px] p-2 text-right">มูลค่าเข้า</th>
              <th className="w-[100px] p-2 text-right">มูลค่าออก</th>
              <th className="w-[110px] whitespace-nowrap p-2 text-center">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={row.id} className={row.runningBalanceByProduct < 0 ? 'border-t border-red-200 bg-red-50/60' : 'border-t hover:bg-slate-50'}>
                <td className="whitespace-nowrap p-2">{formatDateDisplay(row.date)}</td>
                <td className="whitespace-nowrap p-2"><span className="font-mono text-xs text-slate-500">{row.refNo || '-'}</span></td>
                <td className="p-2"><Counterparty name={row.counterpartyName} refType={row.refType} /></td>
                <td className="whitespace-nowrap p-2"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${row.qtyIn > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{row.movementType}</span></td>
                <td className="p-2"><span className="font-medium">{row.productCode ? `${row.productCode} · ` : ''}{row.productName}</span>{row.lotNo && row.lotNo !== 'OPENING' ? <span className="ml-1 text-xs text-slate-400">[{row.lotNo}]</span> : null}</td>
                <td className="p-2 text-right font-mono text-emerald-600">{row.qtyIn ? formatMoney(row.qtyIn) : '-'}</td>
                <td className="p-2 text-right font-mono text-red-600">{row.qtyOut ? formatMoney(row.qtyOut) : '-'}</td>
                <td className={`cursor-pointer p-2 text-right font-mono font-bold ${row.runningBalanceByProduct < 0 ? 'bg-red-100 text-red-700' : 'bg-blue-50/40 text-blue-700'}`} title="ยอดสะสม IN-OUT ทุกประเภท">{formatMoney(row.runningBalanceByProduct)}</td>
                <td className="p-2 text-right font-mono text-slate-500">{formatMoney(row.unitCost)}</td>
                <td className="p-2 text-right font-mono text-emerald-700">{row.valueIn ? formatMoney(row.valueIn) : '-'}</td>
                <td className="p-2 text-right font-mono text-red-700">{row.valueOut ? formatMoney(row.valueOut) : '-'}</td>
                <td className="p-2 text-center"><button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => setSelectedRow(row)}>จัดการ</button></td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ยังไม่มี Stock Movement</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>พบทั้งหมด <span className="font-semibold text-slate-900">{data?.total ?? 0}</span> รายการ</span>
        <div className="flex items-center gap-2">
          <button className="rounded-md border px-3 py-1 disabled:opacity-40" disabled={page <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1">หน้า {page} / {totalPages}</span>
          <button className="rounded-md border px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} type="button" onClick={() => setPage((value) => value + 1)}>ถัดไป</button>
        </div>
      </div>
      {selectedRow ? <StockLedgerDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Counterparty({ name, refType }: { name: string; refType: string }) {
  if (name && name !== '-') {
    const isSupplier = refType === 'PB' || refType === 'PB-CANCEL'
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isSupplier ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{isSupplier ? 'ผู้ขาย' : 'ผู้ซื้อ'}</span>
        <span className={`text-sm font-semibold ${isSupplier ? 'text-emerald-800' : 'text-blue-800'}`}>{name}</span>
      </div>
    )
  }
  const labelMap: Record<string, string> = { ADJ: 'นับสต๊อก', CR: 'รับคืนสินค้า', GA: 'ปรับเกรด', OB: 'ยอดยกมา', SC: 'แปลง Status', ST: 'โอนระหว่างสาขา' }
  return <span className="text-xs italic text-slate-500">{labelMap[refType] ?? refType ?? '-'}</span>
}

function StockLedgerDetailModal({ onClose, row }: { onClose: () => void; row: StockLedgerRow }) {
  const netQty = row.qtyIn - row.qtyOut
  const netValue = row.valueIn - row.valueOut

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="รายละเอียด Stock Ledger">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">📋 รายละเอียด Stock Ledger</h2>
            <p className="mt-1 text-xs text-slate-500">อ่านอย่างเดียวจากรายการ ledger ที่แสดงในตาราง</p>
          </div>
          <button className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={onClose}>ปิด</button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <DetailPanel title="เอกสารอ้างอิง">
            <DetailRow label="วันที่" value={row.date || '-'} />
            <DetailRow label="เลขบิล" value={row.refNo || '-'} mono />
            <DetailRow label="Ref Type" value={row.refType || '-'} />
            <DetailRow label="Ref ID" value={row.refId || '-'} mono />
            <DetailRow label="Movement" value={row.movementType || '-'} />
          </DetailPanel>

          <DetailPanel title="สินค้า / ที่เก็บ">
            <DetailRow label="สินค้า" value={`${row.productCode ? `${row.productCode} · ` : ''}${row.productName}`} />
            <DetailRow label="Product ID" value={row.productId || '-'} mono />
            <DetailRow label="Lot" value={row.lotNo || '-'} />
            <DetailRow label="สาขา" value={row.branchName || '-'} />
            <DetailRow label="คลัง" value={row.warehouseName || '-'} />
          </DetailPanel>

          <DetailPanel title="จำนวน / ต้นทุน">
            <DetailRow label="เข้า" value={row.qtyIn ? formatMoney(row.qtyIn) : '-'} tone="emerald" />
            <DetailRow label="ออก" value={row.qtyOut ? formatMoney(row.qtyOut) : '-'} tone="red" />
            <DetailRow label="สุทธิ" value={formatMoney(netQty)} tone={netQty >= 0 ? 'emerald' : 'red'} />
            <DetailRow label="ต้นทุน/หน่วย" value={formatMoney(row.unitCost)} />
            <DetailRow label="คงเหลือสะสม" value={formatMoney(row.runningBalanceByProduct)} tone={row.runningBalanceByProduct < 0 ? 'red' : 'blue'} />
          </DetailPanel>

          <DetailPanel title="มูลค่า / สถานะ">
            <DetailRow label="มูลค่าเข้า" value={row.valueIn ? formatMoney(row.valueIn) : '-'} tone="emerald" />
            <DetailRow label="มูลค่าออก" value={row.valueOut ? formatMoney(row.valueOut) : '-'} tone="red" />
            <DetailRow label="มูลค่าสุทธิ" value={formatMoney(netValue)} tone={netValue >= 0 ? 'emerald' : 'red'} />
            <DetailRow label="พร้อมขาย" value={row.notAvailableForSale ? 'No' : 'Yes'} tone={row.notAvailableForSale ? 'red' : 'emerald'} />
            <DetailRow label="สถานะสินค้า" value={row.outputCategory || '-'} />
          </DetailPanel>
        </div>

        <div className="border-t bg-slate-50 px-5 py-4 text-sm">
          <div className="font-semibold text-slate-700">หมายเหตุ</div>
          <div className="mt-1 whitespace-pre-wrap text-slate-600">{row.note || '-'}</div>
          <div className="mt-3 text-xs text-slate-500">คู่ค้า/ที่มา: {row.counterpartyName || '-'}</div>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-3 text-sm font-bold text-slate-800">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({ label, mono = false, tone = 'normal', value }: { label: string; mono?: boolean; tone?: 'blue' | 'emerald' | 'normal' | 'red'; value: string }) {
  const toneClass = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    normal: 'text-slate-900',
    red: 'text-red-700',
  }[tone]
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`break-words font-semibold ${mono ? 'font-mono text-xs' : ''} ${toneClass}`}>{value}</span>
    </div>
  )
}
