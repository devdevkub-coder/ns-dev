'use client'
import { Skeleton } from '@/components/ui/Skeleton'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AccountCurrency = { code: string; currency: string; id: string; label: string }
type Account = { code: string; id: string; label: string }
type Branch = { code: string; name: string }
type ConversionRow = { actualThbReceived: number; bankFeeThb: number; branchCode: string | null; conversionDate: string; destinationAccountCode: string; docNo: string; id: string; line: { carryingThbOut: number; nativeAmount: number; realizedFxDifference: number } | null; reversalOfId: string | null; sourceAccountCode: string; sourceCurrencyCode: string; status: string }
type Payload = { filters: { branches: Branch[]; destinationAccounts: Account[]; functionalCurrencyCode: string; sourceAccounts: AccountCurrency[] }; rows: ConversionRow[] }
type LedgerPayload = { summary: { foreignBalance: number; thbBalance: number; valuation: { weightedCarryingRate: number | null } } }
type ConversionColumnKey = 'action' | 'actualThbReceived' | 'carryingThbOut' | 'conversionDate' | 'docNo' | 'nativeAmount' | 'realizedFxDifference' | 'sourceAccount' | 'status'
type SortDirection = 'asc' | 'desc'

const conversionColumns: Array<ResizableColumnDefinition<ConversionColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'conversionDate', defaultWidth: 120, minWidth: 105 },
  { key: 'sourceAccount', defaultWidth: 180, minWidth: 150 },
  { key: 'nativeAmount', defaultWidth: 130, minWidth: 110 },
  { key: 'carryingThbOut', defaultWidth: 145, minWidth: 120 },
  { key: 'actualThbReceived', defaultWidth: 145, minWidth: 120 },
  { key: 'realizedFxDifference', defaultWidth: 135, minWidth: 115 },
  { key: 'status', defaultWidth: 110, minWidth: 95 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const today = () => new Date().toISOString().slice(0, 10)

export function FcdConversionPageClient() {
  const searchParams = useSearchParams()
  const documentNumber = searchParams.get('docNo')?.trim() ?? ''
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<ConversionColumnKey | null>(null)
  const [form, setForm] = useState({ actualThbReceived: '', bankFeeThb: '0', bankReference: '', branchCode: '', conversionDate: today(), destinationAccountCode: '', nativeAmount: '', source: '' })
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)
  const columnResize = useResizableColumns('finance.foreign.fcd-conversions.main.v1', conversionColumns)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const query = documentNumber ? `?${new URLSearchParams({ docNo: documentNumber })}` : ''
      setData(await dailyFetchJson<Payload>(`/api/finance/foreign/fcd-conversions${query}`))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'โหลดรายการแลกเงิน FCD ไม่ได้') }
    finally { setIsLoading(false) }
  }, [documentNumber])
  useEffect(() => { void load() }, [load])
  const source = useMemo(() => data?.filters.sourceAccounts.find((item) => item.id === form.source) ?? null, [data?.filters.sourceAccounts, form.source])
  useEffect(() => {
    if (!source) { setLedger(null); return }
    void dailyFetchJson<LedgerPayload>(`/api/finance/foreign/fcd-ledger?${new URLSearchParams({ accountId: source.code, currencyCode: source.currency })}`)
      .then(setLedger)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลด FCD balance ไม่ได้'))
  }, [source])
  const projectedCarrying = source && ledger?.summary.valuation.weightedCarryingRate != null && form.nativeAmount
    ? Number((Number(form.nativeAmount) * ledger.summary.valuation.weightedCarryingRate).toFixed(2)) : null
  const realizedDifference = projectedCarrying != null && form.actualThbReceived ? Number((Number(form.actualThbReceived) - projectedCarrying).toFixed(2)) : null
  const effectiveConversionRate = form.nativeAmount && form.actualThbReceived && Number(form.nativeAmount) > 0
    ? Number(form.actualThbReceived) / Number(form.nativeAmount) : null
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((left, right) => {
      const leftValue = conversionSortValue(left, sortKey)
      const rightValue = conversionSortValue(right, sortKey)
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'th', { numeric: true })
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: ConversionColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  async function submit() {
    if (!source) { setError('ต้องเลือกบัญชี FCD และสกุลเงินต้นทาง'); return }
    setSaving(true); setError(null)
    try {
      await dailyFetchJson('/api/finance/foreign/fcd-conversions', {
        body: JSON.stringify({ ...form, sourceAccountCode: source.code, sourceCurrencyCode: source.currency, idempotencyKey: crypto.randomUUID() }),
        headers: { 'Content-Type': 'application/json' }, method: 'POST',
      })
      setForm({ actualThbReceived: '', bankFeeThb: '0', bankReference: '', branchCode: '', conversionDate: today(), destinationAccountCode: '', nativeAmount: '', source: '' })
      setLedger(null)
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'บันทึกรายการแลกเงิน FCD ไม่ได้') } finally { setSaving(false) }
  }

  async function reverse(docNo: string) {
    setSaving(true); setError(null)
    try {
      await dailyFetchJson('/api/finance/foreign/fcd-conversions', { body: JSON.stringify({ conversionDate: today(), idempotencyKey: crypto.randomUUID(), originalDocNo: docNo }), headers: { 'Content-Type': 'application/json' }, method: 'PATCH' })
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'ยกเลิกรายการแลกเงิน FCD ไม่ได้') } finally { setSaving(false) }
  }

  function renderRowAction(row: ConversionRow, mobileLabel = false) {
    if (row.status !== 'active' || row.reversalOfId) return null
    return <TableActionButton busy={saving} disabled={saving} label="จัดการ" menu={<TableActionMenuItem disabled={saving} onSelect={() => void reverse(row.docNo)}>ยกเลิก</TableActionMenuItem>} mobileLabel={mobileLabel} />
  }

  return <section className="space-y-4" data-ns-field-scope="entry">
    {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
    <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <Field label="วันที่แลกเงินจริง"><DatePickerInput className="h-10 w-full" value={form.conversionDate} onChange={(value) => setForm({ ...form, conversionDate: value })} /></Field>
      <Field label="สาขา"><Select value={form.branchCode} onChange={(event) => setForm({ ...form, branchCode: event.target.value })}><option value="">เลือกสาขา</option>{(data?.filters.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.code} - {branch.name}</option>)}</Select></Field>
      <div className="col-span-2 md:col-span-1"><Field label="บัญชี FCD และสกุลเงิน"><Select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}><option value="">เลือกบัญชี FCD</option>{(data?.filters.sourceAccounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</Select></Field></div>
      <Field label={`ยอดที่แลก (${source?.currency ?? '-'})`}><MoneyInput value={form.nativeAmount} onChange={(nativeAmount) => setForm({ ...form, nativeAmount })} /></Field>
      <Field label={`บัญชีรับ ${data?.filters.functionalCurrencyCode ?? '-'}`}><Select value={form.destinationAccountCode} onChange={(event) => setForm({ ...form, destinationAccountCode: event.target.value })}><option value="">เลือกบัญชีปลายทาง</option>{(data?.filters.destinationAccounts ?? []).map((account) => <option key={account.id} value={account.code}>{account.label}</option>)}</Select></Field>
      <div className="col-span-2 md:col-span-1"><Field label={`ยอด ${data?.filters.functionalCurrencyCode ?? '-'} เข้าบัญชีจริง (หลังหัก fee)`}><MoneyInput value={form.actualThbReceived} onChange={(actualThbReceived) => setForm({ ...form, actualThbReceived })} /></Field></div>
      <Field label="ค่าธรรมเนียมธนาคาร"><MoneyInput value={form.bankFeeThb} onChange={(bankFeeThb) => setForm({ ...form, bankFeeThb })} /></Field>
      <Field label="เลขอ้างอิงธนาคาร"><input className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm" value={form.bankReference} onChange={(event) => setForm({ ...form, bankReference: event.target.value })} /></Field>
      <div className="col-span-2 flex items-end md:col-span-1"><button className="h-10 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="button" onClick={() => void submit()}>บันทึกการแลกเงิน</button></div>
    </div>
    {source ? <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm md:grid-cols-5"><Fact label={`คงเหลือ ${source.currency}`} value={formatMoney(ledger?.summary.foreignBalance ?? 0)} /><Fact label="Carrying THB" value={formatMoney(ledger?.summary.thbBalance ?? 0)} /><Fact label="Carrying rate" value={ledger?.summary.valuation.weightedCarryingRate?.toFixed(3) ?? '-'} /><Fact label="Effective conversion rate" value={effectiveConversionRate?.toFixed(3) ?? '-'} /><Fact label="กำไร/(ขาดทุน) ที่คาด" value={realizedDifference == null ? '-' : formatMoney(realizedDifference)} /></div> : null}
    {columnResize.hasCustomWidths ? <div className="flex justify-end"><button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 hidden lg:inline-flex" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button></div> : null}
    <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
      <div className="overflow-x-auto">
        <table className="ns-table min-w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>{conversionColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}</colgroup>
          <thead><tr><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="เอกสาร" resizeProps={columnResize.getResizeHandleProps('docNo', 'เอกสาร')} sortKey="docNo" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('conversionDate', 'วันที่')} sortKey="conversionDate" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="FCD" resizeProps={columnResize.getResizeHandleProps('sourceAccount', 'FCD')} sortKey="sourceAccount" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ยอด native" resizeProps={columnResize.getResizeHandleProps('nativeAmount', 'ยอด native')} sortKey="nativeAmount" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="Carrying THB" resizeProps={columnResize.getResizeHandleProps('carryingThbOut', 'Carrying THB')} sortKey="carryingThbOut" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="รับจริง THB" resizeProps={columnResize.getResizeHandleProps('actualThbReceived', 'รับจริง THB')} sortKey="actualThbReceived" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="FX ต่าง" resizeProps={columnResize.getResizeHandleProps('realizedFxDifference', 'FX ต่าง')} sortKey="realizedFxDifference" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={handleSort} /><ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} /></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={conversionColumns.length}><div className="flex items-center justify-center gap-3 py-1"><Skeleton className="h-4 w-44" /><Skeleton className="h-4 w-28" /><span className="sr-only">กำลังโหลดข้อมูล</span></div></td></tr> : null}
            {!isLoading && sortedRows.map((row) => <tr key={row.id}><td className="p-3 text-center font-mono text-xs text-slate-700 whitespace-nowrap">{row.docNo}</td><td className="p-3 text-center whitespace-nowrap text-slate-700">{row.conversionDate}</td><td className="p-3 text-center whitespace-nowrap text-slate-700">{row.sourceAccountCode} ({row.sourceCurrencyCode})</td><td className="p-3 text-right tabular-nums">{row.line ? formatMoney(row.line.nativeAmount) : '-'}</td><td className="p-3 text-right tabular-nums">{row.line ? formatMoney(row.line.carryingThbOut) : '-'}</td><td className="p-3 text-right tabular-nums">{formatMoney(row.actualThbReceived)}</td><td className="p-3 text-right tabular-nums">{row.line ? formatMoney(row.line.realizedFxDifference) : '-'}</td><td className="p-3 text-center whitespace-nowrap">{row.status}</td><td className="p-3 text-center">{renderRowAction(row)}</td></tr>)}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={conversionColumns.length}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
    <div className="space-y-3 lg:hidden">
      {isLoading ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
      {!isLoading && sortedRows.map((row) => <div key={row.id} className="space-y-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="whitespace-nowrap font-mono text-xs text-slate-500">{row.docNo}</div><div className="mt-0.5 text-sm font-medium text-slate-800">{row.sourceAccountCode} ({row.sourceCurrencyCode})</div></div><div className="text-right text-xs text-slate-500"><div className="whitespace-nowrap">{row.conversionDate}</div><div className="mt-1 whitespace-nowrap text-slate-700">{row.status}</div></div></div><div className="grid grid-cols-2 gap-2 border-y border-slate-100 py-2 text-right text-sm tabular-nums"><div><div className="text-xs text-slate-500">ยอด native</div>{row.line ? formatMoney(row.line.nativeAmount) : '-'}</div><div><div className="text-xs text-slate-500">Carrying THB</div>{row.line ? formatMoney(row.line.carryingThbOut) : '-'}</div><div><div className="text-xs text-slate-500">รับจริง THB</div>{formatMoney(row.actualThbReceived)}</div><div><div className="text-xs text-slate-500">FX ต่าง</div>{row.line ? formatMoney(row.line.realizedFxDifference) : '-'}</div></div>{renderRowAction(row, true)}</div>)}
      {!isLoading && sortedRows.length === 0 ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">ยังไม่มีรายการ</div> : null}
    </div>
  </section>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="space-y-1 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label> }
function Fact({ label, value }: { label: string; value: string }) { return <div><div className="text-slate-500">{label}</div><div className="font-semibold tabular-nums text-slate-900">{value}</div></div> }
function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <input className="h-10 w-full rounded-md border border-slate-300 px-2 text-right tabular-nums" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /> }

function conversionSortValue(row: ConversionRow, key: ConversionColumnKey): number | string {
  if (key === 'actualThbReceived') return row.actualThbReceived
  if (key === 'carryingThbOut') return row.line?.carryingThbOut ?? 0
  if (key === 'conversionDate') return row.conversionDate
  if (key === 'docNo') return row.docNo
  if (key === 'nativeAmount') return row.line?.nativeAmount ?? 0
  if (key === 'realizedFxDifference') return row.line?.realizedFxDifference ?? 0
  if (key === 'sourceAccount') return `${row.sourceAccountCode} ${row.sourceCurrencyCode}`
  if (key === 'status') return row.status
  return ''
}
