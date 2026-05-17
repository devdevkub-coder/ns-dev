'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  supplierFormSchema,
  exportSuppliers,
  listSuppliers,
  saveSupplier,
  setSupplierActive,
  type Supplier,
  type SupplierFormValues,
} from '@/lib/supplier'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { listThaiDistricts, listThaiProvinces, listThaiSubdistricts, type ThaiDistrict, type ThaiProvince, type ThaiSubdistrict } from '@/lib/thai-address'

type SortKey = 'code' | 'name' | 'taxId' | 'type' | 'phone' | 'email' | 'contact' | 'creditTerm' | 'creditLimit' | 'active'

const emptySupplierForm: SupplierFormValues = {
  id: undefined,
  code: null,
  name: '',
  nameTitle: null,
  firstName: null,
  lastName: null,
  type: 'นิติบุคคล',
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
  contact: null,
  contactTitle: null,
  contactFirstName: null,
  contactLastName: null,
  creditTerm: null,
  creditLimit: null,
  bankName: null,
  accountNo: null,
  bankAccount: null,
  branchId: null,
  marketScope: 'ในประเทศ',
  notes: null,
  active: true,
}

const personTitleOptions = ['นาย', 'นาง', 'นางสาว', 'คุณ']

function supplierToForm(supplier: Supplier): SupplierFormValues {
  return {
    id: supplier.id,
    code: supplier.code,
    name: supplier.name,
    nameTitle: supplier.nameTitle,
    firstName: supplier.firstName,
    lastName: supplier.lastName,
    type: supplier.type,
    taxId: supplier.taxId,
    phone: supplier.phone ?? '',
    email: supplier.email,
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
    contact: supplier.contact,
    contactTitle: supplier.contactTitle,
    contactFirstName: supplier.contactFirstName,
    contactLastName: supplier.contactLastName,
    creditTerm: supplier.creditTerm,
    creditLimit: supplier.creditLimit,
    bankName: supplier.bankName,
    accountNo: supplier.accountNo,
    bankAccount: supplier.bankAccount,
    branchId: supplier.branchId,
    marketScope: supplier.marketScope,
    notes: supplier.notes,
    active: supplier.active,
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
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('')
  const [marketScopeFilter, setMarketScopeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [provinces, setProvinces] = useState<ThaiProvince[]>([])
  const [search, setSearch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [subdistricts, setSubdistricts] = useState<ThaiSubdistrict[]>([])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const result = await listSuppliers({
        all: true,
      })
      setSuppliers(result.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลผู้ขายไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const filteredSortedSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = suppliers.filter((supplier) => {
      if (supplierTypeFilter && supplier.type !== supplierTypeFilter) return false
      if (marketScopeFilter && supplier.marketScope !== marketScopeFilter) return false
      if (!query) return true

      return Object.values(supplier).some((value) => String(value ?? '').toLowerCase().includes(query))
    })

    return [...rows].sort((left, right) => compareSuppliers(left, right, sortKey, sortDirection))
  }, [supplierTypeFilter, suppliers, marketScopeFilter, search, sortDirection, sortKey])

  const total = filteredSortedSuppliers.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedSuppliers = filteredSortedSuppliers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
      await loadAddressData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลที่อยู่ไทยไม่ได้')
      return
    }
    setFormOpen(true)
  }

  async function openEditForm(supplier: Supplier) {
    setSelectedSupplier(supplier)
    try {
      await loadAddressData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลที่อยู่ไทยไม่ได้')
      return
    }
    setFormOpen(true)
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
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลผู้ขายไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(supplier: Supplier) {
    setError(null)
    try {
      await setSupplierActive(supplier.id, !supplier.active)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'อัปเดตสถานะผู้ขายไม่ได้')
    }
  }

  async function handleExport() {
    setError(null)
    setIsExporting(true)
    try {
      const { blob, filename } = await exportSuppliers({
        supplierType: supplierTypeFilter,
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
      setError(caught instanceof Error ? caught.message : 'Export Excel ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลผู้ขายไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-xl bg-white p-3 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="grid w-full gap-2 md:max-w-3xl md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              onChange={(event) => {
                setPage(1)
                setSearch(event.target.value)
              }}
              placeholder="ค้นหา..."
              type="search"
              value={search}
            />
            <select
              aria-label="กรองประเภทผู้ขาย"
              className="rounded-lg border px-3 py-2 text-sm"
              value={supplierTypeFilter}
              onChange={(event) => {
                setPage(1)
                setSupplierTypeFilter(event.target.value)
              }}
            >
              <option value="">ทุกประเภท</option>
              <option value="บุคคล">บุคคล</option>
              <option value="นิติบุคคล">นิติบุคคล</option>
            </select>
            <select
              aria-label="กรองในประเทศหรือต่างประเทศ"
              className="rounded-lg border px-3 py-2 text-sm"
              value={marketScopeFilter}
              onChange={(event) => {
                setPage(1)
                setMarketScopeFilter(event.target.value)
              }}
            >
              <option value="">ทุกตลาด</option>
              <option value="ในประเทศ">ในประเทศ</option>
              <option value="ต่างประเทศ">ต่างประเทศ</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isExporting || isLoading} type="button" onClick={() => void handleExport()}>
              {isExporting ? 'กำลัง Export...' : '📊 Export Excel'}
            </button>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="button" onClick={() => void openCreateForm()}>
              + เพิ่มรายการ
            </button>
          </div>
        </div>
      </div>

      {!isLoading ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-600">
          <div>
            พบทั้งหมด <span className="font-semibold text-slate-900">{total.toLocaleString('th-TH')}</span> รายการ
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="จำนวนรายการต่อหน้า"
              className="rounded border border-slate-300 px-2 py-1"
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
            <button
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
              disabled={page <= 1 || isLoading}
              type="button"
              onClick={() => {
                setPage(Math.max(1, page - 1))
              }}
            >
              ก่อนหน้า
            </button>
            <span className="px-1">
              หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
            </span>
            <button
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
              disabled={page >= totalPages || isLoading}
              type="button"
              onClick={() => {
                setPage(Math.min(totalPages, currentPage + 1))
              }}
            >
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <div className="w-full max-w-5xl">
            <SupplierForm
              supplier={selectedSupplier}
              districts={districts}
              isSaving={isSaving}
              provinces={provinces}
              subdistricts={subdistricts}
              onCancel={() => {
                setFormOpen(false)
                setSelectedSupplier(null)
              }}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูลผู้ขาย</div> : null}

      {!isLoading ? (
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('code')}>รหัส{sortLabel('code')}</button></th>
                <th className="min-w-[220px] p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('name')}>ชื่อบริษัท/ร้านค้า{sortLabel('name')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('taxId')}>เลขผู้เสียภาษี{sortLabel('taxId')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('type')}>ประเภท{sortLabel('type')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('phone')}>โทร{sortLabel('phone')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('email')}>อีเมล{sortLabel('email')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('contact')}>ผู้ติดต่อ{sortLabel('contact')}</button></th>
                <th className="min-w-[220px] p-2 text-left">ที่อยู่</th>
                <th className="p-2 text-right"><button className="font-semibold" type="button" onClick={() => setSort('creditTerm')}>Term (วัน){sortLabel('creditTerm')}</button></th>
                <th className="p-2 text-right"><button className="font-semibold" type="button" onClick={() => setSort('creditLimit')}>วงเงินเครดิต{sortLabel('creditLimit')}</button></th>
                <th className="p-2 text-center"><button className="font-semibold" type="button" onClick={() => setSort('active')}>สถานะ{sortLabel('active')}</button></th>
                <th className="p-2 text-center">แก้ไข</th>
                <th className="p-2 text-center">ลบ</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSuppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
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
                  <td className="p-2 font-mono text-xs">{supplier.code}</td>
                  <td className="p-2 font-medium">{supplier.name}</td>
                  <td className="p-2 font-mono text-xs">{displayValue(supplier.taxId)}</td>
                  <td className="p-2">{displayValue(supplier.type)}</td>
                  <td className="p-2">{displayValue(supplier.phone)}</td>
                  <td className="p-2">{displayValue(supplier.email)}</td>
                  <td className="p-2">{displayValue(supplier.contact)}</td>
                  <td className="p-2">{displayValue(supplier.address)}</td>
                  <td className="p-2 text-right">{supplier.creditTerm ?? '-'}</td>
                  <td className="p-2 text-right">{formatMoney(supplier.creditLimit)}</td>
                  <td className={`p-2 text-center ${supplier.active ? 'text-emerald-700' : 'text-slate-500'}`}>✓ {supplier.active ? 'ใช้งาน' : 'ปิด'}</td>
                  <td className="p-2 text-center">
                    <button
                      className="text-blue-600"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openEditForm(supplier)
                      }}
                    >
                      แก้ไข
                    </button>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      className="text-red-600"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleToggleActive(supplier)
                      }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedSuppliers.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-sm text-slate-500" colSpan={13}>ไม่พบข้อมูลที่ค้นหา</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

type SupplierFormProps = {
  supplier: Supplier | null
  districts: ThaiDistrict[]
  isSaving: boolean
  provinces: ThaiProvince[]
  subdistricts: ThaiSubdistrict[]
  onCancel: () => void
  onSubmit: (values: SupplierFormValues) => Promise<void>
}

function SupplierForm({ supplier, districts, isSaving, provinces, subdistricts, onCancel, onSubmit }: SupplierFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<SupplierFormValues>(() => (supplier ? supplierToForm(supplier) : emptySupplierForm))

  useEffect(() => {
    setForm(supplier ? supplierToForm(supplier) : emptySupplierForm)
    setErrors({})
  }, [supplier])

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

  function update<K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
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
    }))
  }

  function updateSupplierType(value: SupplierFormValues['type']) {
    setForm((current) => ({
      ...current,
      type: value,
      name: value === 'บุคคล' ? null : current.name,
      nameTitle: value === 'บุคคล' ? current.nameTitle : null,
      firstName: value === 'บุคคล' ? current.firstName : null,
      lastName: value === 'บุคคล' ? current.lastName : null,
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = supplierFormSchema.safeParse(form)
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
        <h3 className="text-lg font-bold text-slate-900">{form.id ? 'แก้ไขผู้ขาย' : 'เพิ่มผู้ขาย'}</h3>
        <ActiveToggle checked={form.active} onChange={(checked) => update('active', checked)} />
      </div>

      <div className="max-h-[76vh] space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลผู้ขาย</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField error={errors.type} label="ประเภทผู้ขาย" value={form.type} onChange={(value) => updateSupplierType(value as SupplierFormValues['type'])}>
              <option value="บุคคล">บุคคล</option>
              <option value="นิติบุคคล">นิติบุคคล</option>
            </SelectField>
            <SelectField label="ประเทศ/ตลาด" value={form.marketScope} onChange={(value) => update('marketScope', value as SupplierFormValues['marketScope'])}>
              <option value="ในประเทศ">ในประเทศ</option>
              <option value="ต่างประเทศ">ต่างประเทศ</option>
            </SelectField>
            {form.type === 'บุคคล' ? (
              <>
                <SelectField error={errors.nameTitle} label="คำนำหน้าชื่อ" value={form.nameTitle ?? ''} onChange={(value) => update('nameTitle', value || null)}>
                  <option value="">เลือกคำนำหน้า</option>
                  {personTitleOptions.map((title) => <option key={title} value={title}>{title}</option>)}
                </SelectField>
                <TextField error={errors.firstName} label="ชื่อ" value={form.firstName ?? ''} onChange={(value) => update('firstName', value || null)} />
                <TextField error={errors.lastName} label="นามสกุล" value={form.lastName ?? ''} onChange={(value) => update('lastName', value || null)} />
              </>
            ) : (
              <TextField className="md:col-span-2" error={errors.name} label="ชื่อบริษัท/ร้านค้า" value={form.name ?? ''} onChange={(value) => update('name', value || null)} />
            )}
            <TextField error={errors.taxId} label="เลขผู้เสียภาษี" value={form.taxId ?? ''} onChange={(value) => update('taxId', value || null)} />
            <TextField error={errors.creditTerm} label="เครดิตเทอม (วัน)" type="number" value={form.creditTerm ?? ''} onChange={(value) => update('creditTerm', value === '' ? null : Number(value))} />
            <TextField error={errors.creditLimit} label="วงเงินเครดิต" type="number" value={form.creditLimit ?? ''} onChange={(value) => update('creditLimit', value === '' ? null : Number(value))} />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลติดต่อ</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField error={errors.contactTitle} label="คำนำหน้าผู้ติดต่อ" value={form.contactTitle ?? ''} onChange={(value) => update('contactTitle', value || null)}>
              <option value="">เลือกคำนำหน้า</option>
              {personTitleOptions.map((title) => <option key={title} value={title}>{title}</option>)}
            </SelectField>
            <TextField error={errors.contactFirstName} label="ชื่อผู้ติดต่อ" value={form.contactFirstName ?? ''} onChange={(value) => update('contactFirstName', value || null)} />
            <TextField error={errors.contactLastName} label="นามสกุลผู้ติดต่อ" value={form.contactLastName ?? ''} onChange={(value) => update('contactLastName', value || null)} />
            <TextField error={errors.phone} label="โทรศัพท์" value={form.phone ?? ''} onChange={(value) => update('phone', value)} />
            <TextField error={errors.email} label="อีเมล" type="email" value={form.email ?? ''} onChange={(value) => update('email', value || null)} />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ที่อยู่</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <TextField error={errors.addressPostalCode} label="รหัสไปรษณีย์" value={form.addressPostalCode ?? ''} onChange={updatePostalCode} />
            <SelectField error={errors.addressProvince} label="จังหวัด" value={form.addressProvince ?? ''} onChange={(value) => {
              setForm((current) => ({ ...current, addressProvince: value || null, addressDistrict: null, addressSubdistrict: null }))
            }}>
              <option value="">เลือกจังหวัด</option>
              {provinceOptions.map((province) => <option key={province.code} value={province.nameTh}>{province.nameTh}</option>)}
            </SelectField>
            <SelectField disabled={!selectedProvince && filteredDistricts.length === 0} error={errors.addressDistrict} label="อำเภอ/เขต" value={form.addressDistrict ?? ''} onChange={(value) => {
              setForm((current) => ({ ...current, addressDistrict: value || null, addressSubdistrict: null }))
            }}>
              <option value="">เลือกอำเภอ/เขต</option>
              {filteredDistricts.map((district) => <option key={district.code} value={district.nameTh}>{district.nameTh}</option>)}
            </SelectField>
            <SelectField disabled={filteredSubdistricts.length === 0} error={errors.addressSubdistrict} label="ตำบล/แขวง" value={form.addressSubdistrict ?? ''} onChange={(value) => {
              const subdistrict = filteredSubdistricts.find((item) => item.nameTh === value)
              const province = subdistrict ? provinces.find((item) => item.code === subdistrict.provinceCode) : null
              const district = subdistrict ? districts.find((item) => item.code === subdistrict.districtCode) : null
              setForm((current) => ({
                ...current,
                addressPostalCode: subdistrict?.postalCode ?? current.addressPostalCode,
                addressProvince: province?.nameTh ?? current.addressProvince,
                addressDistrict: district?.nameTh ?? current.addressDistrict,
                addressSubdistrict: value || null,
              }))
            }}>
              <option value="">เลือกตำบล/แขวง</option>
              {filteredSubdistricts.map((subdistrict) => <option key={subdistrict.code} value={subdistrict.nameTh}>{subdistrict.nameTh}</option>)}
            </SelectField>
            <TextField error={errors.addressNo} label="บ้านเลขที่" value={form.addressNo ?? ''} onChange={(value) => update('addressNo', value || null)} />
            <TextField error={errors.addressMoo} label="หมู่" value={form.addressMoo ?? ''} onChange={(value) => update('addressMoo', value || null)} />
            <TextField className="md:col-span-2" error={errors.addressVillage} label="หมู่บ้าน/อาคาร" value={form.addressVillage ?? ''} onChange={(value) => update('addressVillage', value || null)} />
            <TextField error={errors.addressRoad} label="ถนน" value={form.addressRoad ?? ''} onChange={(value) => update('addressRoad', value || null)} />
            <TextField error={errors.addressCountry} label="ประเทศ" value={form.addressCountry ?? 'ไทย'} onChange={(value) => update('addressCountry', value || 'ไทย')} />
            <TextField className="md:col-span-2" error={errors.address} label="ที่อยู่เต็ม/หมายเหตุที่อยู่" value={form.address ?? ''} onChange={(value) => update('address', value || null)} />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลบัญชีและสาขา</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <TextField error={errors.bankName} label="ธนาคาร" value={form.bankName ?? ''} onChange={(value) => update('bankName', value || null)} />
            <TextField error={errors.accountNo} label="เลขบัญชี" value={form.accountNo ?? ''} onChange={(value) => update('accountNo', value || null)} />
            <TextField error={errors.bankAccount} label="ชื่อบัญชี" value={form.bankAccount ?? ''} onChange={(value) => update('bankAccount', value || null)} />
            <TextField error={errors.branchId} label="รหัสสาขา" value={form.branchId ?? ''} onChange={(value) => update('branchId', value || null)} />
          </div>
        </section>

        <section>
          <TextField error={errors.notes} label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => update('notes', value || null)} />
        </section>
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

type TextFieldProps = {
  className?: string
  error?: string
  label: string
  readOnly?: boolean
  type?: string
  value: string | number
  onChange: (value: string) => void
}

function TextField({ className = '', error, label, readOnly = false, type = 'text', value, onChange }: TextFieldProps) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <input
        className={`mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700 ${readOnly ? 'bg-slate-50' : ''}`}
        readOnly={readOnly}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}

type SelectFieldProps = {
  children: React.ReactNode
  disabled?: boolean
  error?: string
  label: string
  value: string
  onChange: (value: string) => void
}

function SelectField({ children, disabled = false, error, label, value, onChange }: SelectFieldProps) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700 disabled:bg-slate-100"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
