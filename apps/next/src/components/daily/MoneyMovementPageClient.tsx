'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { customerReceiptFormSchema, dailyFetchJson, formatMoney, supplierPaymentFormSchema, todayDateInput, type CustomerReceiptFormValues, type DailyAccountOption, type SupplierPaymentFormValues } from '@/lib/daily'

type Party = { active: boolean | null; id: string; name: string }
type Bill = {
  customerId?: string | null
  date?: string
  docNo: string
  id: string
  paidAmount?: number
  payableBalance?: number
  receivableBalance?: number
  status?: string
  supplierId?: string | null
  totalAmount: number
}
type MoneyRow = {
  accountId?: string
  accountName: string
  amount: number
  billId?: string
  customerId?: string
  date: string
  docNo: string
  fee?: number
  id: string
  method?: string
  netAmount: number
  notes: string
  partyName: string
  supplierId?: string
  withholdingTax?: number
}
type Payload = {
  accounts: DailyAccountOption[]
  bills: Bill[]
  customers?: Party[]
  rows: MoneyRow[]
  settings?: { whtRatePercent?: number }
  suppliers?: Party[]
}

type MoneyForm = SupplierPaymentFormValues | CustomerReceiptFormValues
type PaymentLine = NonNullable<SupplierPaymentFormValues['lines']>[number] & { billText?: string }
type PaymentSplit = SupplierPaymentFormValues['splits'][number]
const pageSizeOptions = [10, 25, 50, 100]

function newPaymentLine(): PaymentLine {
  return { amount: 0, billId: '', billText: '', discount: 0, fee: 0, id: `PL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, supplierId: '', withholdingTax: 0 }
}

function newPaymentSplit(): PaymentSplit {
  return { accountId: '', amount: 0, id: `SP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function paymentCashAmountFromSettlement(totalAmount: number, ratePercent: number) {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent >= 100) return roundMoney(totalAmount)
  return roundMoney(totalAmount * (100 - ratePercent) / 100)
}

function withholdingTaxFromCashAmount(amount: number, ratePercent: number) {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent >= 100) return 0
  return roundMoney(amount * ratePercent / (100 - ratePercent))
}

const paymentTheme = {
  action: 'bg-rose-600 hover:bg-rose-700',
  banner: 'from-rose-600 via-red-600 to-orange-500',
  chip: 'bg-rose-100 text-rose-700',
  muted: 'bg-rose-50 text-rose-700',
  strong: 'text-rose-700',
  table: 'bg-rose-700',
}

const receiptTheme = {
  action: 'bg-emerald-600 hover:bg-emerald-700',
  banner: 'from-emerald-600 via-green-600 to-teal-500',
  chip: 'bg-emerald-100 text-emerald-700',
  muted: 'bg-emerald-50 text-emerald-700',
  strong: 'text-emerald-700',
  table: 'bg-emerald-700',
}

function initialForm(mode: 'payment' | 'receipt'): MoneyForm {
  return {
    accountId: '',
    amount: 0,
    billId: mode === 'payment' ? '' : null,
    date: todayDateInput(),
    discount: 0,
    docNo: null,
    fee: 0,
    id: null,
    method: mode === 'payment' ? 'โอน' : null,
    notes: null,
    ...(mode === 'payment' ? { lines: [newPaymentLine()], splits: [newPaymentSplit()], supplierId: '' } : { customerId: '' }),
    withholdingTax: 0,
  } as MoneyForm
}

export function MoneyMovementPageClient({ mode }: { mode: 'payment' | 'receipt' }) {
  const [data, setData] = useState<Payload>({ accounts: [], bills: [], rows: [] })
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [billSearch, setBillSearch] = useState('')
  const [billStatusFilter, setBillStatusFilter] = useState('unpaid')
  const [billPage, setBillPage] = useState(1)
  const [billPageSize, setBillPageSize] = useState(25)
  const [form, setForm] = useState<MoneyForm>(() => initialForm(mode))
  const [isBillLocked, setIsBillLocked] = useState(false)

  const apiPath = mode === 'payment' ? '/api/purchase/payments' : '/api/sales/receipts'
  const partyKey = mode === 'payment' ? 'supplierId' : 'customerId'
  const parties = useMemo(() => (mode === 'payment' ? data.suppliers ?? [] : data.customers ?? []), [data.customers, data.suppliers, mode])
  const theme = mode === 'payment' ? paymentTheme : receiptTheme
  const title = mode === 'payment' ? 'จ่ายเงิน Supplier' : 'รับเงิน Customer'
  const subtitle = mode === 'payment' ? 'Payment Voucher' : 'Receipt Voucher'
  const historyTitle = mode === 'payment' ? 'ประวัติการจ่ายเงินที่ทำไปแล้ว' : 'ประวัติการรับเงินที่ทำไปแล้ว'
  const amountLabel = mode === 'payment' ? 'ยอดจ่าย' : 'ยอดรับ'
  const accountLabel = mode === 'payment' ? 'บัญชีจ่าย' : 'บัญชีรับ'
  const partyLabel = mode === 'payment' ? 'ผู้ขาย' : 'ลูกค้า'
  const balanceLabel = mode === 'payment' ? 'ค้างจ่าย' : 'ค้างรับ'
  const whtRatePercent = mode === 'payment' ? data.settings?.whtRatePercent ?? 0 : 0
  const partyValue = mode === 'payment'
    ? (form as SupplierPaymentFormValues).supplierId
    : (form as CustomerReceiptFormValues).customerId

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await dailyFetchJson<Payload>(apiPath))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [apiPath])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeAccounts = useMemo(() => data.accounts.filter((account) => account.active), [data.accounts])
  const partyMap = useMemo(() => new Map(parties.map((party) => [party.id, party.name])), [parties])
  const billMap = useMemo(() => new Map(data.bills.map((bill) => [bill.id, bill])), [data.bills])
  const paymentLines = mode === 'payment' ? (form as SupplierPaymentFormValues).lines ?? [] : []
  const selectedBill = form.billId ? billMap.get(form.billId) : null
  const selectedBillBalance = selectedBill ? (mode === 'payment' ? selectedBill.payableBalance ?? 0 : selectedBill.receivableBalance ?? 0) : 0
  const formNetAmount = mode === 'payment'
    ? form.amount + form.fee
    : form.amount - form.fee - form.withholdingTax - form.discount
  const paymentSplits = mode === 'payment' ? (form as SupplierPaymentFormValues).splits ?? [] : []
  const paymentSplitTotal = paymentSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0)

  const outstandingBills = useMemo(() => data.bills
    .filter((bill) => (mode === 'payment' ? (bill.payableBalance ?? 0) > 0 : (bill.receivableBalance ?? 0) > 0))
    .slice(0, 500), [data.bills, mode])
  const paymentSupplierId = mode === 'payment'
    ? paymentLines.find((line) => line.supplierId)?.supplierId ?? (form as SupplierPaymentFormValues).supplierId
    : ''
  const paymentSelectableBills = useMemo(() => {
    if (mode !== 'payment' || !paymentSupplierId) return outstandingBills
    return outstandingBills.filter((bill) => bill.supplierId === paymentSupplierId)
  }, [mode, outstandingBills, paymentSupplierId])

  const supplierBills = useMemo(() => {
    if (mode !== 'payment') return []
    const query = billSearch.trim().toLowerCase()
    return data.bills.filter((bill) => {
      const supplierName = partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? ''
      const balance = bill.payableBalance ?? 0
      const status = paymentBillStatus(bill)
      const matchesSearch = !query || `${bill.docNo} ${supplierName} ${bill.date ?? ''}`.toLowerCase().includes(query)
      const matchesStatus = billStatusFilter === 'all'
        || (billStatusFilter === 'unpaid' && balance > 0 && status !== 'cancelled')
        || (billStatusFilter === 'paid' && balance <= 0 && status !== 'cancelled')
        || (billStatusFilter === 'cancelled' && status === 'cancelled')
      return matchesSearch && matchesStatus
    })
  }, [billSearch, billStatusFilter, data.bills, mode, partyMap])

  const supplierBillTotalRows = supplierBills.length
  const supplierBillTotalPages = Math.max(1, Math.ceil(supplierBillTotalRows / billPageSize))
  const supplierBillCurrentPage = Math.min(billPage, supplierBillTotalPages)
  const supplierBillPageRows = supplierBills.slice((supplierBillCurrentPage - 1) * billPageSize, supplierBillCurrentPage * billPageSize)

  useEffect(() => {
    setBillPage(1)
  }, [billSearch, billStatusFilter, billPageSize])

  useEffect(() => {
    if (billPage > supplierBillTotalPages) setBillPage(supplierBillTotalPages)
  }, [billPage, supplierBillTotalPages])

  useEffect(() => {
    if (mode !== 'payment') return
    setForm((current) => {
      const nextWithholdingTax = withholdingTaxFromCashAmount(current.amount, whtRatePercent)
      if (Math.abs(current.withholdingTax - nextWithholdingTax) < 0.005) return current
      return { ...current, withholdingTax: nextWithholdingTax } as MoneyForm
    })
  }, [form.amount, mode, whtRatePercent])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.rows.filter((row) => {
      const matchesSearch = !query || `${row.docNo} ${row.partyName} ${row.accountName} ${row.notes}`.toLowerCase().includes(query)
      const matchesAccount = !accountFilter || row.accountId === accountFilter || row.accountName === accountFilter
      const matchesFrom = !dateFrom || row.date >= dateFrom
      const matchesTo = !dateTo || row.date <= dateTo
      return matchesSearch && matchesAccount && matchesFrom && matchesTo
    })
  }, [accountFilter, data.rows, dateFrom, dateTo, search])

  const metrics = useMemo(() => {
    const rowAmount = rows.reduce((sum, row) => sum + row.amount, 0)
    const rowNet = rows.reduce((sum, row) => sum + row.netAmount, 0)
    const rowWht = rows.reduce((sum, row) => sum + (row.withholdingTax ?? 0), 0)
    const rowFee = rows.reduce((sum, row) => sum + (row.fee ?? 0), 0)
    const outstanding = outstandingBills.reduce((sum, bill) => sum + (mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0), 0)
    return { outstanding, rowAmount, rowFee, rowNet, rowWht }
  }, [mode, outstandingBills, rows])

  function openForm() {
    setForm(initialForm(mode))
    setIsBillLocked(false)
    setError(null)
    setFormOpen(true)
  }

  function openFormForBill(bill: Bill) {
    const balance = bill.payableBalance ?? 0
    const settlementAmount = balance > 0 ? balance : bill.totalAmount
    setForm({
      ...initialForm(mode),
      amount: paymentCashAmountFromSettlement(settlementAmount, whtRatePercent),
      billId: bill.id,
      lines: [{
        ...newPaymentLine(),
        amount: paymentCashAmountFromSettlement(settlementAmount, whtRatePercent),
        billText: `${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(balance)}`,
        billId: bill.id,
        supplierId: bill.supplierId ?? '',
        withholdingTax: withholdingTaxFromCashAmount(paymentCashAmountFromSettlement(settlementAmount, whtRatePercent), whtRatePercent),
      }],
      supplierId: bill.supplierId ?? '',
    } as unknown as MoneyForm)
    setIsBillLocked(true)
    setError(null)
    setFormOpen(true)
  }

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setAccountFilter('')
  }

  function selectBill(billId: string) {
    const bill = billMap.get(billId)
    if (!bill) {
      setForm({ ...form, billId: '' })
      return
    }
    const balance = mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0
    const nextPartyId = mode === 'payment' ? bill.supplierId ?? '' : bill.customerId ?? ''
    setForm({
      ...form,
      [partyKey]: nextPartyId,
      amount: mode === 'payment'
        ? paymentCashAmountFromSettlement(balance > 0 ? balance : bill.totalAmount, whtRatePercent)
        : balance > 0 ? balance : bill.totalAmount,
      billId,
    } as MoneyForm)
  }

  function paymentLineFromBill(bill: Bill): PaymentLine {
    const balance = bill.payableBalance ?? 0
    const settlementAmount = balance > 0 ? balance : bill.totalAmount
    const amount = paymentCashAmountFromSettlement(settlementAmount, whtRatePercent)
    return {
      ...newPaymentLine(),
      amount,
      billText: `${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`,
      billId: bill.id,
      supplierId: bill.supplierId ?? '',
      withholdingTax: withholdingTaxFromCashAmount(amount, whtRatePercent),
    }
  }

  function syncPaymentLines(nextLines: PaymentLine[]) {
    const normalizedLines = nextLines.length > 0 ? nextLines.map((line) => ({
      ...line,
      amount: Number(line.amount) || 0,
      discount: Number(line.discount) || 0,
      fee: Number(line.fee) || 0,
      withholdingTax: withholdingTaxFromCashAmount(Number(line.amount) || 0, whtRatePercent),
    })) : [newPaymentLine()]
    const firstLine = normalizedLines[0]
    setForm({
      ...form,
      amount: roundMoney(normalizedLines.reduce((sum, line) => sum + line.amount, 0)),
      billId: firstLine?.billId ?? '',
      discount: roundMoney(normalizedLines.reduce((sum, line) => sum + line.discount, 0)),
      fee: roundMoney(normalizedLines.reduce((sum, line) => sum + line.fee, 0)),
      lines: normalizedLines,
      supplierId: firstLine?.supplierId ?? '',
      withholdingTax: roundMoney(normalizedLines.reduce((sum, line) => sum + line.withholdingTax, 0)),
    } as MoneyForm)
  }

  function addPaymentLine() {
    syncPaymentLines([...paymentLines, newPaymentLine()])
  }

  function removePaymentLine(index: number) {
    if (paymentLines.length <= 1) return
    syncPaymentLines(paymentLines.filter((_, lineIndex) => lineIndex !== index))
  }

  function updatePaymentLine(index: number, patch: Partial<PaymentLine>) {
    syncPaymentLines(paymentLines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  function selectPaymentLineBill(index: number, rawValue: string) {
    const docNo = rawValue.split('|')[0]?.trim()
    const bill = paymentSelectableBills.find((candidate) => candidate.id === rawValue || candidate.docNo === docNo)
    if (!bill) {
      updatePaymentLine(index, { billText: rawValue })
      return
    }
    updatePaymentLine(index, paymentLineFromBill(bill))
  }

  function paymentLineInputValue(line: PaymentLine) {
    if (line.billText !== undefined) return line.billText
    const bill = billMap.get(line.billId)
    if (!bill) return ''
    return `${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`
  }

  function syncPaymentSplits(nextSplits: PaymentSplit[]) {
    const firstAccountId = nextSplits[0]?.accountId ?? ''
    setForm({ ...form, accountId: firstAccountId, splits: nextSplits } as MoneyForm)
  }

  function addPaymentSplit() {
    syncPaymentSplits([...paymentSplits, newPaymentSplit()])
  }

  function removePaymentSplit(index: number) {
    if (paymentSplits.length <= 1) return
    syncPaymentSplits(paymentSplits.filter((_, splitIndex) => splitIndex !== index))
  }

  function updatePaymentSplit(index: number, patch: Partial<PaymentSplit>) {
    syncPaymentSplits(paymentSplits.map((split, splitIndex) => (splitIndex === index ? { ...split, ...patch } : split)))
  }

  function normalizedPaymentForm() {
    const paymentForm = form as SupplierPaymentFormValues
    const normalizedSplits = (paymentForm.splits ?? []).map((split) => ({ ...split }))
    const normalizedLines = (paymentForm.lines ?? []).filter((line) => line.billId && (Number(line.amount) || 0) > 0)
    if (normalizedSplits.length === 1 && normalizedSplits[0]?.accountId && (Number(normalizedSplits[0].amount) || 0) <= 0) {
      normalizedSplits[0].amount = formNetAmount
    }
    return {
      ...paymentForm,
      amount: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)),
      accountId: normalizedSplits[0]?.accountId ?? paymentForm.accountId,
      billId: normalizedLines[0]?.billId ?? paymentForm.billId,
      discount: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.discount) || 0), 0)),
      fee: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.fee) || 0), 0)),
      lines: normalizedLines,
      method: paymentForm.method ?? 'โอน',
      splits: normalizedSplits,
      supplierId: normalizedLines[0]?.supplierId ?? paymentForm.supplierId,
      withholdingTax: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.withholdingTax) || 0), 0)),
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = mode === 'payment' ? normalizedPaymentForm() : form
    const parsed = (mode === 'payment' ? supplierPaymentFormSchema : customerReceiptFormSchema).safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson(apiPath, { body: JSON.stringify(parsed.data), method: 'POST' })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-5">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className={`rounded-lg bg-gradient-to-r ${theme.banner} p-5 text-white shadow`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold opacity-90">{subtitle}</div>
            <h1 className="text-2xl font-bold">{mode === 'payment' ? 'จ่ายเงิน Supplier' : 'รับเงิน Customer'}</h1>
            <p className="mt-1 text-sm opacity-90">{mode === 'payment' ? 'บันทึกเงินออกจากบัญชีและประวัติ voucher จ่าย Supplier' : 'บันทึกเงินเข้าบัญชีและประวัติ voucher รับ Customer'}</p>
          </div>
          <button className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow ${theme.action}`} type="button" onClick={openForm}>
            {mode === 'payment' ? '+ จ่ายเงิน Supplier' : '+ รับเงิน Customer'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="จำนวน Voucher" value={rows.length.toLocaleString('th-TH')} tone="slate" />
        <KpiCard label={amountLabel} value={formatMoney(metrics.rowAmount)} tone={mode === 'payment' ? 'rose' : 'emerald'} />
        <KpiCard label="ยอดสุทธิ" value={formatMoney(metrics.rowNet)} tone="blue" />
        <KpiCard label="WHT / Fee" value={`${formatMoney(metrics.rowWht)} / ${formatMoney(metrics.rowFee)}`} tone="amber" />
        <KpiCard label={balanceLabel} value={formatMoney(metrics.outstanding)} tone="violet" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="ค้นหาเลขที่ / ชื่อ / บัญชี / หมายเหตุ" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="">ทุกบัญชี</option>
            {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={clearFilters}>ล้างตัวกรอง</button>
        </div>
      </div>

      {mode === 'payment' ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">บิล Supplier ทั้งหมด</h2>
              <p className="mt-1 text-sm text-slate-500">รวมบิลค้างจ่าย จ่ายบางส่วน จ่ายครบ และยกเลิกในตารางเดียว</p>
            </div>
            <div className="text-sm text-slate-600">พบทั้งหมด <span className="font-semibold text-slate-900">{supplierBillTotalRows}</span> รายการ</div>
          </div>
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_220px]">
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="ค้นหาเลขบิล / Supplier" type="search" value={billSearch} onChange={(event) => setBillSearch(event.target.value)} />
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={billStatusFilter} onChange={(event) => setBillStatusFilter(event.target.value)}>
              <option value="unpaid">เฉพาะค้างจ่าย</option>
              <option value="all">ทั้งหมด</option>
              <option value="paid">จ่ายครบแล้ว</option>
              <option value="cancelled">ยกเลิก</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
            <div>พบทั้งหมด <span className="font-semibold text-slate-900">{supplierBillTotalRows}</span> รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="จำนวนรายการต่อหน้า"
                className="rounded border border-slate-300 px-2 py-1"
                value={billPageSize}
                onChange={(event) => setBillPageSize(Number(event.target.value))}
              >
                {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
              </select>
              <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={supplierBillCurrentPage <= 1} type="button" onClick={() => setBillPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
              <span className="px-1">หน้า {supplierBillCurrentPage} / {supplierBillTotalPages}</span>
              <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={supplierBillCurrentPage >= supplierBillTotalPages} type="button" onClick={() => setBillPage((value) => Math.min(supplierBillTotalPages, value + 1))}>ถัดไป</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2 text-left">เลขบิล</th>
                  <th className="p-2 text-left">วันที่</th>
                  <th className="p-2 text-left">Supplier</th>
                  <th className="p-2 text-right">ยอดรวม</th>
                  <th className="p-2 text-right">จ่ายแล้ว</th>
                  <th className="p-2 text-right">คงเหลือ</th>
                  <th className="p-2 text-center">สถานะ</th>
                  <th className="p-2 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && supplierBillPageRows.map((bill) => {
                  const status = paymentBillStatus(bill)
                  const balance = bill.payableBalance ?? 0
                  return (
                    <tr key={bill.id} className="border-t hover:bg-slate-50">
                      <td className="p-2 font-mono text-xs font-semibold text-slate-700">{bill.docNo}</td>
                      <td className="p-2">{bill.date || '-'}</td>
                      <td className="max-w-72 truncate p-2 font-medium text-slate-800">{partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'}</td>
                      <td className="p-2 text-right font-semibold">{formatMoney(bill.totalAmount)}</td>
                      <td className="p-2 text-right text-blue-700">{formatMoney(bill.paidAmount)}</td>
                      <td className={`p-2 text-right font-bold ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(balance)}</td>
                      <td className="p-2 text-center"><PaymentBillStatusBadge status={status} /></td>
                      <td className="p-2 text-center">
                        {balance > 0 && status !== 'cancelled' ? (
                          <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => openFormForBill(bill)}>ทำจ่าย</button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && supplierBillPageRows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>ไม่พบบิลตามเงื่อนไข</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form className={`w-full overflow-hidden rounded-lg bg-white shadow-xl ${mode === 'payment' ? 'max-w-5xl' : 'max-w-4xl'}`} onSubmit={save}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${mode === 'payment' ? 'bg-white text-slate-900' : theme.muted}`}>
              <div>
                <h3 className="font-bold">{mode === 'payment' ? 'สร้าง Payment Voucher' : title}</h3>
                {mode === 'payment' ? null : <p className="text-xs opacity-80">{subtitle}</p>}
              </div>
              <button className="text-2xl text-slate-500" type="button" onClick={() => setFormOpen(false)}>&times;</button>
            </div>
            {mode === 'payment' ? (
              <div className="space-y-4 p-5 text-sm">
                <div className="max-w-xs">
                  <label className="block">
                    <span className="mb-1 block text-xs">วิธีจ่าย</span>
                    <select className="w-full rounded border px-2 py-1.5 text-sm" required value={form.method ?? 'โอน'} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                      <option value="โอน">โอน</option>
                      <option value="เงินสด">เงินสด</option>
                      <option value="เช็ค">เช็ค</option>
                      <option value="PromptPay">PromptPay</option>
                    </select>
                  </label>
                </div>

                <div className="rounded-lg border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-medium text-blue-900">💳 บัญชีจ่าย * <span className="text-xs font-normal text-slate-600">(เลือกได้หลายบัญชี กรณีวงเงินเต็ม → split)</span></h4>
                    <button className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700" type="button" onClick={addPaymentSplit}>+ เพิ่มบัญชี</button>
                  </div>
                  <div className="space-y-2">
                    {paymentSplits.map((split, splitIndex) => {
                      const splitAccount = activeAccounts.find((account) => account.id === split.accountId)
                      const splitBalance = splitAccount?.balance ?? 0
                      const splitAmount = Number(split.amount) || 0
                      return (
                      <div key={split.id ?? splitIndex} className="grid grid-cols-12 items-center gap-2 rounded border bg-white p-2">
                        <div className="col-span-1 text-center text-xs font-bold text-slate-500">#{splitIndex + 1}</div>
                        <div className="col-span-6">
                          <select
                            className="w-full rounded border px-2 py-1.5 text-sm"
                            required
                            value={split.accountId}
                            onChange={(event) => updatePaymentSplit(splitIndex, { accountId: event.target.value })}
                          >
                            <option disabled value="">-- เลือกบัญชี --</option>
                            {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} (คงเหลือ {formatMoney(account.balance ?? 0)})</option>)}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <input
                            className="w-full rounded border px-2 py-1.5 text-right text-sm"
                            min={0}
                            placeholder={paymentSplits.length === 1 ? formatMoney(formNetAmount) : 'จำนวนเงิน'}
                            step="0.01"
                            type="number"
                            value={String(split.amount)}
                            onChange={(event) => updatePaymentSplit(splitIndex, { amount: Number(event.target.value) })}
                          />
                        </div>
                        <div className="col-span-1 text-center">
                          <button
                            className="px-1 font-bold text-red-500 hover:text-red-700 disabled:text-slate-300"
                            disabled={paymentSplits.length <= 1}
                            type="button"
                            onClick={() => removePaymentSplit(splitIndex)}
                          >
                            ×
                          </button>
                        </div>
                        {split.accountId ? (
                          <div className="col-span-12 grid grid-cols-3 gap-2 pl-2 text-xs">
                            <div className="text-blue-700">💵 คงเหลือ: <b>{formatMoney(splitBalance)}</b></div>
                            <div className="text-amber-700">➖ จ่าย: <b>{formatMoney(splitAmount)}</b></div>
                            <div className="text-emerald-700">📊 หลังจ่าย: <b>{formatMoney(splitBalance - splitAmount)}</b></div>
                          </div>
                        ) : null}
                      </div>
                      )
                    })}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-sm">
                    <div className="rounded bg-slate-100 p-2">
                      <div className="text-xs text-slate-600">💰 รวมแยกบัญชี</div>
                      <div className="font-bold">{formatMoney(paymentSplitTotal)}</div>
                    </div>
                    <div className="rounded bg-amber-50 p-2">
                      <div className="text-xs text-amber-700">🎯 ยอดสุทธิที่ต้องจ่าย</div>
                      <div className="font-bold text-amber-700">{formatMoney(formNetAmount)}</div>
                    </div>
                    <div className={`rounded p-2 ${Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      <div className="text-xs">{Math.abs(paymentSplitTotal - formNetAmount) < 0.01 ? 'ตรงกัน' : '⚠️ ผลต่าง'}</div>
                      <div className="font-bold">{formatMoney(formNetAmount - paymentSplitTotal)}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold text-slate-800">รายการจ่าย ({paymentLines.length}) — เลือกบิลที่ต้องการจ่ายได้เลย ระบบจะ auto-fill Supplier</h4>
                    <button className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700" type="button" onClick={addPaymentLine}>+ เพิ่มบรรทัด</button>
                  </div>
                  {paymentSelectableBills.length === 0 ? <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">⚠️ ไม่มีบิลซื้อค้างจ่ายของ Supplier นี้</div> : null}
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <datalist id="payment-bill-options">
                      {paymentSelectableBills.map((bill) => (
                        <option key={bill.id} value={`${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`} />
                      ))}
                    </datalist>
                    <table className="w-full min-w-[880px] text-xs">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="w-80 p-1 text-left">บิล (เลขที่ · วันที่ · Supplier · ยอดค้าง)</th>
                          <th className="p-1 text-left">Supplier</th>
                          <th className="p-1 text-right">ค้าง</th>
                          <th className="p-1 text-right">จ่าย</th>
                          <th className="p-1 text-right">WHT</th>
                          <th className="p-1 text-right">Discount</th>
                          <th className="p-1 text-right">Bank Fee</th>
                          <th className="w-10 p-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {paymentLines.map((line, lineIndex) => {
                          const lineBill = line.billId ? billMap.get(line.billId) : null
                          const lineBalance = lineBill?.payableBalance ?? 0
                          return (
                            <tr key={line.id ?? lineIndex} className="border-t">
                              <td className="p-1">
                                {isBillLocked && lineIndex === 0 && selectedBill ? (
                                  <input className="w-full rounded border bg-slate-50 px-1 py-1 text-xs font-mono" readOnly value={selectedBill.docNo} />
                                ) : (
                                  <input
                                    autoComplete="off"
                                    className="w-full rounded border px-1 py-1 text-xs"
                                    list="payment-bill-options"
                                    placeholder="🔍 พิมพ์เลขบิล / ชื่อ supplier..."
                                    value={paymentLineInputValue(line)}
                                    onChange={(event) => selectPaymentLineBill(lineIndex, event.target.value)}
                                  />
                                )}
                              </td>
                              <td className="p-1 text-xs text-slate-600">{(partyMap.get(line.supplierId) ?? line.supplierId) || '-'}</td>
                              <td className="p-1 text-right text-amber-700">{formatMoney(lineBalance)}</td>
                              <td className="p-1"><input className="w-full rounded border px-1 py-1 text-right" min={0} step="0.01" type="number" value={String(line.amount)} onChange={(event) => updatePaymentLine(lineIndex, { amount: Number(event.target.value) })} /></td>
                              <td className="p-1"><input className="w-full rounded border bg-slate-50 px-1 py-1 text-right" readOnly type="number" value={String(line.withholdingTax)} /></td>
                              <td className="p-1"><input className="w-full rounded border px-1 py-1 text-right" min={0} step="0.01" type="number" value={String(line.discount)} onChange={(event) => updatePaymentLine(lineIndex, { discount: Number(event.target.value) })} /></td>
                              <td className="p-1"><input className="w-full rounded border px-1 py-1 text-right" min={0} step="0.01" type="number" value={String(line.fee)} onChange={(event) => updatePaymentLine(lineIndex, { fee: Number(event.target.value) })} /></td>
                              <td className="p-1 text-center"><button className="px-1 text-red-500 disabled:text-slate-300" disabled={paymentLines.length <= 1 || (isBillLocked && lineIndex === 0)} type="button" onClick={() => removePaymentLine(lineIndex)}>×</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 font-semibold">
                        <tr>
                          <td className="p-2 text-right" colSpan={2}>รวม</td>
                          <td />
                          <td className="p-2 text-right text-red-700">{formatMoney(form.amount)}</td>
                          <td className="p-2 text-right">{formatMoney(form.withholdingTax)}</td>
                          <td className="p-2 text-right">{formatMoney(form.discount)}</td>
                          <td className="p-2 text-right">{formatMoney(form.fee)}</td>
                          <td />
                        </tr>
                        <tr><td className="p-2 text-right" colSpan={8}>Net Cash Out: <span className="text-base font-bold text-red-700">{formatMoney(formNetAmount)}</span></td></tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Net Cash Out = ยอดจ่าย - WHT + Bank Fee</div>
                </div>

                <Field label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
              </div>
            ) : (
              <>
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <Field label="วันที่" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
                  <BillSelect
                    bills={outstandingBills}
                    label="บิลขาย"
                    mode={mode}
                    partyMap={partyMap}
                    value={form.billId ?? ''}
                    onChange={selectBill}
                  />
                  <Select label={partyLabel} value={partyValue} onChange={(value) => setForm({ ...form, [partyKey]: value } as MoneyForm)} options={parties.filter((party) => party.active !== false)} />
                  <Select label={accountLabel} value={form.accountId} onChange={(value) => setForm({ ...form, accountId: value })} options={activeAccounts} />
                  <Field label={amountLabel} type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: Number(value) })} />
                  <Field label="WHT" type="number" value={String(form.withholdingTax)} onChange={(value) => setForm({ ...form, withholdingTax: Number(value) })} />
                  <Field label="ส่วนลด" type="number" value={String(form.discount)} onChange={(value) => setForm({ ...form, discount: Number(value) })} />
                  <Field label="ค่าธรรมเนียม" type="number" value={String(form.fee)} onChange={(value) => setForm({ ...form, fee: Number(value) })} />
                  <Field label="วิธี" value={form.method ?? ''} onChange={(value) => setForm({ ...form, method: value })} />
                  <Field label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
                </div>
                <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 md:grid-cols-4">
                  <SummaryPill label={amountLabel} value={formatMoney(form.amount)} />
                  <SummaryPill label="WHT" value={formatMoney(form.withholdingTax)} />
                  <SummaryPill label="Fee / Discount" value={`${formatMoney(form.fee)} / ${formatMoney(form.discount)}`} />
                  <SummaryPill label="Net" value={formatMoney(formNetAmount)} />
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
              <button className={`rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 ${theme.action}`} disabled={isSaving} type="submit">บันทึก</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">📜 {historyTitle}</h2>
        <div className="text-sm text-slate-600">พบ <span className="font-semibold text-slate-900">{rows.length}</span> รายการ · รวมสุทธิ <span className={`font-semibold ${theme.strong}`}>{formatMoney(metrics.rowNet)}</span></div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className={`${theme.table} text-white`}>
            <tr>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">{partyLabel}</th>
              <th className="p-2 text-left">บิลอ้างอิง</th>
              <th className="p-2 text-left">บัญชี</th>
              <th className="p-2 text-right">{amountLabel}</th>
              <th className="p-2 text-right">WHT</th>
              <th className="p-2 text-right">Fee</th>
              <th className="p-2 text-right">สุทธิ</th>
              <th className="p-2 text-left">หมายเหตุ</th>
              <th className="p-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => {
              const bill = row.billId ? billMap.get(row.billId) : null
              return (
                <tr key={row.id} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs font-semibold text-slate-700">{row.docNo}</td>
                  <td className="p-2">{row.date}</td>
                  <td className="p-2 font-medium text-slate-800">{row.partyName}</td>
                  <td className="p-2 font-mono text-xs">{bill?.docNo ?? row.billId ?? '-'}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${theme.chip}`}>{row.accountName}</span></td>
                  <td className="p-2 text-right font-semibold">{formatMoney(row.amount)}</td>
                  <td className="p-2 text-right text-amber-700">{formatMoney(row.withholdingTax)}</td>
                  <td className="p-2 text-right text-slate-600">{formatMoney(row.fee)}</td>
                  <td className={`p-2 text-right font-bold ${theme.strong}`}>{formatMoney(row.netAmount)}</td>
                  <td className="max-w-56 truncate p-2 text-slate-600">{row.notes || '-'}</td>
                  <td className="p-2 text-center">
                    <button className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-400" disabled type="button">ดู/พิมพ์</button>
                  </td>
                </tr>
              )
            })}
            {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
          <tfoot className="bg-slate-100 font-semibold">
            <tr>
              <td className="p-2 text-right" colSpan={5}>รวม</td>
              <td className="p-2 text-right">{formatMoney(metrics.rowAmount)}</td>
              <td className="p-2 text-right">{formatMoney(metrics.rowWht)}</td>
              <td className="p-2 text-right">{formatMoney(metrics.rowFee)}</td>
              <td className={`p-2 text-right ${theme.strong}`}>{formatMoney(metrics.rowNet)}</td>
              <td className="p-2" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function paymentBillStatus(bill: Bill) {
  const rawStatus = String(bill.status ?? '').toLowerCase()
  if (rawStatus.includes('cancel')) return 'cancelled'
  const paid = bill.paidAmount ?? 0
  const balance = bill.payableBalance ?? 0
  if (balance <= 0.01 && paid > 0) return 'paid'
  if (paid > 0 && balance > 0.01) return 'partial'
  return 'open'
}

function PaymentBillStatusBadge({ status }: { status: string }) {
  const config = {
    cancelled: 'border-slate-300 bg-slate-100 text-slate-600',
    open: 'border-rose-200 bg-rose-50 text-rose-700',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    partial: 'border-amber-200 bg-amber-50 text-amber-700',
  } as const
  const labels = {
    cancelled: 'ยกเลิก',
    open: 'ค้างจ่าย',
    paid: 'จ่ายครบ',
    partial: 'จ่ายบางส่วน',
  } as const
  const key = (status in config ? status : 'open') as keyof typeof config
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${config[key]}`}>{labels[key]}</span>
}

function BillSelect(props: {
  bills: Bill[]
  label: string
  mode: 'payment' | 'receipt'
  onChange: (value: string) => void
  partyMap: Map<string, string>
  required?: boolean
  value: string
}) {
  return (
    <label className="block text-sm font-medium">
      {props.label ? <span>{props.label}{props.required ? <span className="text-red-600"> *</span> : null}</span> : null}
      <select className={`${props.label ? 'mt-1.5' : ''} w-full rounded-lg border border-slate-300 px-3 py-2`} required={props.required} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option disabled={props.required} value="">{props.required ? 'เลือกบิล' : 'ไม่ระบุ'}</option>
        {props.bills.map((bill) => {
          const partyId = props.mode === 'payment' ? bill.supplierId ?? '' : bill.customerId ?? ''
          const balance = props.mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0
          return <option key={bill.id} value={bill.id}>{bill.docNo} · {(props.partyMap.get(partyId) ?? partyId) || '-'} · {formatMoney(balance)}</option>
        })}
      </select>
    </label>
  )
}

function Field(props: { label: string; onChange: (value: string) => void; readOnly?: boolean; type?: string; value: string }) {
  return <label className="block text-sm font-medium">{props.label}<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" readOnly={props.readOnly} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>
}

function KpiCard({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate' | 'violet'; value: string }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    slate: 'border-slate-200 bg-white text-slate-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }
  return <div className={`rounded-lg border p-4 shadow-sm ${tones[tone]}`}><div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>
}

function Select(props: { allowEmpty?: boolean; label: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; placeholder?: string; required?: boolean; value: string }) {
  const allowEmpty = props.allowEmpty ?? true
  return (
    <label className="block text-sm font-medium">
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      <select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" required={props.required ?? !allowEmpty} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {allowEmpty ? <option value="">ไม่ระบุ</option> : <option disabled value="">{props.placeholder ?? 'เลือกข้อมูล'}</option>}
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>
  )
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><div className="text-xs text-slate-500">{label}</div><div className="font-bold text-slate-900">{value}</div></div>
}
