'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { formatDateDisplay } from '@/lib/format'

type AccountOption = { currency: string; id: string; label: string; name: string; type: string }
type CustomerOption = { id: string; label: string; name: string }
type FxRateOption = { date: string; fromCurrency: string; rate: number; toCurrency: string }
type SalesBillOption = { customerId: string | null; docNo: string; id: string; receivableBalance: number }
type Row = { amountThb: number; date: string; description: string; docNo: string; feeThb: number; id: string; status: string; type: string }
type Payload = {
  filters: {
    accounts: AccountOption[]
    customers: CustomerOption[]
    latestFxRates: FxRateOption[]
    salesBills: SalesBillOption[]
  }
  rows: Row[]
  summary: { postedRows: number; totalFeeThb: number; totalReceivedThb: number }
}

type OverseasReceiptColumnKey = 'action' | 'amountForeign' | 'amountThb' | 'currency' | 'customer' | 'date' | 'docNo' | 'feeThb' | 'fxGainLoss' | 'fxRate' | 'receivedAccount' | 'status'
type SortDirection = 'asc' | 'desc'

const overseasReceiptColumns: Array<ResizableColumnDefinition<OverseasReceiptColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 125, minWidth: 105 },
  { key: 'customer', defaultWidth: 220, minWidth: 150 },
  { key: 'receivedAccount', defaultWidth: 160, minWidth: 120 },
  { key: 'amountForeign', defaultWidth: 130, minWidth: 110 },
  { key: 'currency', defaultWidth: 90, minWidth: 75 },
  { key: 'fxRate', defaultWidth: 90, minWidth: 75 },
  { key: 'amountThb', defaultWidth: 145, minWidth: 120 },
  { key: 'feeThb', defaultWidth: 120, minWidth: 100 },
  { key: 'fxGainLoss', defaultWidth: 115, minWidth: 95 },
  { key: 'status', defaultWidth: 135, minWidth: 110 },
  { key: 'action', defaultWidth: 105, minWidth: 90 },
]

type FormState = {
  bankFeeForeign: number
  billId: string
  chargeBearer: 'OUR' | 'SHA' | 'BEN'
  customerId: string
  date: string
  fxRate: number
  invoiceAmountForeign: number
  invoiceCurrency: string
  notes: string
  payerCountry: string
  receivedAccountId: string
  receivedAmountForeign: number
  swiftRef: string
  valueDate: string
}

const today = () => new Date().toISOString().slice(0, 10)

function initialForm(): FormState {
  return {
    bankFeeForeign: 0,
    billId: '',
    chargeBearer: 'SHA',
    customerId: '',
    date: today(),
    fxRate: 1,
    invoiceAmountForeign: 0,
    invoiceCurrency: 'USD',
    notes: '',
    payerCountry: '',
    receivedAccountId: '',
    receivedAmountForeign: 0,
    swiftRef: '',
    valueDate: '',
  }
}

export function OverseasReceiptPageClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => initialForm())
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<OverseasReceiptColumnKey | null>(null)
  const columnResize = useResizableColumns('finance.foreign.overseas-receipt.main.v1', overseasReceiptColumns)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>('/api/finance/foreign/overseas-receipt'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Overseas Receipt ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters.customers ?? []).map((customer) => ({
      id: customer.id,
      label: customer.label || customer.name || customer.id,
    }))
  }, [data?.filters.customers])

  const selectedAccount = data?.filters.accounts.find((account) => account.id === form.receivedAccountId)
  const receivedCurrency = selectedAccount?.currency ?? form.invoiceCurrency
  const latestRate = data?.filters.latestFxRates.find((rate) => rate.fromCurrency === receivedCurrency && rate.toCurrency === 'THB')
  const fxRate = form.fxRate || latestRate?.rate || 1
  const receivedAmountThb = form.receivedAmountForeign * fxRate
  const bankFeeThb = form.bankFeeForeign * fxRate
  const netReceived = receivedAmountThb - (form.chargeBearer === 'BEN' ? bankFeeThb : 0)
  const filteredBills = data?.filters.salesBills.filter((bill) => !form.customerId || bill.customerId === form.customerId) ?? []
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((a, b) => {
      const aValue = getOverseasReceiptSortValue(a, sortKey)
      const bValue = getOverseasReceiptSortValue(b, sortKey)
      const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'th', { numeric: true })

      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: OverseasReceiptColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function openForm() {
    const next = initialForm()
    next.customerId = data?.filters.customers[0]?.id ?? ''
    next.receivedAccountId = data?.filters.accounts[0]?.id ?? ''
    const currency = data?.filters.accounts[0]?.currency ?? 'USD'
    next.invoiceCurrency = currency === 'THB' ? 'USD' : currency
    next.fxRate = data?.filters.latestFxRates.find((rate) => rate.fromCurrency === currency && rate.toCurrency === 'THB')?.rate ?? 1
    setForm(next)
    setShowForm(true)
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <strong>Overseas Receipt</strong> - รับเงินจากต่างประเทศ (Export Sales) เข้า FCD หรือ THB Bank พร้อมคำนวณ FX Gain/Loss อัตโนมัติ
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="self-center text-sm text-slate-500">รายการรับเงินต่างประเทศ</h3>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={openForm}>+ รับเงินต่างประเทศใหม่</button>
      </div>

      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
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
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}>
          <colgroup>
            {overseasReceiptColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key)
              if (index === overseasReceiptColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={style} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="เลขที่รับเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่รับเงิน')} />
              <ResizableTableHead label="วันที่รับเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่รับเงิน')} />
              <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="customer" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('customer', 'ลูกค้า')} />
              <ResizableTableHead label="บัญชีรับเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="receivedAccount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('receivedAccount', 'บัญชีรับเงิน')} />
              <ResizableTableHead align="right" label="รับ (Foreign)" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amountForeign" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amountForeign', 'รับ Foreign')} />
              <ResizableTableHead label="สกุล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="currency" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('currency', 'สกุล')} />
              <ResizableTableHead align="right" label="FX" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fxRate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fxRate', 'FX')} />
              <ResizableTableHead align="right" label="มูลค่า THB" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amountThb" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amountThb', 'มูลค่า THB')} />
              <ResizableTableHead align="right" label="Bank Fee" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="feeThb" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('feeThb', 'Bank Fee')} />
              <ResizableTableHead align="right" label="FX G/L" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fxGainLoss" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fxGainLoss', 'FX G/L')} />
              <ResizableTableHead align="center" label="สถานะ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="status" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
              <ResizableTableHead align="right" label="" resizeProps={columnResize.getResizeHandleProps('action', 'Read-only')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={overseasReceiptColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && sortedRows.length === 0 ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={overseasReceiptColumns.length}>ยังไม่มีรายการรับเงินต่างประเทศ</td></tr> : null}
            {!isLoading && sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700">{row.docNo}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(row.date)}</td>
                <td className="min-w-0 truncate px-3 py-3 text-slate-700">{row.description || '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">-</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-medium tabular-nums text-emerald-700">{formatMoney(row.amountThb)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-amber-700">{formatMoney(row.feeThb)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">0</td>
                <td className="whitespace-nowrap px-3 py-3 text-center"><span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{row.status}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-slate-400">Read-only</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-100">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && !error && sortedRows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มีรายการรับเงินต่างประเทศ</div>
        ) : null}
        {!isLoading && sortedRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2 text-sm"
          >
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 text-sm font-mono">{row.docNo}</span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{row.status}</span>
            </div>
            
            <div className="text-sm text-slate-600 space-y-1.5">
              <div>
                <span className="font-semibold text-slate-500">Customer: </span>
                <span className="text-slate-800 font-medium">{row.description || '-'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-slate-500 block">วันที่: </span>
                  <span className="text-slate-800">{formatDateDisplay(row.date)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-100/60 mt-1 text-right text-xs">
                <div>
                  <span className="font-semibold text-slate-400 block text-xs">มูลค่า THB:</span>
                  <span className="text-emerald-700 font-bold tabular-nums text-sm">{formatMoney(row.amountThb)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block text-xs">Bank Fee:</span>
                  <span className="text-amber-700 font-bold tabular-nums text-sm">{formatMoney(row.feeThb)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block text-xs">FX G/L:</span>
                  <span className="text-slate-800 font-bold tabular-nums text-sm">0</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-md bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-5 py-4">
              <h3 className="font-bold text-white">รับเงินจากต่างประเทศ</h3>
              <button className="text-2xl text-white/80 hover:text-white" type="button" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="เลขที่"><input className="w-full rounded-md border bg-slate-50 px-2 py-1.5 font-mono" readOnly value="ORC-DRAFT" /></Field>
                <Field label="วันที่"><DatePickerInput className="w-full" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Customer *">
                  <div className="mt-1">
                    <SearchCombobox
                      inputId="overseas-customer-select"
                      label="Customer"
                      hideLabel
                      placeholder="เลือกลูกค้า"
                      options={customerSearchOptions}
                      value={form.customerId}
                      onChange={(value) => setForm({ ...form, billId: '', customerId: value })}
                    />
                  </div>
                </Field>
                <Field label="ประเทศต้นทาง"><input className="w-full rounded-md border px-2 py-1.5" value={form.payerCountry} onChange={(event) => setForm({ ...form, payerCountry: event.target.value })} /></Field>
              </div>
              <Field label="บัญชีรับเงิน *"><select className="w-full rounded-md border px-2 py-1.5" value={form.receivedAccountId} onChange={(event) => setForm({ ...form, receivedAccountId: event.target.value })}><option value="">--</option>{data?.filters.accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select></Field>
              <Field label="อ้างอิงบิลขาย (ถ้ามี)"><select className="w-full rounded-md border px-2 py-1.5" value={form.billId} onChange={(event) => setForm({ ...form, billId: event.target.value })}><option value="">--</option>{filteredBills.map((bill) => <option key={bill.id} value={bill.id}>{bill.docNo} - ค้าง {formatMoney(bill.receivableBalance)}</option>)}</select></Field>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="สกุลที่รับ"><input className="w-full rounded-md border bg-slate-50 px-2 py-1.5" readOnly value={receivedCurrency} /></Field>
                <Field label="FX Rate"><input className="w-full rounded-md border px-2 py-1.5 text-right" min="0" step="0.0001" type="number" value={form.fxRate} onChange={(event) => setForm({ ...form, fxRate: Number(event.target.value) })} /></Field>
                <Field label="Charge Bearer"><select className="w-full rounded-md border px-2 py-1.5" value={form.chargeBearer} onChange={(event) => setForm({ ...form, chargeBearer: event.target.value as FormState['chargeBearer'] })}><option value="OUR">OUR</option><option value="SHA">SHA</option><option value="BEN">BEN</option></select></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="ยอดตาม Invoice (Foreign)"><input className="w-full rounded-md border px-2 py-1.5 text-right" min="0" step="0.01" type="number" value={form.invoiceAmountForeign} onChange={(event) => setForm({ ...form, invoiceAmountForeign: Number(event.target.value) })} /></Field>
                <Field label="ยอดรับจริง (Foreign) *"><input className="w-full rounded-md border px-2 py-1.5 text-right font-bold" min="0" step="0.01" type="number" value={form.receivedAmountForeign} onChange={(event) => setForm({ ...form, receivedAmountForeign: Number(event.target.value) })} /></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="มูลค่า THB"><input className="w-full rounded-md border bg-emerald-50 px-2 py-1.5 text-right font-bold" readOnly value={formatMoney(receivedAmountThb)} /></Field>
                <Field label="Bank Fee (Foreign)"><input className="w-full rounded-md border px-2 py-1.5 text-right" min="0" step="0.01" type="number" value={form.bankFeeForeign} onChange={(event) => setForm({ ...form, bankFeeForeign: Number(event.target.value) })} /></Field>
                <Field label="Bank Fee THB"><input className="w-full rounded-md border bg-amber-50 px-2 py-1.5 text-right font-bold text-amber-700" readOnly value={formatMoney(bankFeeThb)} /></Field>
              </div>
              <div className="rounded-md bg-emerald-50 p-3 text-right text-xs">Net Received: <span className="font-bold text-emerald-700">{formatMoney(netReceived)}</span> | FX G/L: <span className="font-bold text-emerald-700">0</span></div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="SWIFT Reference"><input className="w-full rounded-md border px-2 py-1.5 font-mono" value={form.swiftRef} onChange={(event) => setForm({ ...form, swiftRef: event.target.value })} /></Field>
                <Field label="Value Date"><DatePickerInput className="w-full" value={form.valueDate} onChange={(value) => setForm({ ...form, valueDate: value })} /></Field>
              </div>
              <Field label="หมายเหตุ"><textarea className="w-full rounded-md border px-2 py-1.5" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100/50" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-md bg-slate-600 px-4 py-2 text-sm text-white opacity-60 transition-colors" disabled type="button">บันทึกร่าง</button>
              <button className="rounded-md bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-semibold text-white opacity-60 transition-colors" disabled type="button">รับเงิน + เพิ่ม Bank/FCD</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function getOverseasReceiptSortValue(row: Row, key: OverseasReceiptColumnKey): string | number {
  if (key === 'date') {
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  switch (key) {
    case 'amountThb':
      return row.amountThb
    case 'customer':
      return row.description
    case 'docNo':
      return row.docNo
    case 'feeThb':
      return row.feeThb
    case 'status':
      return row.status
    default:
      return ''
  }
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block"><span className="mb-1 block text-xs">{label}</span>{children}</label>
}
