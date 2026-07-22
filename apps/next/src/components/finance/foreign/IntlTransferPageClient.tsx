'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type AccountOption = { currency: string; id: string; label: string; name: string }
type BeneficiaryOption = { country: string | null; currency: string; id: string; label: string; name: string }
type PurposeOption = { id: string; label: string }
type FxRateOption = { date: string; fromCurrency: string; rate: number; toCurrency: string }
type Row = { amountThb: number; date: string; description: string; docNo: string; fee: number; id: string; status: string; type: string }
type Payload = {
  filters: {
    accounts: AccountOption[]
    beneficiaries: BeneficiaryOption[]
    latestFxRates: FxRateOption[]
    purposes: PurposeOption[]
  }
  rows: Row[]
  summary: { postedRows: number; totalThb: number }
}

type IntlTransferColumnKey = 'action' | 'amountSource' | 'amountThb' | 'bearer' | 'currency' | 'date' | 'description' | 'docNo' | 'fee' | 'fromAccount' | 'fxRate' | 'status' | 'type'
type SortDirection = 'asc' | 'desc'

const intlTransferColumns: Array<ResizableColumnDefinition<IntlTransferColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 105 },
  { key: 'description', defaultWidth: 220, minWidth: 150 },
  { key: 'fromAccount', defaultWidth: 160, minWidth: 120 },
  { key: 'type', defaultWidth: 180, minWidth: 140 },
  { key: 'amountSource', defaultWidth: 125, minWidth: 105 },
  { key: 'currency', defaultWidth: 90, minWidth: 75 },
  { key: 'fxRate', defaultWidth: 90, minWidth: 75 },
  { key: 'amountThb', defaultWidth: 140, minWidth: 115 },
  { key: 'fee', defaultWidth: 110, minWidth: 95 },
  { key: 'bearer', defaultWidth: 105, minWidth: 90 },
  { key: 'status', defaultWidth: 135, minWidth: 110 },
  { key: 'action', defaultWidth: 105, minWidth: 90 },
]

type FormState = {
  amountSourceCcy: number
  bankFeeDest: number
  bankFeeSource: number
  beneficiaryId: string
  chargeBearer: 'OUR' | 'SHA' | 'BEN'
  date: string
  expectedValueDate: string
  fromAccountId: string
  fxRate: number
  intermediaryFee: number
  notes: string
  purposeId: string
  swiftRef: string
  transferType: string
}

const today = () => new Date().toISOString().slice(0, 10)
const transferTypes = ['Overseas Supplier Payment', 'Overseas Expense Payment', 'Customer Refund Overseas', 'FCD Transfer', 'FX Conversion', 'Intercompany Overseas Transfer', 'Loan Repayment Overseas', 'Other']

function initialForm(): FormState {
  return {
    amountSourceCcy: 0,
    bankFeeDest: 0,
    bankFeeSource: 0,
    beneficiaryId: '',
    chargeBearer: 'OUR',
    date: today(),
    expectedValueDate: '',
    fromAccountId: '',
    fxRate: 1,
    intermediaryFee: 0,
    notes: '',
    purposeId: '',
    swiftRef: '',
    transferType: 'Overseas Supplier Payment',
  }
}

export function IntlTransferPageClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => initialForm())
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<IntlTransferColumnKey | null>(null)
  const columnResize = useResizableColumns('finance.foreign.intl-transfer.main.v1', intlTransferColumns)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>('/api/finance/foreign/intl-transfer'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด International Transfer ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const selectedAccount = data?.filters.accounts.find((account) => account.id === form.fromAccountId)
  const selectedBeneficiary = data?.filters.beneficiaries.find((beneficiary) => beneficiary.id === form.beneficiaryId)
  const sourceCurrency = selectedAccount?.currency ?? 'THB'
  const destCurrency = selectedBeneficiary?.currency ?? 'USD'
  const latestRate = data?.filters.latestFxRates.find((rate) => rate.fromCurrency === sourceCurrency && rate.toCurrency === 'THB')
  const fxRate = form.fxRate || latestRate?.rate || 1
  const amountThb = sourceCurrency === 'THB' ? form.amountSourceCcy : form.amountSourceCcy * fxRate
  const totalFee = form.bankFeeSource + form.bankFeeDest + form.intermediaryFee
  const netReceived = form.amountSourceCcy - (form.chargeBearer === 'BEN' ? totalFee : 0)
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((a, b) => {
      const aValue = getIntlTransferSortValue(a, sortKey)
      const bValue = getIntlTransferSortValue(b, sortKey)
      const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'th', { numeric: true })

      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: IntlTransferColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  const tableControls = (
    <>
      <div>
        พบทั้งหมด <span className="font-semibold text-slate-900">{sortedRows.length}</span> รายการ
      </div>
      {columnResize.hasCustomWidths ? (
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          type="button"
          onClick={columnResize.resetColumnWidths}
        >
          คืนค่าเดิมตาราง
        </button>
      ) : null}
    </>
  )

  function openForm() {
    const next = initialForm()
    next.fromAccountId = data?.filters.accounts[0]?.id ?? ''
    next.beneficiaryId = data?.filters.beneficiaries[0]?.id ?? ''
    const accountCurrency = data?.filters.accounts[0]?.currency ?? 'THB'
    next.fxRate = data?.filters.latestFxRates.find((rate) => rate.fromCurrency === accountCurrency && rate.toCurrency === 'THB')?.rate ?? 1
    setForm(next)
    setShowForm(true)
  }

  return (
    <section className="space-y-4">

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="self-center text-sm text-slate-500">รายการโอนต่างประเทศ</h3>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={openForm}>+ โอนต่างประเทศใหม่</button>
      </div>

      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:hidden">
        {tableControls}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          {tableControls}
        </div>
        <div className="overflow-x-auto">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth, width: '100%' }}>
          <colgroup>
            {intlTransferColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="เลขที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead label="วันที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="ผู้รับ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="description" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('description', 'ผู้รับ')} />
              <ResizableTableHead label="บัญชีต้นทาง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fromAccount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fromAccount', 'บัญชีต้นทาง')} />
              <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="type" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
              <ResizableTableHead align="right" label="จำนวน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amountSource" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amountSource', 'จำนวน')} />
              <ResizableTableHead label="สกุล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="currency" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('currency', 'สกุล')} />
              <ResizableTableHead align="right" label="FX" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fxRate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fxRate', 'FX')} />
              <ResizableTableHead align="right" label="มูลค่า THB" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amountThb" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amountThb', 'มูลค่า THB')} />
              <ResizableTableHead align="right" label="Fee" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fee" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fee', 'Fee')} />
              <ResizableTableHead align="center" label="Bearer" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="bearer" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('bearer', 'Bearer')} />
              <ResizableTableHead align="center" label="สถานะ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="status" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
              <ResizableTableHead align="right" label="" resizeProps={columnResize.getResizeHandleProps('action', 'Read-only')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={intlTransferColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && sortedRows.length === 0 ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={intlTransferColumns.length}>ยังไม่มีรายการโอนต่างประเทศ</td></tr> : null}
            {!isLoading && sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700">{row.docNo}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(row.date)}</td>
                <td className="min-w-0 truncate px-3 py-3 text-slate-700">{row.description || '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">-</td>
                <td className="min-w-0 truncate px-3 py-3 text-xs text-slate-700">{row.type}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-900">{formatMoney(row.amountThb)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-amber-700">{formatMoney(row.fee)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-center text-xs text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-center"><span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{row.status}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-slate-400">Read-only</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow border border-slate-100">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && !error && sortedRows.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มีรายการโอนต่างประเทศ</div>
        ) : null}
        {!isLoading && sortedRows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-2 text-sm"
          >
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 text-sm font-mono">{row.docNo}</span>
              <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">{row.status}</span>
            </div>
            
            <div className="text-sm text-slate-600 space-y-1.5">
              <div>
                <span className="font-semibold text-slate-500">ผู้รับ: </span>
                <span className="text-slate-800 font-medium">{row.description || '-'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-slate-500 block">วันที่: </span>
                  <span className="text-slate-800">{formatDateDisplay(row.date)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">ประเภท: </span>
                  <span className="text-slate-800 truncate block">{row.type}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100/60 mt-1 text-right text-xs">
                <div>
                  <span className="font-semibold text-slate-400 block text-xs">มูลค่า THB:</span>
                  <span className="text-slate-800 font-bold tabular-nums text-sm">{formatMoney(row.amountThb)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block text-xs">ค่าธรรมเนียม:</span>
                  <span className="text-amber-700 font-bold tabular-nums text-sm">{formatMoney(row.fee)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-3xl overflow-hidden rounded-md bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150" data-ns-field-scope="entry" onClick={(e) => e.stopPropagation()}>
            <div data-ns-dialog-header className="flex flex-wrap items-center justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4">
              <h3 className="font-bold text-white">โอนเงินต่างประเทศ</h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
                <button className="h-9 rounded-md border border-slate-700 bg-slate-800 px-4 text-sm font-normal text-white opacity-60 transition-colors" disabled type="button">บันทึกร่าง</button>
                <button className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white opacity-60 transition-colors hover:bg-emerald-700" disabled type="button">ส่งธนาคาร + ลด Cash/Bank</button>
              </div>
            </div>
            <div className="space-y-3 bg-slate-50 p-5 text-sm">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="เลขที่"><input className="w-full rounded-md border bg-slate-50 px-2 py-1.5 font-mono" readOnly value="ITF-DRAFT" /></Field>
                <Field label="วันที่"><DatePickerInput className="w-full" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /></Field>
                <Field label="วัตถุประสงค์"><Select className="h-10 w-full px-2 py-1.5" value={form.purposeId} onChange={(event) => setForm({ ...form, purposeId: event.target.value })}><option value="">--</option>{data?.filters.purposes.map((purpose) => <option key={purpose.id} value={purpose.id}>{purpose.label}</option>)}</Select></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="ประเภท"><Select className="h-10 w-full px-2 py-1.5" value={form.transferType} onChange={(event) => setForm({ ...form, transferType: event.target.value })}>{transferTypes.map((type) => <option key={type}>{type}</option>)}</Select></Field>
                <Field label="Charge Bearer"><Select className="h-10 w-full px-2 py-1.5" value={form.chargeBearer} onChange={(event) => setForm({ ...form, chargeBearer: event.target.value as FormState['chargeBearer'] })}><option value="OUR">OUR - ผู้โอนจ่ายค่าธรรมเนียมทั้งหมด</option><option value="SHA">SHA - แบ่งค่าธรรมเนียม</option><option value="BEN">BEN - ผู้รับรับภาระค่าธรรมเนียม</option></Select></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="บัญชีต้นทาง *"><Select className="h-10 w-full px-2 py-1.5" value={form.fromAccountId} onChange={(event) => setForm({ ...form, fromAccountId: event.target.value })}><option value="">--</option>{data?.filters.accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</Select></Field>
                <Field label="ผู้รับ (Beneficiary) *"><Select className="h-10 w-full px-2 py-1.5" value={form.beneficiaryId} onChange={(event) => setForm({ ...form, beneficiaryId: event.target.value })}><option value="">--</option>{data?.filters.beneficiaries.map((beneficiary) => <option key={beneficiary.id} value={beneficiary.id}>{beneficiary.label}</option>)}</Select></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="สกุลต้นทาง"><input className="w-full rounded-md border bg-slate-50 px-2 py-1.5" readOnly value={sourceCurrency} /></Field>
                <Field label="สกุลปลายทาง"><input className="w-full rounded-md border bg-slate-50 px-2 py-1.5" readOnly value={destCurrency} /></Field>
                <Field label="FX Rate"><input className="w-full rounded-md border px-2 py-1.5 text-right" min="0" step="0.0001" type="number" value={form.fxRate} onChange={(event) => setForm({ ...form, fxRate: Number(event.target.value) })} /></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="จำนวน (สกุลต้นทาง) *"><input className="w-full rounded-md border px-2 py-1.5 text-right font-bold" min="0" step="0.01" type="number" value={form.amountSourceCcy} onChange={(event) => setForm({ ...form, amountSourceCcy: Number(event.target.value) })} /></Field>
                <Field label="มูลค่า THB"><input className="w-full rounded-md border bg-blue-50 px-2 py-1.5 text-right font-bold" readOnly value={formatMoney(amountThb)} /></Field>
              </div>
              <div className="rounded-md bg-amber-50 p-3">
                <div className="mb-2 text-xs font-semibold text-amber-700">ค่าธรรมเนียม</div>
                <div className="grid gap-2 md:grid-cols-3">
                  <Field label="Bank Fee (ต้นทาง)"><input className="w-full rounded-md border px-2 py-1 text-right" min="0" step="0.01" type="number" value={form.bankFeeSource} onChange={(event) => setForm({ ...form, bankFeeSource: Number(event.target.value) })} /></Field>
                  <Field label="Intermediary Fee"><input className="w-full rounded-md border px-2 py-1 text-right" min="0" step="0.01" type="number" value={form.intermediaryFee} onChange={(event) => setForm({ ...form, intermediaryFee: Number(event.target.value) })} /></Field>
                  <Field label="Receiving Bank Fee"><input className="w-full rounded-md border px-2 py-1 text-right" min="0" step="0.01" type="number" value={form.bankFeeDest} onChange={(event) => setForm({ ...form, bankFeeDest: Number(event.target.value) })} /></Field>
                </div>
                <div className="mt-2 text-right text-xs">รวม Fee: <span className="font-bold text-amber-700">{formatMoney(totalFee)}</span> | Net Received: <span className="font-bold text-emerald-700">{formatMoney(netReceived)}</span></div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="SWIFT Reference"><input className="w-full rounded-md border px-2 py-1.5 font-mono" value={form.swiftRef} onChange={(event) => setForm({ ...form, swiftRef: event.target.value })} /></Field>
                <Field label="วัน Value Date คาดการณ์"><DatePickerInput className="w-full" value={form.expectedValueDate} onChange={(value) => setForm({ ...form, expectedValueDate: value })} /></Field>
              </div>
              <Field label="หมายเหตุ"><textarea className="w-full rounded-md border px-2 py-1.5" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function getIntlTransferSortValue(row: Row, key: IntlTransferColumnKey): string | number {
  if (key === 'date') {
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  switch (key) {
    case 'amountThb':
      return row.amountThb
    case 'docNo':
      return row.docNo
    case 'description':
      return row.description
    case 'fee':
      return row.fee
    case 'status':
      return row.status
    case 'type':
      return row.type
    default:
      return ''
  }
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block" data-manual-required={label.trim().endsWith('*') ? 'true' : undefined}><span className="mb-1 block text-xs">{label}</span>{children}</label>
}
