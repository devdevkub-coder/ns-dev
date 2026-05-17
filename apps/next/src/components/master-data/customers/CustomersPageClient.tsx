'use client'

import { useEffect, useMemo, useState } from 'react'
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
  type: null,
  taxId: null,
  phone: null,
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
  creditTerm: null,
  creditLimit: null,
  salesId: null,
  notes: null,
  active: true,
}

function customerToForm(customer: Customer): CustomerFormValues {
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    type: customer.type,
    taxId: customer.taxId,
    phone: customer.phone,
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
    creditTerm: customer.creditTerm,
    creditLimit: customer.creditLimit,
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
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [provinces, setProvinces] = useState<ThaiProvince[]>([])
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [subdistricts, setSubdistricts] = useState<ThaiSubdistrict[]>([])

  async function loadData() {
    setError(null)
    setIsLoading(true)
    try {
      const customerRows = await listCustomers()
      setCustomers(customerRows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลลูกค้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }

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
  }, [])

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = !query
      ? customers
      : customers.filter((customer) =>
          [
            customer.id,
            customer.code,
            customer.name,
            customer.type,
            customer.taxId,
            customer.phone,
            customer.email,
            customer.address,
            customer.contact,
            customer.creditTerm,
            customer.creditLimit,
            customer.salesId,
            customer.notes,
            customer.active ? 'ใช้งาน active' : 'ปิด inactive',
          ].some((value) => String(value ?? '').toLowerCase().includes(query)),
        )

    return [...rows].sort((left, right) => compareCustomers(left, right, sortKey, sortDirection))
  }, [customers, search, sortDirection, sortKey])

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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลลูกค้าไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-xl bg-white p-3 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <input className="w-full rounded-lg border px-3 py-2 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหา..." type="search" value={search} />
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
                <th className="w-10 p-2 text-left">
                  <input className="h-4 w-4 rounded border-slate-300" type="checkbox" />
                </th>
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
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="border-t">
                  <td className="p-2"><input className="h-4 w-4 rounded border-slate-300" type="checkbox" /></td>
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
                  <td className="p-2 text-center"><button className="text-blue-600" type="button" onClick={() => void openEditForm(customer)}>แก้ไข</button></td>
                  <td className="p-2 text-center"><button className="text-red-600" type="button" onClick={() => handleToggleActive(customer)}>ลบ</button></td>
                </tr>
              ))}
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-sm text-slate-500" colSpan={14}>ไม่พบข้อมูลที่ค้นหา</td>
                </tr>
              ) : null}
            </tbody>
          </table>
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

  const selectedProvince = provinces.find((province) => province.nameTh === form.addressProvince) ?? null
  const filteredDistricts = selectedProvince ? districts.filter((district) => district.provinceCode === selectedProvince.code) : []
  const selectedDistrict = filteredDistricts.find((district) => district.nameTh === form.addressDistrict) ?? null
  const filteredSubdistricts = selectedDistrict ? subdistricts.filter((subdistrict) => subdistrict.districtCode === selectedDistrict.code) : []

  function update<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
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
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลบริษัท</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <TextField className="md:col-span-2" error={errors.name} label="ชื่อบริษัท" value={form.name} onChange={(value) => update('name', value)} />
            <SelectField label="ประเภท" value={form.type ?? ''} onChange={(value) => update('type', value || null)}>
              <option value="">ไม่ระบุ</option>
              <option value="นิติบุคคล">นิติบุคคล</option>
              <option value="บุคคล">บุคคล</option>
              <option value="ต่างประเทศ">ต่างประเทศ</option>
            </SelectField>
            <TextField label="เลขผู้เสียภาษี" value={form.taxId ?? ''} onChange={(value) => update('taxId', value || null)} />
            <TextField label="เครดิตเทอม (วัน)" type="number" value={form.creditTerm ?? ''} onChange={(value) => update('creditTerm', value === '' ? null : Number(value))} />
            <TextField label="วงเงินเครดิต" type="number" value={form.creditLimit ?? ''} onChange={(value) => update('creditLimit', value === '' ? null : Number(value))} />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลติดต่อ</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="ผู้ติดต่อ" value={form.contact ?? ''} onChange={(value) => update('contact', value || null)} />
            <TextField label="โทรศัพท์" value={form.phone ?? ''} onChange={(value) => update('phone', value || null)} />
            <TextField error={errors.email} label="อีเมล" type="email" value={form.email ?? ''} onChange={(value) => update('email', value || null)} />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ที่อยู่</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <TextField label="บ้านเลขที่" value={form.addressNo ?? ''} onChange={(value) => update('addressNo', value || null)} />
            <TextField label="หมู่" value={form.addressMoo ?? ''} onChange={(value) => update('addressMoo', value || null)} />
            <TextField className="md:col-span-2" label="หมู่บ้าน/อาคาร" value={form.addressVillage ?? ''} onChange={(value) => update('addressVillage', value || null)} />
            <TextField label="ถนน" value={form.addressRoad ?? ''} onChange={(value) => update('addressRoad', value || null)} />
            <SelectField disabled={!selectedDistrict} label="ตำบล/แขวง" value={form.addressSubdistrict ?? ''} onChange={(value) => {
              const subdistrict = filteredSubdistricts.find((item) => item.nameTh === value)
              setForm((current) => ({ ...current, addressSubdistrict: value || null, addressPostalCode: subdistrict?.postalCode ?? null }))
            }}>
              <option value="">เลือกตำบล/แขวง</option>
              {filteredSubdistricts.map((subdistrict) => <option key={subdistrict.code} value={subdistrict.nameTh}>{subdistrict.nameTh}</option>)}
            </SelectField>
            <SelectField disabled={!selectedProvince} label="อำเภอ/เขต" value={form.addressDistrict ?? ''} onChange={(value) => {
              setForm((current) => ({ ...current, addressDistrict: value || null, addressSubdistrict: null, addressPostalCode: null }))
            }}>
              <option value="">เลือกอำเภอ/เขต</option>
              {filteredDistricts.map((district) => <option key={district.code} value={district.nameTh}>{district.nameTh}</option>)}
            </SelectField>
            <SelectField label="จังหวัด" value={form.addressProvince ?? ''} onChange={(value) => {
              setForm((current) => ({ ...current, addressProvince: value || null, addressDistrict: null, addressSubdistrict: null, addressPostalCode: null }))
            }}>
              <option value="">เลือกจังหวัด</option>
              {provinces.map((province) => <option key={province.code} value={province.nameTh}>{province.nameTh}</option>)}
            </SelectField>
            <TextField label="รหัสไปรษณีย์" readOnly value={form.addressPostalCode ?? ''} onChange={() => undefined} />
            <TextField label="ประเทศ" value={form.addressCountry ?? 'ไทย'} onChange={(value) => update('addressCountry', value || 'ไทย')} />
            <TextField className="md:col-span-2" label="ที่อยู่เต็ม/หมายเหตุที่อยู่" value={form.address ?? ''} onChange={(value) => update('address', value || null)} />
          </div>
        </section>

        <section>
          <TextField label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => update('notes', value || null)} />
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
  label: string
  value: string
  onChange: (value: string) => void
}

function SelectField({ children, disabled = false, label, value, onChange }: SelectFieldProps) {
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
    </label>
  )
}
