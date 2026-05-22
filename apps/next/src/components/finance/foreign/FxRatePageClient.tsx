'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson } from '@/lib/daily'

type FxRateRow = {
  active: boolean
  fromCurrency: string
  id: string
  note: string | null
  rate: number
  rateDate: string
  rateType: string
  source: string | null
  toCurrency: string
  updatedAt: string
}

type CurrencyOption = {
  code: string
  displayCode: string
  name: string
  rateToThb: number
  symbol: string | null
}

type FxRatePayload = {
  filters: {
    currencies: CurrencyOption[]
    fromCurrencies: string[]
    rateTypes: string[]
    toCurrencies: string[]
  }
  latestRates: FxRateRow[]
  rows: FxRateRow[]
  summary: {
    activeRows: number
    latestPairs: number
    rows: number
  }
}

type FormState = {
  active: boolean
  fromCurrency: string
  id: string
  note: string
  rate: string
  rateDate: string
  rateType: string
  source: string
  toCurrency: string
}

const today = new Date().toISOString().slice(0, 10)

function emptyForm(): FormState {
  return {
    active: true,
    fromCurrency: 'USD',
    id: '',
    note: '',
    rate: '',
    rateDate: today,
    rateType: 'BOT Rate',
    source: 'BOT',
    toCurrency: 'THB',
  }
}

export function FxRatePageClient() {
  const [active, setActive] = useState('true')
  const [data, setData] = useState<FxRatePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState>(emptyForm)
  const [fromCurrency, setFromCurrency] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [toDate, setToDate] = useState('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (fromCurrency !== 'all') params.set('fromCurrency', fromCurrency)
    if (active !== 'all') params.set('active', active)
    return params.toString()
  }, [active, fromCurrency, fromDate, toDate])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<FxRatePayload>(`/api/finance/foreign/fx-rate${queryString ? `?${queryString}` : ''}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด FX Rate ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currencyOptions = useMemo(() => {
    const displays = data?.filters.currencies.map((currency) => currency.displayCode).filter(Boolean) ?? []
    return Array.from(new Set(['THB', 'USD', 'CNY', 'JPY', 'EUR', 'SGD', ...displays])).sort()
  }, [data?.filters.currencies])

  const latestRates = useMemo(() => {
    const order = ['USD', 'CNY', 'JPY', 'EUR', 'SGD']
    return [...(data?.latestRates ?? [])].sort((left, right) => {
      const leftIndex = order.indexOf(left.fromCurrency)
      const rightIndex = order.indexOf(right.fromCurrency)
      return (leftIndex === -1 ? order.length : leftIndex) - (rightIndex === -1 ? order.length : rightIndex)
    })
  }, [data?.latestRates])

  const rateTypeOptions = useMemo(() => {
    return Array.from(new Set(['BOT Rate', 'TT Buying', 'TT Selling', ...(data?.filters.rateTypes ?? [])]))
  }, [data?.filters.rateTypes])

  function openCreate() {
    setForm(emptyForm())
    setFieldErrors({})
    setShowForm(true)
  }

  function openEdit(row: FxRateRow) {
    setForm({
      active: row.active,
      fromCurrency: row.fromCurrency,
      id: row.id,
      note: row.note ?? '',
      rate: String(row.rate),
      rateDate: row.rateDate,
      rateType: row.rateType,
      source: row.source ?? '',
      toCurrency: row.toCurrency,
    })
    setFieldErrors({})
    setShowForm(true)
  }

  function validateForm() {
    const nextErrors: Record<string, string> = {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.rateDate)) nextErrors.rateDate = 'เลือกวันที่'
    if (!/^[A-Z0-9]{3,6}$/.test(form.fromCurrency)) nextErrors.fromCurrency = 'เลือกสกุลต้นทาง'
    if (!/^[A-Z0-9]{3,6}$/.test(form.toCurrency)) nextErrors.toCurrency = 'เลือกสกุลปลายทาง'
    if (form.fromCurrency === form.toCurrency) nextErrors.toCurrency = 'สกุลต้องไม่ซ้ำกัน'
    if (!form.rateType.trim()) nextErrors.rateType = 'กรอกประเภท Rate'
    if (!Number.isFinite(Number(form.rate)) || Number(form.rate) <= 0) nextErrors.rate = 'Rate ต้องมากกว่า 0'
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function saveRate() {
    if (!validateForm()) return
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/finance/foreign/fx-rate', {
        body: JSON.stringify({ ...form, rate: Number(form.rate) }),
        headers: { 'Content-Type': 'application/json' },
        method: form.id ? 'PATCH' : 'POST',
      })
      setShowForm(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึก FX Rate ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <strong>FX Rate Management</strong> - เก็บอัตราแลกเปลี่ยนตามวันที่ ระบบจะใช้ rate ล่าสุด ณ วันที่ทำธุรกรรม
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {latestRates.slice(0, 5).map((rate) => (
          <div key={rate.id} className="rounded-xl bg-white p-3 text-center shadow">
            <div className="text-xs text-slate-500">{rate.fromCurrency} -&gt; {rate.toCurrency}</div>
            <div className="text-2xl font-bold text-blue-600">{formatRate(rate.rate)}</div>
            <div className="mt-1 text-xs text-slate-400">{rate.rateDate}</div>
          </div>
        ))}
        {!isLoading && (data?.latestRates.length ?? 0) === 0 ? <div className="rounded-xl bg-white p-3 text-sm text-slate-500 shadow">ยังไม่มี FX Rate</div> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold text-slate-900">FX Rate History</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input aria-label="จากวันที่" className="rounded-lg border border-slate-200 px-3 py-2" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input aria-label="ถึงวันที่" className="rounded-lg border border-slate-200 px-3 py-2" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <select aria-label="สกุลต้นทาง" className="rounded-lg border border-slate-200 px-3 py-2" value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value)}>
            <option value="all">ทุกสกุล</option>
            {(data?.filters.fromCurrencies ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="สถานะ" className="rounded-lg border border-slate-200 px-3 py-2" value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">ทั้งหมด</option>
          </select>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button" onClick={openCreate}>+ เพิ่ม FX Rate</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">From</th>
              <th className="p-2 text-left">To</th>
              <th className="p-2 text-left">Rate Type</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-left">Source</th>
              <th className="p-2 text-center">Active</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>ยังไม่มี FX Rate</td></tr> : null}
            {!isLoading && data?.rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2">{row.rateDate}</td>
                <td className="p-2 font-medium">{row.fromCurrency}</td>
                <td className="p-2 font-medium">{row.toCurrency}</td>
                <td className="p-2 text-xs">{row.rateType}</td>
                <td className="p-2 text-right font-bold">{formatRate(row.rate)}</td>
                <td className="p-2 text-xs">{row.source || '-'}</td>
                <td className="p-2 text-center text-xs text-slate-500">{row.active ? 'Yes' : 'No'}</td>
                <td className="p-2 text-right"><button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => openEdit(row)}>จัดการ</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 p-4">
          <div className="mx-auto my-10 max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-semibold">{form.id ? 'แก้ไข FX Rate' : 'เพิ่ม FX Rate'}</h3>
              <button className="text-2xl text-slate-400" type="button" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="grid gap-3 p-5 text-sm md:grid-cols-2">
              <Field label="วันที่" error={fieldErrors.rateDate}><input className="w-full rounded border px-2 py-1.5" type="date" value={form.rateDate} onChange={(event) => setForm({ ...form, rateDate: event.target.value })} /></Field>
              <Field label="Rate Type" error={fieldErrors.rateType}><select className="w-full rounded border px-2 py-1.5" value={form.rateType} onChange={(event) => setForm({ ...form, rateType: event.target.value })}>{rateTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
              <Field label="From" error={fieldErrors.fromCurrency}><CurrencySelect options={currencyOptions} value={form.fromCurrency} onChange={(value) => setForm({ ...form, fromCurrency: value })} /></Field>
              <Field label="To" error={fieldErrors.toCurrency}><CurrencySelect options={currencyOptions} value={form.toCurrency} onChange={(value) => setForm({ ...form, toCurrency: value })} /></Field>
              <Field label="Rate" error={fieldErrors.rate}><input className="w-full rounded border px-2 py-1.5 text-right font-bold" inputMode="decimal" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} /></Field>
              <Field label="Source"><input className="w-full rounded border px-2 py-1.5" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></Field>
              <Field label="สถานะ"><select className="w-full rounded border px-2 py-1.5" value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
              <Field label="หมายเหตุ"><input className="w-full rounded border px-2 py-1.5" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
              <button className="px-4 py-2 text-sm" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void saveRate()}>{isSaving ? 'กำลังบันทึก' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function formatRate(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 6, minimumFractionDigits: 2 })
}

function Field({ children, error, label }: { children: ReactNode; error?: string; label: string }) {
  return <label className="block"><span className="mb-1 block text-xs text-slate-600">{label}</span>{children}{error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}</label>
}

function CurrencySelect({ onChange, options, value }: { onChange: (value: string) => void; options: string[]; value: string }) {
  return <select className="w-full rounded border px-2 py-1.5" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
}
