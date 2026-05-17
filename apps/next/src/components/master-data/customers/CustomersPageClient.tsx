'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  customerFormSchema,
  listCustomers,
  saveCustomer,
  setCustomerActive,
  type Customer,
  type CustomerFormValues,
} from '@/lib/customer'
import { listThaiDistricts, listThaiProvinces, listThaiSubdistricts, type ThaiDistrict, type ThaiProvince, type ThaiSubdistrict } from '@/lib/thai-address'

type SortKey = 'code' | 'name' | 'taxId' | 'type' | 'phone' | 'email' | 'contact' | 'creditTerm' | 'creditLimit' | 'active'

const emptyCustomerForm: CustomerFormValues = {
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
  marketScope: 'ในประเทศ',
  salesId: null,
  notes: null,
  active: true,
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
    taxId: customer.taxId,
    phone: customer.phone ?? '',
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
    contact: customer.contact,
    contactTitle: customer.contactTitle,
    contactFirstName: customer.contactFirstName,
    contactLastName: customer.contactLastName,
    creditTerm: customer.creditTerm,
    creditLimit: customer.creditLimit,
    marketScope: customer.marketScope,
    salesId: customer.salesId,
    notes: customer.notes,
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

export function CustomersPageClient() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [districts, setDistricts] = useState<ThaiDistrict[]>([])
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
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
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const result = await listCustomers({
        customerType: customerTypeFilter,
        direction: sortDirection,
        marketScope: marketScopeFilter,
        page,
        pageSize,
        q: search,
        sort: sortKey,
      })
      setCustomers(result.rows)
      setPage(result.page)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลลูกค้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [customerTypeFilter, marketScopeFilter, page, pageSize, search, sortDirection, sortKey])

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
    const timer = window.setTimeout(() => {
      void loadData()
    }, 250)

    return () => window.clearTimeout(timer)
  }, [loadData])

  async function openCreateForm() {
    setSelectedCustomer(null)
    try {
      await loadAddressData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลที่อยู่ไทยไม่ได้')
      return
    }
    setFormOpen(true)
  }

  async function openEditForm(customer: Customer) {
    setSelectedCustomer(customer)
    try {
      await loadAddressData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลที่อยู่ไทยไม่ได้')
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
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลลูกค้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(customer: Customer) {
    setError(null)
    try {
      await setCustomerActive(customer.id, !customer.active)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'อัปเดตสถานะลูกค้าไม่ได้')
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
          <div className="font-bold">โหลดหรือบันทึกข้อมูลลูกค้าไม่ได้</div>
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
              aria-label="กรองประเภทลูกค้า"
              className="rounded-lg border px-3 py-2 text-sm"
              value={customerTypeFilter}
              onChange={(event) => {
                setPage(1)
                setCustomerTypeFilter(event.target.value)
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
            <button className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white" type="button">
              📊 Export Excel
            </button>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="button" onClick={() => void openCreateForm()}>
              + เพิ่มรายการ
            </button>
          </div>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <div className="w-full max-w-5xl">
            <CustomerForm
              customer={selectedCustomer}
              districts={districts}
              isSaving={isSaving}
              provinces={provinces}
              subdistricts={subdistricts}
              onCancel={() => {
                setFormOpen(false)
                setSelectedCustomer(null)
              }}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูลลูกค้า</div> : null}

      {!isLoading ? (
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('code')}>รหัส{sortLabel('code')}</button></th>
                <th className="min-w-[220px] p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('name')}>ชื่อบริษัท{sortLabel('name')}</button></th>
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
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
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
                  <td className="p-2 font-mono text-xs">{customer.code}</td>
                  <td className="p-2 font-medium">{customer.name}</td>
                  <td className="p-2 font-mono text-xs">{displayValue(customer.taxId)}</td>
                  <td className="p-2">{displayValue(customer.type)}</td>
                  <td className="p-2">{displayValue(customer.phone)}</td>
                  <td className="p-2">{displayValue(customer.email)}</td>
                  <td className="p-2">{displayValue(customer.contact)}</td>
                  <td className="p-2">{displayValue(customer.address)}</td>
                  <td className="p-2 text-right">{customer.creditTerm ?? '-'}</td>
                  <td className="p-2 text-right">{formatMoney(customer.creditLimit)}</td>
                  <td className={`p-2 text-center ${customer.active ? 'text-emerald-700' : 'text-slate-500'}`}>✓ {customer.active ? 'ใช้งาน' : 'ปิด'}</td>
                  <td className="p-2 text-center">
                    <button
                      className="text-blue-600"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openEditForm(customer)
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
                        void handleToggleActive(customer)
                      }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-sm text-slate-500" colSpan={13}>ไม่พบข้อมูลที่ค้นหา</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div>
              ทั้งหมด {total.toLocaleString('th-TH')} รายการ · หน้า {page.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
            </div>
            <div className="flex items-center gap-2">
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
              <button
                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                disabled={page >= totalPages || isLoading}
                type="button"
                onClick={() => {
                  setPage(Math.min(totalPages, page + 1))
                }}
              >
                ถัดไป
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type CustomerFormProps = {
  customer: Customer | null
  districts: ThaiDistrict[]
  isSaving: boolean
  provinces: ThaiProvince[]
  subdistricts: ThaiSubdistrict[]
  onCancel: () => void
  onSubmit: (values: CustomerFormValues) => Promise<void>
}

function CustomerForm({ customer, districts, isSaving, provinces, subdistricts, onCancel, onSubmit }: CustomerFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<CustomerFormValues>(() => (customer ? customerToForm(customer) : emptyCustomerForm))

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

  function update<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
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

  function updateCustomerType(value: CustomerFormValues['type']) {
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
    const parsed = customerFormSchema.safeParse(form)
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
        <h3 className="text-lg font-bold text-slate-900">{form.id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</h3>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input checked={form.active} className="size-4 rounded border-slate-300" type="checkbox" onChange={(event) => update('active', event.target.checked)} />
          ใช้งาน
        </label>
      </div>

      <div className="max-h-[76vh] space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลลูกค้า</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField error={errors.type} label="ประเภทลูกค้า" value={form.type} onChange={(value) => updateCustomerType(value as CustomerFormValues['type'])}>
              <option value="บุคคล">บุคคล</option>
              <option value="นิติบุคคล">นิติบุคคล</option>
            </SelectField>
            <SelectField label="ประเทศ/ตลาด" value={form.marketScope} onChange={(value) => update('marketScope', value as CustomerFormValues['marketScope'])}>
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
              <TextField className="md:col-span-2" error={errors.name} label="ชื่อบริษัท" value={form.name ?? ''} onChange={(value) => update('name', value || null)} />
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
