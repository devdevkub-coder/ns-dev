'use client'

import { useCallback, useEffect, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
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
      <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
        <strong>International Transfer</strong> - โอนเงินต่างประเทศ พร้อม SWIFT/Intermediary Fee, Charge Bearer (OUR/SHA/BEN), FX Rate ที่ใช้จริง
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="self-center text-sm text-slate-500">รายการโอนต่างประเทศ</h3>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={openForm}>+ โอนต่างประเทศใหม่</button>
      </div>

      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">เลขที่</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">วันที่</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">ผู้รับ</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">บัญชีต้นทาง</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">ประเภท</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">จำนวน</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">สกุล</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">FX</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">มูลค่า THB</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">Fee</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-center">Bearer</th><th className="px-4 py-3 text-xs font-semibold text-slate-500 text-center">สถานะ</th><th></th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="py-10 text-center text-slate-400" colSpan={13}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <tr><td className="py-10 text-center text-slate-400" colSpan={13}>ยังไม่มีรายการโอนต่างประเทศ</td></tr> : null}
            {data?.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3.5 font-mono">{row.docNo}</td><td className="px-4 py-3.5">{formatDateDisplay(row.date)}</td><td className="px-4 py-3.5">{row.description || '-'}</td><td className="px-4 py-3.5 text-xs">-</td><td className="px-4 py-3.5 text-xs">{row.type}</td><td className="px-4 py-3.5 text-right font-medium">-</td><td className="px-4 py-3.5">-</td><td className="px-4 py-3.5 text-right">-</td><td className="px-4 py-3.5 text-right">{formatMoney(row.amountThb)}</td><td className="px-4 py-3.5 text-right text-amber-700">{formatMoney(row.fee)}</td><td className="px-4 py-3.5 text-center text-xs">-</td><td className="px-4 py-3.5 text-center"><span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{row.status}</span></td><td className="px-4 py-3.5 text-right text-xs text-slate-400">Read-only</td>
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
        {!isLoading && (data?.rows.length ?? 0) === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มีรายการโอนต่างประเทศ</div>
        ) : null}
        {!isLoading && data?.rows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2 text-sm"
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
          <div className="w-full max-w-3xl overflow-hidden rounded-md bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-5 py-4">
              <h3 className="font-bold text-white">โอนเงินต่างประเทศ</h3>
              <button className="text-2xl text-white/80 hover:text-white" type="button" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="เลขที่"><input className="w-full rounded-md border bg-slate-50 px-2 py-1.5 font-mono" readOnly value="ITF-DRAFT" /></Field>
                <Field label="วันที่"><DatePickerInput className="w-full" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /></Field>
                <Field label="วัตถุประสงค์"><select className="w-full rounded-md border px-2 py-1.5" value={form.purposeId} onChange={(event) => setForm({ ...form, purposeId: event.target.value })}><option value="">--</option>{data?.filters.purposes.map((purpose) => <option key={purpose.id} value={purpose.id}>{purpose.label}</option>)}</select></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="ประเภท"><select className="w-full rounded-md border px-2 py-1.5" value={form.transferType} onChange={(event) => setForm({ ...form, transferType: event.target.value })}>{transferTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
                <Field label="Charge Bearer"><select className="w-full rounded-md border px-2 py-1.5" value={form.chargeBearer} onChange={(event) => setForm({ ...form, chargeBearer: event.target.value as FormState['chargeBearer'] })}><option value="OUR">OUR - ผู้โอนจ่ายค่าธรรมเนียมทั้งหมด</option><option value="SHA">SHA - แบ่งค่าธรรมเนียม</option><option value="BEN">BEN - ผู้รับรับภาระค่าธรรมเนียม</option></select></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="บัญชีต้นทาง *"><select className="w-full rounded-md border px-2 py-1.5" value={form.fromAccountId} onChange={(event) => setForm({ ...form, fromAccountId: event.target.value })}><option value="">--</option>{data?.filters.accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select></Field>
                <Field label="ผู้รับ (Beneficiary) *"><select className="w-full rounded-md border px-2 py-1.5" value={form.beneficiaryId} onChange={(event) => setForm({ ...form, beneficiaryId: event.target.value })}><option value="">--</option>{data?.filters.beneficiaries.map((beneficiary) => <option key={beneficiary.id} value={beneficiary.id}>{beneficiary.label}</option>)}</select></Field>
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
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100/50" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-md bg-slate-600 px-4 py-2 text-sm text-white opacity-60 transition-colors" disabled type="button">บันทึกร่าง</button>
              <button className="rounded-md bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-semibold text-white opacity-60 transition-colors" disabled type="button">ส่งธนาคาร + ลด Cash/Bank</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block"><span className="mb-1 block text-xs">{label}</span>{children}</label>
}
