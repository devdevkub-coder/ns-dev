'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Select } from '@/components/ui/Select'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AccountCurrency = { code: string; currency: string; id: string; label: string }
type Branch = { code: string; name: string }
type Row = { branchCode: string | null; carryingThbBefore: number; closingFxRate: number; currencyCode: string; docNo: string; id: string; nativeBalance: number; periodEnd: string; revaluedThbAmount: number; reversalOfId: string | null; status: string; unrealizedFxDifference: number }
type Payload = { filters: { accountCurrencies: AccountCurrency[]; branches: Branch[]; functionalCurrencyCode: string; rateTypes: string[] }; rows: Row[]; suggestedRate: { rate: string | null; rateId: string | null; source: string | null; status: 'suggested' | 'manual_required' } | null }
type LedgerPayload = { summary: { foreignBalance: number; thbBalance: number } }

const today = () => new Date().toISOString().slice(0, 10)

export function FcdRevaluationPageClient() {
  const searchParams = useSearchParams()
  const documentNumber = searchParams.get('docNo')?.trim() ?? ''
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ account: '', branchCode: '', closingFxRate: '', periodEnd: today(), rateOverrideReason: '', rateType: '' })
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)
  const account = useMemo(() => data?.filters.accountCurrencies.find((item) => item.id === form.account) ?? null, [data?.filters.accountCurrencies, form.account])
  const preview = account && form.closingFxRate && ledger ? Number((ledger.summary.foreignBalance * Number(form.closingFxRate)).toFixed(2)) : null
  const difference = preview != null && ledger ? Number((preview - ledger.summary.thbBalance).toFixed(2)) : null
  const load = useCallback(async () => {
    try {
      const query = documentNumber ? `?${new URLSearchParams({ docNo: documentNumber })}` : ''
      setData(await dailyFetchJson<Payload>(`/api/finance/foreign/fcd-revaluations${query}`))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'โหลดรายการตีมูลค่า FCD ไม่ได้') }
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
  return <section className="space-y-4">
    {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
    <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <Field label="วันสิ้นงวด"><DatePickerInput className="h-9 w-full" value={form.periodEnd} onChange={(periodEnd) => setForm({ ...form, periodEnd })} /></Field>
      <Field label="สาขา"><Select value={form.branchCode} onChange={(event) => setForm({ ...form, branchCode: event.target.value })}><option value="">เลือกสาขา</option>{(data?.filters.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.code} - {branch.name}</option>)}</Select></Field>
      <Field label="บัญชี FCD และสกุลเงิน"><Select value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })}><option value="">เลือกบัญชี FCD</option>{(data?.filters.accountCurrencies ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
      <Field label="ประเภท rate"><Select value={form.rateType} onChange={(event) => setForm({ ...form, rateType: event.target.value })}><option value="">เลือกประเภท rate</option>{(data?.filters.rateTypes ?? []).map((rateType) => <option key={rateType} value={rateType}>{rateType}</option>)}</Select></Field>
      <Field label={`Closing rate (${account?.currency ?? '-'} / ${data?.filters.functionalCurrencyCode ?? '-'})`}><input className="h-9 w-full rounded-md border border-slate-300 px-2 text-right tabular-nums" inputMode="decimal" value={form.closingFxRate} onChange={(event) => setForm({ ...form, closingFxRate: event.target.value })} /></Field>
      <Field label="เหตุผลเมื่อกรอก/แก้ rate เอง"><input className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" value={form.rateOverrideReason} onChange={(event) => setForm({ ...form, rateOverrideReason: event.target.value })} /></Field>
      <div className="flex items-end"><button className="h-9 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="button" onClick={() => void submit()}>Post การตีมูลค่า</button></div>
    </div>
    {account && form.rateType ? <p className="px-1 text-sm text-slate-600">{data?.suggestedRate?.status === 'suggested' ? `พบ rate ${data.suggestedRate.rate} จาก ${data.suggestedRate.source ?? 'rate source'} สามารถแก้ไขได้ก่อนบันทึก` : 'ไม่พบ rate ตรงวันและประเภทที่เลือก กรุณากรอก rate พร้อมเหตุผล'}</p> : null}
    {account ? <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm md:grid-cols-4"><Fact label={`ยอด native (${account.currency})`} value={formatMoney(ledger?.summary.foreignBalance ?? 0)} /><Fact label="Carrying THB" value={formatMoney(ledger?.summary.thbBalance ?? 0)} /><Fact label="มูลค่าตาม closing rate" value={preview == null ? '-' : formatMoney(preview)} /><Fact label="Unrealized FX" value={difference == null ? '-' : formatMoney(difference)} /></div> : null}
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"><table className="ns-table w-full text-sm"><thead><tr className="bg-slate-100"><th>เอกสาร</th><th>งวด</th><th>สกุลเงิน</th><th>Native</th><th>Carrying ก่อน</th><th>Closing rate</th><th>ส่วนต่าง</th><th>สถานะ</th><th /></tr></thead><tbody>{(data?.rows ?? []).map((row) => <tr key={row.id}><td>{row.docNo}</td><td>{row.periodEnd}</td><td>{row.currencyCode}</td><td className="text-right tabular-nums">{formatMoney(row.nativeBalance)}</td><td className="text-right tabular-nums">{formatMoney(row.carryingThbBefore)}</td><td className="text-right tabular-nums">{row.closingFxRate.toFixed(3)}</td><td className="text-right tabular-nums">{formatMoney(row.unrealizedFxDifference)}</td><td>{row.status}</td><td>{row.status === 'posted' && !row.reversalOfId ? <button className="text-red-700 underline disabled:opacity-50" disabled={saving} type="button" onClick={() => void reverse(row.docNo)}>ยกเลิก</button> : null}</td></tr>)}</tbody></table></div>
  </section>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label> }
function Fact({ label, value }: { label: string; value: string }) { return <div><div className="text-slate-500">{label}</div><div className="font-semibold tabular-nums text-slate-900">{value}</div></div> }
