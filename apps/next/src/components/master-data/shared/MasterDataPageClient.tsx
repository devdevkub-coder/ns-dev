'use client'

import { useCallback, useEffect, useMemo, useState, type FocusEvent } from 'react'
import { paymentMethodGroupFromValue, resolvePaymentMethodValueForAccount } from '@/lib/account-payment-method'
import {
  accountMasterDataFormSchema,
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
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { FormSelectField } from '@/components/ui/FormSelectField'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { formatDecimalDisplay, formatDecimalDraft, formatPhoneDisplay, sanitizeAccountNoInput, sanitizeDecimalInput } from '@/lib/format'

type SortKey = keyof MasterDataRecord

type MasterDataPageClientProps = {
  config: MasterDataPageConfig
}

const pageSizeOptions = [10, 25, 50, 100]

function paymentMethodGroupForFormValue(
  value: string | null | undefined,
  paymentMethods: MasterDataRecord[],
) {
  return paymentMethodGroupFromValue(value, paymentMethods)
}

function recordToForm(record: MasterDataRecord, paymentMethods: MasterDataRecord[]): MasterDataFormValues {
  const paymentMethodGroup = paymentMethodGroupForFormValue(record.type, paymentMethods)
  const normalizedSubtype = paymentMethodGroup === 'cash'
    ? 'cash'
    : (record.subtype ?? 'savings')

  return {
    id: record.id,
    code: record.code,
    name: record.name,
    active: record.active,
    type: resolvePaymentMethodValueForAccount(record, paymentMethods),
    subtype: normalizedSubtype,
    phone: formatPhoneDisplay(record.phone),
    email: record.email,
    note: record.note,
    symbol: record.symbol,
    ratePercent: record.ratePercent,
    rateToThb: record.rateToThb,
    sortOrder: record.sortOrder,
    parentId: record.parentId,
    channelType: record.channelType,
    stockEffect: record.stockEffect,
    availableForSale: record.availableForSale,
    bankName: record.bankName,
    bankBranch: record.bankBranch,
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

function displayRecordValue(record: MasterDataRecord, key: keyof MasterDataRecord) {
  if (key === 'phone') return displayValue(formatPhoneDisplay(record.phone))
  return displayValue(record[key] as string | number | boolean | null)
}

function formatNumber(value: number | null, fractionDigits = 2) {
  if (value === null) return '-'
  return value.toLocaleString('th-TH', { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits })
}

function parseNumericFieldValue(value: string) {
  if (value.trim() === '' || value.trim() === '.') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

function validateMasterDataForm(
  config: MasterDataPageConfig,
  values: MasterDataFormValues,
  paymentMethodRows: MasterDataRecord[],
) {
  const schema = config.apiPath === '/api/master-data/accounts' ? accountMasterDataFormSchema : masterDataFormSchema
  const parsed = schema.safeParse(values)
  const errors: Record<string, string> = {}
  const hiddenFieldKeys = new Set<string>()

  if (config.apiPath === '/api/master-data/accounts') {
    delete errors.name
    const accountName = typeof values.name === 'string' ? values.name.trim() : ''
    if (!accountName) {
      errors.name = 'กรอกชื่อบัญชี'
    } else if (accountName.length > 180) {
      errors.name = 'ชื่อบัญชียาวเกินไป'
    }

    const accountTypeGroup = paymentMethodGroupForFormValue(values.type, paymentMethodRows) ?? 'bank'

    if (!values.type) {
      hiddenFieldKeys.add('subtype')
      hiddenFieldKeys.add('bankName')
      hiddenFieldKeys.add('bankBranch')
      hiddenFieldKeys.add('accountNo')
      hiddenFieldKeys.add('odLimit')
    } else if (accountTypeGroup === 'cash') {
      hiddenFieldKeys.add('subtype')
      hiddenFieldKeys.add('bankName')
      hiddenFieldKeys.add('bankBranch')
      hiddenFieldKeys.add('accountNo')
      hiddenFieldKeys.add('odLimit')
    } else if (accountTypeGroup === 'bank' && values.subtype !== 'od') {
      hiddenFieldKeys.add('odLimit')
    }
  }

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (hiddenFieldKeys.has(key)) continue
      if (key && !errors[key]) errors[key] = issue.message
    }
  }

  for (const field of config.fields) {
    const key = String(field.key)
    if (hiddenFieldKeys.has(key)) continue
    const value = values[field.key]
    const textValue = typeof value === 'string' ? value.trim() : value

    if (field.required && (textValue === null || textValue === undefined || textValue === '')) {
      errors[key] = `กรอก${field.label}`
      continue
    }

    if (field.type === 'select' && textValue) {
      const allowedValues = new Set(field.options?.map((option) => option.value) ?? [])
      if (allowedValues.size > 0 && !allowedValues.has(String(textValue))) {
        errors[key] = `${field.label}ไม่อยู่ในตัวเลือกที่กำหนด`
      }
    }
  }

  if (config.apiPath === '/api/master-data/accounts') {
    const accountTypeGroup = paymentMethodGroupForFormValue(values.type, paymentMethodRows) ?? 'bank'
    const accountSubtype = accountTypeGroup === 'cash' ? 'cash' : values.subtype
    const currency = String(values.currency ?? '').trim().toUpperCase()
    const odLimit = values.odLimit

    if (!values.currency) {
      errors.currency = 'กรอกสกุลเงิน'
    }

    if (accountTypeGroup === 'bank' && !accountSubtype) {
      errors.subtype = 'เลือกประเภทบัญชี'
    }

    if (accountSubtype === 'cash') {
      // no extra bank-account requirement
    } else {
      if (!values.bankName) errors.bankName = 'เลือกธนาคาร'
      if (!values.accountNo) errors.accountNo = 'กรอกเลขที่บัญชี'
    }

    if (accountSubtype === 'fcd' && currency === 'THB') {
      errors.currency = 'บัญชี FCD ต้องใช้สกุลเงินที่ไม่ใช่ THB'
    }

    if ((accountSubtype === 'savings' || accountSubtype === 'current' || accountSubtype === 'od') && currency && currency !== 'THB') {
      errors.currency = 'บัญชีประเภทนี้ต้องใช้สกุลเงิน THB'
    }

    if (accountSubtype === 'od') {
      if (odLimit === null || odLimit === undefined || odLimit <= 0) {
        errors.odLimit = 'กรอกวงเงิน OD มากกว่า 0'
      }
    }
  }

  return { errors, values: parsed.success ? parsed.data : null }
}

export function MasterDataPageClient({ config }: MasterDataPageClientProps) {
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [records, setRecords] = useState<MasterDataRecord[]>([])
  const [fieldOptions, setFieldOptions] = useState<Partial<Record<keyof MasterDataFormValues, Array<{ label: string; value: string }>>>>({})
  const [fieldOptionRows, setFieldOptionRows] = useState<Partial<Record<keyof MasterDataFormValues, MasterDataRecord[]>>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<MasterDataRecord | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>(config.columns[0]?.key ?? 'code')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const optionFields = config.fields.filter((field) => field.optionsApiPath)
      const [rows, optionResults] = await Promise.all([
        listMasterDataRecords(config.apiPath),
        Promise.all(optionFields.map(async (field) => ({
          key: field.key,
          rows: await listMasterDataRecords(field.optionsApiPath as string),
          valueKey: field.optionValueKey ?? 'name',
        }))),
      ])
      setRecords(rows)
      setFieldOptionRows(Object.fromEntries(optionResults.map((result) => [result.key, result.rows])))
      setFieldOptions(Object.fromEntries(optionResults.map((result) => [
        result.key,
        result.rows
          .filter((row) => row.active)
          .map((row) => ({
            label: row.code ? `${row.code} - ${row.name}` : row.name,
            value: String(row[result.valueKey] ?? row.name),
          })),
      ])))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `โหลดข้อมูล${config.entityName}ไม่ได้`)
    } finally {
      setIsLoading(false)
    }
  }, [config.apiPath, config.entityName, config.fields])

  const resolvedConfig = useMemo(() => ({
    ...config,
    fields: config.fields.map((field) => fieldOptions[field.key] ? { ...field, options: fieldOptions[field.key] } : field),
  }), [config, fieldOptions])

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

  const total = filteredRecords.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [currentPage, filteredRecords, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

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
      setPage(1)
      return
    }

    setSortKey(key)
    setSortDirection('asc')
    setPage(1)
  }

  function sortLabel(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-md bg-white p-4 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="ค้นหา..."
              type="search"
              value={search}
            />
            {config.description ? <div className="mt-2 text-xs text-slate-500">{config.description}</div> : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="button" onClick={openCreateForm}>
              + {config.createLabel}
            </button>
          </div>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <div className="w-full max-w-4xl">
            <MasterDataForm
              config={resolvedConfig}
              isSaving={isSaving}
              paymentMethodRows={fieldOptionRows.type ?? []}
              supportsActive={config.supportsActive !== false}
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

      {isLoading ? <div className="rounded-md bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}

      {!isLoading ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบทั้งหมด <span className="font-semibold text-slate-900">{total}</span> รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="จำนวนรายการต่อหน้า"
                className="rounded-md border border-slate-300 px-2 py-1"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>{size} / หน้า</option>
                ))}
              </select>
              <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
              <span className="px-1">หน้า {currentPage} / {totalPages}</span>
              <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md bg-white shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {config.columns.map((column) => (
                    <th key={column.key} className={`min-w-32 p-2 text-${column.align ?? 'left'}`}>
                      <button className="font-semibold" type="button" onClick={() => setSort(column.key)}>
                        {column.label}{sortLabel(column.key)}
                      </button>
                    </th>
                  ))}
                  <th className="p-2 text-center">แก้ไข</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="cursor-pointer border-t hover:bg-slate-50 focus-within:bg-slate-50"
                    tabIndex={0}
                    onClick={() => openEditForm(record)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openEditForm(record)
                      }
                    }}
                  >
                    {config.columns.map((column) => (
                      <td key={column.key} className={`p-2 text-${column.align ?? 'left'} ${column.key === 'code' ? 'font-mono text-xs' : ''}`}>
                        {column.format === 'money' ? formatNumber(record[column.key] as number | null) : null}
                        {column.format === 'number' ? formatNumber(record[column.key] as number | null, 4) : null}
                        {column.format === 'status' ? <ActiveToggle checked={record.active} label={record.active ? 'ใช้งาน' : 'ปิด'} onChange={() => void handleToggleActive(record)} /> : null}
                        {!column.format ? displayRecordValue(record, column.key) : null}
                      </td>
                    ))}
                    <td className="p-2 text-center">
                      <button
                        className="text-blue-600"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditForm(record)
                        }}
                      >
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-slate-500" colSpan={config.columns.length + 1}>{config.emptyMessage}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type MasterDataFormProps = {
  config: MasterDataPageConfig
  isSaving: boolean
  paymentMethodRows: MasterDataRecord[]
  record: MasterDataRecord | null
  supportsActive: boolean
  onCancel: () => void
  onSubmit: (values: MasterDataFormValues) => Promise<void>
}

function MasterDataForm({ config, isSaving, paymentMethodRows, record, supportsActive, onCancel, onSubmit }: MasterDataFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<MasterDataFormValues>(() => (record ? recordToForm(record, paymentMethodRows) : emptyMasterDataForm))

  useEffect(() => {
    setForm(record ? recordToForm(record, paymentMethodRows) : emptyMasterDataForm)
    setErrors({})
  }, [paymentMethodRows, record])

  function update<K extends keyof MasterDataFormValues>(key: K, value: MasterDataFormValues[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (config.apiPath === '/api/master-data/accounts') {
        const typedNext = next as MasterDataFormValues
        const nextPaymentMethodGroup = paymentMethodGroupForFormValue(typedNext.type, paymentMethodRows)
        if (key === 'type') {
          if (nextPaymentMethodGroup === 'cash') {
            typedNext.subtype = 'cash'
            typedNext.bankName = null
            typedNext.bankBranch = null
            typedNext.accountNo = null
            typedNext.odLimit = null
          } else {
            if (!typedNext.subtype || typedNext.subtype === 'cash') typedNext.subtype = 'savings'
            if (!typedNext.currency) typedNext.currency = 'THB'
          }
        }
        if (key === 'subtype' && nextPaymentMethodGroup === 'bank') {
          if (value === 'savings' || value === 'current' || value === 'fcd' || value === 'od') {
            if (value === 'savings' || value === 'current' || value === 'od') {
              typedNext.currency = 'THB'
            }
            if (value === 'fcd' && typedNext.currency === 'THB') {
              typedNext.currency = null
            }
            if (value !== 'od') {
              typedNext.odLimit = null
            }
          }
        }
      }
      if (Object.keys(errors).length > 0) {
        setErrors(validateMasterDataForm(config, next, paymentMethodRows).errors)
      }
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validateMasterDataForm(config, form, paymentMethodRows)
    if (Object.keys(result.errors).length > 0 || !result.values) {
      setErrors(result.errors)
      return
    }

    setErrors({})
    await onSubmit(result.values)
  }

  return (
    <form noValidate className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-bold text-slate-900">{form.id ? `แก้ไข${config.entityName}` : config.createLabel}</h3>
        {supportsActive ? <ActiveToggle checked={form.active} onChange={(checked) => update('active', checked)} /> : null}
      </div>

      <div className="grid max-h-[76vh] gap-4 overflow-y-auto px-5 py-5 md:grid-cols-3">
        {config.fields.filter((field) => {
          if (config.apiPath === '/api/master-data/accounts') {
            const accountTypeGroup = paymentMethodGroupForFormValue(form.type, paymentMethodRows)
            if (!form.type && ['subtype', 'bankName', 'bankBranch', 'accountNo', 'odLimit'].includes(String(field.key))) {
              return false
            }
            if (accountTypeGroup === 'cash' && ['subtype', 'bankName', 'bankBranch', 'accountNo', 'odLimit'].includes(String(field.key))) {
              return false
            }
            if (accountTypeGroup === 'bank' && field.key === 'odLimit' && form.subtype !== 'od') {
              return false
            }
          }
          return true
        }).map((field) => (
          <FormField
            key={field.key}
            error={errors[field.key]}
            field={field}
            value={form[field.key]}
            onChange={(value) => {
              const normalized = field.key === 'availableForSale'
                ? value === 'true'
                : field.type === 'number'
                  ? parseNumericFieldValue(value)
                  : value || null
              update(field.key, normalized as never)
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
        <button className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={onCancel}>
          ยกเลิก
        </button>
        <button className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60" disabled={isSaving} type="submit">
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
  const isEmailField = field.key === 'email'
  const isPhoneField = field.key === 'phone'
  const isAccountNoField = field.key === 'accountNo'
  const isNumberField = field.type === 'number'
  const isMoneyField = field.inputFormat === 'money'
  const inputType = isEmailField ? 'email' : 'text'
  const inputPlaceholder = isEmailField ? 'example@company.com' : `กรอก${field.label}`
  const [draftValue, setDraftValue] = useState<string | null>(null)

  if (field.type === 'select') {
    return (
      <FormSelectField
        error={error}
        label={field.label}
        placeholder="เลือก"
        required={field.required}
        value={String(value ?? '')}
        onChange={onChange}
      >
        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </FormSelectField>
    )
  }

  return (
    <label className="block text-sm font-medium">
      {field.label}{field.required ? <span className="text-red-600"> *</span> : null}
      {isPhoneField ? (
        <PhoneInput
          aria-invalid={Boolean(error)}
          aria-required={field.required}
          className="mt-1.5 w-full"
          error={Boolean(error)}
          value={String(value ?? '')}
          onChange={onChange}
        />
      ) : (
        <input
          aria-invalid={Boolean(error)}
          aria-required={field.required}
          className={`mt-1.5 w-full rounded-md border px-3 py-2 outline-none focus:border-slate-700 ${isMoneyField ? 'text-right' : ''} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
          inputMode={isEmailField ? 'email' : isAccountNoField ? 'numeric' : isNumberField ? 'decimal' : undefined}
          placeholder={inputPlaceholder}
          type={inputType}
          value={isMoneyField ? (draftValue ?? formatDecimalDisplay(typeof value === 'number' ? value : null, 2)) : String(value ?? '')}
          onBlur={(event) => {
            if (!isMoneyField) return
            const nextValue = sanitizeDecimalInput(event.target.value, 2)
            if (nextValue.trim() === '' || nextValue.trim() === '.') {
              setDraftValue(null)
              onChange('')
              return
            }
            const parsed = Number(nextValue)
            if (!Number.isFinite(parsed)) {
              setDraftValue(null)
              onChange('')
              return
            }
            const normalized = parsed.toFixed(2)
            setDraftValue(null)
            onChange(normalized)
          }}
          onChange={(event) => {
            const nextValue = isEmailField
              ? event.target.value.replace(/[^\x20-\x7E]/g, '')
              : isAccountNoField
                ? sanitizeAccountNoInput(event.target.value)
                : isNumberField
                  ? sanitizeDecimalInput(event.target.value, isMoneyField ? 2 : 6)
                : event.target.value
            if (isMoneyField) {
              setDraftValue(nextValue)
            }
            onChange(nextValue)
          }}
          onFocus={(event: FocusEvent<HTMLInputElement>) => {
            if (!isMoneyField) return
            const currentValue = typeof value === 'number' ? formatDecimalDraft(value, 2) : ''
            setDraftValue(currentValue)
            // Place caret at end after swapping from formatted display to editable draft.
            requestAnimationFrame(() => {
              const end = event.target.value.length
              event.target.setSelectionRange(end, end)
            })
          }}
        />
      )}
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
