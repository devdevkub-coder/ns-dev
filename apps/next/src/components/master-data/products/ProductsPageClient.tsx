'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { getErrorMessage } from '@/lib/api-client'
import {
  exportProducts,
  listProducts,
  productFormSchema,
  productStatusOptions,
  saveProduct,
  setProductActive,
  type Product,
  type ProductFormValues,
} from '@/lib/product'

type SortKey = 'active' | 'code' | 'grade' | 'itemStatus' | 'metalGroup' | 'name' | 'stdCost' | 'stdPrice' | 'targetMarginPct' | 'type' | 'unit'

const emptyProductForm: ProductFormValues = {
  id: undefined,
  code: '',
  name: '',
  active: true,
  type: null,
  unit: 'kg',
  metalGroup: null,
  itemStatus: 'RM',
  grade: null,
  stdPrice: null,
  stdCost: null,
  targetMarginPct: null,
}

function productToForm(product: Product): ProductFormValues {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    active: product.active,
    type: product.type,
    unit: product.unit ?? 'kg',
    metalGroup: product.metalGroup,
    itemStatus: productStatusOptions.includes(product.itemStatus as ProductFormValues['itemStatus']) ? product.itemStatus as ProductFormValues['itemStatus'] : 'RM',
    grade: product.grade,
    stdPrice: product.stdPrice,
    stdCost: product.stdCost,
    targetMarginPct: product.targetMarginPct,
  }
}

function displayValue(value: string | number | null) {
  return value === null || value === '' ? '-' : value
}

function formatNumber(value: number | null, fractionDigits = 2) {
  if (value === null) return '-'
  return value.toLocaleString('th-TH', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
}

function uniqueText(values: Array<string | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))
}

function compareProducts(left: Product, right: Product, key: SortKey, direction: 'asc' | 'desc') {
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

export function ProductsPageClient() {
  const [activeFilter, setActiveFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [itemStatusFilter, setItemStatusFilter] = useState('')
  const [metalGroupFilter, setMetalGroupFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [productTypeFilter, setProductTypeFilter] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('code')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const result = await listProducts({ all: true })
      setProducts(result.rows)
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลสินค้าไม่ได้'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const productTypes = useMemo(() => uniqueText(products.map((product) => product.type)), [products])
  const metalGroups = useMemo(() => uniqueText(products.map((product) => product.metalGroup)), [products])

  const filteredSortedProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = products.filter((product) => {
      if (activeFilter === 'active' && !product.active) return false
      if (activeFilter === 'inactive' && product.active) return false
      if (itemStatusFilter && product.itemStatus !== itemStatusFilter) return false
      if (metalGroupFilter && product.metalGroup !== metalGroupFilter) return false
      if (productTypeFilter && product.type !== productTypeFilter) return false
      if (!query) return true

      return Object.values(product).some((value) => String(value ?? '').toLowerCase().includes(query))
    })

    return [...rows].sort((left, right) => compareProducts(left, right, sortKey, sortDirection))
  }, [activeFilter, itemStatusFilter, metalGroupFilter, productTypeFilter, products, search, sortDirection, sortKey])

  const total = filteredSortedProducts.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedProducts = filteredSortedProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  function openCreateForm() {
    setSelectedProduct(null)
    setFormOpen(true)
  }

  function openEditForm(product: Product) {
    setSelectedProduct(product)
    setFormOpen(true)
  }

  async function handleSubmit(values: ProductFormValues) {
    setIsSaving(true)
    setError(null)
    try {
      await saveProduct(values)
      setFormOpen(false)
      setSelectedProduct(null)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกข้อมูลสินค้าไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(product: Product) {
    setError(null)
    try {
      await setProductActive(product.id, !product.active)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'อัปเดตสถานะสินค้าไม่ได้'))
    }
  }

  async function handleExport() {
    setError(null)
    setIsExporting(true)
    try {
      const { blob, filename } = await exportProducts({
        active: activeFilter,
        direction: sortDirection,
        itemStatus: itemStatusFilter,
        metalGroup: metalGroupFilter,
        productType: productTypeFilter,
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

  function resetFilters() {
    setActiveFilter('')
    setItemStatusFilter('')
    setMetalGroupFilter('')
    setProductTypeFilter('')
    setSearch('')
    setPage(1)
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลสินค้าไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-xl bg-white p-3 shadow">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid w-full gap-2 md:grid-cols-2 xl:max-w-5xl xl:grid-cols-[minmax(0,1fr)_150px_150px_150px_130px]">
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
              aria-label="กรองประเภทสินค้า"
              className="rounded-lg border px-3 py-2 text-sm"
              value={productTypeFilter}
              onChange={(event) => {
                setPage(1)
                setProductTypeFilter(event.target.value)
              }}
            >
              <option value="">ทุกประเภท</option>
              {productTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select
              aria-label="กรองกลุ่มโลหะ"
              className="rounded-lg border px-3 py-2 text-sm"
              value={metalGroupFilter}
              onChange={(event) => {
                setPage(1)
                setMetalGroupFilter(event.target.value)
              }}
            >
              <option value="">ทุกกลุ่มโลหะ</option>
              {metalGroups.map((metalGroup) => <option key={metalGroup} value={metalGroup}>{metalGroup}</option>)}
            </select>
            <select
              aria-label="กรองสถานะสินค้า"
              className="rounded-lg border px-3 py-2 text-sm"
              value={itemStatusFilter}
              onChange={(event) => {
                setPage(1)
                setItemStatusFilter(event.target.value)
              }}
            >
              <option value="">ทุกสถานะสินค้า</option>
              {productStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select
              aria-label="กรองสถานะใช้งาน"
              className="rounded-lg border px-3 py-2 text-sm"
              value={activeFilter}
              onChange={(event) => {
                setPage(1)
                setActiveFilter(event.target.value)
              }}
            >
              <option value="">ทั้งหมด</option>
              <option value="active">ใช้งาน</option>
              <option value="inactive">ปิด</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" type="button" onClick={resetFilters}>
              ล้างตัวกรอง
            </button>
            <button className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isExporting || isLoading} type="button" onClick={() => void handleExport()}>
              {isExporting ? 'กำลัง Export...' : '📊 Export Excel'}
            </button>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="button" onClick={openCreateForm}>
              + เพิ่มสินค้า
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
            <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage(Math.max(1, page - 1))}>
              ก่อนหน้า
            </button>
            <span className="px-1">
              หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
            </span>
            <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <div className="w-full max-w-4xl">
            <ProductForm
              isSaving={isSaving}
              product={selectedProduct}
              productTypes={productTypes}
              metalGroups={metalGroups}
              onCancel={() => {
                setFormOpen(false)
                setSelectedProduct(null)
              }}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูลสินค้า</div> : null}

      {!isLoading ? (
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('code')}>รหัส{sortLabel('code')}</button></th>
                <th className="min-w-[220px] p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('name')}>ชื่อสินค้า{sortLabel('name')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('type')}>ประเภท{sortLabel('type')}</button></th>
                <th className="p-2 text-center"><button className="font-semibold" type="button" onClick={() => setSort('unit')}>หน่วย{sortLabel('unit')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('metalGroup')}>กลุ่มโลหะ{sortLabel('metalGroup')}</button></th>
                <th className="p-2 text-center"><button className="font-semibold" type="button" onClick={() => setSort('itemStatus')}>สถานะสินค้า{sortLabel('itemStatus')}</button></th>
                <th className="p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('grade')}>เกรด{sortLabel('grade')}</button></th>
                <th className="p-2 text-right"><button className="font-semibold" type="button" onClick={() => setSort('stdPrice')}>ราคามาตรฐาน{sortLabel('stdPrice')}</button></th>
                <th className="p-2 text-right"><button className="font-semibold" type="button" onClick={() => setSort('stdCost')}>ต้นทุนมาตรฐาน{sortLabel('stdCost')}</button></th>
                <th className="p-2 text-right"><button className="font-semibold" type="button" onClick={() => setSort('targetMarginPct')}>Target Margin{sortLabel('targetMarginPct')}</button></th>
                <th className="p-2 text-center"><button className="font-semibold" type="button" onClick={() => setSort('active')}>สถานะ{sortLabel('active')}</button></th>
                <th className="p-2 text-center">แก้ไข</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => (
                <tr
                  key={product.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditForm(product)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openEditForm(product)
                    }
                  }}
                >
                  <td className="p-2 font-mono text-xs">{product.code}</td>
                  <td className="p-2 font-medium">{product.name}</td>
                  <td className="p-2">{displayValue(product.type)}</td>
                  <td className="p-2 text-center">{displayValue(product.unit)}</td>
                  <td className="p-2">{displayValue(product.metalGroup)}</td>
                  <td className="p-2 text-center">{displayValue(product.itemStatus)}</td>
                  <td className="p-2">{displayValue(product.grade)}</td>
                  <td className="p-2 text-right">{formatNumber(product.stdPrice)}</td>
                  <td className="p-2 text-right">{formatNumber(product.stdCost)}</td>
                  <td className="p-2 text-right">{product.targetMarginPct === null ? '-' : `${formatNumber(product.targetMarginPct)}%`}</td>
                  <td className="p-2 text-center">
                    <ActiveToggle checked={product.active} label={product.active ? 'ใช้งาน' : 'ปิด'} onChange={() => void handleToggleActive(product)} />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      className="text-blue-600"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openEditForm(product)
                      }}
                    >
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-sm text-slate-500" colSpan={12}>ไม่พบข้อมูลที่ค้นหา</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

type ProductFormProps = {
  isSaving: boolean
  metalGroups: string[]
  product: Product | null
  productTypes: string[]
  onCancel: () => void
  onSubmit: (values: ProductFormValues) => Promise<void>
}

function ProductForm({ isSaving, metalGroups, product, productTypes, onCancel, onSubmit }: ProductFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<ProductFormValues>(() => (product ? productToForm(product) : emptyProductForm))

  useEffect(() => {
    setForm(product ? productToForm(product) : emptyProductForm)
    setErrors({})
  }, [product])

  function update<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = productFormSchema.safeParse(form)
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
        <h3 className="text-lg font-bold text-slate-900">{form.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</h3>
        <ActiveToggle checked={form.active} onChange={(checked) => update('active', checked)} />
      </div>

      <div className="max-h-[76vh] space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลสินค้า</h4>
          <div className="grid gap-4 md:grid-cols-4">
            <TextField error={errors.code} label="รหัสสินค้า *" readOnly={Boolean(form.id)} value={form.code} onChange={(value) => update('code', value)} />
            <TextField className="md:col-span-2" error={errors.name} label="ชื่อสินค้า *" value={form.name} onChange={(value) => update('name', value)} />
            <SelectField error={errors.itemStatus} label="สถานะสินค้า *" value={form.itemStatus} onChange={(value) => update('itemStatus', value as ProductFormValues['itemStatus'])}>
              {productStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </SelectField>
            <TextField error={errors.type} label="ประเภทสินค้า" list="product-type-options" value={form.type ?? ''} onChange={(value) => update('type', value || null)} />
            <TextField error={errors.unit} label="หน่วย" value={form.unit ?? ''} onChange={(value) => update('unit', value || null)} />
            <TextField error={errors.metalGroup} label="กลุ่มโลหะ" list="metal-group-options" value={form.metalGroup ?? ''} onChange={(value) => update('metalGroup', value || null)} />
            <TextField error={errors.grade} label="เกรด" value={form.grade ?? ''} onChange={(value) => update('grade', value || null)} />
          </div>
          <datalist id="product-type-options">
            {productTypes.map((type) => <option key={type} value={type} />)}
          </datalist>
          <datalist id="metal-group-options">
            {metalGroups.map((metalGroup) => <option key={metalGroup} value={metalGroup} />)}
          </datalist>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ราคาและต้นทุน</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField error={errors.stdPrice} label="ราคามาตรฐาน" type="number" value={form.stdPrice ?? ''} onChange={(value) => update('stdPrice', value === '' ? null : Number(value))} />
            <TextField error={errors.stdCost} label="ต้นทุนมาตรฐาน" type="number" value={form.stdCost ?? ''} onChange={(value) => update('stdCost', value === '' ? null : Number(value))} />
            <TextField error={errors.targetMarginPct} label="Target Margin %" type="number" value={form.targetMarginPct ?? ''} onChange={(value) => update('targetMarginPct', value === '' ? null : Number(value))} />
          </div>
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
  list?: string
  readOnly?: boolean
  type?: string
  value: string | number
  onChange: (value: string) => void
}

function TextField({ className = '', error, label, list, readOnly = false, type = 'text', value, onChange }: TextFieldProps) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <input
        className={`mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700 ${readOnly ? 'bg-slate-50' : ''}`}
        list={list}
        min={type === 'number' ? 0 : undefined}
        readOnly={readOnly}
        step={type === 'number' ? '0.01' : undefined}
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
  error?: string
  label: string
  value: string
  onChange: (value: string) => void
}

function SelectField({ children, error, label, value, onChange }: SelectFieldProps) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
