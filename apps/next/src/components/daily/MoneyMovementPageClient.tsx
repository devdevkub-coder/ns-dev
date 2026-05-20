'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { customerReceiptFormSchema, dailyFetchJson, formatMoney, supplierPaymentFormSchema, todayDateInput, type CustomerReceiptFormValues, type DailyAccountOption, type SupplierPaymentFormValues } from '@/lib/daily'

type Party = { active: boolean | null; id: string; name: string }
type Bill = {
  customerId?: string | null
  docNo: string
  id: string
  payableBalance?: number
  receivableBalance?: number
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
type Payload = { accounts: DailyAccountOption[]; bills: Bill[]; customers?: Party[]; rows: MoneyRow[]; suppliers?: Party[] }

type MoneyForm = SupplierPaymentFormValues | CustomerReceiptFormValues

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
    billId: null,
    date: todayDateInput(),
    discount: 0,
    docNo: null,
    fee: 0,
    id: null,
    method: null,
    notes: null,
    ...(mode === 'payment' ? { supplierId: '' } : { customerId: '' }),
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
  const [form, setForm] = useState<MoneyForm>(() => initialForm(mode))

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

  const outstandingBills = useMemo(() => data.bills
    .filter((bill) => (mode === 'payment' ? (bill.payableBalance ?? 0) > 0 : (bill.receivableBalance ?? 0) > 0))
    .slice(0, 500), [data.bills, mode])

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
      setForm({ ...form, billId: null })
      return
    }
    const balance = mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0
    const nextPartyId = mode === 'payment' ? bill.supplierId ?? '' : bill.customerId ?? ''
    setForm({
      ...form,
      [partyKey]: nextPartyId,
      amount: balance > 0 ? balance : bill.totalAmount,
      billId,
    } as MoneyForm)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = (mode === 'payment' ? supplierPaymentFormSchema : customerReceiptFormSchema).safeParse(form)
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

      {outstandingBills.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">ยังไม่มีบิลค้างสำหรับสร้าง voucher ใหม่</div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form className="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl" onSubmit={save}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${theme.muted}`}>
              <div>
                <h3 className="font-bold">{title}</h3>
                <p className="text-xs opacity-80">{subtitle}</p>
              </div>
              <button className="text-2xl text-slate-500" type="button" onClick={() => setFormOpen(false)}>&times;</button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="วันที่" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
              <BillSelect
                bills={outstandingBills}
                label={mode === 'payment' ? 'บิลซื้อ' : 'บิลขาย'}
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
              <SummaryPill label="Net" value={formatMoney(mode === 'payment' ? form.amount + form.fee - form.withholdingTax - form.discount : form.amount - form.fee - form.withholdingTax - form.discount)} />
            </div>
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

function BillSelect(props: {
  bills: Bill[]
  label: string
  mode: 'payment' | 'receipt'
  onChange: (value: string) => void
  partyMap: Map<string, string>
  value: string
}) {
  return (
    <label className="block text-sm font-medium">
      {props.label}
      <select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">ไม่ระบุ</option>
        {props.bills.map((bill) => {
          const partyId = props.mode === 'payment' ? bill.supplierId ?? '' : bill.customerId ?? ''
          const balance = props.mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0
          return <option key={bill.id} value={bill.id}>{bill.docNo} · {(props.partyMap.get(partyId) ?? partyId) || '-'} · {formatMoney(balance)}</option>
        })}
      </select>
    </label>
  )
}

function Field(props: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="block text-sm font-medium">{props.label}<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>
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

function Select(props: { label: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; value: string }) {
  return <label className="block text-sm font-medium">{props.label}<select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" value={props.value} onChange={(event) => props.onChange(event.target.value)}><option value="">ไม่ระบุ</option>{props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><div className="text-xs text-slate-500">{label}</div><div className="font-bold text-slate-900">{value}</div></div>
}
