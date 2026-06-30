'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Download, ImagePlus, Plus, Trash2, Upload } from 'lucide-react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { getErrorMessage } from '@/lib/api-client'
import { listMasterDataRecords, type MasterDataRecord } from '@/lib/master-data'
import {
  buildProductOriginalImageStorageKey,
  buildProductThumbnailStorageKey,
  prepareProductImageUploadAssets,
  PRODUCT_IMAGE_BUCKET,
} from '@/lib/product-images'
import {
  exportProducts,
  importProducts,
  listProducts,
  productFormSchema,
  saveProduct,
  setProductActive,
  type Product,
  type ProductFormValues,
} from '@/lib/product'
import { getSupabaseClient } from '@/lib/supabase'

type SortKey = 'active' | 'code' | 'name' | 'type' | 'unit'
type ProductColumnKey = SortKey | 'action'

const productColumns: Array<ResizableColumnDefinition<ProductColumnKey>> = [
  { key: 'code', defaultWidth: 100, minWidth: 80 },
  { key: 'name', defaultWidth: 280, minWidth: 180 },
  { key: 'type', defaultWidth: 140, minWidth: 100 },
  { key: 'unit', defaultWidth: 90, minWidth: 70 },
  { key: 'active', defaultWidth: 110, minWidth: 90 },
  { key: 'action', defaultWidth: 110, minWidth: 90 },
]


const emptyProductForm: ProductFormValues = {
  id: undefined,
  code: null,
  name: '',
  active: true,
  imageStorageKey: null,
  imageThumbnailStorageKey: null,
  type: 'สินค้าสิ่งเจือปน',
  unit: 'กก.',
}

function productToForm(product: Product): ProductFormValues {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    active: product.active,
    imageStorageKey: product.imageStorageKey,
    imageThumbnailStorageKey: product.imageThumbnailStorageKey,
    type: product.type || 'สินค้าสิ่งเจือปน',
    unit: product.unit ?? 'กก.',
  }
}

function displayValue(value: string | number | null) {
  return value === null || value === '' ? '-' : value
}

function uniqueText(values: Array<string | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  })
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

type ProductSubmitPayload = {
  imageAction: 'keep' | 'remove' | 'replace'
  imageFile: File | null
  values: ProductFormValues
}

export function ImpurityProductsPageClient() {
  const [activeFilter, setActiveFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set())
  const [productTypeFilter, setProductTypeFilter] = useState('')
  const [productTypes, setProductTypes] = useState<MasterDataRecord[]>([])
  const [productUnits, setProductUnits] = useState<MasterDataRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('master-data.products.v5', productColumns)


  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const [result, typeRows, unitRows] = await Promise.all([
        listProducts({ all: true }),
        listMasterDataRecords('/api/master-data/product-types'),
        listMasterDataRecords('/api/master-data/product-units'),
      ])
      setProducts(result.rows)
      setProductTypes(typeRows.filter((type) => type.active))
      setProductUnits(unitRows.filter((unit) => unit.active))
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลสินค้าไม่ได้'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const productTypeOptions = useMemo(() => {
    const activeTypeNames = productTypes.map((type) => type.name)
    const existingTypeNames = uniqueText(products.map((product) => product.type))
    return Array.from(new Set([...activeTypeNames, ...existingTypeNames])).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))
  }, [productTypes, products])

  const filteredSortedProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = products.filter((product) => {
      const isImpurity = product.type === 'สินค้าสิ่งเจือปน' || product.type?.toLowerCase().includes('สิ่งเจือปน')
      if (!isImpurity) return false

      if (activeFilter === 'active' && !product.active) return false
      if (activeFilter === 'inactive' && product.active) return false
      if (productTypeFilter && product.type !== productTypeFilter) return false
      if (!query) return true

      return Object.values(product).some((value) => String(value ?? '').toLowerCase().includes(query))
    })

    return [...rows].sort((left, right) => compareProducts(left, right, sortKey, sortDirection))
  }, [activeFilter, productTypeFilter, products, search, sortDirection, sortKey])

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

  async function handleSubmit({ imageAction, imageFile, values }: ProductSubmitPayload) {
    setIsSaving(true)
    setError(null)
    try {
      const previousImageKey = selectedProduct?.imageStorageKey ?? null
      const previousThumbKey = selectedProduct?.imageThumbnailStorageKey ?? null
      const initialImageKey = imageAction === 'remove' ? null : previousImageKey
      const initialThumbKey = imageAction === 'remove' ? null : previousThumbKey
      let savedProduct = await saveProduct({
        ...values,
        imageStorageKey: initialImageKey,
        imageThumbnailStorageKey: initialThumbKey,
      })

      if (imageAction === 'replace' && imageFile) {
        const supabase = getSupabaseClient()
        if (!supabase) {
          throw new Error('ไม่พบการเชื่อมต่อ Supabase สำหรับอัปโหลดรูปสินค้า')
        }

        const assets = await prepareProductImageUploadAssets(imageFile)
        const nextImageKey = buildProductOriginalImageStorageKey(savedProduct.code, imageFile.name)
        const nextThumbKey = buildProductThumbnailStorageKey(savedProduct.code, imageFile.name)
        const uploadedKeys: string[] = []
        const storage = supabase.storage.from(PRODUCT_IMAGE_BUCKET)

        try {
          const { error: originalUploadError } = await storage.upload(nextImageKey, assets.original, {
            cacheControl: '3600',
            contentType: assets.original.type || undefined,
            upsert: true,
          })

          if (originalUploadError) {
            throw new Error(`อัปโหลดรูปสินค้าหลักไม่สำเร็จ: ${originalUploadError.message}`)
          }
          uploadedKeys.push(nextImageKey)

          const { error: thumbUploadError } = await storage.upload(nextThumbKey, assets.thumbnail, {
            cacheControl: '3600',
            contentType: assets.thumbnail.type || undefined,
            upsert: true,
          })

          if (thumbUploadError) {
            throw new Error(`อัปโหลดรูปสินค้าย่อไม่สำเร็จ: ${thumbUploadError.message}`)
          }
          uploadedKeys.push(nextThumbKey)

          savedProduct = await saveProduct({
            ...values,
            id: savedProduct.id,
            code: savedProduct.code,
            imageStorageKey: nextImageKey,
            imageThumbnailStorageKey: nextThumbKey,
          })
        } catch (uploadOrSaveError) {
          if (uploadedKeys.length > 0) {
            void storage.remove(uploadedKeys).catch(() => undefined)
          }
          throw uploadOrSaveError
        }

        const oldKeys = [previousImageKey, previousThumbKey]
          .filter((value): value is string => Boolean(value))
          .filter((value) => value !== nextImageKey && value !== nextThumbKey)

        if (oldKeys.length > 0) {
          void storage.remove(oldKeys).catch(() => undefined)
        }
      } else if (imageAction === 'remove' && (previousImageKey || previousThumbKey)) {
        const supabase = getSupabaseClient()
        if (supabase) {
          const oldKeys = [previousImageKey, previousThumbKey].filter((value): value is string => Boolean(value))
          if (oldKeys.length > 0) {
            void supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(oldKeys).catch(() => undefined)
          }
        }
      }

      setFormOpen(false)
      setSelectedProduct(null)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกข้อมูลสินค้าไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(product: Product, active: boolean) {
    setError(null)
    setPendingToggleIds((current) => new Set(current).add(product.id))
    setProducts((current) => current.map((row) => row.id === product.id ? { ...row, active } : row))
    setSelectedProduct((current) => current?.id === product.id ? { ...current, active } : current)

    try {
      const updatedProduct = await setProductActive(product.id, active)
      setProducts((current) => current.map((row) => row.id === updatedProduct.id ? updatedProduct : row))
      setSelectedProduct((current) => current?.id === updatedProduct.id ? updatedProduct : current)
    } catch (caught) {
      setProducts((current) => current.map((row) => row.id === product.id ? { ...row, active: product.active } : row))
      setSelectedProduct((current) => current?.id === product.id ? { ...current, active: product.active } : current)
      setError(getErrorMessage(caught, 'อัปเดตสถานะสินค้าไม่ได้'))
    } finally {
      setPendingToggleIds((current) => {
        const next = new Set(current)
        next.delete(product.id)
        return next
      })
    }
  }

  async function handleExport() {
    setError(null)
    setIsExporting(true)
    try {
      const { blob, filename } = await exportProducts({
        active: activeFilter,
        direction: sortDirection,
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

  async function handleImport(file: File | null) {
    if (!file) return
    setError(null)
    setIsImporting(true)
    try {
      const result = await importProducts(file)
      await loadData()
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

  function resetFilters() {
    setActiveFilter('')
    setProductTypeFilter('')
    setSearch('')
    setPage(1)
  }

  const hasFilters = Boolean(search.trim() || productTypeFilter || activeFilter)

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลสินค้าไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block mb-4 space-y-3 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
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
          {hasFilters ? (
            <button className="rounded-md bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs h-9 focus:outline-none" type="button" onClick={resetFilters}>
              ✕ ล้าง
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
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
                  event.currentTarget.value = ''
                }}
              />
            </label>
            <button className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none" disabled={isExporting || isLoading} type="button" onClick={() => void handleExport()}>
              <Download aria-hidden="true" className="h-4 w-4" />
              <span className="text-xs sm:text-sm">{isExporting ? 'กำลัง Export...' : 'Export Excel'}</span>
            </button>
            <button className="inline-flex h-9 items-center gap-1 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 focus:outline-none" type="button" onClick={openCreateForm}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              เพิ่มสินค้าสิ่งเจือปน
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-50 pt-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">สถานะ:</span>
            <MatchButton active={activeFilter === ''} label="ทั้งหมด" onClick={() => { setActiveFilter(''); setPage(1); }} />
            <MatchButton active={activeFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => { setActiveFilter('active'); setPage(1); }} />
            <MatchButton active={activeFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => { setActiveFilter('inactive'); setPage(1); }} />
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden">
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
            ตัวกรอง {hasFilters ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform focus:outline-none"
          onClick={openCreateForm}
          type="button"
          aria-label="เพิ่มสินค้าสิ่งเจือปน"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
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
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">สถานะการใช้งาน</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={activeFilter === ''} label="ทั้งหมด" onClick={() => { setActiveFilter(''); setPage(1); }} />
                  <MatchButton active={activeFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => { setActiveFilter('active'); setPage(1); }} />
                  <MatchButton active={activeFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => { setActiveFilter('inactive'); setPage(1); }} />
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
                        event.currentTarget.value = ''
                        setShowMobileFilters(false)
                      }}
                    />
                  </label>
                  <button className="flex-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" disabled={isExporting || isLoading} type="button" onClick={() => { void handleExport(); setShowMobileFilters(false); }}>
                    <Download aria-hidden="true" className="h-4 w-4" />
                    <span>{isExporting ? 'Exporting...' : 'Export Excel'}</span>
                  </button>
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
              onClick={() => setPage(Math.max(1, page - 1))}
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
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormOpen(false); setSelectedProduct(null); } }}>
        <DialogContent className="max-w-4xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" hideClose>
          <ProductForm
            isSaving={isSaving}
            product={selectedProduct}
            productTypes={productTypeOptions}
            productUnits={productUnits}
            onCancel={() => {
              setFormOpen(false)
              setSelectedProduct(null)
            }}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>

      {isLoading ? <div className="rounded-md bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูลสินค้า</div> : null}

      {!isLoading ? (
        <>
          {/* Desktop Table View */}
          <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm hidden lg:block">
            <div className="overflow-x-auto">
              <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {productColumns.map((column) => (
                    <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <TableHeader>
                  <tr>
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="รหัส" resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')} sortKey="code" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ชื่อสินค้า" resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อสินค้า')} sortKey="name" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} sortKey="type" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="หน่วย" resizeProps={columnResize.getResizeHandleProps('unit', 'หน่วย')} sortKey="unit" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={setSort} />
                    <ResizableTableHead align="center" label="แก้ไข" resizeProps={columnResize.getResizeHandleProps('action', 'แก้ไข')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {paginatedProducts.map((product) => (
                    <TableRow
                      key={product.id}
                      className="cursor-pointer border-slate-100 hover:bg-slate-50"
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
                      <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-slate-700">{product.code}</TableCell>
                      <TableCell className="truncate text-xs font-semibold text-slate-800" title={product.name}>{product.name}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{displayValue(product.type)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-slate-700">{displayValue(product.unit)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-slate-700">
                        <ActiveToggle
                          checked={product.active}
                          disabled={pendingToggleIds.has(product.id)}
                          label={product.active ? 'ใช้งาน' : 'ปิด'}
                          onChange={(checked) => void handleToggleActive(product, checked)}
                        />
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold text-slate-700">
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openEditForm(product)
                          }}
                        >
                          แก้ไข
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedProducts.length === 0 ? (
                    <TableRow>
                      <TableCell className="p-4 text-center text-sm text-slate-500" colSpan={6}>ไม่พบข้อมูลที่ค้นหา</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="block lg:hidden space-y-3">
            {paginatedProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-colors"
                onClick={() => openEditForm(product)}
              >
                <div className="flex gap-3 items-start">
                  {/* Product Thumbnail on the Left */}
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                    {product.thumbnailUrl ? (
                      <Image
                        fill
                        unoptimized
                        alt={product.name}
                        className="object-cover"
                        sizes="56px"
                        src={product.thumbnailUrl}
                      />
                    ) : (
                      <span className="text-slate-400 text-lg">📦</span>
                    )}
                  </div>

                  {/* Product Info on the Right */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate">
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {product.code}
                        </span>
                        <h4 className="font-bold text-slate-900 mt-1.5 text-[15px] truncate">
                          {product.name}
                        </h4>
                      </div>
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <ActiveToggle
                          checked={product.active}
                          disabled={pendingToggleIds.has(product.id)}
                          label={product.active ? 'ใช้งาน' : 'ปิด'}
                          onChange={(checked) => void handleToggleActive(product, checked)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 mt-2.5 text-xs text-slate-600">
                      <div>
                        <span className="block text-slate-400 font-medium">ประเภท</span>
                        <span className="font-semibold text-slate-700 truncate block">{displayValue(product.type)}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 font-medium">หน่วยนับ</span>
                        <span className="font-semibold text-slate-700">{displayValue(product.unit)}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            ))}
            {paginatedProducts.length === 0 ? (
              <div className="rounded-md bg-white p-8 text-center text-sm text-slate-500 shadow-sm border border-slate-200">
                ไม่พบข้อมูลที่ค้นหา
              </div>
            ) : null}
          </div>
        </>
      ) : null}

    </section>
  )
}

type ProductFormProps = {
  isSaving: boolean
  product: Product | null
  productTypes: string[]
  productUnits: MasterDataRecord[]
  onCancel: () => void
  onSubmit: (payload: ProductSubmitPayload) => Promise<void>
}

function ProductForm({ isSaving, product, productTypes, productUnits, onCancel, onSubmit }: ProductFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<ProductFormValues>(() => (product ? productToForm(product) : emptyProductForm))
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [previewImageName, setPreviewImageName] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(product?.thumbnailUrl ?? null)

  useEffect(() => {
    setForm(product ? productToForm(product) : emptyProductForm)
    setPendingImageFile(null)
    setPreviewImageName(product?.imageNames[0] ?? '')
    setPreviewImageUrl(product?.thumbnailUrl ?? null)
    setErrors({})
  }, [product])

  function update<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function replacePrimaryImage(fileList: FileList | null) {
    const selectedFile = Array.from(fileList ?? [])[0]
    if (!selectedFile) return
    if (!selectedFile.type.startsWith('image/')) {
      setErrors((current) => ({ ...current, imageStorageKey: 'อัปโหลดได้เฉพาะไฟล์รูปภาพ' }))
      return
    }

    const nextPreviewUrl = await fileToDataUrl(selectedFile)
    setErrors((current) => {
      const nextErrors = { ...current }
      delete nextErrors.imageStorageKey
      return nextErrors
    })
    setPendingImageFile(selectedFile)
    setPreviewImageName(selectedFile.name)
    setPreviewImageUrl(nextPreviewUrl)
  }

  function removeProductImage() {
    setPendingImageFile(null)
    setPreviewImageName('')
    setPreviewImageUrl(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = productFormSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }

    setErrors({})
    await onSubmit({
      imageAction: pendingImageFile ? 'replace' : (previewImageUrl ? 'keep' : 'remove'),
      imageFile: pendingImageFile,
      values: parsed.data,
    })
  }

  return (
    <form className="overflow-hidden rounded-md bg-slate-900 dark:bg-[#0f172a] shadow-xl flex flex-col w-full max-h-[90vh]" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 bg-slate-900 dark:bg-[#0f172a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <h3 className="text-lg font-bold text-white">{form.id ? 'แก้ไขสินค้าสิ่งเจือปน' : 'เพิ่มสินค้าสิ่งเจือปน'}</h3>
        <ActiveToggle checked={form.active} labelClassName="text-sm font-medium text-slate-200 dark:text-slate-800" onChange={(checked) => update('active', checked)} />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 px-5 py-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ข้อมูลสินค้า</h4>
          <div className="grid gap-3 md:grid-cols-4">
            {form.id ? <TextField error={errors.code} label="รหัสสินค้า" readOnly value={form.code ?? ''} onChange={(value) => update('code', value)} /> : null}
            <TextField className={form.id ? 'md:col-span-1' : 'md:col-span-2'} error={errors.name} label="ชื่อสินค้า *" value={form.name} onChange={(value) => update('name', value)} />
            <TextField
              label="ประเภทสินค้า"
              readOnly
              value="สินค้าสิ่งเจือปน"
              onChange={() => {}}
            />
            <SelectField error={errors.unit} label="หน่วย" value={form.unit ?? ''} onChange={(value) => update('unit', value || null)}>
              <option value="">เลือกหน่วย</option>
              {productUnits.map((unit) => {
                const value = unit.symbol || unit.name
                const label = unit.symbol && unit.symbol !== unit.name ? `${unit.name} (${unit.symbol})` : unit.name
                return <option key={unit.id} value={value}>{label}</option>
              })}
            </SelectField>
            <div className="md:col-span-4">
              <div className="block text-xs font-medium text-slate-600">
                รูปสินค้า
                <div className={`mt-1 rounded-md border bg-slate-50 p-3 ${errors.imageStorageKey ? 'border-red-300' : 'border-slate-200'}`}>
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="relative flex h-36 w-36 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-emerald-400 hover:bg-slate-50 transition-colors">
                        {previewImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt={form.name || 'ตัวอย่าง'} className="h-full w-full object-cover rounded-xl" src={previewImageUrl} />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-center text-xs font-semibold text-white opacity-0 hover:opacity-100 transition rounded-xl">
                              คลิกเพื่อเปลี่ยนรูป
                            </span>
                          </>
                        ) : (
                          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-700">
                            <span className="text-2xl mb-1">📁</span>
                            <span className="px-2 text-center text-xs font-semibold text-slate-700">เพิ่มรูปสินค้า</span>
                          </span>
                        )}
                        <input
                          accept="image/*"
                          className="hidden"
                          type="file"
                          onChange={(event) => {
                            void replacePrimaryImage(event.target.files)
                            event.target.value = ''
                          }}
                        />
                      </label>
                      {previewImageUrl ? (
                        <button className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline" type="button" onClick={removeProductImage}>
                          <Trash2 className="h-3.5 w-3.5" />
                          ลบรูปหลัก
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {errors.imageStorageKey ? <div className="mt-2 text-xs text-red-700">{errors.imageStorageKey}</div> : null}
                </div>
              </div>
            </div>
          </div>
        </section>
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

type SelectFieldProps = {
  children: React.ReactNode
  error?: string
  label: string
  value: string
  onChange: (value: string) => void
}

function SelectField({ children, error, label, value, onChange }: SelectFieldProps) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {labelText}{hasInlineRequired ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <select
        className={`w-full h-10 rounded-md border px-3 py-2 text-sm text-slate-900 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white border-slate-300 hover:border-slate-400 ${error ? 'border-red-400 bg-red-50/50' : ''}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
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
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  const isNumberField = type === 'number'

  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {labelText}{hasInlineRequired ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <input
        className={`w-full h-10 rounded-md border px-3 py-2 text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isNumberField ? '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' : ''} ${readOnly ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400'} ${error ? 'border-red-400 bg-red-50/50' : ''}`}
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

function MatchButton({ active, label, onClick, tone = 'dark' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const activeClass = {
    amber: 'border-amber-600 bg-amber-600 text-white',
    dark: 'border-slate-700 bg-slate-700 text-white',
    emerald: 'border-emerald-600 bg-emerald-600 text-white',
    red: 'border-red-600 bg-red-600 text-white',
    slate: 'border-slate-500 bg-slate-500 text-white',
  }[tone]
  const idleClass = tone === 'amber' ? 'border-slate-300 bg-white hover:bg-amber-50' : tone === 'emerald' ? 'border-slate-300 bg-white hover:bg-emerald-50' : tone === 'red' ? 'border-slate-300 bg-white hover:bg-red-50' : 'border-slate-300 bg-white hover:bg-slate-100'
  return <button className={`rounded-md border px-3.5 py-1.5 text-sm font-medium ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
}
