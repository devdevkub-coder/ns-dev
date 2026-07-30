'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Select } from '@/components/ui/Select'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AccountCurrency = { code: string; currency: string; id: string; label: string }
type Account = { code: string; id: string; label: string }
type Branch = { code: string; name: string }
type ConversionRow = { actualThbReceived: number; bankFeeThb: number; branchCode: string | null; conversionDate: string; destinationAccountCode: string; docNo: string; id: string; line: { carryingThbOut: number; nativeAmount: number; realizedFxDifference: number } | null; reversalOfId: string | null; sourceAccountCode: string; sourceCurrencyCode: string; status: string }
type Payload = { filters: { branches: Branch[]; destinationAccounts: Account[]; functionalCurrencyCode: string; sourceAccounts: AccountCurrency[] }; rows: ConversionRow[] }
type LedgerPayload = { summary: { foreignBalance: number; thbBalance: number; valuation: { weightedCarryingRate: number | null } } }

const today = () => new Date().toISOString().slice(0, 10)

export function FcdConversionPageClient() {
  const searchParams = useSearchParams()
  const documentNumber = searchParams.get('docNo')?.trim() ?? ''
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ actualThbReceived: '', bankFeeThb: '0', bankReference: '', branchCode: '', conversionDate: today(), destinationAccountCode: '', nativeAmount: '', source: '' })
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)

  const load = useCallback(async () => {
    try {
      const query = documentNumber ? `?${new URLSearchParams({ docNo: documentNumber })}` : ''
      setData(await dailyFetchJson<Payload>(`/api/finance/foreign/fcd-conversions${query}`))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'โหลดรายการแลกเงิน FCD ไม่ได้') }
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

  return <section className="space-y-4">
    {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
    <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <Field label="วันที่แลกเงินจริง"><DatePickerInput className="h-9 w-full" value={form.conversionDate} onChange={(value) => setForm({ ...form, conversionDate: value })} /></Field>
      <Field label="สาขา"><Select value={form.branchCode} onChange={(event) => setForm({ ...form, branchCode: event.target.value })}><option value="">เลือกสาขา</option>{(data?.filters.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.code} - {branch.name}</option>)}</Select></Field>
      <Field label="บัญชี FCD และสกุลเงิน"><Select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}><option value="">เลือกบัญชี FCD</option>{(data?.filters.sourceAccounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</Select></Field>
      <Field label={`ยอดที่แลก (${source?.currency ?? '-'})`}><MoneyInput value={form.nativeAmount} onChange={(nativeAmount) => setForm({ ...form, nativeAmount })} /></Field>
      <Field label={`บัญชีรับ ${data?.filters.functionalCurrencyCode ?? '-'}`}><Select value={form.destinationAccountCode} onChange={(event) => setForm({ ...form, destinationAccountCode: event.target.value })}><option value="">เลือกบัญชีปลายทาง</option>{(data?.filters.destinationAccounts ?? []).map((account) => <option key={account.id} value={account.code}>{account.label}</option>)}</Select></Field>
      <Field label={`ยอด ${data?.filters.functionalCurrencyCode ?? '-'} เข้าบัญชีจริง (หลังหัก fee)`}><MoneyInput value={form.actualThbReceived} onChange={(actualThbReceived) => setForm({ ...form, actualThbReceived })} /></Field>
      <Field label="ค่าธรรมเนียมธนาคาร"><MoneyInput value={form.bankFeeThb} onChange={(bankFeeThb) => setForm({ ...form, bankFeeThb })} /></Field>
      <Field label="เลขอ้างอิงธนาคาร"><input className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" value={form.bankReference} onChange={(event) => setForm({ ...form, bankReference: event.target.value })} /></Field>
      <div className="flex items-end"><button className="h-9 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="button" onClick={() => void submit()}>บันทึกการแลกเงิน</button></div>
    </div>
    {source ? <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm md:grid-cols-5"><Fact label={`คงเหลือ ${source.currency}`} value={formatMoney(ledger?.summary.foreignBalance ?? 0)} /><Fact label="Carrying THB" value={formatMoney(ledger?.summary.thbBalance ?? 0)} /><Fact label="Carrying rate" value={ledger?.summary.valuation.weightedCarryingRate?.toFixed(3) ?? '-'} /><Fact label="Effective conversion rate" value={effectiveConversionRate?.toFixed(3) ?? '-'} /><Fact label="กำไร/(ขาดทุน) ที่คาด" value={realizedDifference == null ? '-' : formatMoney(realizedDifference)} /></div> : null}
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"><table className="ns-table w-full text-sm"><thead><tr className="bg-slate-100"><th>เอกสาร</th><th>วันที่</th><th>FCD</th><th>ยอด native</th><th>Carrying THB</th><th>รับจริง THB</th><th>FX ต่าง</th><th>สถานะ</th><th /></tr></thead><tbody>{(data?.rows ?? []).map((row) => <tr key={row.id}><td>{row.docNo}</td><td>{row.conversionDate}</td><td>{row.sourceAccountCode} ({row.sourceCurrencyCode})</td><td className="text-right tabular-nums">{row.line ? formatMoney(row.line.nativeAmount) : '-'}</td><td className="text-right tabular-nums">{row.line ? formatMoney(row.line.carryingThbOut) : '-'}</td><td className="text-right tabular-nums">{formatMoney(row.actualThbReceived)}</td><td className="text-right tabular-nums">{row.line ? formatMoney(row.line.realizedFxDifference) : '-'}</td><td>{row.status}</td><td>{row.status === 'active' && !row.reversalOfId ? <button className="text-red-700 underline disabled:opacity-50" disabled={saving} type="button" onClick={() => void reverse(row.docNo)}>ยกเลิก</button> : null}</td></tr>)}</tbody></table></div>
  </section>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="space-y-1 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label> }
function Fact({ label, value }: { label: string; value: string }) { return <div><div className="text-slate-500">{label}</div><div className="font-semibold tabular-nums text-slate-900">{value}</div></div> }
function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <input className="h-9 w-full rounded-md border border-slate-300 px-2 text-right tabular-nums" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /> }
