'use client'

import { Check, Copy, Download, Plus, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  defaultSupplierPaymentMethodName,
  supplierFormSchema,
  exportSuppliers,
  importSuppliers,
  listSuppliers,
  saveSupplier,
  setSupplierActive,
  supplierBankAccountValidationIssues,
  supplierPaymentMethodGroup,
  type Supplier,
  type SupplierFormValues,
} from '@/lib/supplier'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { FormSelectField } from '@/components/ui/FormSelectField'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { getErrorMessage } from '@/lib/api-client'
import { formatAccountNoDisplay, formatPhoneDisplay, sanitizeAccountNoInput, sanitizePhoneInput } from '@/lib/format'
import { listMasterDataRecords, type MasterDataRecord } from '@/lib/master-data'
import { listThaiDistricts, listThaiProvinces, listThaiSubdistricts, type ThaiDistrict, type ThaiProvince, type ThaiSubdistrict } from '@/lib/thai-address'

type SortKey = 'code' | 'name' | 'taxId' | 'type' | 'phone' | 'bankName' | 'accountNo' | 'salesName' | 'active'
type ActiveFilter = '' | 'active' | 'inactive'
type SupplierColumnKey = SortKey | 'action' | 'branches'
type SupplierBankAccountForm = SupplierFormValues['bankAccounts'][number]

const supplierColumns: Array<ResizableColumnDefinition<SupplierColumnKey>> = [
  { key: 'code', defaultWidth: 100, minWidth: 80 },
  { key: 'name', defaultWidth: 260, minWidth: 180 },
  { key: 'taxId', defaultWidth: 130, minWidth: 110 },
  { key: 'type', defaultWidth: 95, minWidth: 80 },
  { key: 'phone', defaultWidth: 110, minWidth: 90 },
  { key: 'branches', defaultWidth: 180, minWidth: 130 },
  { key: 'bankName', defaultWidth: 180, minWidth: 130 },
  { key: 'accountNo', defaultWidth: 180, minWidth: 130 },
  { key: 'salesName', defaultWidth: 120, minWidth: 100 },
  { key: 'active', defaultWidth: 110, minWidth: 90 },
  { key: 'action', defaultWidth: 110, minWidth: 90 },
]

const emptyBankAccount: SupplierBankAccountForm = {
  id: null,
  paymentMethod: '',
  bankName: null,
  accountNo: null,
  bankAccount: null,
  branchCode: null,
  isPrimary: true,
  active: true,
}

const emptySupplierForm: SupplierFormValues = {
  id: undefined,
  code: null,
  name: '',
  nameTitle: null,
  firstName: null,
  lastName: null,
  type: 'นิติบุคคล',
  taxId: '',
  phone: '',
  address: null,
  addressNo: null,
  addressMoo: null,
  addressVillage: null,
  addressRoad: null,
  addressSubdistrict: null,
  addressDistrict: null,
  addressProvince: null,
  addressPostalCode: null,
  addressCountry: 'ไทย',
  countryCode: 'TH',
  addressLine1: null,
  addressLine2: null,
  addressCity: null,
  addressStateRegion: null,
  addressPostalCodeIntl: null,
  bankName: null,
  accountNo: null,
  bankAccount: null,
  bankAccounts: [emptyBankAccount],
  branchId: null,
  branchIds: [],
  primaryBranchId: null,
  salesId: null,
  salesName: null,
  marketScope: 'ในประเทศ',
  active: true,
}

type SupplierFormState = Omit<SupplierFormValues, 'marketScope'> & {
  marketScope: SupplierFormValues['marketScope'] | ''
}

const personTitleOptions = ['นาย', 'นาง', 'นางสาว', 'คุณ']

function supplierToForm(supplier: Supplier, paymentMethods: MasterDataRecord[]): SupplierFormValues {
  const bankAccounts = supplier.bankAccounts.length > 0
    ? supplier.bankAccounts.map((account, index) => ({
      ...account,
      paymentMethod: account.paymentMethod,
      accountNo: account.accountNo ? sanitizeAccountNoInput(account.accountNo) : null,
      isPrimary: account.isPrimary || index === 0,
    }))
    : supplier.accountNo
      ? [{
        id: null,
        paymentMethod: defaultSupplierPaymentMethodName(paymentMethods, 'bank') ?? '',
        bankName: supplier.bankName,
        accountNo: sanitizeAccountNoInput(supplier.accountNo),
        bankAccount: supplier.bankAccount,
        branchCode: supplier.branchId,
        isPrimary: true,
        active: true,
      }]
      : [emptyBankAccount]

  return {
    id: supplier.id,
    code: supplier.code,
    name: supplier.name,
    nameTitle: supplier.nameTitle,
    firstName: supplier.firstName,
    lastName: supplier.lastName,
    type: supplier.type,
    taxId: supplier.taxId ?? '',
    phone: formatPhoneDisplay(supplier.phone) ?? '',
    address: supplier.address,
    addressNo: supplier.addressNo,
    addressMoo: supplier.addressMoo,
    addressVillage: supplier.addressVillage,
    addressRoad: supplier.addressRoad,
    addressSubdistrict: supplier.addressSubdistrict,
    addressDistrict: supplier.addressDistrict,
    addressProvince: supplier.addressProvince,
    addressPostalCode: supplier.addressPostalCode,
    addressCountry: supplier.addressCountry ?? 'ไทย',
    countryCode: supplier.countryCode ?? (supplier.marketScope === 'ต่างประเทศ' ? null : 'TH'),
    addressLine1: supplier.addressLine1,
    addressLine2: supplier.addressLine2,
    addressCity: supplier.addressCity,
    addressStateRegion: supplier.addressStateRegion,
    addressPostalCodeIntl: supplier.addressPostalCodeIntl,
    bankName: supplier.bankName,
    accountNo: supplier.accountNo,
    bankAccount: supplier.bankAccount,
    bankAccounts,
    branchId: supplier.branchId,
    branchIds: supplier.branchIds,
    primaryBranchId: supplier.primaryBranchId,
    salesId: supplier.salesId,
    salesName: supplier.salesName,
    marketScope: supplier.marketScope,
    active: supplier.active,
  }
}

function displayValue(value: string | number | null) {
  return value === null || value === '' ? '-' : value
}

function supplierReceivingLines(supplier: Supplier) {
  const accounts = supplier.bankAccounts.filter((account) => account.active !== false)
  if (accounts.length === 0 && (supplier.bankName || supplier.accountNo)) {
    const branchSuffix = supplier.branchId ? ` (สาขา ${supplier.branchId})` : ''
    return [{
      bankName: `${supplier.bankName || 'เงินโอน'}${branchSuffix}`,
      accountNo: formatAccountNoDisplay(supplier.accountNo) || '-',
      rawAccountNo: sanitizeAccountNoInput(supplier.accountNo ?? '') || null,
    }]
  }

  return accounts.map((account) => {
    if (!account.accountNo) {
      return { bankName: account.paymentMethod || 'เงินสด', accountNo: '-', rawAccountNo: null }
    }

    const branchSuffix = account.branchCode ? ` (สาขา ${account.branchCode})` : ''
    return {
      bankName: `${account.bankName || 'เงินโอน'}${branchSuffix}`,
      accountNo: formatAccountNoDisplay(account.accountNo) || '-',
      rawAccountNo: sanitizeAccountNoInput(account.accountNo ?? '') || null,
    }
  })
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values))
}

function compareSuppliers(left: Supplier, right: Supplier, key: SortKey, direction: 'asc' | 'desc') {
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

export function SuppliersPageClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [districts, setDistricts] = useState<ThaiDistrict[]>([])
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('')
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('')
  const [marketScopeFilter, setMarketScopeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [provinces, setProvinces] = useState<ThaiProvince[]>([])
  const [salespersonFilter, setSalespersonFilter] = useState('')
  const [salespersons, setSalespersons] = useState<MasterDataRecord[]>([])
  const [branches, setBranches] = useState<MasterDataRecord[]>([])
  const [bankNames, setBankNames] = useState<MasterDataRecord[]>([])
  const [paymentMethods, setPaymentMethods] = useState<MasterDataRecord[]>([])
  const [copiedAccountKey, setCopiedAccountKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [subdistricts, setSubdistricts] = useState<ThaiSubdistrict[]>([])
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('master-data.suppliers.v5', supplierColumns)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const [result, salespersonRows] = await Promise.all([
        listSuppliers({ all: true }),
        listMasterDataRecords('/api/master-data/salespersons'),
      ])
      setSuppliers(result.rows)
      setSalespersons(salespersonRows.filter((salesperson) => salesperson.active))
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลผู้ขายไม่ได้'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const filteredSortedSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = suppliers.filter((supplier) => {
      if (supplierTypeFilter && supplier.type !== supplierTypeFilter) return false
      if (marketScopeFilter && supplier.marketScope !== marketScopeFilter) return false
      if (salespersonFilter && supplier.salesId !== salespersonFilter) return false
      if (activeFilter === 'active' && !supplier.active) return false
      if (activeFilter === 'inactive' && supplier.active) return false
      if (!query) return true

      return Object.values(supplier).some((value) => String(value ?? '').toLowerCase().includes(query))
    })

    return [...rows].sort((left, right) => compareSuppliers(left, right, sortKey, sortDirection))
  }, [activeFilter, supplierTypeFilter, suppliers, marketScopeFilter, salespersonFilter, search, sortDirection, sortKey])

  const total = filteredSortedSuppliers.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedSuppliers = filteredSortedSuppliers.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasActiveFilters = Boolean(search.trim() || supplierTypeFilter || marketScopeFilter || salespersonFilter || activeFilter)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  async function loadAddressData() {
    if (provinces.length && districts.length && subdistricts.length) {
      return
    }

    const [provinceRows, districtRows, subdistrictRows] = await Promise.all([
      listThaiProvinces(),
      listThaiDistricts(),
      listThaiSubdistricts(),
    ])
    setProvinces(provinceRows)
    setDistricts(districtRows)
    setSubdistricts(subdistrictRows)
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function openCreateForm() {
    setSelectedSupplier(null)
    try {
      await Promise.all([loadAddressData(), loadBankNames(), loadBranches(), loadPaymentMethods()])
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลที่อยู่ไทยไม่ได้'))
      return
    }
    setFormOpen(true)
  }

  async function openEditForm(supplier: Supplier) {
    setSelectedSupplier(supplier)
    try {
      await Promise.all([loadAddressData(), loadBankNames(), loadBranches(), loadPaymentMethods()])
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลที่อยู่ไทยไม่ได้'))
      return
    }
    setFormOpen(true)
  }

  async function loadBankNames() {
    if (bankNames.length) return
    const rows = await listMasterDataRecords('/api/master-data/bank-names')
    setBankNames(rows.filter((bankName) => bankName.active))
  }

  async function loadBranches() {
    if (branches.length) return
    const rows = await listMasterDataRecords('/api/master-data/branches')
    setBranches(rows.filter((branch) => branch.active))
  }

  async function loadPaymentMethods() {
    if (paymentMethods.length) return
    const rows = await listMasterDataRecords('/api/master-data/payment-methods')
    setPaymentMethods(rows.filter((paymentMethod) => paymentMethod.active))
  }

  async function handleSubmit(values: SupplierFormValues) {
    setIsSaving(true)
    setError(null)
    try {
      await saveSupplier(values)
      setFormOpen(false)
      setSelectedSupplier(null)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกข้อมูลผู้ขายไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(supplier: Supplier, active: boolean) {
    setError(null)
    setPendingToggleIds((current) => new Set(current).add(supplier.id))
    setSuppliers((current) => current.map((row) => row.id === supplier.id ? { ...row, active } : row))
    setSelectedSupplier((current) => current?.id === supplier.id ? { ...current, active } : current)

    try {
      const updatedSupplier = await setSupplierActive(supplier.id, active)
      setSuppliers((current) => current.map((row) => row.id === updatedSupplier.id ? updatedSupplier : row))
      setSelectedSupplier((current) => current?.id === updatedSupplier.id ? updatedSupplier : current)
    } catch (caught) {
      setSuppliers((current) => current.map((row) => row.id === supplier.id ? { ...row, active: supplier.active } : row))
      setSelectedSupplier((current) => current?.id === supplier.id ? { ...current, active: supplier.active } : current)
      setError(getErrorMessage(caught, 'อัปเดตสถานะผู้ขายไม่ได้'))
    } finally {
      setPendingToggleIds((current) => {
        const next = new Set(current)
        next.delete(supplier.id)
        return next
      })
    }
  }

  async function handleExport() {
    setError(null)
    setIsExporting(true)
    try {
      const { blob, filename } = await exportSuppliers({
        active: activeFilter,
        supplierType: supplierTypeFilter,
        direction: sortDirection,
        marketScope: marketScopeFilter,
        q: search,
        salesId: salespersonFilter,
        sort: sortKey,
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Export Excel ไม่สำเร็จ'))
    } finally {
      setIsExporting(false)
    }
  }

  async function handleImport(file: File | null) {
    if (!file) return
    setError(null)
    setIsImporting(true)
    try {
      const result = await importSuppliers(file)
      await loadData()
      setPage(1)
      window.alert(`Import สำเร็จ ${result.totalRows.toLocaleString('th-TH')} รายการ: เพิ่มใหม่ ${result.inserted.toLocaleString('th-TH')} / อัปเดต ${result.updated.toLocaleString('th-TH')}`)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Import Excel ไม่สำเร็จ'))
    } finally {
      setIsImporting(false)
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

  async function copyAccountNo(accountKey: string, accountNo: string) {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(accountNo)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = accountNo
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopiedAccountKey(accountKey)
      window.setTimeout(() => setCopiedAccountKey((current) => current === accountKey ? null : current), 1200)
    } catch (caught) {
      setError(getErrorMessage(caught, 'คัดลอกเลขบัญชีไม่ได้'))
    }
  }

  function segmentedButtonClass(active: boolean) {
    return `rounded-md border px-3 py-1 text-xs font-medium ${
      active
        ? 'border-slate-700 bg-slate-700 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }`
  }

  function clearFilters() {
    setSearch('')
    setSupplierTypeFilter('')
    setMarketScopeFilter('')
    setSalespersonFilter('')
    setActiveFilter('')
    setPage(1)
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลผู้ขายไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:mb-4 lg:block lg:space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm h-9 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="ค้นหา..."
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          {hasActiveFilters ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none" type="button" onClick={clearFilters}>
              ✕ ล้าง
            </button>
          ) : null}

        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-50 pt-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">ประเภทผู้ขาย:</span>
            <MatchButton active={supplierTypeFilter === ''} label="ทั้งหมด" onClick={() => { setSupplierTypeFilter(''); setPage(1); }} />
            <MatchButton active={supplierTypeFilter === 'บุคคล'} label="บุคคล" tone="emerald" onClick={() => { setSupplierTypeFilter('บุคคล'); setPage(1); }} />
            <MatchButton active={supplierTypeFilter === 'นิติบุคคล'} label="นิติบุคคล" tone="slate" onClick={() => { setSupplierTypeFilter('นิติบุคคล'); setPage(1); }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">ประเทศ/ตลาด:</span>
            <MatchButton active={marketScopeFilter === ''} label="ทั้งหมด" onClick={() => { setMarketScopeFilter(''); setPage(1); }} />
            <MatchButton active={marketScopeFilter === 'ในประเทศ'} label="ในประเทศ" tone="emerald" onClick={() => { setMarketScopeFilter('ในประเทศ'); setPage(1); }} />
            <MatchButton active={marketScopeFilter === 'ต่างประเทศ'} label="ต่างประเทศ" tone="slate" onClick={() => { setMarketScopeFilter('ต่างประเทศ'); setPage(1); }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">ผู้ดูแล:</span>
            <select
              aria-label="กรองผู้ดูแล"
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={salespersonFilter}
              onChange={(event) => {
                setPage(1)
                setSalespersonFilter(event.target.value)
              }}
            >
              <option value="">ทุกผู้ดูแล</option>
              {salespersons.map((salesperson) => (
                <option key={salesperson.id} value={salesperson.id}>{salesperson.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">สถานะ:</span>
            <MatchButton active={activeFilter === ''} label="ทั้งหมด" onClick={() => { setActiveFilter(''); setPage(1) }} />
            <MatchButton active={activeFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => { setActiveFilter('active'); setPage(1) }} />
            <MatchButton active={activeFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => { setActiveFilter('inactive'); setPage(1) }} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 focus-within:outline-none ${isImporting || isLoading ? 'pointer-events-none opacity-60' : ''}`}>
              <Upload aria-hidden="true" className="h-4 w-4" />
              <span className="text-xs sm:text-sm">{isImporting ? 'กำลัง Import...' : 'Import Excel'}</span>
              <input
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={isImporting || isLoading}
                type="file"
                onChange={(event) => {
                  void handleImport(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
            </label>
            <button className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none" disabled={isExporting || isLoading} type="button" onClick={() => void handleExport()}>
              <Download aria-hidden="true" className="h-4 w-4" />
              <span className="text-xs sm:text-sm">{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</span>
            </button>
            <button className="inline-flex h-9 items-center gap-1 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 focus:outline-none" type="button" onClick={() => void openCreateForm()}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              เพิ่มรายการ
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex gap-2 items-center">
          <input
            className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm h-9 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="ค้นหา..."
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {hasActiveFilters ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform focus:outline-none"
          onClick={() => void openCreateForm()}
          type="button"
          aria-label="เพิ่มรายการผู้ขาย"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองเพิ่มเติม"
          onClose={() => setShowMobileFilters(false)}
          footer={(
            <>
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  clearFilters()
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
            </>
          )}
        >
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">ประเภทผู้ขาย</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={supplierTypeFilter === ''} label="ทั้งหมด" onClick={() => { setSupplierTypeFilter(''); setPage(1); }} />
                  <MatchButton active={supplierTypeFilter === 'บุคคล'} label="บุคคล" tone="emerald" onClick={() => { setSupplierTypeFilter('บุคคล'); setPage(1); }} />
                  <MatchButton active={supplierTypeFilter === 'นิติบุคคล'} label="นิติบุคคล" tone="slate" onClick={() => { setSupplierTypeFilter('นิติบุคคล'); setPage(1); }} />
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">ประเทศ/ตลาด</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={marketScopeFilter === ''} label="ทั้งหมด" onClick={() => { setMarketScopeFilter(''); setPage(1); }} />
                  <MatchButton active={marketScopeFilter === 'ในประเทศ'} label="ในประเทศ" tone="emerald" onClick={() => { setMarketScopeFilter('ในประเทศ'); setPage(1); }} />
                  <MatchButton active={marketScopeFilter === 'ต่างประเทศ'} label="ต่างประเทศ" tone="slate" onClick={() => { setMarketScopeFilter('ต่างประเทศ'); setPage(1); }} />
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">ผู้ดูแล</span>
                <select
                  aria-label="กรองผู้ดูแลมือถือ"
                  className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                  value={salespersonFilter}
                  onChange={(event) => {
                    setPage(1)
                    setSalespersonFilter(event.target.value)
                  }}
                >
                  <option value="">ทุกผู้ดูแล</option>
                  {salespersons.map((salesperson) => (
                    <option key={salesperson.id} value={salesperson.id}>{salesperson.name}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">สถานะการใช้งาน</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={activeFilter === ''} label="ทั้งหมด" onClick={() => { setActiveFilter(''); setPage(1) }} />
                  <MatchButton active={activeFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => { setActiveFilter('active'); setPage(1) }} />
                  <MatchButton active={activeFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => { setActiveFilter('inactive'); setPage(1) }} />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <span className="block text-xs font-semibold text-slate-600">จัดการไฟล์</span>
                <div className="flex gap-2">
                  <label className={`flex-1 inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 ${isImporting || isLoading ? 'pointer-events-none opacity-60' : ''}`}>
                    <Upload aria-hidden="true" className="h-4 w-4" />
                    <span>{isImporting ? 'Importing...' : 'Import Excel'}</span>
                    <input
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      disabled={isImporting || isLoading}
                      type="file"
                      onChange={(event) => {
                        void handleImport(event.target.files?.[0] ?? null)
                        event.target.value = ''
                        setShowMobileFilters(false)
                      }}
                    />
                  </label>
                  <button className="flex-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" disabled={isExporting || isLoading} type="button" onClick={() => { void handleExport(); setShowMobileFilters(false); }}>
                    <Download aria-hidden="true" className="h-4 w-4" />
                    <span>{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</span>
                  </button>
                </div>
              </div>
        </MobileFilterSheet>
      ) : null}


      {!isLoading ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-600">
          <div>
            พบทั้งหมด <span className="font-semibold text-slate-900">{total.toLocaleString('th-TH')}</span> รายการ
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {columnResize.hasCustomWidths ? (
              <Button className="hidden lg:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>
                คืนค่าเดิมตาราง
              </Button>
            ) : null}
            <PageSizeDropdown value={pageSize} onChange={(size) => {
              setPage(1)
              setPageSize(size)
            }} />
            <Button disabled={page <= 1 || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage(Math.max(1, page - 1))}>ก่อนหน้า</Button>
            <span className="px-1 text-xs">หน้า {currentPage} / {totalPages}</span>
            <Button disabled={page >= totalPages || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>ถัดไป</Button>
          </div>
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormOpen(false); setSelectedSupplier(null); } }}>
        <DialogContent className="max-w-5xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" hideClose>
          <SupplierForm
            supplier={selectedSupplier}
            districts={districts}
            isSaving={isSaving}
            bankNames={bankNames}
            paymentMethods={paymentMethods}
            branches={branches}
            provinces={provinces}
            salespersons={salespersons}
            subdistricts={subdistricts}
            onCancel={() => {
              setFormOpen(false)
              setSelectedSupplier(null)
            }}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>

      {isLoading ? <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูลผู้ขาย</div> : null}

      {!isLoading ? (
        <>
          {/* Desktop Table View */}
          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
            <div className="overflow-x-auto">
              <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {supplierColumns.map((column) => (
                    <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <TableHeader>
                  <tr>
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="รหัส" resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')} sortKey="code" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ชื่อบริษัท/ร้านค้า" resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อบริษัท/ร้านค้า')} sortKey="name" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขผู้เสียภาษี" resizeProps={columnResize.getResizeHandleProps('taxId', 'เลขผู้เสียภาษี')} sortKey="taxId" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} sortKey="type" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="โทร" resizeProps={columnResize.getResizeHandleProps('phone', 'โทร')} sortKey="phone" onSort={setSort} />
                    <ResizableTableHead direction={sortDirection} label="สาขาที่ใช้ได้" resizeProps={columnResize.getResizeHandleProps('branches', 'สาขาที่ใช้ได้')} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ธนาคารรับเงิน" resizeProps={columnResize.getResizeHandleProps('bankName', 'ธนาคารรับเงิน')} sortKey="bankName" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขที่บัญชีรับเงิน" resizeProps={columnResize.getResizeHandleProps('accountNo', 'เลขที่บัญชีรับเงิน')} sortKey="accountNo" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ผู้ดูแล" resizeProps={columnResize.getResizeHandleProps('salesName', 'ผู้ดูแล')} sortKey="salesName" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={setSort} />
                    <ResizableTableHead align="center" label="แก้ไข" resizeProps={columnResize.getResizeHandleProps('action', 'แก้ไข')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {paginatedSuppliers.map((supplier) => {
                    const receivingLines = supplierReceivingLines(supplier)
                    return (
                      <TableRow
                        key={supplier.id}
                        className="cursor-pointer border-slate-100 hover:bg-slate-50"
                        role="button"
                        tabIndex={0}
                        onClick={() => void openEditForm(supplier)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            void openEditForm(supplier)
                          }
                        }}
                      >
                        <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-slate-700">{supplier.code}</TableCell>
                        <TableCell className="truncate text-xs font-semibold text-slate-800" title={supplier.name}>{supplier.name}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-slate-700">{displayValue(supplier.taxId)}</TableCell>
                        <TableCell className="text-xs font-semibold text-slate-700">{displayValue(supplier.type)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-700">{displayValue(formatPhoneDisplay(supplier.phone))}</TableCell>
                        <TableCell className="truncate text-xs font-semibold text-slate-700" title={supplier.branchNames.join(', ') || undefined}>
                          {supplier.branchNames.length ? supplier.branchNames.join(', ') : <span className="text-amber-700">ยังไม่กำหนด</span>}
                        </TableCell>
                        <TableCell className="align-top text-xs font-semibold text-slate-700">
                          {receivingLines.length ? (
                            <div className="space-y-1">
                              {receivingLines.map((line, index) => (
                                <div key={`${supplier.id}-bank-${index}`} className="min-h-5 truncate leading-5" title={line.bankName}>{line.bankName}</div>
                              ))}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="align-top font-mono text-xs font-semibold text-slate-700">
                          {receivingLines.length ? (
                            <div className="space-y-1">
                              {receivingLines.map((line, index) => {
                                const accountKey = `${supplier.id}-account-${index}`
                                return (
                                  <div key={accountKey} className="flex min-h-5 items-center gap-2 leading-5">
                                    <span className="truncate">{line.accountNo}</span>
                                    {line.rawAccountNo ? (
                                      <CopyAccountButton
                                        accountKey={accountKey}
                                        accountNo={line.rawAccountNo}
                                        copied={copiedAccountKey === accountKey}
                                        label={line.accountNo}
                                        onCopy={copyAccountNo}
                                      />
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="truncate text-xs font-semibold text-slate-700" title={supplier.salesName ?? undefined}>{displayValue(supplier.salesName)}</TableCell>
                        <TableCell className="text-center text-xs font-semibold text-slate-700">
                          <ActiveToggle
                            checked={supplier.active}
                            disabled={pendingToggleIds.has(supplier.id)}
                            label={supplier.active ? 'ใช้งาน' : 'ปิด'}
                            onChange={(checked) => void handleToggleActive(supplier, checked)}
                          />
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold text-slate-700">
                          <button
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void openEditForm(supplier)
                            }}
                          >
                            แก้ไข
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {paginatedSuppliers.length === 0 ? (
                    <TableRow>
                      <TableCell className="p-8 text-center text-sm text-slate-500" colSpan={11}>ไม่พบข้อมูลที่ค้นหา</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="block lg:hidden space-y-3">
            {paginatedSuppliers.map((supplier) => {
              const receivingLines = supplierReceivingLines(supplier)
              return (
                <div
                  key={supplier.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-colors"
                  onClick={() => void openEditForm(supplier)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {supplier.code}
                      </span>
                      <h4 className="font-bold text-slate-900 mt-1.5 text-[15px]">
                        {supplier.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <ActiveToggle
                        checked={supplier.active}
                        disabled={pendingToggleIds.has(supplier.id)}
                        label={supplier.active ? 'ใช้งาน' : 'ปิด'}
                        onChange={(checked) => void handleToggleActive(supplier, checked)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-slate-100 pt-2.5 mt-2.5 text-xs text-slate-600">
                    <div>
                      <span className="block text-slate-400 font-medium">ประเภท</span>
                      <span className="font-semibold text-slate-700">{displayValue(supplier.type)}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400 font-medium">โทรศัพท์</span>
                      <span className="font-semibold text-slate-700">{displayValue(formatPhoneDisplay(supplier.phone))}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-slate-400 font-medium">สาขาที่ใช้ได้</span>
                      <span className={supplier.branchNames.length ? 'font-semibold text-slate-700' : 'font-semibold text-amber-700'}>
                        {supplier.branchNames.length ? supplier.branchNames.join(', ') : 'ยังไม่กำหนด'}
                      </span>
                    </div>

                    <div className="col-span-2 border-t border-slate-50 pt-2 mt-1">
                      <span className="block text-slate-400 font-medium">ธนาคาร & บัญชีรับเงิน</span>
                      {receivingLines.length ? (
                        <div className="space-y-1.5 mt-0.5">
                          {receivingLines.map((line, index) => {
                            const accountKey = `${supplier.id}-account-mobile-${index}`
                            return (
                              <div key={accountKey} className="flex items-center justify-between gap-2 bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100">
                                <div className="truncate">
                                  <div className="font-semibold text-slate-700">{line.bankName}</div>
                                  <div className="font-mono text-xs text-slate-500 mt-0.5">{line.accountNo}</div>
                                </div>
                                {line.rawAccountNo ? (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <CopyAccountButton
                                      accountKey={accountKey}
                                      accountNo={line.rawAccountNo}
                                      copied={copiedAccountKey === accountKey}
                                      label={line.accountNo}
                                      onCopy={copyAccountNo}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      ) : <span className="font-semibold text-slate-700">-</span>}
                    </div>

                    {supplier.salesName ? (
                      <div className="col-span-2 border-t border-slate-50 pt-2 mt-1">
                        <span className="block text-slate-400 font-medium">ผู้ดูแล</span>
                        <span className="font-semibold text-slate-700">{supplier.salesName}</span>
                      </div>
                    ) : null}
                  </div>

                </div>
              )
            })}
            {paginatedSuppliers.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm border border-slate-200">
                ไม่พบข้อมูลที่ค้นหา
              </div>
            ) : null}
          </div>
        </>
      ) : null}

    </section>
  )
}

type SupplierFormProps = {
  bankNames: MasterDataRecord[]
  branches: MasterDataRecord[]
  paymentMethods: MasterDataRecord[]
  supplier: Supplier | null
  districts: ThaiDistrict[]
  isSaving: boolean
  provinces: ThaiProvince[]
  salespersons: MasterDataRecord[]
  subdistricts: ThaiSubdistrict[]
  onCancel: () => void
  onSubmit: (values: SupplierFormValues) => Promise<void>
}

type CopyAccountButtonProps = {
  accountKey: string
  accountNo: string
  copied: boolean
  label: string
  onCopy: (accountKey: string, accountNo: string) => Promise<void>
}

function CopyAccountButton({ accountKey, accountNo, copied, label, onCopy }: CopyAccountButtonProps) {
  return (
    <button
      aria-label={`คัดลอกเลขบัญชี ${label}`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-slate-600 transition hover:bg-slate-100 ${copied ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white'}`}
      title={copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขบัญชี'}
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        void onCopy(accountKey, accountNo)
      }}
    >
      <span className="sr-only">{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
      {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
    </button>
  )
}

function SupplierForm({ supplier, bankNames, branches, paymentMethods, districts, isSaving, provinces, salespersons, subdistricts, onCancel, onSubmit }: SupplierFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<SupplierFormState>(() => (supplier ? supplierToForm(supplier, paymentMethods) : emptySupplierForm))

  useEffect(() => {
    setForm(supplier ? supplierToForm(supplier, paymentMethods) : emptySupplierForm)
    setErrors({})
  }, [paymentMethods, supplier])

  const postalCode = form.addressPostalCode?.trim() ?? ''
  const postalSubdistricts = postalCode.length === 5 ? subdistricts.filter((subdistrict) => subdistrict.postalCode === postalCode) : []
  const postalProvinceCodes = uniqueValues(postalSubdistricts.map((subdistrict) => subdistrict.provinceCode))
  const postalDistrictCodes = uniqueValues(postalSubdistricts.map((subdistrict) => subdistrict.districtCode))
  const selectedProvince = provinces.find((province) => province.nameTh === form.addressProvince) ?? null
  const provinceOptions = postalProvinceCodes.length > 0 ? provinces.filter((province) => postalProvinceCodes.includes(province.code)) : provinces
  const filteredDistricts = selectedProvince
    ? districts.filter((district) => district.provinceCode === selectedProvince.code && (postalDistrictCodes.length === 0 || postalDistrictCodes.includes(district.code)))
    : postalDistrictCodes.length > 0
      ? districts.filter((district) => postalDistrictCodes.includes(district.code))
      : []
  const selectedDistrict = filteredDistricts.find((district) => district.nameTh === form.addressDistrict) ?? null
  const filteredSubdistricts = selectedDistrict
    ? subdistricts.filter((subdistrict) => subdistrict.districtCode === selectedDistrict.code && (!postalCode || subdistrict.postalCode === postalCode))
    : postalSubdistricts
  const bankNameOptions = useMemo(() => {
    const names = bankNames.map((bankName) => bankName.name).filter((name) => name !== 'เงินสด')
    if (form.bankName && form.bankName !== 'เงินสด' && !names.includes(form.bankName)) names.push(form.bankName)
    for (const account of form.bankAccounts) {
      if (account.bankName && account.bankName !== 'เงินสด' && !names.includes(account.bankName)) names.push(account.bankName)
    }
    return names
  }, [bankNames, form.bankAccounts, form.bankName])
  const paymentMethodOptions = useMemo(() => {
    const configuredMethods = paymentMethods.map((paymentMethod) => ({
      value: paymentMethod.name,
      label: paymentMethod.name,
    }))
    const currentMethods = form.bankAccounts
      .map((account) => account.paymentMethod?.trim())
      .filter((paymentMethod): paymentMethod is string => Boolean(paymentMethod))
      .map((paymentMethod) => ({ value: paymentMethod, label: paymentMethod }))
    const options = uniqueValues([...configuredMethods, ...currentMethods].map((option) => option.value))
      .map((value) => [...configuredMethods, ...currentMethods].find((option) => option.value === value) ?? { value, label: value })
    return options
  }, [form.bankAccounts, paymentMethods])

  function update<K extends keyof SupplierFormState>(key: K, value: SupplierFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateBranchSelection(branchId: string, checked: boolean) {
    setForm((current) => {
      const branchIds = checked
        ? uniqueValues([...current.branchIds, branchId])
        : current.branchIds.filter((id) => id !== branchId)
      const primaryBranchId = current.primaryBranchId && branchIds.includes(current.primaryBranchId)
        ? current.primaryBranchId
        : branchIds[0] ?? null
      return {
        ...current,
        branchId: primaryBranchId,
        branchIds,
        primaryBranchId,
      }
    })
  }

  function updateBankAccount<K extends keyof SupplierBankAccountForm>(index: number, key: K, value: SupplierBankAccountForm[K]) {
    setForm((current) => {
      const bankAccounts = current.bankAccounts.map((account, accountIndex) => {
        if (accountIndex !== index) return account
        const nextAccount = { ...account, [key]: value }
        if (key === 'paymentMethod' && supplierPaymentMethodGroup(String(value ?? ''), paymentMethods) === 'cash') {
          return { ...nextAccount, bankName: null, accountNo: null, bankAccount: null, branchCode: null }
        }
        return nextAccount
      })
      return { ...current, bankAccounts }
    })
  }

  function addBankAccount() {
    setForm((current) => ({
      ...current,
      bankAccounts: [
        ...current.bankAccounts,
        { ...emptyBankAccount, id: null, isPrimary: false },
      ],
    }))
  }

  function removeBankAccount(index: number) {
    setForm((current) => {
      const bankAccounts = current.bankAccounts.filter((_, accountIndex) => accountIndex !== index)
      if (!bankAccounts.length) return { ...current, bankAccounts: [{ ...emptyBankAccount }] }
      return { ...current, bankAccounts }
    })
  }

  function updatePostalCode(value: string) {
    const nextPostalCode = value.trim()
    const matchingSubdistricts = nextPostalCode.length === 5 ? subdistricts.filter((subdistrict) => subdistrict.postalCode === nextPostalCode) : []
    const matchingProvinceCodes = uniqueValues(matchingSubdistricts.map((subdistrict) => subdistrict.provinceCode))
    const matchingDistrictCodes = uniqueValues(matchingSubdistricts.map((subdistrict) => subdistrict.districtCode))
    const nextProvince = matchingProvinceCodes.length === 1 ? provinces.find((province) => province.code === matchingProvinceCodes[0])?.nameTh ?? null : null
    const nextDistrict = matchingDistrictCodes.length === 1 ? districts.find((district) => district.code === matchingDistrictCodes[0])?.nameTh ?? null : null
    const nextSubdistrict = matchingSubdistricts.length === 1 ? matchingSubdistricts[0]?.nameTh ?? null : null

    setForm((current) => ({
      ...current,
      addressPostalCode: nextPostalCode || null,
      addressProvince: nextProvince,
      addressDistrict: nextDistrict,
      addressSubdistrict: nextSubdistrict,
      addressCountry: nextPostalCode.length === 5 ? 'ไทย' : current.addressCountry,
      countryCode: nextPostalCode.length === 5 ? 'TH' : current.countryCode,
    }))
  }

  function updateSupplierType(value: SupplierFormState['type']) {
    setForm((current) => ({
      ...current,
      type: value,
      name: value === 'บุคคล' ? null : current.name,
      nameTitle: value === 'บุคคล' ? current.nameTitle : null,
      firstName: value === 'บุคคล' ? current.firstName : null,
      lastName: value === 'บุคคล' ? current.lastName : null,
    }))
  }

  function updateMarketScope(value: SupplierFormValues['marketScope'] | '') {
    setForm((current) => ({
      ...current,
      marketScope: value,
      countryCode: value === 'ในประเทศ' ? 'TH' : value === 'ต่างประเทศ' ? null : current.countryCode,
      addressCountry: value === 'ในประเทศ' ? 'ไทย' : value === 'ต่างประเทศ' ? (current.addressCountry === 'ไทย' ? null : current.addressCountry) : current.addressCountry,
      addressLine1: value === 'ในประเทศ' ? current.addressLine1 : current.addressLine1 ?? current.address,
      addressLine2: value === 'ในประเทศ' ? current.addressLine2 : current.addressLine2,
      addressCity: value === 'ในประเทศ' ? current.addressCity : current.addressCity,
      addressStateRegion: value === 'ในประเทศ' ? current.addressStateRegion : current.addressStateRegion,
      addressPostalCodeIntl: value === 'ในประเทศ' ? current.addressPostalCodeIntl : current.addressPostalCodeIntl,
      addressPostalCode: value === 'ต่างประเทศ' ? null : current.addressPostalCode,
      addressProvince: value === 'ต่างประเทศ' ? null : current.addressProvince,
      addressDistrict: value === 'ต่างประเทศ' ? null : current.addressDistrict,
      addressSubdistrict: value === 'ต่างประเทศ' ? null : current.addressSubdistrict,
    }))
  }

  function updateSalesperson(salesId: string) {
    const salesperson = salespersons.find((item) => item.id === salesId)
    setForm((current) => ({
      ...current,
      salesId: salesperson?.id ?? null,
      salesName: salesperson?.name ?? null,
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = supplierFormSchema.safeParse(form)
    if (form.branchIds.length === 0) {
      setErrors({ branchIds: 'เลือกสาขาที่ใช้ได้อย่างน้อย 1 สาขา' })
      return
    }
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])))
      return
    }

    const bankAccountIssues = supplierBankAccountValidationIssues(parsed.data, paymentMethods)
    if (bankAccountIssues.length > 0) {
      setErrors(Object.fromEntries(bankAccountIssues.map((issue) => [issue.path.join('.'), issue.message])))
      return
    }

    setErrors({})
    await onSubmit(parsed.data)
  }

  return (
    <form className="overflow-hidden rounded-md bg-slate-900 dark:bg-[#0f172a] shadow-xl flex flex-col w-full max-h-[90vh]" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 bg-slate-900 dark:bg-[#0f172a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <h3 className="text-lg font-bold text-white">{form.id ? 'แก้ไขผู้ขาย' : 'เพิ่มผู้ขาย'}</h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ActiveToggle checked={form.active} labelClassName="text-sm font-medium text-slate-200 dark:text-slate-800" onChange={(checked) => update('active', checked)} />
          <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white transition-colors hover:border-rose-700 hover:bg-rose-700 focus:outline-none" type="button" onClick={onCancel}>
            ยกเลิก
          </button>
          <button className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 focus:outline-none" disabled={isSaving} type="submit">
            {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 px-5 py-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ข้อมูลผู้ขาย</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField required error={errors.type} label="ประเภทผู้ขาย" value={form.type} onChange={(value) => updateSupplierType(value as SupplierFormValues['type'])}>
              <option value="บุคคล">บุคคล</option>
              <option value="นิติบุคคล">นิติบุคคล</option>
            </SelectField>
            {form.type === 'บุคคล' ? (
              <>
                <SelectField required error={errors.nameTitle} label="คำนำหน้าชื่อ" placeholder="เลือกคำนำหน้า" value={form.nameTitle ?? ''} onChange={(value) => update('nameTitle', value || null)}>
                  {personTitleOptions.map((title) => <option key={title} value={title}>{title}</option>)}
                </SelectField>
                <TextField required error={errors.firstName} label="ชื่อ" value={form.firstName ?? ''} onChange={(value) => update('firstName', value || null)} />
                <TextField required error={errors.lastName} label="นามสกุล" value={form.lastName ?? ''} onChange={(value) => update('lastName', value || null)} />
              </>
            ) : (
              <TextField required className="md:col-span-2" error={errors.name} label="ชื่อบริษัท/ร้านค้า" value={form.name ?? ''} onChange={(value) => update('name', value || null)} />
            )}
            <TextField error={errors.taxId} label="เลขผู้เสียภาษี" value={form.taxId ?? ''} onChange={(value) => update('taxId', value || null)} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                โทรศัพท์
              </span>
              <PhoneInput className="w-full" error={Boolean(errors.phone)} value={form.phone ?? ''} onChange={(value) => update('phone', value)} />
              {errors.phone ? <span className="mt-1 block text-xs text-red-700">{errors.phone}</span> : null}
            </label>
            <SelectField required error={errors.salesId} label="ผู้ดูแล" placeholder="เลือกผู้ดูแล" value={form.salesId ?? ''} onChange={updateSalesperson}>
              {salespersons.map((salesperson) => <option key={salesperson.id} value={salesperson.id}>{salesperson.name}</option>)}
            </SelectField>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">สาขาที่ใช้ได้</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {branches.map((branch) => {
              const checked = form.branchIds.includes(branch.id)
              return (
                <label key={branch.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${checked ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-800">{branch.name}</span>
                    <span className="block truncate font-mono text-xs text-slate-500">{branch.code ?? branch.id}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <input
                      checked={form.primaryBranchId === branch.id}
                      className="h-4 w-4"
                      disabled={!checked}
                      name="supplier-primary-branch"
                      type="radio"
                      onChange={() => setForm((current) => ({ ...current, branchId: branch.id, primaryBranchId: branch.id }))}
                    />
                    <input
                      checked={checked}
                      className="h-4 w-4"
                      type="checkbox"
                      onChange={(event) => updateBranchSelection(branch.id, event.target.checked)}
                    />
                  </span>
                </label>
              )
            })}
          </div>
          <div className="mt-2 text-xs text-slate-500">สาขานี้คือสิทธิ์ใช้งานผู้ขายกับเอกสาร ไม่ใช่รหัสสาขาบัญชีธนาคาร</div>
          {errors.branchIds ? <span className="mt-1 block text-xs text-red-700">{errors.branchIds}</span> : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ที่อยู่</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField required className="md:col-span-2" error={errors.marketScope} label="ประเทศ/ตลาด" placeholder="เลือกประเทศ/ตลาด" value={form.marketScope} onChange={(value) => updateMarketScope(value as SupplierFormValues['marketScope'] | '')}>
              <option value="ในประเทศ">ในประเทศ</option>
              <option value="ต่างประเทศ">ต่างประเทศ</option>
            </SelectField>
            {form.marketScope === 'ในประเทศ' ? (
              <>
                <TextField error={errors.addressPostalCode} label="รหัสไปรษณีย์" value={form.addressPostalCode ?? ''} onChange={updatePostalCode} />
                <SelectField error={errors.addressProvince} label="จังหวัด" placeholder="เลือกจังหวัด" value={form.addressProvince ?? ''} onChange={(value) => {
                  setForm((current) => ({ ...current, addressProvince: value || null, addressDistrict: null, addressSubdistrict: null, addressCountry: value ? 'ไทย' : current.addressCountry, countryCode: value ? 'TH' : current.countryCode }))
                }}>
                  {provinceOptions.map((province) => <option key={province.code} value={province.nameTh}>{province.nameTh}</option>)}
                </SelectField>
                <SelectField disabled={!selectedProvince && filteredDistricts.length === 0} error={errors.addressDistrict} label="อำเภอ/เขต" placeholder="เลือกอำเภอ/เขต" value={form.addressDistrict ?? ''} onChange={(value) => {
                  setForm((current) => ({ ...current, addressDistrict: value || null, addressSubdistrict: null }))
                }}>
                  {filteredDistricts.map((district) => <option key={district.code} value={district.nameTh}>{district.nameTh}</option>)}
                </SelectField>
                <SelectField disabled={filteredSubdistricts.length === 0} error={errors.addressSubdistrict} label="ตำบล/แขวง" placeholder="เลือกตำบล/แขวง" value={form.addressSubdistrict ?? ''} onChange={(value) => {
                  const subdistrict = filteredSubdistricts.find((item) => item.nameTh === value)
                  const province = subdistrict ? provinces.find((item) => item.code === subdistrict.provinceCode) : null
                  const district = subdistrict ? districts.find((item) => item.code === subdistrict.districtCode) : null
                  setForm((current) => ({
                    ...current,
                    addressPostalCode: subdistrict?.postalCode ?? current.addressPostalCode,
                    addressProvince: province?.nameTh ?? current.addressProvince,
                    addressDistrict: district?.nameTh ?? current.addressDistrict,
                    addressSubdistrict: value || null,
                    addressCountry: value ? 'ไทย' : current.addressCountry,
                    countryCode: value ? 'TH' : current.countryCode,
                  }))
                }}>
                  {filteredSubdistricts.map((subdistrict) => <option key={subdistrict.code} value={subdistrict.nameTh}>{subdistrict.nameTh}</option>)}
                </SelectField>
                <TextField error={errors.addressNo} label="บ้านเลขที่" value={form.addressNo ?? ''} onChange={(value) => update('addressNo', value || null)} />
                <TextField error={errors.addressMoo} label="หมู่" value={form.addressMoo ?? ''} onChange={(value) => update('addressMoo', value || null)} />
                <TextField className="md:col-span-2" error={errors.addressVillage} label="หมู่บ้าน/อาคาร" value={form.addressVillage ?? ''} onChange={(value) => update('addressVillage', value || null)} />
                <TextField className="md:col-span-2" error={errors.addressRoad} label="ถนน" value={form.addressRoad ?? ''} onChange={(value) => update('addressRoad', value || null)} />
              </>
            ) : (
              <>
                <TextField required error={errors.addressCountry} label="ประเทศ" value={form.addressCountry ?? ''} onChange={(value) => update('addressCountry', value || null)} />
                <TextField required className="md:col-span-2" error={errors.addressLine1} label="ที่อยู่บรรทัด 1" value={form.addressLine1 ?? ''} onChange={(value) => update('addressLine1', value || null)} />
                <TextField className="md:col-span-2" error={errors.addressLine2} label="ที่อยู่บรรทัด 2" value={form.addressLine2 ?? ''} onChange={(value) => update('addressLine2', value || null)} />
                <TextField required error={errors.addressCity} label="เมือง" value={form.addressCity ?? ''} onChange={(value) => update('addressCity', value || null)} />
                <TextField error={errors.addressStateRegion} label="รัฐ/จังหวัด/ภูมิภาค" value={form.addressStateRegion ?? ''} onChange={(value) => update('addressStateRegion', value || null)} />
                <TextField error={errors.addressPostalCodeIntl} label="รหัสไปรษณีย์สากล" value={form.addressPostalCodeIntl ?? ''} onChange={(value) => update('addressPostalCodeIntl', value || null)} />
              </>
            )}
            <TextField className="md:col-span-4" error={errors.address} label="ที่อยู่เต็ม/หมายเหตุที่อยู่" value={form.address ?? ''} onChange={(value) => update('address', value || null)} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <h4 className="text-sm font-bold text-slate-800">ข้อมูลบัญชีและสาขา</h4>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={addBankAccount}>
              + เพิ่มบัญชี
            </button>
          </div>
          <div className="space-y-3">
            {form.bankAccounts.map((account, index) => {
              const isBankMethod = supplierPaymentMethodGroup(account.paymentMethod, paymentMethods) === 'bank'
              return (
                <div key={`${account.id ?? 'new'}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-4 md:grid-cols-5">
                    <SelectField required error={errors[`bankAccounts.${index}.paymentMethod`]} label="วิธีจ่าย/รับเงิน" placeholder="เลือกวิธีจ่าย/รับเงิน" value={account.paymentMethod} onChange={(value) => updateBankAccount(index, 'paymentMethod', value as SupplierBankAccountForm['paymentMethod'])}>
                      {paymentMethodOptions.map((paymentMethod) => <option key={paymentMethod.value} value={paymentMethod.value}>{paymentMethod.label}</option>)}
                    </SelectField>
                    {isBankMethod ? (
                      <>
                        <SelectField required error={errors[`bankAccounts.${index}.bankName`]} label="ธนาคารรับเงิน" placeholder="เลือกธนาคาร" value={account.bankName ?? ''} onChange={(value) => updateBankAccount(index, 'bankName', value || null)}>
                          {bankNameOptions.map((bankName) => <option key={bankName} value={bankName}>{bankName}</option>)}
                        </SelectField>
                        <TextField required error={errors[`bankAccounts.${index}.accountNo`]} label="เลขที่บัญชีรับเงิน" value={account.accountNo ?? ''} onChange={(value) => updateBankAccount(index, 'accountNo', value || null)} />
                        <TextField error={errors[`bankAccounts.${index}.bankAccount`]} label="ชื่อบัญชีรับเงิน" value={account.bankAccount ?? ''} onChange={(value) => updateBankAccount(index, 'bankAccount', value || null)} />
                        <TextField error={errors[`bankAccounts.${index}.branchCode`]} label="รหัสสาขา" value={account.branchCode ?? ''} onChange={(value) => updateBankAccount(index, 'branchCode', value || null)} />
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {form.bankAccounts.length > 1 ? (
                      <button className="text-xs font-semibold text-red-700 hover:text-red-900" type="button" onClick={() => removeBankAccount(index)}>
                        ลบบัญชี
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
            {errors.bankAccounts ? <div className="text-xs text-red-700">{errors.bankAccounts}</div> : null}
          </div>
        </section>
      </div>

    </form>
  )
}

type TextFieldProps = {
  className?: string
  error?: string
  label: string
  readOnly?: boolean
  required?: boolean
  type?: string
  value: string | number
  onChange: (value: string) => void
}

function TextField({ className = '', error, label, readOnly = false, required = false, type = 'text', value, onChange }: TextFieldProps) {
  const isEmailField = type === 'email'
  const isPhoneField = label === 'โทรศัพท์'
  const isAccountNoField = label === 'เลขบัญชี' || label === 'เลขที่บัญชีรับเงิน'
  const isTaxIdField = label === 'เลขผู้เสียภาษี'
  const isThaiPostalCodeField = label === 'รหัสไปรษณีย์'
  const isNumberField = type === 'number'
  const placeholder = isEmailField ? 'example@company.com' : `กรอก${label}`

  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}{required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <input
        className={`w-full h-10 rounded-md border px-3 py-2 text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isNumberField ? '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' : ''} ${readOnly ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400'} ${error ? 'border-red-400 bg-red-50/50' : ''}`}
        inputMode={isEmailField ? 'email' : isPhoneField ? 'tel' : isAccountNoField || isTaxIdField || isThaiPostalCodeField ? 'numeric' : undefined}
        placeholder={readOnly ? undefined : placeholder}
        readOnly={readOnly}
        required={required}
        type={type}
        value={value}
        onChange={(event) => {
          const nextValue = isEmailField
            ? event.target.value.replace(/[^\x20-\x7E]/g, '')
            : isPhoneField
              ? sanitizePhoneInput(event.target.value)
              : isAccountNoField
                ? sanitizeAccountNoInput(event.target.value)
                : isTaxIdField
                  ? event.target.value.replace(/\D/g, '').slice(0, 13)
                  : isThaiPostalCodeField
                    ? event.target.value.replace(/\D/g, '').slice(0, 5)
                    : event.target.value
          onChange(nextValue)
        }}
      />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}

type SelectFieldProps = {
  children: React.ReactNode
  className?: string
  disabled?: boolean
  error?: string
  label: string
  placeholder?: string
  required?: boolean
  value: string
  onChange: (value: string) => void
}

function SelectField({ children, className = '', disabled = false, error, label, placeholder, required = false, value, onChange }: SelectFieldProps) {
  return <FormSelectField className={className} disabled={disabled} error={error} label={label} placeholder={placeholder} required={required} value={value} onChange={onChange}>{children}</FormSelectField>
}

function MatchButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const className = active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${className}`} type="button" onClick={onClick}>{label}</button>
}
