'use client'

import { Download, Plus, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CUSTOMER_LEGAL_ENTITY_TYPES,
  customerFormSchema,
  exportCustomers,
  importCustomers,
  listCustomers,
  saveCustomer,
  setCustomerActive,
  type Customer,
  type CustomerFormValues,
} from '@/lib/customer'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { FormSelectField } from '@/components/ui/FormSelectField'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { getErrorMessage } from '@/lib/api-client'
import { formatPhoneDisplay, sanitizePhoneInput } from '@/lib/format'
import { listMasterDataRecords, type MasterDataRecord } from '@/lib/master-data'
import { listThaiDistricts, listThaiProvinces, listThaiSubdistricts, type ThaiDistrict, type ThaiProvince, type ThaiSubdistrict } from '@/lib/thai-address'

type SortKey = 'code' | 'name' | 'taxId' | 'type' | 'legalEntityType' | 'marketScope' | 'phone' | 'email' | 'creditTerm' | 'creditLimit' | 'active'
type CustomerColumnKey = SortKey | 'action' | 'address' | 'branches'

const customerColumns: Array<ResizableColumnDefinition<CustomerColumnKey>> = [
  { key: 'code', defaultWidth: 100, minWidth: 80 },
  { key: 'name', defaultWidth: 260, minWidth: 180 },
  { key: 'taxId', defaultWidth: 150, minWidth: 125 },
  { key: 'type', defaultWidth: 110, minWidth: 90 },
  { key: 'legalEntityType', defaultWidth: 160, minWidth: 135 },
  { key: 'branches', defaultWidth: 180, minWidth: 130 },
  { key: 'marketScope', defaultWidth: 135, minWidth: 115 },
  { key: 'phone', defaultWidth: 135, minWidth: 110 },
  { key: 'email', defaultWidth: 180, minWidth: 130 },
  { key: 'address', defaultWidth: 260, minWidth: 180 },
  { key: 'creditTerm', defaultWidth: 115, minWidth: 100 },
  { key: 'creditLimit', defaultWidth: 145, minWidth: 125 },
  { key: 'active', defaultWidth: 110, minWidth: 90 },
  { key: 'action', defaultWidth: 110, minWidth: 90 },
]


const emptyCustomerForm: CustomerFormValues = {
  id: undefined,
  code: null,
  name: '',
  nameTitle: null,
  firstName: null,
  lastName: null,
  type: 'นิติบุคคล',
  legalEntityType: null,
  taxId: null,
  phone: '',
  email: null,
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
  creditTerm: null,
  creditLimit: null,
  branchIds: [],
  primaryBranchId: null,
  marketScope: 'ในประเทศ',
  salesId: null,
  active: true,
}

type CustomerFormState = Omit<CustomerFormValues, 'marketScope'> & {
  marketScope: CustomerFormValues['marketScope'] | ''
}

const personTitleOptions = ['นาย', 'นาง', 'นางสาว', 'คุณ']

function customerToForm(customer: Customer): CustomerFormValues {
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    nameTitle: customer.nameTitle,
    firstName: customer.firstName,
    lastName: customer.lastName,
    type: customer.type,
    legalEntityType: customer.legalEntityType,
    taxId: customer.taxId,
    phone: formatPhoneDisplay(customer.phone) ?? '',
    email: customer.email,
    address: customer.address,
    addressNo: customer.addressNo,
    addressMoo: customer.addressMoo,
    addressVillage: customer.addressVillage,
    addressRoad: customer.addressRoad,
    addressSubdistrict: customer.addressSubdistrict,
    addressDistrict: customer.addressDistrict,
    addressProvince: customer.addressProvince,
    addressPostalCode: customer.addressPostalCode,
    addressCountry: customer.addressCountry ?? 'ไทย',
    countryCode: customer.countryCode ?? (customer.marketScope === 'ต่างประเทศ' ? null : 'TH'),
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    addressCity: customer.addressCity,
    addressStateRegion: customer.addressStateRegion,
    addressPostalCodeIntl: customer.addressPostalCodeIntl,
    creditTerm: customer.creditTerm,
    creditLimit: customer.creditLimit,
    branchIds: customer.branchIds,
    primaryBranchId: customer.primaryBranchId,
    marketScope: customer.marketScope,
    salesId: customer.salesId,
    active: customer.active,
  }
}

function displayValue(value: string | number | null) {
  return value === null || value === '' ? '-' : value
}

function formatMoney(value: number | null) {
  if (value === null) return '-'
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values))
}

function legalEntityTypeFromOption(value: string): CustomerFormValues['legalEntityType'] {
  return CUSTOMER_LEGAL_ENTITY_TYPES.find((type) => type === value) ?? null
}

function compareCustomers(left: Customer, right: Customer, key: SortKey, direction: 'asc' | 'desc') {
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

export function CustomersPageClient() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [districts, setDistricts] = useState<ThaiDistrict[]>([])
  const [branches, setBranches] = useState<MasterDataRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set())
  const [customerTypeFilter, setCustomerTypeFilter] = useState('')
  const [marketScopeFilter, setMarketScopeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [provinces, setProvinces] = useState<ThaiProvince[]>([])
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [subdistricts, setSubdistricts] = useState<ThaiSubdistrict[]>([])
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('master-data.customers.v6', customerColumns)


  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const result = await listCustomers({
        all: true,
      })
      setCustomers(result.rows)
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลลูกค้าไม่ได้'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const filteredSortedCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = customers.filter((customer) => {
      if (customerTypeFilter && customer.type !== customerTypeFilter) return false
      if (marketScopeFilter && customer.marketScope !== marketScopeFilter) return false
      if (!query) return true

      return Object.values(customer).some((value) => String(value ?? '').toLowerCase().includes(query))
    })

    return [...rows].sort((left, right) => compareCustomers(left, right, sortKey, sortDirection))
  }, [customerTypeFilter, customers, marketScopeFilter, search, sortDirection, sortKey])

  const total = filteredSortedCustomers.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedCustomers = filteredSortedCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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

  async function loadBranches() {
    if (branches.length) return
    const rows = await listMasterDataRecords('/api/master-data/branches')
    setBranches(rows.filter((branch) => branch.active))
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function openCreateForm() {
    setSelectedCustomer(null)
    try {
      await Promise.all([loadAddressData(), loadBranches()])
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลที่อยู่ไทยไม่ได้'))
      return
    }
    setFormOpen(true)
  }

  async function openEditForm(customer: Customer) {
    setSelectedCustomer(customer)
    try {
      await Promise.all([loadAddressData(), loadBranches()])
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลที่อยู่ไทยไม่ได้'))
      return
    }
    setFormOpen(true)
  }

  async function handleSubmit(values: CustomerFormValues) {
    setIsSaving(true)
    setError(null)
    try {
      await saveCustomer(values)
      setFormOpen(false)
      setSelectedCustomer(null)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกข้อมูลลูกค้าไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(customer: Customer, active: boolean) {
    setError(null)
    setPendingToggleIds((current) => new Set(current).add(customer.id))
    setCustomers((current) => current.map((row) => row.id === customer.id ? { ...row, active } : row))
    setSelectedCustomer((current) => current?.id === customer.id ? { ...current, active } : current)

    try {
      const updatedCustomer = await setCustomerActive(customer.id, active)
      setCustomers((current) => current.map((row) => row.id === updatedCustomer.id ? updatedCustomer : row))
      setSelectedCustomer((current) => current?.id === updatedCustomer.id ? updatedCustomer : current)
    } catch (caught) {
      setCustomers((current) => current.map((row) => row.id === customer.id ? { ...row, active: customer.active } : row))
      setSelectedCustomer((current) => current?.id === customer.id ? { ...current, active: customer.active } : current)
      setError(getErrorMessage(caught, 'อัปเดตสถานะลูกค้าไม่ได้'))
    } finally {
      setPendingToggleIds((current) => {
        const next = new Set(current)
        next.delete(customer.id)
        return next
      })
    }
  }

  async function handleExport() {
    setError(null)
    setIsExporting(true)
    try {
      const { blob, filename } = await exportCustomers({
        customerType: customerTypeFilter,
        direction: sortDirection,
        marketScope: marketScopeFilter,
        q: search,
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
      const result = await importCustomers(file)
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

  const hasFilters = Boolean(search.trim() || customerTypeFilter || marketScopeFilter)

  const resetFilters = useCallback(() => {
    setSearch('')
    setCustomerTypeFilter('')
    setMarketScopeFilter('')
    setPage(1)
  }, [])

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลลูกค้าไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block mb-4 space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm h-9"
            placeholder="ค้นหา..."
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          {hasFilters ? (
            <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200 h-9" type="button" onClick={resetFilters}>
              ✕ ล้าง
            </button>
          ) : null}

        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-50 pt-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">ประเภทลูกค้า:</span>
            <MatchButton active={customerTypeFilter === ''} label="ทั้งหมด" onClick={() => setCustomerTypeFilter('')} />
            <MatchButton active={customerTypeFilter === 'บุคคล'} label="บุคคล" tone="emerald" onClick={() => setCustomerTypeFilter('บุคคล')} />
            <MatchButton active={customerTypeFilter === 'นิติบุคคล'} label="นิติบุคคล" tone="slate" onClick={() => setCustomerTypeFilter('นิติบุคคล')} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">ประเทศ/ตลาด:</span>
            <MatchButton active={marketScopeFilter === ''} label="ทั้งหมด" onClick={() => setMarketScopeFilter('')} />
            <MatchButton active={marketScopeFilter === 'ในประเทศ'} label="ในประเทศ" tone="emerald" onClick={() => setMarketScopeFilter('ในประเทศ')} />
            <MatchButton active={marketScopeFilter === 'ต่างประเทศ'} label="ต่างประเทศ" tone="slate" onClick={() => setMarketScopeFilter('ต่างประเทศ')} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 ${isImporting || isLoading ? 'pointer-events-none opacity-60' : ''}`}>
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
            <button className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" disabled={isExporting || isLoading} type="button" onClick={() => void handleExport()}>
              <Download aria-hidden="true" className="h-4 w-4" />
              <span className="text-xs sm:text-sm">{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</span>
            </button>
            <button className="inline-flex h-9 items-center gap-1 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60" type="button" onClick={() => void openCreateForm()}>
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
            className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm h-9"
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
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {hasFilters ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform"
          onClick={() => void openCreateForm()}
          type="button"
          aria-label="เพิ่มรายการลูกค้า"
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
            </>
          )}
        >
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">ประเภทลูกค้า</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={customerTypeFilter === ''} label="ทั้งหมด" onClick={() => setCustomerTypeFilter('')} />
                  <MatchButton active={customerTypeFilter === 'บุคคล'} label="บุคคล" tone="emerald" onClick={() => setCustomerTypeFilter('บุคคล')} />
                  <MatchButton active={customerTypeFilter === 'นิติบุคคล'} label="นิติบุคคล" tone="slate" onClick={() => setCustomerTypeFilter('นิติบุคคล')} />
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">ประเทศ/ตลาด</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={marketScopeFilter === ''} label="ทั้งหมด" onClick={() => setMarketScopeFilter('')} />
                  <MatchButton active={marketScopeFilter === 'ในประเทศ'} label="ในประเทศ" tone="emerald" onClick={() => setMarketScopeFilter('ในประเทศ')} />
                  <MatchButton active={marketScopeFilter === 'ต่างประเทศ'} label="ต่างประเทศ" tone="slate" onClick={() => setMarketScopeFilter('ต่างประเทศ')} />
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
            <select
              aria-label="จำนวนรายการต่อหน้า"
              className="h-9 rounded-md border border-slate-300 px-2 py-1 text-sm bg-white"
              value={pageSize}
              onChange={(event) => {
                setPage(1)
                setPageSize(Number(event.target.value))
              }}
            >
              <option value={10}>10 / หน้า</option>
              <option value={25}>25 / หน้า</option>
              <option value={50}>50 / หน้า</option>
              <option value={100}>100 / หน้า</option>
            </select>
            <Button
              disabled={page <= 1 || isLoading}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                setPage(Math.max(1, page - 1))
              }}
            >
              ก่อนหน้า
            </Button>
            <span className="px-1 text-xs">
              หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
            </span>
            <Button
              disabled={page >= totalPages || isLoading}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                setPage(Math.min(totalPages, currentPage + 1))
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormOpen(false); setSelectedCustomer(null); } }}>
        <DialogContent className="max-w-5xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" hideClose>
          <CustomerForm
            customer={selectedCustomer}
            districts={districts}
            isSaving={isSaving}
            provinces={provinces}
            subdistricts={subdistricts}
            branches={branches}
            onCancel={() => {
              setFormOpen(false)
              setSelectedCustomer(null)
            }}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>

      {isLoading ? <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูลลูกค้า</div> : null}

      {!isLoading ? (
        <>
          {/* Desktop Table View */}
          <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm hidden lg:block">
            <div className="overflow-x-auto">
              <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {customerColumns.map((column) => (
                    <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <TableHeader>
                  <tr>
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="รหัส" resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')} sortKey="code" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ชื่อบริษัท" resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อบริษัท')} sortKey="name" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขผู้เสียภาษี" resizeProps={columnResize.getResizeHandleProps('taxId', 'เลขผู้เสียภาษี')} sortKey="taxId" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} sortKey="type" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="รูปแบบบริษัท" resizeProps={columnResize.getResizeHandleProps('legalEntityType', 'รูปแบบบริษัท')} sortKey="legalEntityType" onSort={setSort} />
                    <ResizableTableHead direction={sortDirection} label="สาขาที่ใช้ได้" resizeProps={columnResize.getResizeHandleProps('branches', 'สาขาที่ใช้ได้')} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ประเทศ/ตลาด" resizeProps={columnResize.getResizeHandleProps('marketScope', 'ประเทศ/ตลาด')} sortKey="marketScope" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="โทร" resizeProps={columnResize.getResizeHandleProps('phone', 'โทร')} sortKey="phone" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="อีเมล" resizeProps={columnResize.getResizeHandleProps('email', 'อีเมล')} sortKey="email" onSort={setSort} />
                    <ResizableTableHead direction={sortDirection} label="ที่อยู่" resizeProps={columnResize.getResizeHandleProps('address', 'ที่อยู่')} />
                    <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="Term (วัน)" resizeProps={columnResize.getResizeHandleProps('creditTerm', 'Term (วัน)')} sortKey="creditTerm" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="วงเงินเครดิต" resizeProps={columnResize.getResizeHandleProps('creditLimit', 'วงเงินเครดิต')} sortKey="creditLimit" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={setSort} />
                    <ResizableTableHead align="center" label="แก้ไข" resizeProps={columnResize.getResizeHandleProps('action', 'แก้ไข')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {paginatedCustomers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer border-slate-100 hover:bg-slate-50"
                      role="button"
                      tabIndex={0}
                      onClick={() => void openEditForm(customer)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          void openEditForm(customer)
                        }
                      }}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-slate-700">{customer.code}</TableCell>
                      <TableCell className="truncate text-xs font-semibold text-slate-800" title={customer.name}>{customer.name}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-slate-700">{displayValue(customer.taxId)}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{displayValue(customer.type)}</TableCell>
                      <TableCell className="truncate text-xs font-semibold text-slate-700" title={customer.legalEntityType ?? undefined}>{customer.type === 'นิติบุคคล' ? displayValue(customer.legalEntityType) : '-'}</TableCell>
                      <TableCell className="truncate text-xs font-semibold text-slate-700" title={customer.branchNames.join(', ') || undefined}>
                        {customer.branchNames.length ? customer.branchNames.join(', ') : <span className="text-amber-700">ยังไม่กำหนด</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-700">{customer.marketScope}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-700">{displayValue(formatPhoneDisplay(customer.phone))}</TableCell>
                      <TableCell className="truncate text-xs font-semibold text-slate-700" title={customer.email ?? undefined}>{displayValue(customer.email)}</TableCell>
                      <TableCell className="truncate text-xs font-semibold text-slate-700" title={customer.address ?? undefined}>{displayValue(customer.address)}</TableCell>
                      <TableCell className="text-right pr-4 font-mono tabular-nums whitespace-nowrap text-xs font-semibold text-slate-700">{customer.creditTerm ?? '-'}</TableCell>
                      <TableCell className="text-right pr-4 font-mono tabular-nums whitespace-nowrap text-xs font-semibold text-slate-700">{formatMoney(customer.creditLimit)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-slate-700">
                        <ActiveToggle
                          checked={customer.active}
                          disabled={pendingToggleIds.has(customer.id)}
                          label={customer.active ? 'ใช้งาน' : 'ปิด'}
                          onChange={(checked) => void handleToggleActive(customer, checked)}
                        />
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold text-slate-700">
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void openEditForm(customer)
                          }}
                        >
                          แก้ไข
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell className="p-4 text-center text-sm text-slate-500" colSpan={14}>ไม่พบข้อมูลที่ค้นหา</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="block lg:hidden space-y-3">
            {paginatedCustomers.map((customer) => (
              <div
                key={customer.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-colors"
                onClick={() => void openEditForm(customer)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {customer.code}
                    </span>
                    <h4 className="font-bold text-slate-900 mt-1.5 text-[15px]">
                      {customer.name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <ActiveToggle
                      checked={customer.active}
                      disabled={pendingToggleIds.has(customer.id)}
                      label={customer.active ? 'ใช้งาน' : 'ปิด'}
                      onChange={(checked) => void handleToggleActive(customer, checked)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-slate-100 pt-2.5 mt-2.5 text-xs text-slate-600">
                  <div>
                    <span className="block text-slate-400 font-medium">ประเภท</span>
                    <span className="font-semibold text-slate-700">{displayValue(customer.type)}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-medium">ประเทศ/ตลาด</span>
                    <span className="font-semibold text-slate-700">{customer.marketScope}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-slate-400 font-medium">สาขาที่ใช้ได้</span>
                    <span className={customer.branchNames.length ? 'font-semibold text-slate-700' : 'font-semibold text-amber-700'}>
                      {customer.branchNames.length ? customer.branchNames.join(', ') : 'ยังไม่กำหนด'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-medium">รูปแบบบริษัท</span>
                    <span className="font-semibold text-slate-700">{customer.type === 'นิติบุคคล' ? displayValue(customer.legalEntityType) : '-'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-medium">โทรศัพท์</span>
                    <span className="font-semibold text-slate-700">{displayValue(formatPhoneDisplay(customer.phone))}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-slate-400 font-medium">วงเงินเครดิต</span>
                    <span className="font-semibold text-slate-700">{formatMoney(customer.creditLimit)} (เทอม {customer.creditTerm ?? '-'} วัน)</span>
                  </div>
                  {customer.address ? (
                    <div className="col-span-2 border-t border-slate-50 pt-2 mt-1">
                      <span className="block text-slate-400 font-medium">ที่อยู่</span>
                      <span className="font-medium text-slate-700 line-clamp-2">{customer.address}</span>
                    </div>
                  ) : null}
                </div>

              </div>
            ))}
            {paginatedCustomers.length === 0 ? (
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

type CustomerFormProps = {
  branches: MasterDataRecord[]
  customer: Customer | null
  districts: ThaiDistrict[]
  isSaving: boolean
  provinces: ThaiProvince[]
  subdistricts: ThaiSubdistrict[]
  onCancel: () => void
  onSubmit: (values: CustomerFormValues) => Promise<void>
}

function CustomerForm({ customer, districts, isSaving, provinces, subdistricts, branches, onCancel, onSubmit }: CustomerFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<CustomerFormState>(() => (customer ? customerToForm(customer) : emptyCustomerForm))

  useEffect(() => {
    setForm(customer ? customerToForm(customer) : emptyCustomerForm)
    setErrors({})
  }, [customer])

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

  function update<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
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
      return { ...current, branchIds, primaryBranchId }
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

  function updateCustomerType(value: CustomerFormState['type']) {
    setForm((current) => ({
      ...current,
      type: value,
      name: value === 'บุคคล' ? null : current.name,
      legalEntityType: value === 'บุคคล' ? null : current.legalEntityType,
      nameTitle: value === 'บุคคล' ? current.nameTitle : null,
      firstName: value === 'บุคคล' ? current.firstName : null,
      lastName: value === 'บุคคล' ? current.lastName : null,
    }))
  }

  function updateMarketScope(value: CustomerFormValues['marketScope'] | '') {
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = customerFormSchema.safeParse(form)
    if (form.branchIds.length === 0) {
      setErrors({ branchIds: 'เลือกสาขาที่ใช้ได้อย่างน้อย 1 สาขา' })
      return
    }
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])))
      return
    }

    setErrors({})
    await onSubmit(parsed.data)
  }

  return (
    <form className="overflow-hidden rounded-md bg-slate-900 dark:bg-[#0f172a] shadow-xl flex flex-col w-full max-h-[90vh]" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 bg-slate-900 dark:bg-[#0f172a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <h3 className="text-lg font-bold text-white">{form.id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</h3>
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
          <h4 className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ข้อมูลลูกค้า</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField required error={errors.type} label="ประเภทลูกค้า" value={form.type} onChange={(value) => updateCustomerType(value as CustomerFormValues['type'])}>
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
              <>
                <TextField required className="md:col-span-2" error={errors.name} label="ชื่อบริษัท" value={form.name ?? ''} onChange={(value) => update('name', value || null)} />
                <SelectField error={errors.legalEntityType} label="รูปแบบบริษัท" placeholder="เลือกรูปแบบบริษัท" value={form.legalEntityType ?? ''} onChange={(value) => update('legalEntityType', legalEntityTypeFromOption(value))}>
                  {CUSTOMER_LEGAL_ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </SelectField>
              </>
            )}
            <TextField error={errors.taxId} label="เลขผู้เสียภาษี" value={form.taxId ?? ''} onChange={(value) => update('taxId', value || null)} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                โทรศัพท์
              </span>
              <PhoneInput className="w-full" error={Boolean(errors.phone)} value={form.phone ?? ''} onChange={(value) => update('phone', value || null)} />
              {errors.phone ? <span className="mt-1 block text-xs text-red-700">{errors.phone}</span> : null}
            </label>
            <TextField error={errors.email} label="อีเมล" type="email" value={form.email ?? ''} onChange={(value) => update('email', value || null)} />
            <TextField error={errors.creditTerm} label="เครดิตเทอม (วัน)" type="number" value={form.creditTerm ?? ''} onChange={(value) => update('creditTerm', value === '' ? null : Number(value))} />
            <TextField error={errors.creditLimit} label="วงเงินเครดิต" type="number" value={form.creditLimit ?? ''} onChange={(value) => update('creditLimit', value === '' ? null : Number(value))} />
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
                      name="customer-primary-branch"
                      type="radio"
                      onChange={() => update('primaryBranchId', branch.id)}
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
          <div className="mt-2 text-xs text-slate-500">เลือก checkbox เพื่อกำหนดสาขาที่ใช้ได้ และเลือก radio เป็นสาขาหลัก</div>
          {errors.branchIds ? <span className="mt-1 block text-xs text-red-700">{errors.branchIds}</span> : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ที่อยู่</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <FormSelectField required className="md:col-span-2" error={errors.marketScope} label="ประเทศ/ตลาด" placeholder="เลือกประเทศ/ตลาด" value={form.marketScope} onChange={(value) => updateMarketScope(value as CustomerFormValues['marketScope'] | '')}>
              <option value="ในประเทศ">ในประเทศ</option>
              <option value="ต่างประเทศ">ต่างประเทศ</option>
            </FormSelectField>
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
        inputMode={isEmailField ? 'email' : isPhoneField ? 'tel' : isTaxIdField || isThaiPostalCodeField ? 'numeric' : undefined}
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
