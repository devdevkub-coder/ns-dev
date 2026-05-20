'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney, pettyAdvanceFormSchema, pettyAdvanceReturnFormSchema, todayDateInput, type DailyAccountOption, type PettyAdvanceFormValues } from '@/lib/daily'

type PettyAdvanceRow = PettyAdvanceFormValues & {
  accountName: string
  docNo: string
  id: string
  remaining: number
  returns?: PettyReturnRow[]
  returned: number
  spent: number
}

type PettyReturnRow = {
  accountId: string
  accountName: string
  amount: number
  date: string
  id: string
  notes: string
}

type PettyPayload = {
  accounts: DailyAccountOption[]
  rows: PettyAdvanceRow[]
}

const emptyForm: PettyAdvanceFormValues = {
  accountId: '',
  amount: 0,
  date: todayDateInput(),
  docNo: null,
  id: null,
  notes: null,
  recipientName: '',
  status: 'active',
  type: 'DIRECTOR_LOAN',
}

export function DailyPettyAdvancePageClient() {
  const [accounts, setAccounts] = useState<DailyAccountOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<PettyAdvanceFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [detailRow, setDetailRow] = useState<PettyAdvanceRow | null>(null)
  const [returnForm, setReturnForm] = useState({ accountId: '', amount: '', date: todayDateInput(), notes: '' })
  const [returningRow, setReturningRow] = useState<PettyAdvanceRow | null>(null)
  const [rows, setRows] = useState<PettyAdvanceRow[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [type, setType] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<PettyPayload>('/api/daily/petty-advances')
      setAccounts(payload.accounts)
      setRows(payload.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดเงินสำรองจ่ายไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows
      .filter((row) => !status || row.status === status)
      .filter((row) => !type || row.type === type)
      .filter((row) => !query || `${row.docNo} ${row.recipientName} ${row.notes ?? ''}`.toLowerCase().includes(query))
      .sort((left, right) => right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo))
  }, [rows, search, status, type])

  const summary = {
    active: rows.filter((row) => row.status === 'active').length,
    count: rows.filter((row) => row.status !== 'cancelled').length,
    remaining: rows.filter((row) => row.status === 'active').reduce((sum, row) => sum + row.remaining, 0),
    returned: rows.reduce((sum, row) => sum + row.returned, 0),
    spent: rows.reduce((sum, row) => sum + row.spent, 0),
    total: rows.reduce((sum, row) => sum + row.amount, 0),
  }

  const topRecipients = useMemo(() => {
    const byRecipient = new Map<string, { active: number; count: number; name: string; remaining: number; total: number }>()
    rows.filter((row) => row.status !== 'cancelled').forEach((row) => {
      const current = byRecipient.get(row.recipientName) ?? { active: 0, count: 0, name: row.recipientName, remaining: 0, total: 0 }
      current.count += 1
      current.total += row.amount
      if (row.status === 'active') {
        current.active += 1
        current.remaining += row.remaining
      }
      byRecipient.set(row.recipientName, current)
    })
    return Array.from(byRecipient.values()).sort((left, right) => right.remaining - left.remaining).slice(0, 10)
  }, [rows])

  function openCreateForm() {
    setForm({ ...emptyForm, date: todayDateInput() })
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEditForm(row: PettyAdvanceRow) {
    setForm({
      accountId: row.accountId,
      amount: row.amount,
      date: row.date,
      docNo: row.docNo,
      id: row.id,
      notes: row.notes,
      recipientName: row.recipientName,
      status: row.status,
      type: row.type,
    })
    setFieldErrors({})
    setFormOpen(true)
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = pettyAdvanceFormSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/daily/petty-advances', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกเงินสำรองจ่ายไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function saveReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!returningRow) return
    const parsed = pettyAdvanceReturnFormSchema.safeParse({
      accountId: returnForm.accountId,
      advanceId: returningRow.id,
      amount: Number(returnForm.amount),
      date: returnForm.date,
      notes: returnForm.notes || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลคืนเงินไม่ถูกต้อง')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/daily/petty-advances/returns', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setReturningRow(null)
      setReturnForm({ accountId: '', amount: '', date: todayDateInput(), notes: '' })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกคืนเงินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-xl bg-gradient-to-r from-purple-700 to-pink-600 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">🏦 เงินสำรองจ่าย / กู้กรรมการ</h1>
        <p className="mt-1 text-sm opacity-90">ติดตามเงินที่จ่ายล่วงหน้าให้กรรมการ/พนักงานไปใช้จ่าย — รายละเอียดบิลที่จ่ายแต่ละก้อน + การคืนเงิน</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="📋 รายการทั้งหมด" value={String(summary.count)} />
        <SummaryCard label="⏰ ค้างคืน (active)" tone="amber" value={String(summary.active)} />
        <SummaryCard label="💸 จ่ายไปทั้งหมด" tone="blue" value={formatMoney(summary.total)} />
        <SummaryCard label="✓ ใช้จ่าย/คืนแล้ว" tone="emerald" value={formatMoney(summary.spent + summary.returned)} />
        <SummaryCard label="⚠ ค้างคืน" tone="red" value={formatMoney(summary.remaining)} />
      </div>

      {topRecipients.length ? (
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-2 font-bold text-slate-700">👥 Top 10 ผู้รับเงินที่ค้างคืน</div>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            {topRecipients.map((recipient) => (
              <div key={recipient.name} className="flex justify-between rounded border border-slate-200 bg-slate-50 p-2">
                <div><b>{recipient.name}</b> · <span className="text-xs text-slate-500">{recipient.count} ครั้ง</span></div>
                <div className={recipient.remaining > 0 ? 'font-bold text-red-700' : 'text-emerald-600'}>{formatMoney(recipient.remaining)} ค้าง</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-56 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="🔍 ค้นหา..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="rounded-lg border px-2 py-2 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">ทุกประเภท</option>
            <option value="DIRECTOR_LOAN">👔 กู้กรรมการ</option>
            <option value="PETTY_CASH">💵 เงินสำรองจ่าย</option>
          </select>
          <select className="rounded-lg border px-2 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option value="active">⏰ ค้างคืน</option>
            <option value="closed">✓ ปิดแล้ว</option>
            <option value="cancelled">⊘ ยกเลิก</option>
          </select>
          <button className="ml-auto rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700" type="button" onClick={openCreateForm}>+ จ่ายล่วงหน้าใหม่</button>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form noValidate className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl" onSubmit={saveForm}>
            <div className="flex items-center justify-between border-b bg-purple-50 px-5 py-4">
              <h3 className="font-bold">{form.id ? '✏️ แก้ไข' : '+ จ่ายเงินสำรอง/กู้'}</h3>
              <button className="text-2xl text-slate-400" type="button" onClick={() => setFormOpen(false)}>&times;</button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <TextField label="เลขที่" readOnly value={form.docNo ?? 'ระบบจะออกเลขให้'} />
              <TextField error={fieldErrors.date} label="วันที่" required type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
              <label className="block text-sm font-medium">
                ประเภท <span className="text-red-600">*</span>
                <select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as 'DIRECTOR_LOAN' | 'PETTY_CASH' })}>
                  <option value="DIRECTOR_LOAN">👔 กู้กรรมการ</option>
                  <option value="PETTY_CASH">💵 เงินสำรองจ่าย</option>
                </select>
              </label>
              <TextField error={fieldErrors.recipientName} label="ผู้รับเงิน" required value={form.recipientName} onChange={(value) => setForm({ ...form, recipientName: value })} />
              <TextField error={fieldErrors.amount} label="จำนวนเงิน" required type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: Number(value) })} />
              <SelectField error={fieldErrors.accountId} label="บัญชีจ่ายออก" value={form.accountId} onChange={(value) => setForm({ ...form, accountId: value })} options={accounts.filter((account) => account.active)} />
              <div className="md:col-span-2">
                <TextField error={fieldErrors.notes} label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
              <button className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? 'กำลังบันทึก...' : '💾 บันทึก + จ่ายเงิน'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {returningRow ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl" onSubmit={saveReturn}>
            <div className="border-b bg-emerald-50 px-5 py-4 font-bold text-emerald-800">💵 คืนเงิน — {returningRow.docNo} / {returningRow.recipientName}</div>
            <div className="space-y-3 p-5 text-sm">
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">ยอดจ่ายล่วงหน้า: <b>{formatMoney(returningRow.amount)}</b> · ใช้ไปแล้ว: <b>{formatMoney(returningRow.spent)}</b> · คืนแล้ว: <b>{formatMoney(returningRow.returned)}</b> · <span className="font-bold text-red-700">คงค้าง: {formatMoney(returningRow.remaining)}</span></div>
              <TextField label="วันที่คืน" required type="date" value={returnForm.date} onChange={(value) => setReturnForm({ ...returnForm, date: value })} />
              <TextField label="จำนวนเงินคืน" required type="number" value={returnForm.amount} onChange={(value) => setReturnForm({ ...returnForm, amount: value })} />
              <SelectField error={undefined} label="บัญชีรับคืน" value={returnForm.accountId} onChange={(value) => setReturnForm({ ...returnForm, accountId: value })} options={accounts.filter((account) => account.active)} />
              <TextField label="หมายเหตุ" value={returnForm.notes} onChange={(value) => setReturnForm({ ...returnForm, notes: value })} />
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={() => setReturningRow(null)}>ยกเลิก</button>
              <button className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} type="submit">บันทึกคืนเงิน</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{filteredRows.length}</span> รายการ</div>
      </div>

      {detailRow ? <DetailModal row={detailRow} onClose={() => setDetailRow(null)} /> : null}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">ประเภท</th>
              <th className="p-2 text-left">ผู้รับเงิน</th>
              <th className="p-2 text-right">ยอดจ่าย</th>
              <th className="p-2 text-right">ใช้ไปแล้ว</th>
              <th className="p-2 text-right">คืนแล้ว</th>
              <th className="p-2 text-right">คงค้าง</th>
              <th className="p-2 text-center">สถานะ</th>
              <th className="p-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && filteredRows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-purple-50">
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs ${row.type === 'DIRECTOR_LOAN' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{row.type === 'DIRECTOR_LOAN' ? '👔 กู้กรรมการ' : '💵 เงินสำรองจ่าย'}</span></td>
                <td className="p-2 font-medium">{row.recipientName}</td>
                <td className="p-2 text-right">{formatMoney(row.amount)}</td>
                <td className="p-2 text-right text-blue-700">{row.spent > 0 ? <button className="hover:underline" type="button" onClick={() => setDetailRow(row)}>{formatMoney(row.spent)}</button> : '-'}</td>
                <td className="p-2 text-right text-emerald-700">{formatMoney(row.returned)}</td>
                <td className={`p-2 text-right font-bold ${row.remaining > 1 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(row.remaining)}</td>
                <td className="p-2 text-center"><StatusBadge status={row.status} /></td>
                <td className="space-x-1 whitespace-nowrap p-2 text-right">
                  <button className="text-xs text-blue-600 hover:underline" title="ดูรายละเอียด" type="button" onClick={() => setDetailRow(row)}>🔍</button>
                  {row.status === 'active' && row.remaining > 0 ? <button className="rounded bg-emerald-600 px-2 py-1 text-xs text-white" type="button" onClick={() => { setReturningRow(row); setReturnForm({ accountId: row.accountId, amount: String(Math.max(0, row.remaining)), date: todayDateInput(), notes: '' }) }}>💵 คืนเงิน</button> : null}
                  {row.status === 'active' ? <button className="text-xs text-blue-600 hover:underline" type="button" onClick={() => openEditForm(row)}>แก้</button> : null}
                  <button className="text-xs text-red-300" disabled type="button">🗑</button>
                </td>
              </tr>
            ))}
            {!isLoading && filteredRows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: PettyAdvanceRow }) {
  const returns = row.returns ?? []
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="mx-auto my-4 max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b bg-purple-50 px-5 py-3">
          <div>
            <h3 className="text-lg font-bold">📋 รายละเอียด {row.docNo} — {row.recipientName}</h3>
            <div className="mt-0.5 text-xs text-slate-600">{row.type === 'DIRECTOR_LOAN' ? '👔 กู้กรรมการ' : '💵 เงินสำรองจ่าย'} · {row.date} · จำนวน {formatMoney(row.amount)} บาท</div>
          </div>
          <button className="text-2xl text-slate-400" type="button" onClick={onClose}>&times;</button>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="rounded bg-blue-50 p-2 text-center"><div className="text-xs text-blue-700">จ่ายล่วงหน้า</div><div className="font-bold">{formatMoney(row.amount)}</div></div>
            <div className="rounded bg-amber-50 p-2 text-center"><div className="text-xs text-amber-700">ใช้ไปแล้ว</div><div className="font-bold">{formatMoney(row.spent)}</div></div>
            <div className="rounded bg-emerald-50 p-2 text-center"><div className="text-xs text-emerald-700">คืนแล้ว</div><div className="font-bold">{formatMoney(row.returned)}</div></div>
            <div className="rounded bg-red-50 p-2 text-center"><div className="text-xs text-red-700">คงค้าง</div><div className="font-bold">{formatMoney(row.remaining)}</div></div>
          </div>

          <div>
            <div className="mb-2 font-bold text-purple-700">📝 บิลค่าใช้จ่ายที่จ่ายจากเงินก้อนนี้</div>
            <div className="rounded border border-slate-200 py-4 text-center text-slate-400">ยังไม่มีบิลที่ link อยู่ใน payload ปัจจุบัน</div>
          </div>

          <div>
            <div className="mb-2 font-bold text-emerald-700">💵 ประวัติการคืนเงิน ({returns.length} ครั้ง)</div>
            {returns.length ? (
              <table className="w-full border text-xs">
                <thead className="bg-slate-100"><tr><th className="p-2 text-left">วันที่</th><th className="p-2 text-right">จำนวน</th><th className="p-2 text-left">บัญชีรับ</th><th className="p-2 text-left">หมายเหตุ</th></tr></thead>
                <tbody>
                  {returns.map((entry) => (
                    <tr key={entry.id} className="border-t">
                      <td className="p-2">{entry.date}</td>
                      <td className="p-2 text-right font-bold text-emerald-700">{formatMoney(entry.amount)}</td>
                      <td className="p-2">{entry.accountName}</td>
                      <td className="p-2">{entry.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="rounded border border-slate-200 py-4 text-center text-slate-400">ยังไม่มีประวัติคืนเงิน</div>}
          </div>
        </div>
        <div className="flex justify-end border-t bg-slate-50 px-5 py-3">
          <button className="rounded bg-slate-300 px-4 py-2 text-sm" type="button" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">⏰ ค้างคืน</span>
  if (status === 'closed') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">✓ ปิดแล้ว</span>
  return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">⊘ ยกเลิก</span>
}

function SummaryCard({ label, tone, value }: { label: string; tone?: 'amber' | 'blue' | 'emerald' | 'red'; value: string }) {
  const className = tone === 'amber'
    ? 'bg-amber-50 text-amber-800'
    : tone === 'blue'
      ? 'bg-blue-50 text-blue-800'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-800'
        : tone === 'red'
          ? 'bg-red-50 text-red-800'
          : 'bg-white text-slate-900'
  return <div className={`rounded-xl p-3 shadow ${className}`}><div className="text-xs opacity-80">{label}</div><div className="text-xl font-bold">{value}</div></div>
}

function TextField(props: { error?: string; label: string; onChange?: (value: string) => void; readOnly?: boolean; required?: boolean; type?: string; value: string }) {
  return (
    <label className="block text-sm font-medium">
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      <input className={`mt-1.5 w-full rounded-lg border px-3 py-2 outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'} ${props.readOnly ? 'bg-slate-50' : ''}`} readOnly={props.readOnly} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange?.(event.target.value)} />
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function SelectField(props: { error?: string; label: string; onChange: (value: string) => void; options: DailyAccountOption[]; value: string }) {
  return (
    <label className="block text-sm font-medium">
      {props.label} <span className="text-red-600">*</span>
      <select className={`mt-1.5 w-full rounded-lg border px-3 py-2 outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">ไม่ระบุ</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}
