'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AccountCurrency = { code: string; currency: string; id: string; label: string }
type Branch = { code: string; name: string }
type Row = { branchCode: string | null; carryingThbBefore: number; closingFxRate: number; currencyCode: string; docNo: string; id: string; nativeBalance: number; periodEnd: string; revaluedThbAmount: number; reversalOfId: string | null; status: string; unrealizedFxDifference: number }
type Payload = { filters: { accountCurrencies: AccountCurrency[]; branches: Branch[]; functionalCurrencyCode: string; rateTypes: string[] }; rows: Row[]; suggestedRate: { rate: string | null; rateId: string | null; source: string | null; status: 'suggested' | 'manual_required' } | null }
type LedgerPayload = { summary: { foreignBalance: number; thbBalance: number } }
type RevaluationColumnKey = 'action' | 'carryingThbBefore' | 'closingFxRate' | 'currencyCode' | 'docNo' | 'nativeBalance' | 'periodEnd' | 'status' | 'unrealizedFxDifference'
type SortDirection = 'asc' | 'desc'

const revaluationColumns: Array<ResizableColumnDefinition<RevaluationColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'periodEnd', defaultWidth: 120, minWidth: 105 },
  { key: 'currencyCode', defaultWidth: 110, minWidth: 90 },
  { key: 'nativeBalance', defaultWidth: 130, minWidth: 110 },
  { key: 'carryingThbBefore', defaultWidth: 145, minWidth: 120 },
  { key: 'closingFxRate', defaultWidth: 125, minWidth: 105 },
  { key: 'unrealizedFxDifference', defaultWidth: 135, minWidth: 115 },
  { key: 'status', defaultWidth: 110, minWidth: 95 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const today = () => new Date().toISOString().slice(0, 10)

export function FcdRevaluationPageClient() {
  const searchParams = useSearchParams()
  const documentNumber = searchParams.get('docNo')?.trim() ?? ''
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<RevaluationColumnKey | null>(null)
  const [form, setForm] = useState({ account: '', branchCode: '', closingFxRate: '', periodEnd: today(), rateOverrideReason: '', rateType: '' })
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)
  const columnResize = useResizableColumns('finance.foreign.fcd-revaluations.main.v1', revaluationColumns)
  const account = useMemo(() => data?.filters.accountCurrencies.find((item) => item.id === form.account) ?? null, [data?.filters.accountCurrencies, form.account])
  const preview = account && form.closingFxRate && ledger ? Number((ledger.summary.foreignBalance * Number(form.closingFxRate)).toFixed(2)) : null
  const difference = preview != null && ledger ? Number((preview - ledger.summary.thbBalance).toFixed(2)) : null
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((left, right) => {
      const leftValue = revaluationSortValue(left, sortKey)
      const rightValue = revaluationSortValue(right, sortKey)
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'th', { numeric: true })
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: RevaluationColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }
  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const query = documentNumber ? `?${new URLSearchParams({ docNo: documentNumber })}` : ''
      setData(await dailyFetchJson<Payload>(`/api/finance/foreign/fcd-revaluations${query}`))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'โหลดรายการตีมูลค่า FCD ไม่ได้') }
    finally { setIsLoading(false) }
  }, [documentNumber])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!account) { setLedger(null); return }
    void dailyFetchJson<LedgerPayload>(`/api/finance/foreign/fcd-ledger?${new URLSearchParams({ accountId: account.code, currencyCode: account.currency })}`).then(setLedger).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลด FCD balance ไม่ได้'))
  }, [account])
  useEffect(() => {
    if (!account || !form.periodEnd || !form.rateType) return
    setForm((current) => ({ ...current, closingFxRate: '' }))
    const query = new URLSearchParams({ currencyCode: account.currency, periodEnd: form.periodEnd, rateType: form.rateType })
    void dailyFetchJson<Payload>(`/api/finance/foreign/fcd-revaluations?${query}`)
      .then((payload) => {
        setData((current) => current ? { ...current, suggestedRate: payload.suggestedRate } : payload)
        if (payload.suggestedRate?.status === 'suggested') {
          setForm((current) => current.closingFxRate ? current : { ...current, closingFxRate: payload.suggestedRate!.rate ?? '' })
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลด suggested rate ไม่ได้'))
  }, [account, form.periodEnd, form.rateType])
  async function submit() {
    if (!account) { setError('ต้องเลือกบัญชี FCD และสกุลเงิน'); return }
    setSaving(true); setError(null)
    try {
      await dailyFetchJson('/api/finance/foreign/fcd-revaluations', { body: JSON.stringify({ ...form, accountCode: account.code, currencyCode: account.currency, idempotencyKey: crypto.randomUUID() }), headers: { 'Content-Type': 'application/json' }, method: 'POST' })
      setForm({ account: '', branchCode: '', closingFxRate: '', periodEnd: today(), rateOverrideReason: '', rateType: '' }); setLedger(null); await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'บันทึกรายการตีมูลค่า FCD ไม่ได้') } finally { setSaving(false) }
  }
  async function reverse(docNo: string) {
    setSaving(true); setError(null)
    try { await dailyFetchJson('/api/finance/foreign/fcd-revaluations', { body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), originalDocNo: docNo, reversalDate: today() }), headers: { 'Content-Type': 'application/json' }, method: 'PATCH' }); await load() } catch (caught) { setError(caught instanceof Error ? caught.message : 'ยกเลิกรายการตีมูลค่า FCD ไม่ได้') } finally { setSaving(false) }
  }

  function renderRowAction(row: Row, mobileLabel = false) {
    if (row.status !== 'posted' || row.reversalOfId) return null
    return <TableActionButton busy={saving} disabled={saving} label="จัดการ" menu={<TableActionMenuItem disabled={saving} onSelect={() => void reverse(row.docNo)}>ยกเลิก</TableActionMenuItem>} mobileLabel={mobileLabel} />
  }
  return <section className="space-y-4" data-ns-field-scope="entry">
    {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
    <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <Field label="วันสิ้นงวด"><DatePickerInput className="h-10 w-full" value={form.periodEnd} onChange={(periodEnd) => setForm({ ...form, periodEnd })} /></Field>
      <Field label="สาขา"><Select value={form.branchCode} onChange={(event) => setForm({ ...form, branchCode: event.target.value })}><option value="">เลือกสาขา</option>{(data?.filters.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.code} - {branch.name}</option>)}</Select></Field>
      <Field label="บัญชี FCD และสกุลเงิน"><Select value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })}><option value="">เลือกบัญชี FCD</option>{(data?.filters.accountCurrencies ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
      <Field label="ประเภท rate"><Select value={form.rateType} onChange={(event) => setForm({ ...form, rateType: event.target.value })}><option value="">เลือกประเภท rate</option>{(data?.filters.rateTypes ?? []).map((rateType) => <option key={rateType} value={rateType}>{rateType}</option>)}</Select></Field>
      <Field label={`Closing rate (${account?.currency ?? '-'} / ${data?.filters.functionalCurrencyCode ?? '-'})`}><input className="h-10 w-full rounded-md border border-slate-300 px-2 text-right tabular-nums" inputMode="decimal" value={form.closingFxRate} onChange={(event) => setForm({ ...form, closingFxRate: event.target.value })} /></Field>
      <Field label="เหตุผลเมื่อกรอก/แก้ rate เอง"><input className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm" value={form.rateOverrideReason} onChange={(event) => setForm({ ...form, rateOverrideReason: event.target.value })} /></Field>
      <div className="flex items-end"><button className="h-10 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="button" onClick={() => void submit()}>Post การตีมูลค่า</button></div>
    </div>
    {account && form.rateType ? <p className="px-1 text-sm text-slate-600">{data?.suggestedRate?.status === 'suggested' ? `พบ rate ${data.suggestedRate.rate} จาก ${data.suggestedRate.source ?? 'rate source'} สามารถแก้ไขได้ก่อนบันทึก` : 'ไม่พบ rate ตรงวันและประเภทที่เลือก กรุณากรอก rate พร้อมเหตุผล'}</p> : null}
    {account ? <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm md:grid-cols-4"><Fact label={`ยอด native (${account.currency})`} value={formatMoney(ledger?.summary.foreignBalance ?? 0)} /><Fact label="Carrying THB" value={formatMoney(ledger?.summary.thbBalance ?? 0)} /><Fact label="มูลค่าตาม closing rate" value={preview == null ? '-' : formatMoney(preview)} /><Fact label="Unrealized FX" value={difference == null ? '-' : formatMoney(difference)} /></div> : null}
    {columnResize.hasCustomWidths ? <div className="flex justify-end"><button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button></div> : null}
    <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
      <div className="overflow-x-auto">
        <table className="ns-table min-w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>{revaluationColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}</colgroup>
          <thead><tr><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="เอกสาร" resizeProps={columnResize.getResizeHandleProps('docNo', 'เอกสาร')} sortKey="docNo" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="งวด" resizeProps={columnResize.getResizeHandleProps('periodEnd', 'งวด')} sortKey="periodEnd" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="สกุลเงิน" resizeProps={columnResize.getResizeHandleProps('currencyCode', 'สกุลเงิน')} sortKey="currencyCode" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="Native" resizeProps={columnResize.getResizeHandleProps('nativeBalance', 'Native')} sortKey="nativeBalance" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="Carrying ก่อน" resizeProps={columnResize.getResizeHandleProps('carryingThbBefore', 'Carrying ก่อน')} sortKey="carryingThbBefore" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="Closing rate" resizeProps={columnResize.getResizeHandleProps('closingFxRate', 'Closing rate')} sortKey="closingFxRate" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ส่วนต่าง" resizeProps={columnResize.getResizeHandleProps('unrealizedFxDifference', 'ส่วนต่าง')} sortKey="unrealizedFxDifference" onSort={handleSort} /><ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={handleSort} /><ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} /></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={revaluationColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && sortedRows.map((row) => <tr key={row.id}><td className="p-3 text-center font-mono text-xs text-slate-700 whitespace-nowrap">{row.docNo}</td><td className="p-3 text-center whitespace-nowrap text-slate-700">{row.periodEnd}</td><td className="p-3 text-center whitespace-nowrap text-slate-700">{row.currencyCode}</td><td className="p-3 text-right tabular-nums">{formatMoney(row.nativeBalance)}</td><td className="p-3 text-right tabular-nums">{formatMoney(row.carryingThbBefore)}</td><td className="p-3 text-right tabular-nums">{row.closingFxRate.toFixed(3)}</td><td className="p-3 text-right tabular-nums">{formatMoney(row.unrealizedFxDifference)}</td><td className="p-3 text-center whitespace-nowrap">{row.status}</td><td className="p-3 text-center">{renderRowAction(row)}</td></tr>)}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={revaluationColumns.length}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
    <div className="space-y-3 lg:hidden">
      {isLoading ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
      {!isLoading && sortedRows.map((row) => <div key={row.id} className="space-y-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="whitespace-nowrap font-mono text-xs text-slate-500">{row.docNo}</div><div className="mt-0.5 text-sm font-medium text-slate-800">{row.currencyCode}</div></div><div className="text-right text-xs text-slate-500"><div className="whitespace-nowrap">{row.periodEnd}</div><div className="mt-1 whitespace-nowrap text-slate-700">{row.status}</div></div></div><div className="grid grid-cols-2 gap-2 border-y border-slate-100 py-2 text-right text-sm tabular-nums"><div><div className="text-xs text-slate-500">Native</div>{formatMoney(row.nativeBalance)}</div><div><div className="text-xs text-slate-500">Carrying ก่อน</div>{formatMoney(row.carryingThbBefore)}</div><div><div className="text-xs text-slate-500">Closing rate</div>{row.closingFxRate.toFixed(3)}</div><div><div className="text-xs text-slate-500">ส่วนต่าง</div>{formatMoney(row.unrealizedFxDifference)}</div></div>{renderRowAction(row, true)}</div>)}
      {!isLoading && sortedRows.length === 0 ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">ยังไม่มีรายการ</div> : null}
    </div>
  </section>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label> }
function Fact({ label, value }: { label: string; value: string }) { return <div><div className="text-slate-500">{label}</div><div className="font-semibold tabular-nums text-slate-900">{value}</div></div> }

function revaluationSortValue(row: Row, key: RevaluationColumnKey): number | string {
  if (key === 'carryingThbBefore') return row.carryingThbBefore
  if (key === 'closingFxRate') return row.closingFxRate
  if (key === 'currencyCode') return row.currencyCode
  if (key === 'docNo') return row.docNo
  if (key === 'nativeBalance') return row.nativeBalance
  if (key === 'periodEnd') return row.periodEnd
  if (key === 'status') return row.status
  if (key === 'unrealizedFxDifference') return row.unrealizedFxDifference
  return ''
}
