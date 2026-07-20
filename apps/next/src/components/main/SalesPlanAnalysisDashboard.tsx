'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { Select } from '@/components/ui/Select'
import { SearchCombobox } from '@/components/ui/SearchCombobox'

type AnyRow = Record<string, number | string | boolean | null | undefined>

type SalesPlanPayload = {
  filters: { metalGroups: string[]; month: string }
  productAnalysis: AnyRow[]
}

type AnalysisColumn = { key: string; label: string; numeric?: boolean }

const analysisColumns: AnalysisColumn[] = [
  { key: 'name', label: 'สินค้า' },
  { key: 'metalGroup', label: 'หมวด' },
  { key: 'stock', label: 'Stock รวม (กก.)', numeric: true },
  { key: 'lockedKg', label: 'ล็อกแล้ว (กก.)', numeric: true },
  { key: 'remainingKg', label: 'ว่างให้ขาย (กก.)', numeric: true },
  { key: 'wac', label: 'WAC ต้นทุน', numeric: true },
]

const remainingColumns: AnalysisColumn[] = [
  { key: 'name', label: 'สินค้า' },
  { key: 'metalGroup', label: 'หมวด' },
  { key: 'stock', label: 'Stock ทั้งหมด (กก.)', numeric: true },
  { key: 'lockedKg', label: 'ล็อกแล้ว (กก.)', numeric: true },
  { key: 'lockedContainers', label: 'ล็อกแล้ว (ตู้)', numeric: true },
  { key: 'remainingKg', label: 'รอล็อก (กก.)', numeric: true },
  { key: 'remainingContainers', label: 'รอล็อก (ตู้)', numeric: true },
  { key: 'wac', label: 'WAC', numeric: true },
  { key: 'value', label: 'มูลค่า WAC', numeric: true },
]

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function displayValue(row: AnyRow, column: AnalysisColumn) {
  if (!column.numeric) return String(row[column.key] ?? '')
  return numberValue(column.key === 'lockedContainers' ? 0 : row[column.key])
}

async function downloadTable(filename: string, sheet: string, columns: AnalysisColumn[], rows: AnyRow[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile([
    columns.map((column) => ({ fontWeight: 'bold' as const, value: column.label })),
    ...rows.map((row) => columns.map((column) => displayValue(row, column))),
  ], { sheet }).toFile(filename)
}

function tableNumber(value: unknown) {
  return formatMoney(numberValue(value))
}

export function SalesPlanAnalysisDashboard() {
  const [month, setMonth] = useState('2026-07')
  const [data, setData] = useState<SalesPlanPayload | null>(null)
  const [group, setGroup] = useState('')
  const [product, setProduct] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'analysis' | 'remaining'>('analysis')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const load = async (targetMonth = month) => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await dailyFetchJson<SalesPlanPayload>(`/api/sales-plan?month=${encodeURIComponent(targetMonth)}`)
      setData(payload)
      setMonth(payload.filters.month)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Dashboard ไม่สำเร็จ')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load('2026-07')
  }, [])

  const productOptions = useMemo(() => Array.from(new Map(
    (data?.productAnalysis ?? [])
      .map((row) => {
        const code = String(row.code ?? '').trim()
        const name = String(row.name ?? '').trim()
        if (!code) return null
        return [code, {
          description: String(row.metalGroup ?? '').trim(),
          id: code,
          label: name ? `${code} - ${name}` : code,
          searchText: `${code} ${name} ${String(row.metalGroup ?? '')}`,
        }]
      })
      .filter((entry): entry is [string, { description: string; id: string; label: string; searchText: string }] => entry !== null),
  ).values()), [data?.productAnalysis])
  const groupOptions = useMemo(() => Array.from(new Set(
    (data?.productAnalysis ?? []).map((row) => String(row.metalGroup ?? '')).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, 'th', { numeric: true })), [data?.productAnalysis])

  const rows = useMemo(() => (data?.productAnalysis ?? []).filter((row) => {
    const matchesGroup = !group || String(row.metalGroup ?? '') === group
    const matchesProduct = !product || String(row.code ?? '') === product
    return matchesGroup && matchesProduct
  }), [data?.productAnalysis, group, product])

  const totals = useMemo(() => ({
    stock: rows.reduce((sum, row) => sum + numberValue(row.stock), 0),
    locked: rows.reduce((sum, row) => sum + numberValue(row.lockedKg), 0),
    remaining: rows.reduce((sum, row) => sum + numberValue(row.remainingKg), 0),
    value: rows.reduce((sum, row) => sum + numberValue(row.value), 0),
  }), [rows])
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, rows])

  useEffect(() => {
    setPage(1)
  }, [activeTab, group, month, pageSize, product])

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const exportTable = async (type: 'analysis' | 'remaining') => {
    if (!rows.length) {
      setError('ไม่มีข้อมูลสำหรับส่งออก Excel')
      return
    }
    setIsExporting(true)
    try {
      const columns = type === 'analysis' ? analysisColumns : remainingColumns
      const sheet = type === 'analysis' ? 'วิเคราะห์แผนขาย' : 'สต๊อกหลังหักแผนล็อก'
      await downloadTable(`วิเคราะห์แผนขาย-${type}-${month}.xlsx`, sheet, columns, rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ส่งออก Excel ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Sales Planning Dashboard</p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-800"><Calculator className="size-5 text-emerald-600" />วิเคราะห์แผนขาย</h1>
            <p className="mt-1 text-sm text-slate-500">วิเคราะห์สต๊อกว่างขายทุกหมวด และสต๊อกหลังหักแผนที่ล็อก</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">จำนวนสินค้า</div><div className="mt-1 text-lg font-bold text-slate-800">{rows.length.toLocaleString('th-TH')}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Stock รวม</div><div className="mt-1 text-lg font-bold text-slate-800">{tableNumber(totals.stock)} กก.</div></div>
          <div className="rounded-lg bg-emerald-50 p-3"><div className="text-xs text-emerald-700">ล็อกแล้ว</div><div className="mt-1 text-lg font-bold text-emerald-700">{tableNumber(totals.locked)} กก.</div></div>
          <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-700">ว่างให้ขาย</div><div className="mt-1 text-lg font-bold text-amber-700">{tableNumber(totals.remaining)} กก.</div></div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex min-w-max items-end gap-2">
          <label className="flex shrink-0 flex-col gap-1 text-[11px] font-semibold text-slate-500" htmlFor="sales-plan-analysis-month">
            เดือน
            <input className="h-8 w-[140px] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700" id="sales-plan-analysis-month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); void load(event.target.value) }} />
          </label>
          <label className="flex shrink-0 flex-col gap-1 text-[11px] font-semibold text-slate-500">
            หมวด
            <Select className="h-8 w-[150px] text-xs" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="">ทุกหมวด</option>
              {groupOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </label>
          <div className="flex shrink-0 flex-col gap-1 text-[11px] font-semibold text-slate-500">
            สินค้า
            <SearchCombobox
              hideLabel
              inputClassName="h-8 w-[300px] text-xs"
              inputId="sales-plan-analysis-product"
              label="สินค้า"
              options={productOptions}
              placeholder="ค้นหาชื่อหรือรหัสสินค้า"
              value={product}
              onChange={setProduct}
            />
          </div>
          <button className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw className="size-3.5" />รีเฟรช</button>
          {(group || product) ? <button className="h-8 shrink-0 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => { setGroup(''); setProduct('') }} type="button">ล้างตัวกรอง</button> : null}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="flex overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          { key: 'analysis' as const, label: 'วิเคราะห์แผนขายและสต๊อกว่างขาย' },
          { key: 'remaining' as const, label: 'สต๊อกว่างขายหลังหักแผนที่ล็อก' },
        ].map((tab) => (
          <button
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${activeTab === tab.key ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'analysis' ? (
        <AnalysisTable columns={analysisColumns} isExporting={isExporting} page={page} pageSize={pageSize} rows={pagedRows} totalItems={rows.length} totalPages={totalPages} title="วิเคราะห์แผนขายและสต๊อกว่างขาย" onExport={() => void exportTable('analysis')} onPageChange={setPage} onPageSizeChange={setPageSize} />
      ) : (
        <AnalysisTable columns={remainingColumns} isExporting={isExporting} page={page} pageSize={pageSize} rows={pagedRows} totalItems={rows.length} totalPages={totalPages} title={`สต๊อกว่างขายหลังหักแผนที่ล็อก — เดือน ${month}`} onExport={() => void exportTable('remaining')} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
    </section>
  )
}

function AnalysisTable({ columns, isExporting, page, pageSize, rows, title, totalItems, totalPages, onExport, onPageChange, onPageSizeChange }: { columns: AnalysisColumn[]; isExporting: boolean; page: number; pageSize: number; rows: AnyRow[]; title: string; totalItems: number; totalPages: number; onExport: () => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={isExporting || !rows.length} onClick={onExport} type="button"><Download className="size-4" />ส่งออก Excel</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-500">แสดง {totalItems ? `${((page - 1) * pageSize) + 1}-${Math.min(page * pageSize, totalItems)}` : '0'} จาก {totalItems.toLocaleString('th-TH')} รายการ</span>
        <div className="flex items-center gap-2">
          <PageSizeDropdown options={[10, 25, 50, 100]} value={pageSize} onChange={onPageSizeChange} />
          <button aria-label="หน้าก่อนหน้า" className="inline-flex size-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button"><ChevronLeft className="size-4" /></button>
          <span className="min-w-[70px] text-center text-xs font-semibold text-slate-600">หน้า {page} / {totalPages}</span>
          <button aria-label="หน้าถัดไป" className="inline-flex size-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100"><tr>{columns.map((column) => <th className={`whitespace-nowrap px-3 py-3 text-xs font-bold text-slate-600 ${column.numeric ? 'text-right' : 'text-left'}`} key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => <tr className="hover:bg-slate-50" key={`${String(row.code)}-${title}`}>
              {columns.map((column) => <td className={`whitespace-nowrap px-3 py-2.5 ${column.numeric ? 'text-right tabular-nums' : 'text-left'} ${column.key === 'remainingKg' ? 'font-bold text-amber-700' : 'text-slate-700'}`} key={column.key}>{column.numeric ? tableNumber(displayValue(row, column)) : String(row[column.key] ?? '')}</td>)}
            </tr>)}
            {!rows.length ? <tr><td className="px-3 py-10 text-center font-semibold text-slate-400" colSpan={columns.length}>ไม่พบข้อมูล</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
