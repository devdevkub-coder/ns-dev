'use client'

import { useCallback, useEffect, useMemo, useState, type FocusEvent } from 'react'
import { Plus } from 'lucide-react'
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
import { Button } from '@/components/ui/Button'
import { FormSelectField } from '@/components/ui/FormSelectField'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { formatDecimalDisplay, formatDecimalDraft, formatPhoneDisplay, sanitizeAccountNoInput, sanitizeDecimalInput } from '@/lib/format'
import { Dialog, DialogContent } from '@/components/ui/Dialog'

type SortKey = keyof MasterDataRecord
type TableColumnKey = SortKey | '__action'

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
    nameTitle: record.nameTitle,
    firstName: record.firstName,
    lastName: record.lastName,
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
    accountName: record.accountName,
    currency: record.currency,
    openingBalance: record.openingBalance,
    odLimit: record.odLimit,
    branchId: record.branchId,
    address: record.address,
    commissionEnabled: record.commissionEnabled,
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

function alignClass(align: 'center' | 'left' | 'right' | undefined) {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
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

function directorDisplayName(values: Pick<MasterDataFormValues, 'firstName' | 'lastName' | 'nameTitle'>) {
  return [values.nameTitle, values.firstName, values.lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
}

function valuesForValidation(config: MasterDataPageConfig, values: MasterDataFormValues) {
  if (config.apiPath !== '/api/master-data/directors') return values
  return { ...values, name: directorDisplayName(values) || '-' }
}

function validateMasterDataForm(
  config: MasterDataPageConfig,
  values: MasterDataFormValues,
  paymentMethodRows: MasterDataRecord[],
) {
  const schema = config.apiPath === '/api/master-data/accounts' ? accountMasterDataFormSchema : masterDataFormSchema
  const normalizedValues = valuesForValidation(config, values)
  const parsed = schema.safeParse(normalizedValues)
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

  if (config.apiPath === '/api/master-data/directors') {
    if (!values.type) errors.type = 'เลือกประเภท'
    if (!values.nameTitle) errors.nameTitle = 'เลือกคำนำหน้าชื่อ'
    if (!values.firstName) errors.firstName = 'กรอกชื่อ'
    if (!values.lastName) errors.lastName = 'กรอกนามสกุล'

    const hasBankInfo = Boolean(values.bankName || values.accountNo || values.accountName || values.bankBranch)
    if (hasBankInfo) {
      if (!values.bankName) errors.bankName = 'เลือกธนาคาร'
      if (!values.accountName) errors.accountName = 'กรอกชื่อบัญชี'
      if (!values.accountNo) errors.accountNo = 'กรอกเลขบัญชี'
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const resizableColumns = useMemo<Array<ResizableColumnDefinition<TableColumnKey>>>(() => ([
    ...config.columns.map((column) => ({
      defaultWidth: column.width ?? 136,
      key: column.key,
      maxWidth: column.maxWidth,
      minWidth: column.minWidth ?? 96,
    })),
    { defaultWidth: 76, key: '__action', minWidth: 72 },
  ]), [config.columns])
  const columnResize = useResizableColumns<TableColumnKey>(`master-data.${config.apiPath}`, resizableColumns)

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
    const rows = records.filter((record) => {
      if (config.supportsActive !== false) {
        if (activeFilter === 'active' && !record.active) return false
        if (activeFilter === 'inactive' && record.active) return false
      }
      if (!query) return true
      return Object.values(record).some((value) =>
        String(value ?? '').toLowerCase().includes(query),
      )
    })

    return [...rows].sort((left, right) => compareRecords(left, right, sortKey, sortDirection))
  }, [records, search, sortDirection, sortKey, activeFilter, config.supportsActive])

  const total = filteredRecords.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [currentPage, filteredRecords, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, activeFilter, pageSize])

  const hasFilters = Boolean(search.trim() || (config.supportsActive !== false && activeFilter !== 'all'))
  const resetFilters = useCallback(() => {
    setSearch('')
    setActiveFilter('all')
    setPage(1)
  }, [])

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

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block mb-4 space-y-2 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm h-9 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="ค้นหา..."
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          {hasFilters ? (
            <button className="rounded-md bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs h-9 focus:outline-none" type="button" onClick={resetFilters}>
              ✕ ล้าง
            </button>
          ) : null}
          <button
            className="ml-auto rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60 h-9 flex items-center justify-center font-semibold shadow-sm focus:outline-none transition"
            type="button"
            onClick={openCreateForm}
          >
            + {config.createLabel}
          </button>
        </div>
        {config.supportsActive !== false ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">สถานะ:</span>
            <MatchButton active={activeFilter === 'all'} label="ทั้งหมด" onClick={() => setActiveFilter('all')} />
            <MatchButton active={activeFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => setActiveFilter('active')} />
            <MatchButton active={activeFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => setActiveFilter('inactive')} />
          </div>
        ) : null}
        {config.description ? <div className="text-xs text-slate-500 mt-1">{config.description}</div> : null}
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden">
        <div className="flex gap-2 items-center">
          <input
            className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm h-9 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="ค้นหา..."
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          {config.supportsActive !== false ? (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
              onClick={() => setShowMobileFilters(true)}
            >
              ตัวกรอง {activeFilter !== 'all' ? '(มี)' : ''}
            </button>
          ) : null}
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform focus:outline-none"
          onClick={openCreateForm}
          type="button"
          aria-label={config.createLabel}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters && config.supportsActive !== false ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะการใช้งาน</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={activeFilter === 'all'} label="ทั้งหมด" onClick={() => setActiveFilter('all')} />
                  <MatchButton active={activeFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => setActiveFilter('active')} />
                  <MatchButton active={activeFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => setActiveFilter('inactive')} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  resetFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormOpen(false); setSelectedRecord(null); } }}>
        <DialogContent className="max-w-4xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" hideClose>
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
        </DialogContent>
      </Dialog>

      {isLoading ? <div className="rounded-md bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}

      {!isLoading ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบทั้งหมด <span className="font-semibold text-slate-900">{total}</span> รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              {columnResize.hasCustomWidths ? (
                <Button className="hidden lg:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>
                  คืนค่าเดิมตาราง
                </Button>
              ) : null}
              <select
                aria-label="จำนวนรายการต่อหน้า"
                className="h-9 w-auto min-w-24 rounded-md border border-slate-300 px-2 py-1 text-sm bg-white"
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
              <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
              <span className="px-1 text-xs">หน้า {currentPage} / {totalPages}</span>
              <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm hidden lg:block">
            <div className="overflow-x-auto">
              <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {config.columns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}
                  <col style={columnResize.getColumnStyle('__action')} />
                </colgroup>
                <TableHeader>
                  <tr>
                    {config.columns.map((column) => (
                      <ResizableTableHead
                        key={column.key}
                        activeSortKey={sortKey}
                        align={column.align}
                        direction={sortDirection}
                        label={column.label}
                        resizeProps={columnResize.getResizeHandleProps(column.key, column.label)}
                        sortKey={column.key}
                        onSort={setSort}
                      />
                    ))}
                    <ResizableTableHead align="center" label="แก้ไข" resizeProps={columnResize.getResizeHandleProps('__action', 'แก้ไข')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                {paginatedRecords.map((record) => (
                  <TableRow
                    key={record.id}
                    className="cursor-pointer border-slate-100 hover:bg-slate-50 focus-within:bg-slate-50"
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
                      <TableCell
                        key={column.key}
                        className={`p-2 text-xs font-semibold text-slate-700 ${alignClass(column.align)} ${
                          column.align === 'right'
                            ? 'pr-4 tabular-nums whitespace-nowrap'
                            : column.key === 'code'
                            ? 'font-mono tabular-nums whitespace-nowrap'
                            : 'truncate'
                        }`}
                      >
                        {column.format === 'money' ? formatNumber(record[column.key] as number | null) : null}
                        {column.format === 'number' ? formatNumber(record[column.key] as number | null, 4) : null}
                        {column.format === 'status' ? (
                          <ActiveToggle
                            checked={record.active}
                            label={record.active ? 'ใช้งาน' : 'ปิด'}
                            onChange={() => void handleToggleActive(record)}
                          />
                        ) : null}
                        {!column.format ? displayRecordValue(record, column.key) : null}
                      </TableCell>
                    ))}
                    <TableCell className="p-2 text-center">
                      <button
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditForm(record)
                        }}
                      >
                        แก้ไข
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell className="p-8 text-center text-sm text-slate-500" colSpan={config.columns.length + 1}>{config.emptyMessage}</TableCell>
                  </TableRow>
                ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="block lg:hidden space-y-3">
            {paginatedRecords.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => openEditForm(record)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    {record.code ? (
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {String(record.code)}
                      </span>
                    ) : null}
                    <h4 className="font-bold text-slate-900 mt-1.5 text-[15px]">
                      {String(record.name ?? record.firstName ?? '-')}
                    </h4>
                  </div>
                  {config.supportsActive !== false ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <ActiveToggle
                        checked={record.active}
                        label={record.active ? 'ใช้งาน' : 'ปิด'}
                        onChange={() => void handleToggleActive(record)}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-slate-100 pt-2.5 mt-2.5 text-xs text-slate-600">
                  {config.columns
                    .filter((col) => col.key !== 'code' && col.key !== 'name' && col.format !== 'status')
                    .slice(0, 3)
                    .map((column) => (
                      <div key={column.key}>
                        <span className="block text-slate-400 font-medium">{column.label}</span>
                        <span className="font-semibold text-slate-700">
                          {column.format === 'money' ? formatNumber(record[column.key] as number | null) : null}
                          {column.format === 'number' ? formatNumber(record[column.key] as number | null, 4) : null}
                          {!column.format ? displayRecordValue(record, column.key) : null}
                        </span>
                      </div>
                    ))}
                </div>

              </div>
            ))}
            {filteredRecords.length === 0 ? (
              <div className="rounded-md bg-white p-8 text-center text-sm text-slate-500 shadow-sm border border-slate-200">
                {config.emptyMessage}
              </div>
            ) : null}
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
          if (value === 'savings' || value === 'current' || value === 'fcd') {
            if (value === 'savings' || value === 'current') {
              typedNext.currency = 'THB'
            }
            if (value === 'fcd' && typedNext.currency === 'THB') {
              typedNext.currency = null
            }
            if (value !== 'current') {
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

  function isFieldVisible(field: MasterDataField) {
    if (config.apiPath === '/api/master-data/accounts') {
      const accountTypeGroup = paymentMethodGroupForFormValue(form.type, paymentMethodRows)
      if (!form.type && ['subtype', 'bankName', 'bankBranch', 'accountNo', 'odLimit'].includes(String(field.key))) {
        return false
      }
      if (accountTypeGroup === 'cash' && ['subtype', 'bankName', 'bankBranch', 'accountNo', 'odLimit'].includes(String(field.key))) {
        return false
      }
      if (accountTypeGroup === 'bank' && field.key === 'odLimit' && form.subtype !== 'current') {
        return false
      }
    }
    return true
  }

  const visibleFields = config.fields.filter(isFieldVisible)
  const fieldSections = visibleFields.reduce<Array<{ fields: MasterDataField[]; title: string | null }>>((sections, field) => {
    const title = field.section ?? null
    const lastSection = sections.at(-1)
    if (!lastSection || lastSection.title !== title) {
      sections.push({ fields: [field], title })
      return sections
    }
    lastSection.fields.push(field)
    return sections
  }, [])
  const hasFieldSections = fieldSections.some((section) => section.title)

  function renderField(field: MasterDataField) {
    return (
      <FormField
        key={field.key}
        error={errors[field.key]}
        field={field}
        value={form[field.key] as string | number | boolean | null | undefined}
        onChange={(value) => {
          const normalized = field.type === 'checkbox'
            ? value === true || value === 'true'
            : field.key === 'availableForSale'
            ? value === 'true'
            : field.type === 'number'
              ? parseNumericFieldValue(String(value))
              : value || null
          update(field.key, normalized as never)
        }}
      />
    )
  }

  return (
    <form noValidate className="overflow-hidden rounded-md bg-slate-900 dark:bg-[#0f172a] shadow-xl flex flex-col w-full" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 bg-slate-900 dark:bg-[#0f172a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <h3 className="text-lg font-bold text-white">{form.id ? `แก้ไข${config.entityName}` : config.createLabel}</h3>
        {supportsActive ? <ActiveToggle checked={form.active} labelClassName="text-sm font-medium text-slate-200 dark:text-slate-800" onChange={(checked) => update('active', checked)} /> : null}
      </div>

      <div className="max-h-[76vh] overflow-y-auto bg-slate-50 px-5 py-5 flex-1 space-y-5">
        {hasFieldSections ? (
          <div className="space-y-5">
            {fieldSections.map((section, index) => (
              <section key={`${section.title ?? 'default'}-${index}`} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                {section.title ? <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">{section.title}</h4> : null}
                <div className="grid gap-4 md:grid-cols-3">
                  {section.fields.map(renderField)}
                  {section.title === 'ยอดตั้งต้นและวงเงิน OD' && form.subtype === 'current' && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">เงื่อนไขการใช้ OD</span>
                      <input
                        className="w-full h-10 rounded-md border px-3 py-2 text-sm outline-none bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed"
                        disabled
                        type="text"
                        value="ใช้เงินคงเหลือปกติก่อน แล้วค่อยใช้ OD"
                      />
                    </label>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              {visibleFields.map(renderField)}
            </div>
          </div>
        )}

        {config.apiPath === '/api/master-data/accounts' && record && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ข้อมูลคำนวณจาก Bank Statement (อ่านอย่างเดียว)</h4>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="text-xs text-emerald-800 font-semibold mb-1">ยอดคงเหลือจริง</div>
                <div className="text-lg font-bold text-emerald-900 tabular-nums">
                  {formatNumber(typeof (record as any).realBalance === 'number' ? (record as any).realBalance : null)}
                </div>
              </div>
              {form.subtype === 'current' && (
                <>
                  <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-4">
                    <div className="text-xs text-orange-800 font-semibold mb-1">OD ใช้ไป</div>
                    <div className="text-lg font-bold text-orange-900 tabular-nums">
                      {formatNumber(typeof (record as any).odUsed === 'number' ? (record as any).odUsed : null)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                    <div className="text-xs text-emerald-800 font-semibold mb-1">OD คงเหลือ</div>
                    <div className="text-lg font-bold text-emerald-900 tabular-nums">
                      {formatNumber(typeof (record as any).odRemaining === 'number' ? (record as any).odRemaining : null)}
                    </div>
                  </div>
                </>
              )}
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="text-xs text-emerald-800 font-semibold mb-1">ยอดที่ใช้จ่ายได้</div>
                <div className="text-lg font-bold text-emerald-900 tabular-nums">
                  {formatNumber(form.subtype === 'current' ? (typeof (record as any).availableToPay === 'number' ? (record as any).availableToPay : null) : (typeof (record as any).realBalance === 'number' ? (record as any).realBalance : null))}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 italic mt-1.5">
              สูตร: ยอดที่ใช้จ่ายได้ = ยอดคงเหลือจริง + วงเงิน OD
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3.5 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
        <button className="text-slate-500 hover:text-slate-700 text-sm font-semibold px-4 py-2 transition-colors focus:outline-none" type="button" onClick={onCancel}>
          ยกเลิก
        </button>
        <button className="rounded-md bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 shadow-sm transition-colors focus:outline-none" disabled={isSaving} type="submit">
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
  onChange: (value: string | boolean) => void
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

  if (field.type === 'checkbox') {
    return (
      <label className="flex min-h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
        <input
          checked={value === true}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="text-sm font-semibold text-slate-700">{field.label}</span>
        {error ? <span className="ml-auto text-xs text-red-700">{error}</span> : null}
      </label>
    )
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {field.label}{field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {isPhoneField ? (
        <PhoneInput
          aria-invalid={Boolean(error)}
          aria-required={field.required}
          className="w-full"
          error={Boolean(error)}
          value={String(value ?? '')}
          onChange={onChange}
        />
      ) : (
        <input
          aria-invalid={Boolean(error)}
          aria-required={field.required}
          className={`w-full h-10 rounded-md border px-3 py-2 text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isMoneyField ? 'text-right' : ''} ${error ? 'border-red-400 bg-red-50/50' : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400'}`}
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

function MatchButton({ active, label, onClick, tone = 'dark' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const activeClass = {
    amber: 'border-amber-600 bg-amber-600 text-white',
    dark: 'border-slate-700 bg-slate-700 text-white',
    emerald: 'border-emerald-600 bg-emerald-600 text-white',
    red: 'border-red-600 bg-red-600 text-white',
    slate: 'border-slate-500 bg-slate-500 text-white',
  }[tone]
  const idleClass = tone === 'amber' ? 'border-slate-300 bg-white hover:bg-amber-50' : tone === 'emerald' ? 'border-slate-300 bg-white hover:bg-emerald-50' : tone === 'red' ? 'border-slate-300 bg-white hover:bg-red-50' : 'border-slate-300 bg-white hover:bg-slate-100'
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
}

