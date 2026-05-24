'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import type { StatusConvertFormValues, StockAdjustFormValues, StockConvertFormValues, StockOption } from '@/lib/stock'

type Mode = 'adjust' | 'convert' | 'status-convert'
type Payload = {
  reference: { branches: StockOption[]; customers?: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: Array<Record<string, string | number | boolean | null>>
}
type OperationColumn = {
  cellClassName?: string
  headerClassName?: string
  key: string
  label: string
}

const config = {
  adjust: {
    accent: 'from-amber-600 to-orange-600',
    api: '/api/stock/adjust',
    title: 'Stock Count Adjustment / ปรับสต๊อกจากการนับจริง',
  },
  convert: {
    accent: 'from-cyan-700 to-teal-700',
    api: '/api/stock/convert',
    title: 'Grade Adjustment / ปรับเกรดสินค้า',
  },
  'status-convert': {
    accent: 'from-purple-700 to-pink-700',
    api: '/api/stock/status-convert',
    title: 'ปรับสถานะสินค้า / Status Convert',
  },
} satisfies Record<Mode, { accent: string; api: string; title: string }>

export function StockOperationPageClient({ mode }: { mode: Mode }) {
  const meta = config[mode]
  const pathname = usePathname()
  const [data, setData] = useState<Payload>({ reference: { branches: [], products: [], warehouses: [] }, rows: [] })
  const [error, setError] = useState<string | null>(null)
  const [adjustBranchFilter, setAdjustBranchFilter] = useState('')
  const [adjustTypeFilter, setAdjustTypeFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [fromDateFilter, setFromDateFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [costStatusFilter, setCostStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sourceTypeFilter, setSourceTypeFilter] = useState('')
  const [toDateFilter, setToDateFilter] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>(meta.api))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [meta.api])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (window.location.search.includes('new=1')) setFormOpen(true)
  }, [])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.rows
      .filter((row) => !query || Object.values(row).join(' ').toLowerCase().includes(query))
      .filter((row) => mode !== 'convert' || !sourceTypeFilter || row.sourceType === sourceTypeFilter)
      .filter((row) => mode !== 'convert' || !costStatusFilter || row.costStatus === costStatusFilter)
      .filter((row) => mode !== 'adjust' || !adjustBranchFilter || row.branchId === adjustBranchFilter)
      .filter((row) => mode !== 'adjust' || !adjustTypeFilter || row.adjustType === adjustTypeFilter)
      .filter((row) => mode !== 'adjust' || !fromDateFilter || String(row.date ?? '') >= fromDateFilter)
      .filter((row) => mode !== 'adjust' || !toDateFilter || String(row.date ?? '') <= toDateFilter)
  }, [adjustBranchFilter, adjustTypeFilter, costStatusFilter, data.rows, fromDateFilter, mode, search, sourceTypeFilter, toDateFilter])

  async function submit(values: StatusConvertFormValues | StockConvertFormValues | StockAdjustFormValues) {
    setError(null)
    setIsSaving(true)
    try {
      await dailyFetchJson(meta.api, { body: JSON.stringify(values), method: 'POST' })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className={`${mode === 'status-convert' ? 'rounded-md' : 'rounded-md'} bg-gradient-to-r ${meta.accent} p-5 text-white shadow ${mode === 'convert' ? 'flex items-start justify-between gap-4' : ''}`}>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">{mode === 'convert' ? '🔀 Grade Adjustment / ปรับเกรดสินค้า' : mode === 'adjust' ? '🔢 Stock Count Adjustment / ปรับสต๊อกจากการนับจริง' : '🔄 ปรับสถานะสินค้า (Status Convert)'}</h1>
          <p className="mt-1 text-sm opacity-90">{descriptionFor(mode)}</p>
        </div>
        {mode === 'convert' ? <a className="shrink-0 rounded-md bg-white px-4 py-2 font-bold text-cyan-700 hover:bg-cyan-50" href={`${pathname}?new=1`}>+ ปรับเกรดใหม่</a> : null}
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {mode === 'status-convert' ? <StatusConvertTip /> : null}
      {mode === 'adjust' ? <AdjustPrincipleBox /> : null}
      <SummaryCards mode={mode} rows={rows} />
      <div className={mode === 'convert' || mode === 'adjust' ? 'flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow' : 'rounded-md bg-white p-3 shadow'}>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'adjust' ? <a className="rounded-md bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700" href={`${pathname}?new=1`}>+ ปรับสต๊อกใหม่ (Quick Adjust)</a> : null}
          <input className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm" placeholder={mode === 'convert' ? 'ค้นหา doc/source/target/ref...' : mode === 'adjust' ? 'ค้นหา doc/สินค้า/เหตุผล...' : '🔍 ค้นหาเลขที่/สินค้า/หมายเหตุ...'} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          {mode === 'convert' ? (
            <>
              <select className="rounded-md border bg-amber-50 px-3 py-2 text-sm font-medium" value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
                <option value="">ทุก Source Type</option>
                <option value="Manual">📝 Manual</option>
                <option value="Production Order">🏭 Production Order</option>
              </select>
              <select className="rounded-md border px-3 py-2 text-sm" value={costStatusFilter} onChange={(event) => setCostStatusFilter(event.target.value)}>
                <option value="">ทุก Cost Status</option>
                <option value="allocated">✓ Allocated</option>
                <option value="pending_cost">⏳ Pending Cost</option>
                <option value="partial">📋 Partial</option>
              </select>
            </>
          ) : mode === 'adjust' ? (
            <>
              <select className="rounded-md border px-3 py-2 text-sm" value={adjustBranchFilter} onChange={(event) => setAdjustBranchFilter(event.target.value)}>
                <option value="">ทุกสาขา</option>
                {data.reference.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <select className="rounded-md border px-3 py-2 text-sm" value={adjustTypeFilter} onChange={(event) => setAdjustTypeFilter(event.target.value)}>
                <option value="">ทุกประเภท</option>
                <option value="LOSS">📉 นับขาด</option>
                <option value="GAIN">📈 นับเกิน</option>
              </select>
              <DatePickerInput className="w-[130px]" title="จากวันที่" value={fromDateFilter} onChange={setFromDateFilter} />
              <DatePickerInput className="w-[130px]" title="ถึงวันที่" value={toDateFilter} onChange={setToDateFilter} />
              <button className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white opacity-60" disabled title="รอ export contract สำหรับ stock adjustment" type="button">📥 CSV</button>
            </>
          ) : mode === 'status-convert' ? (
            <a className="rounded-md bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700" href={`${pathname}?new=1`}>+ ปรับสถานะใหม่</a>
          ) : <a className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white" href={`${pathname}?new=1`}>+ เพิ่มรายการ</a>}
          {mode === 'status-convert' ? null : <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => void loadData()}>Refresh</button>}
        </div>
      </div>
      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <div className="w-full max-w-3xl overflow-hidden rounded-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4"><h3 className="font-bold">{meta.title}</h3><a className="text-2xl text-slate-400" href={pathname}>&times;</a></div>
            {mode === 'status-convert' ? <StatusConvertForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
            {mode === 'convert' ? <ConvertForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
            {mode === 'adjust' ? <AdjustForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
          </div>
        </div>
      ) : null}
      <OperationTable isLoading={isLoading} mode={mode} rows={rows} />
      {mode === 'adjust' ? <AdjustUsageBox /> : null}
    </section>
  )
}

function descriptionFor(mode: Mode) {
  if (mode === 'status-convert') return 'เปลี่ยนสถานะ RM ↔ WIP ↔ FG ไม่ต้องเปิดใบสั่งผลิต · สร้าง Stock Ledger 2 ฝั่งอัตโนมัติ · เก็บประวัติพร้อมเหตุผล'
  if (mode === 'convert') return 'ตัดสินค้าต้นทางและเพิ่มสินค้าปลายทางด้วยต้นทุน WAC ของ source'
  return 'หาของไม่เจอ · สต๊อกตัด 0 แล้ว แต่ในระบบยังมี · นับเกินระบบ — Quick Adjust ทีละ row · Note-only ไม่ลง P&L'
}

function SummaryCards({ mode, rows }: { mode: Mode; rows: Payload['rows'] }) {
  const totalQty = rows.reduce((sum, row) => sum + Number(row.qty ?? row.sourceQty ?? row.diffQty ?? 0), 0)
  const totalValue = rows.reduce((sum, row) => sum + Number(row.value ?? row.valueNote ?? 0), 0)
  if (mode === 'convert') {
    const posted = rows.filter((row) => row.status === 'posted').length
    const pendingCost = rows.filter((row) => row.costStatus === 'pending_cost').length
    const manualCount = rows.filter((row) => row.sourceType === 'Manual').length
    const autoCount = rows.filter((row) => row.sourceType === 'Production Order').length
    const reversed = rows.filter((row) => row.status === 'reversed').length
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
        <Metric cardClassName="rounded-md bg-white p-3 shadow" label="รายการทั้งหมด" value={String(rows.length)} valueClassName="text-xl font-bold text-slate-900" />
        <Metric cardClassName="rounded-md bg-emerald-50 p-3 shadow" label="Posted" value={String(posted)} valueClassName="text-xl font-bold text-emerald-700" />
        <Metric cardClassName="rounded-md bg-amber-50 p-3 shadow" label="⏳ Pending Cost" value={String(pendingCost)} valueClassName="text-xl font-bold text-amber-700" />
        <Metric cardClassName="rounded-md bg-blue-50 p-3 shadow" label="📝 Manual" value={String(manualCount)} valueClassName="text-xl font-bold text-blue-700" />
        <Metric cardClassName="rounded-md bg-purple-50 p-3 shadow" label="🏭 Auto (Production)" value={String(autoCount)} valueClassName="text-xl font-bold text-purple-700" />
        <Metric cardClassName="rounded-md bg-white p-3 shadow" label="น้ำหนักรวม" value={`${formatMoney(totalQty)} กก.`} valueClassName="text-xl font-bold text-slate-900" />
        <Metric cardClassName="rounded-md bg-slate-50 p-3 shadow" label="Reversed" value={String(reversed)} valueClassName="text-xl font-bold text-slate-500" />
      </div>
    )
  }
  if (mode === 'adjust') {
    const lossRows = rows.filter((row) => Number(row.diffQty ?? 0) < 0)
    const gainRows = rows.filter((row) => Number(row.diffQty ?? 0) > 0)
    const lossQty = lossRows.reduce((sum, row) => sum + Math.abs(Number(row.diffQty ?? 0)), 0)
    const gainQty = gainRows.reduce((sum, row) => sum + Number(row.diffQty ?? 0), 0)
    const lossValue = lossRows.reduce((sum, row) => sum + Number(row.valueNote ?? 0), 0)
    const gainValue = gainRows.reduce((sum, row) => sum + Number(row.valueNote ?? 0), 0)
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric cardClassName="rounded-md bg-white p-3 shadow" label="รายการทั้งหมด" value={String(rows.length)} valueClassName="text-xl font-bold text-slate-900" />
        <Metric cardClassName="rounded-md bg-white p-3 shadow" label="นับขาด (LOSS)" value={`-${formatMoney(lossQty)} กก.`} valueClassName="text-xl font-bold text-red-600" />
        <Metric cardClassName="rounded-md bg-white p-3 shadow" label="มูลค่าขาด (Note)" value={formatMoney(lossValue)} valueClassName="text-lg font-bold text-red-600" />
        <Metric cardClassName="rounded-md bg-white p-3 shadow" label="นับเกิน (GAIN)" value={`+${formatMoney(gainQty)} กก.`} valueClassName="text-xl font-bold text-emerald-700" />
        <Metric cardClassName="rounded-md bg-white p-3 shadow" label="มูลค่าเกิน (Note)" value={formatMoney(gainValue)} valueClassName="text-lg font-bold text-emerald-700" />
      </div>
    )
  }
  if (mode === 'status-convert') return null
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="รายการ" value={String(rows.length)} />
      <Metric label="น้ำหนักรวม" value={`${formatMoney(totalQty)} กก.`} />
      <Metric label="มูลค่า" value={formatMoney(totalValue)} />
      <Metric label="สถานะ" value="DB-connected" />
    </div>
  )
}

function StatusConvertTip() {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
      💡 <b>วิธีใช้:</b> เลือกสินค้า + คลัง + จำนวน → เปลี่ยนสถานะปลายทาง → กดบันทึก<br />
      ถ้าปรับครบทั้งหมด → product.itemStatus จะเปลี่ยนตามอัตโนมัติ · ถ้าปรับบางส่วน → จะเหลือทั้ง RM และ FG (ต้นทุนเดียวกัน)
    </div>
  )
}

function AdjustPrincipleBox() {
  return (
    <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs text-slate-700">
      <div className="mb-1 font-bold">📒 หลักการทำงาน — Note-only (ไม่ลง P&amp;L)</div>
      <ul className="ml-5 list-disc space-y-0.5">
        <li>ปรับสต๊อกจริง (qty) ตาม &quot;นับจริง&quot; ของคุณ — ตัดออกหรือเพิ่มเข้า stock_ledger</li>
        <li><strong>มูลค่า (value) = 0</strong> ใน ledger — ไม่กระทบ Stock Value · ไม่ลง P&amp;L · ไม่กระโดด WAC</li>
        <li>มูลค่าที่หาย/เกินเก็บเป็น <strong>Note</strong> สำหรับ analysis เท่านั้น และแสดงใน column &quot;มูลค่า Note&quot;</li>
        <li>ใช้เมื่อ &quot;หาของไม่เจอ&quot; / &quot;นับจริง 0 แต่ระบบมี&quot; / &quot;นับเกินระบบ&quot;</li>
      </ul>
    </div>
  )
}

function AdjustUsageBox() {
  return (
    <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-4 text-sm">
      <h3 className="mb-1 font-bold">💡 ใช้เมื่อไหร่</h3>
      <ul className="ml-5 list-disc space-y-1 text-slate-700">
        <li><strong>หาของไม่เจอ</strong> — ระบบมี 100 กก. แต่นับจริงเหลือ 80 → ใส่ &quot;นับจริง&quot; 80 → ขาด 20 กก. (Note)</li>
        <li><strong>สต๊อกตัด 0 แต่ในระบบยังมี</strong> — ระบบมี 50 กก. แต่นับจริง 0 → ใส่ &quot;นับจริง&quot; 0 → ขาด 50 กก. (Note)</li>
        <li><strong>นับเกินระบบ</strong> — ระบบมี 10 กก. แต่นับจริงได้ 25 → ใส่ &quot;นับจริง&quot; 25 → เกิน 15 กก. (Note)</li>
        <li>เคลื่อนไหวจะเข้า Stock Ledger เป็น <code>STOCK_COUNT_LOSS</code> หรือ <code>STOCK_COUNT_GAIN</code> · qty จริง · value=0</li>
      </ul>
    </div>
  )
}

function OperationTable({ isLoading, mode, rows }: { isLoading: boolean; mode: Mode; rows: Payload['rows'] }) {
  const columns = columnsFor(mode)
  return (
    <div className={mode === 'convert' || mode === 'status-convert' ? 'overflow-x-auto rounded-md bg-white shadow' : 'overflow-x-auto rounded-md bg-white shadow'}>
      <table className={mode === 'convert' ? 'w-full min-w-[1300px] text-sm' : mode === 'status-convert' ? 'w-full min-w-[1120px] text-sm' : 'w-full min-w-[1000px] text-sm'}>
        <thead className="bg-slate-100"><tr>{columns.map((column) => <th key={column.key} className={`p-2 text-left ${column.headerClassName ?? ''}`}>{column.label}</th>)}</tr></thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={columns.length}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.map((row, index) => <tr key={String(row.id ?? index)} className="border-t hover:bg-slate-50">{columns.map((column) => <td key={column.key} className={`p-2 ${column.cellClassName ?? ''}`}>{formatOperationCell(mode, row, column.key)}</td>)}</tr>)}
          {!isLoading && !rows.length ? <tr><td className="p-8 text-center text-slate-400" colSpan={columns.length}>{emptyTextFor(mode)}</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function emptyTextFor(mode: Mode) {
  if (mode === 'convert') return 'ยังไม่มีรายการปรับเกรด'
  if (mode === 'status-convert') return 'ยังไม่เคยปรับสถานะ — กดปุ่ม "+ ปรับสถานะใหม่"'
  return 'ยังไม่มีรายการ'
}

function columnsFor(mode: Mode): OperationColumn[] {
  if (mode === 'status-convert') return [
    { key: 'date', label: 'วันที่' }, { key: 'refNo', label: 'เลขที่' }, { key: 'productDisplay', label: 'สินค้า' }, { key: 'lotNo', label: 'Lot' }, { key: 'locationDisplay', label: 'สาขา/คลัง' }, { key: 'qty', label: 'จำนวน (กก.)', cellClassName: 'text-right font-bold text-purple-700' }, { key: 'value', label: 'มูลค่า', cellClassName: 'text-right text-slate-600' }, { key: 'statusFlow', label: 'เปลี่ยนสถานะ', cellClassName: 'text-center' }, { key: 'note', label: 'เหตุผล' }, { key: 'createdBy', label: 'ผู้ทำ' },
  ]
  if (mode === 'convert') return [
    { key: 'sourceType', label: 'Source Type' },
    { key: 'refNo', label: 'เลขที่ / Ref' },
    { key: 'date', label: 'วันที่' },
    { key: 'branchWarehouse', label: 'สาขา / คลัง' },
    { key: 'sourceProduct', label: 'Source (ออก)', headerClassName: 'bg-red-50' },
    { key: 'sourceQty', label: 'Qty', cellClassName: 'text-right font-mono text-red-700', headerClassName: 'bg-red-50 text-right' },
    { key: 'unitCost', label: '฿/กก.', cellClassName: 'text-right font-mono', headerClassName: 'bg-red-50 text-right' },
    { key: 'targetProduct', label: 'Target (เข้า)', headerClassName: 'bg-emerald-50' },
    { key: 'targetQty', label: 'Qty', cellClassName: 'text-right font-mono text-emerald-700', headerClassName: 'bg-emerald-50 text-right' },
    { key: 'targetUnitCost', label: '฿/กก.', cellClassName: 'text-right font-mono', headerClassName: 'bg-emerald-50 text-right' },
    { key: 'lossQty', label: 'Loss', cellClassName: 'text-right font-mono' },
    { key: 'costStatus', label: 'Cost Status', cellClassName: 'text-center' },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-center' },
    { key: 'action', label: '' },
  ]
  if (mode === 'adjust') return [
    { key: 'docNo', label: 'Doc No' },
    { key: 'date', label: 'วันที่' },
    { key: 'branchWarehouse', label: 'สาขา/คลัง' },
    { key: 'productName', label: 'สินค้า' },
    { key: 'lotNo', label: 'Lot' },
    { key: 'systemQty', label: 'ระบบ', cellClassName: 'text-right font-mono' },
    { key: 'countedQty', label: 'นับจริง', cellClassName: 'text-right font-mono' },
    { key: 'diffQty', label: 'Diff', cellClassName: 'text-right font-mono' },
    { key: 'adjustType', label: 'ประเภท' },
    { key: 'valueNote', label: 'มูลค่า Note', cellClassName: 'text-right font-mono' },
    { key: 'reason', label: 'เหตุผล' },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-center' },
    { key: 'action', label: 'การกระทำ', cellClassName: 'text-center' },
  ]
  return []
}

function formatCell(value: unknown) {
  if (typeof value === 'number') return formatMoney(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '-')
}

function formatOperationCell(mode: Mode, row: Record<string, string | number | boolean | null>, key: string) {
  if (mode === 'status-convert') {
    if (key === 'productDisplay') return <><b>{formatCell(row.productCode)}</b><div className="text-xs text-slate-500">{formatCell(row.productName)}</div></>
    if (key === 'locationDisplay') return <span className="text-xs">{formatCell(row.branchName)}<br />{formatCell(row.warehouseName)}</span>
    if (key === 'statusFlow') return <><span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{formatCell(row.statusFrom)}</span><span className="mx-1 text-amber-600">→</span><span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{formatCell(row.statusTo)}</span></>
  }
  if (mode === 'convert') {
    if (key === 'action') {
      return (
        <div className="flex items-center justify-center gap-1">
          <button className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 opacity-60" disabled title="รอออกแบบ cost allocation/audit ก่อนเปิดใช้งาน" type="button">Confirm Cost</button>
          <button className="rounded-md bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700 opacity-60" disabled title="รอออกแบบ reverse/audit/rollback ก่อนเปิดใช้งาน" type="button">Reverse</button>
        </div>
      )
    }
    if (key === 'costStatus') {
      const value = String(row[key] ?? '')
      const label = value === 'allocated' ? '✓ Allocated' : value === 'pending_cost' ? '⏳ Pending Cost' : value === 'partial' ? '📋 Partial' : '-'
      const color = value === 'allocated' ? 'bg-emerald-100 text-emerald-700' : value === 'pending_cost' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
      return <span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      const color = value === 'posted' ? 'bg-emerald-100 text-emerald-700' : value === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
      return <span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${color}`}>{value || '-'}</span>
    }
    if (key === 'sourceType') {
      const value = String(row[key] ?? 'Manual')
      const color = value === 'Production Order' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      return <span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${color}`}>{value}</span>
    }
  }
  if (mode === 'adjust') {
    if (key === 'action') {
      return <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60" disabled title="รอออกแบบ reverse/audit/rollback ก่อนเปิดใช้งาน" type="button">จัดการ</button>
    }
    if (key === 'adjustType') {
      const value = String(row[key] ?? '')
      const color = value === 'LOSS' ? 'bg-red-100 text-red-700' : value === 'GAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      const label = value === 'LOSS' ? '📉 นับขาด' : value === 'GAIN' ? '📈 นับเกิน' : '-'
      return <span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      return <span className="rounded-md-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{value || 'posted'}</span>
    }
    if (key === 'diffQty') {
      const value = Number(row[key] ?? 0)
      return <span className={value < 0 ? 'font-mono text-red-600' : value > 0 ? 'font-mono text-emerald-700' : 'font-mono text-slate-500'}>{formatMoney(value)}</span>
    }
  }
  return formatCell(row[key])
}

function Metric({ cardClassName = 'rounded-md bg-white p-3 shadow', label, value, valueClassName = 'mt-1 text-lg font-bold text-slate-900' }: { cardClassName?: string; label: string; value: string; valueClassName?: string }) {
  return <div className={cardClassName}><div className="text-xs text-slate-500">{label}</div><div className={valueClassName}>{value}</div></div>
}

function Field(props: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="block text-sm font-medium">{props.label}{props.type === 'date' ? <DatePickerInput className="mt-1.5 w-full" value={props.value} onChange={props.onChange} /> : <input className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2" type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} />}</label>
}

function Select(props: { label: string; onChange: (value: string) => void; options: StockOption[]; value: string }) {
  return <label className="block text-sm font-medium">{props.label}<select className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2" value={props.value} onChange={(event) => props.onChange(event.target.value)}><option value="">เลือก</option>{props.options.filter((option) => option.active !== false).map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}</select></label>
}

function BranchWarehouseFields({ branchId, reference, setBranchId, setWarehouseId, warehouseId }: { branchId: string; reference: Payload['reference']; setBranchId: (value: string) => void; setWarehouseId: (value: string) => void; warehouseId: string }) {
  return <>
    <Select label="สาขา" options={reference.branches} value={branchId} onChange={(value) => { setBranchId(value); setWarehouseId('') }} />
    <Select label="คลัง" options={reference.warehouses.filter((item) => !branchId || item.branchId === branchId)} value={warehouseId} onChange={setWarehouseId} />
  </>
}

function StatusConvertForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StatusConvertFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StatusConvertFormValues>({ branchId: '', date: todayDateInput(), docNo: null, fromStatus: 'RM', lotNo: null, notes: null, productId: '', qty: 0, reason: null, toStatus: 'FG', warehouseId: '' })
  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} onSubmit={() => props.onSubmit(values)}>
    <BaseDateDoc values={values} setValues={setValues} />
    <Select label="สินค้า" options={props.reference.products} value={values.productId} onChange={(productId) => setValues({ ...values, productId })} />
    <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
    <Select label="จากสถานะ" options={statusOptions()} value={values.fromStatus} onChange={(fromStatus) => setValues({ ...values, fromStatus: fromStatus as StatusConvertFormValues['fromStatus'] })} />
    <Select label="เป็นสถานะ" options={statusOptions()} value={values.toStatus} onChange={(toStatus) => setValues({ ...values, toStatus: toStatus as StatusConvertFormValues['toStatus'] })} />
    <Field label="น้ำหนัก" type="number" value={String(values.qty)} onChange={(qty) => setValues({ ...values, qty: Number(qty) })} />
    <Field label="Lot" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
    <Field label="เหตุผล" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
  </FormShell>
}

function ConvertForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StockConvertFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StockConvertFormValues>({ branchId: '', date: todayDateInput(), docNo: null, lotNo: null, notes: null, reason: null, sourceProductId: '', sourceQty: 0, targetLotNo: null, targetProductId: '', targetQty: 0, warehouseId: '' })
  const sourceProduct = props.reference.products.find((item) => item.id === values.sourceProductId)
  const targetProduct = props.reference.products.find((item) => item.id === values.targetProductId)
  const lossQty = Math.max(0, Number(values.sourceQty) - Number(values.targetQty))
  const yieldPct = Number(values.sourceQty) > 0 ? (Number(values.targetQty) / Number(values.sourceQty)) * 100 : 0
  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} mode="convert" onSubmit={() => props.onSubmit(values)}>
    <BaseDateDoc values={values} setValues={setValues} />
    <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
    <div className="rounded-md border border-red-100 bg-red-50/70 p-4 md:col-span-2">
      <div className="mb-3 text-sm font-bold text-red-700">Source (ออก)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="สินค้าต้นทาง" options={props.reference.products} value={values.sourceProductId} onChange={(sourceProductId) => setValues({ ...values, sourceProductId })} />
        <Field label="น้ำหนักต้นทาง" type="number" value={String(values.sourceQty)} onChange={(sourceQty) => setValues({ ...values, sourceQty: Number(sourceQty) })} />
        <Field label="Lot ต้นทาง" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
        <ReadOnlyBox label="Source Product" value={sourceProduct ? `${sourceProduct.code ? `${sourceProduct.code} - ` : ''}${sourceProduct.name}` : '-'} />
      </div>
    </div>
    <div className="rounded-md border border-emerald-100 bg-emerald-50/70 p-4 md:col-span-2">
      <div className="mb-3 text-sm font-bold text-emerald-700">Target (เข้า)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="สินค้าปลายทาง" options={props.reference.products} value={values.targetProductId} onChange={(targetProductId) => setValues({ ...values, targetProductId })} />
        <Field label="น้ำหนักปลายทาง" type="number" value={String(values.targetQty)} onChange={(targetQty) => setValues({ ...values, targetQty: Number(targetQty) })} />
        <Field label="Lot ปลายทาง" value={values.targetLotNo ?? ''} onChange={(targetLotNo) => setValues({ ...values, targetLotNo })} />
        <ReadOnlyBox label="Target Product" value={targetProduct ? `${targetProduct.code ? `${targetProduct.code} - ` : ''}${targetProduct.name}` : '-'} />
      </div>
    </div>
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4 md:col-span-2">
      <div className="mb-3 text-sm font-bold text-slate-700">Loss / Yield / Cost Flow</div>
      <div className="grid gap-4 md:grid-cols-3">
        <ReadOnlyBox label="Loss" value={`${formatMoney(lossQty)} กก.`} />
        <ReadOnlyBox label="Yield" value={`${formatMoney(yieldPct)}%`} />
        <ReadOnlyBox label="Allocation" value="Manual WAC" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="เหตุผล" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
        <Field label="หมายเหตุ" value={values.notes ?? ''} onChange={(notes) => setValues({ ...values, notes })} />
      </div>
    </div>
  </FormShell>
}

function AdjustForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StockAdjustFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StockAdjustFormValues>({ branchId: '', countedQty: 0, date: todayDateInput(), docNo: null, lotNo: null, productId: '', reason: '', remark: null, systemQty: 0, warehouseId: '' })
  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} onSubmit={() => props.onSubmit(values)}>
    <BaseDateDoc values={values} setValues={setValues} />
    <Select label="สินค้า" options={props.reference.products} value={values.productId} onChange={(productId) => setValues({ ...values, productId })} />
    <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
    <Field label="Lot" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
    <Field label="ยอดในระบบ" type="number" value={String(values.systemQty)} onChange={(systemQty) => setValues({ ...values, systemQty: Number(systemQty) })} />
    <Field label="นับจริง" type="number" value={String(values.countedQty)} onChange={(countedQty) => setValues({ ...values, countedQty: Number(countedQty) })} />
    <Field label="เหตุผล" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} />
  </FormShell>
}

function BaseDateDoc<T extends { date: string; docNo?: string | null }>({ setValues, values }: { setValues: (values: T) => void; values: T }) {
  return <>
    <Field label="วันที่" type="date" value={values.date} onChange={(date) => setValues({ ...values, date })} />
    <Field label="เลขที่เอกสาร" value={values.docNo ?? ''} onChange={(docNo) => setValues({ ...values, docNo })} />
  </>
}

function ReadOnlyBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-white/70 bg-white/80 px-3 py-2"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{value}</div></div>
}

function FormShell({ cancelHref, children, isSaving, mode, onSubmit }: { cancelHref: string; children: React.ReactNode; isSaving: boolean; mode?: Mode; onSubmit: () => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
    <div className="grid gap-4 p-5 md:grid-cols-2">{children}</div>
    <div className="flex justify-end gap-2 border-t px-5 py-4"><a className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" href={cancelHref}>ยกเลิก</a><button className={mode === 'convert' ? 'rounded-md bg-cyan-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60' : 'rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60'} disabled={isSaving} type="submit">{mode === 'convert' ? '💾 บันทึก (Post)' : 'บันทึก'}</button></div>
  </form>
}

function statusOptions(): StockOption[] {
  return [{ active: true, id: 'RM', name: 'RM' }, { active: true, id: 'WIP', name: 'WIP' }, { active: true, id: 'FG', name: 'FG' }]
}
