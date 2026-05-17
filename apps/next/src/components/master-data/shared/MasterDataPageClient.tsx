'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  emptyMasterDataForm,
  listMasterDataRecords,
  masterDataFormSchema,
  saveMasterDataRecord,
  setMasterDataRecordActive,
  type MasterDataField,
  type MasterDataFormValues,
  type MasterDataPageConfig,
  type MasterDataRecord,
} from '@/lib/master-data'

type SortKey = keyof MasterDataRecord

type MasterDataPageClientProps = {
  config: MasterDataPageConfig
}

function recordToForm(record: MasterDataRecord): MasterDataFormValues {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    active: record.active,
    type: record.type,
    phone: record.phone,
    email: record.email,
    note: record.note,
    symbol: record.symbol,
    rateToThb: record.rateToThb,
    parentId: record.parentId,
    channelType: record.channelType,
    bankName: record.bankName,
    accountNo: record.accountNo,
    currency: record.currency,
    openingBalance: record.openingBalance,
    odLimit: record.odLimit,
    branchId: record.branchId,
    address: record.address,
    commissionPct: record.commissionPct,
    baseSalary: record.baseSalary,
    accountCurrency: record.accountCurrency,
    bankAccount: record.bankAccount,
    capacityKgPerHr: record.capacityKgPerHr,
    contact: record.contact,
    country: record.country,
    creditLimit: record.creditLimit,
    creditTerm: record.creditTerm,
    grade: record.grade,
    itemStatus: record.itemStatus,
    maintenanceStatus: record.maintenanceStatus,
    metalGroup: record.metalGroup,
    normalYieldPct: record.normalYieldPct,
    requiredDoc: record.requiredDoc,
    responsiblePerson: record.responsiblePerson,
    stdCost: record.stdCost,
    stdPrice: record.stdPrice,
    stdProcessCostPerHr: record.stdProcessCostPerHr,
    swift: record.swift,
    taxId: record.taxId,
    unit: record.unit,
  }
}

function displayValue(value: string | number | boolean | null) {
  if (value === null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'ใช้งาน' : 'ปิด'
  return value
}

function formatNumber(value: number | null, fractionDigits = 2) {
  if (value === null) return '-'
  return value.toLocaleString('th-TH', { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits })
}

function compareRecords(left: MasterDataRecord, right: MasterDataRecord, key: SortKey, direction: 'asc' | 'desc') {
  const multiplier = direction === 'asc' ? 1 : -1
  const leftValue = left[key]
  const rightValue = right[key]

  if (typeof leftValue === 'number' || typeof rightValue === 'number') {
    return (((leftValue as number | null) ?? -Infinity) - ((rightValue as number | null) ?? -Infinity)) * multiplier
  }

  if (typeof leftValue === 'boolean' || typeof rightValue === 'boolean') {
    return (Number(leftValue ?? false) - Number(rightValue ?? false)) * multiplier
  }

  return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th', { numeric: true }) * multiplier
}

export function MasterDataPageClient({ config }: MasterDataPageClientProps) {
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [records, setRecords] = useState<MasterDataRecord[]>([])
  const [search, setSearch] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<MasterDataRecord | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>(config.columns[0]?.key ?? 'code')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const rows = await listMasterDataRecords(config.apiPath)
      setRecords(rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `โหลดข้อมูล${config.entityName}ไม่ได้`)
    } finally {
      setIsLoading(false)
    }
  }, [config.apiPath, config.entityName])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = !query
      ? records
      : records.filter((record) =>
          Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(query)),
        )

    return [...rows].sort((left, right) => compareRecords(left, right, sortKey, sortDirection))
  }, [records, search, sortDirection, sortKey])

  function openCreateForm() {
    setSelectedRecord(null)
    setFormOpen(true)
  }

  function openEditForm(record: MasterDataRecord) {
    setSelectedRecord(record)
    setFormOpen(true)
  }

  async function handleSubmit(values: MasterDataFormValues) {
    setIsSaving(true)
    setError(null)
    try {
      await saveMasterDataRecord(config.apiPath, values)
      setFormOpen(false)
      setSelectedRecord(null)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `บันทึกข้อมูล${config.entityName}ไม่ได้`)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(record: MasterDataRecord) {
    setError(null)
    try {
      await setMasterDataRecordActive(config.apiPath, record.id, !record.active)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `อัปเดตสถานะ${config.entityName}ไม่ได้`)
    }
  }

  function setSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function sortLabel(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-lg bg-white p-4 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <input className="w-full rounded-lg border px-3 py-2 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหา..." type="search" value={search} />
            {config.description ? <div className="mt-2 text-xs text-slate-500">{config.description}</div> : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white" type="button">
              📊 Export Excel
            </button>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="button" onClick={openCreateForm}>
              + {config.createLabel}
            </button>
          </div>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <div className="w-full max-w-4xl">
            <MasterDataForm
              config={config}
              isSaving={isSaving}
              record={selectedRecord}
              onCancel={() => {
                setFormOpen(false)
                setSelectedRecord(null)
              }}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}

      {!isLoading ? (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="w-10 p-2 text-left">
                  <input className="h-4 w-4 rounded border-slate-300" type="checkbox" />
                </th>
                {config.columns.map((column) => (
                  <th key={column.key} className={`min-w-32 p-2 text-${column.align ?? 'left'}`}>
                    <button className="font-semibold" type="button" onClick={() => setSort(column.key)}>
                      {column.label}{sortLabel(column.key)}
                    </button>
                  </th>
                ))}
                <th className="p-2 text-center">แก้ไข</th>
                <th className="p-2 text-center">ลบ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id} className="border-t">
                  <td className="p-2"><input className="h-4 w-4 rounded border-slate-300" type="checkbox" /></td>
                  {config.columns.map((column) => (
                    <td key={column.key} className={`p-2 text-${column.align ?? 'left'} ${column.key === 'code' ? 'font-mono text-xs' : ''}`}>
                      {column.format === 'money' ? formatNumber(record[column.key] as number | null) : null}
                      {column.format === 'number' ? formatNumber(record[column.key] as number | null, 4) : null}
                      {column.format === 'status' ? <span className={record.active ? 'text-emerald-700' : 'text-slate-500'}>✓ {displayValue(record[column.key])}</span> : null}
                      {!column.format ? displayValue(record[column.key] as string | number | boolean | null) : null}
                    </td>
                  ))}
                  <td className="p-2 text-center"><button className="text-blue-600" type="button" onClick={() => openEditForm(record)}>แก้ไข</button></td>
                  <td className="p-2 text-center"><button className="text-red-600" type="button" onClick={() => handleToggleActive(record)}>ลบ</button></td>
                </tr>
              ))}
              {filteredRecords.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-sm text-slate-500" colSpan={config.columns.length + 3}>{config.emptyMessage}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

type MasterDataFormProps = {
  config: MasterDataPageConfig
  isSaving: boolean
  record: MasterDataRecord | null
  onCancel: () => void
  onSubmit: (values: MasterDataFormValues) => Promise<void>
}

function MasterDataForm({ config, isSaving, record, onCancel, onSubmit }: MasterDataFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<MasterDataFormValues>(() => (record ? recordToForm(record) : emptyMasterDataForm))

  useEffect(() => {
    setForm(record ? recordToForm(record) : emptyMasterDataForm)
    setErrors({})
  }, [record])

  function update<K extends keyof MasterDataFormValues>(key: K, value: MasterDataFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = masterDataFormSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }

    setErrors({})
    await onSubmit(parsed.data)
  }

  return (
    <form className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-bold text-slate-900">{form.id ? `แก้ไข${config.entityName}` : config.createLabel}</h3>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input checked={form.active} className="size-4 rounded border-slate-300" type="checkbox" onChange={(event) => update('active', event.target.checked)} />
          ใช้งาน
        </label>
      </div>

      <div className="grid max-h-[76vh] gap-4 overflow-y-auto px-5 py-5 md:grid-cols-3">
        {config.fields.map((field) => (
          <FormField
            key={field.key}
            error={errors[field.key]}
            field={field}
            value={form[field.key]}
            onChange={(value) => {
              const normalized = field.type === 'number' ? (value === '' ? null : Number(value)) : value || null
              update(field.key, normalized as never)
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
        <button className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={onCancel}>
          ยกเลิก
        </button>
        <button className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60" disabled={isSaving} type="submit">
          {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}

type FormFieldProps = {
  error?: string
  field: MasterDataField
  value: string | number | boolean | null | undefined
  onChange: (value: string) => void
}

function FormField({ error, field, value, onChange }: FormFieldProps) {
  if (field.type === 'select') {
    return (
      <label className="block text-sm font-medium">
        {field.label}
        <select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" required={field.required} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          <option value="">ไม่ระบุ</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
      </label>
    )
  }

  return (
    <label className="block text-sm font-medium">
      {field.label}
      <input
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700"
        required={field.required}
        type={field.type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
