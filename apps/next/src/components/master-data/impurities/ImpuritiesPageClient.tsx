'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { Button } from '@/components/ui/Button'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { getErrorMessage } from '@/lib/api-client'
import {
  impurityFormSchema,
  listImpurities,
  saveImpurity,
  setImpurityActive,
  type Impurity,
  type ImpurityFormValues,
} from '@/lib/impurity'

type SortKey = 'active' | 'name'
type ImpurityColumnKey = SortKey | 'action'

const impurityColumns: Array<ResizableColumnDefinition<ImpurityColumnKey>> = [
  { key: 'name', defaultWidth: 320, minWidth: 180 },
  { key: 'active', defaultWidth: 110, minWidth: 90 },
  { key: 'action', defaultWidth: 80, minWidth: 70 },
]


const emptyImpurityForm: ImpurityFormValues = {
  id: undefined,
  name: '',
  active: true,
}

const pageSizeOptions = [10, 25, 50, 100]

function impurityToForm(impurity: Impurity): ImpurityFormValues {
  return {
    id: impurity.id,
    name: impurity.name,
    active: impurity.active,
  }
}

function compareImpurities(left: Impurity, right: Impurity, key: SortKey, direction: 'asc' | 'desc') {
  const multiplier = direction === 'asc' ? 1 : -1
  const leftValue = left[key]
  const rightValue = right[key]

  if (typeof leftValue === 'boolean' || typeof rightValue === 'boolean') {
    return (Number(leftValue ?? false) - Number(rightValue ?? false)) * multiplier
  }

  return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th', { numeric: true }) * multiplier
}

export function ImpuritiesPageClient() {
  const [activeFilter, setActiveFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [impurities, setImpurities] = useState<Impurity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [selectedImpurity, setSelectedImpurity] = useState<Impurity | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('master-data.impurities', impurityColumns)


  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setImpurities(await listImpurities())
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลสิ่งเจือปนไม่ได้'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredSortedImpurities = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = impurities.filter((impurity) => {
      if (activeFilter === 'active' && !impurity.active) return false
      if (activeFilter === 'inactive' && impurity.active) return false
      if (!query) return true
      return impurity.name.toLowerCase().includes(query)
    })

    return [...rows].sort((left, right) => compareImpurities(left, right, sortKey, sortDirection))
  }, [activeFilter, impurities, search, sortDirection, sortKey])

  const total = filteredSortedImpurities.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedImpurities = filteredSortedImpurities.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function openCreateForm() {
    setSelectedImpurity(null)
    setFormOpen(true)
  }

  function openEditForm(impurity: Impurity) {
    setSelectedImpurity(impurity)
    setFormOpen(true)
  }

  async function handleSubmit(values: ImpurityFormValues) {
    setIsSaving(true)
    setError(null)
    try {
      await saveImpurity(values)
      setFormOpen(false)
      setSelectedImpurity(null)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกข้อมูลสิ่งเจือปนไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(impurity: Impurity, active: boolean) {
    setError(null)
    setPendingToggleIds((current) => new Set(current).add(impurity.id))
    setImpurities((current) => current.map((row) => row.id === impurity.id ? { ...row, active } : row))
    setSelectedImpurity((current) => current?.id === impurity.id ? { ...current, active } : current)

    try {
      const updatedImpurity = await setImpurityActive(impurity.id, active)
      setImpurities((current) => current.map((row) => row.id === updatedImpurity.id ? updatedImpurity : row))
      setSelectedImpurity((current) => current?.id === updatedImpurity.id ? updatedImpurity : current)
    } catch (caught) {
      setImpurities((current) => current.map((row) => row.id === impurity.id ? { ...row, active: impurity.active } : row))
      setSelectedImpurity((current) => current?.id === impurity.id ? { ...current, active: impurity.active } : current)
      setError(getErrorMessage(caught, 'อัปเดตสถานะสิ่งเจือปนไม่ได้'))
    } finally {
      setPendingToggleIds((current) => {
        const next = new Set(current)
        next.delete(impurity.id)
        return next
      })
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
    setSearch('')
    setPage(1)
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลดหรือบันทึกข้อมูลสิ่งเจือปนไม่ได้</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-2 w-full xl:max-w-2xl xl:grid xl:grid-cols-[minmax(0,1fr)_130px]">
            <div className="flex gap-2 w-full">
              <input
                className="h-9 w-full flex-1 rounded-md border border-slate-300 px-3 text-sm"
                onChange={(event) => {
                  setPage(1)
                  setSearch(event.target.value)
                }}
                placeholder="ค้นหา..."
                type="search"
                value={search}
              />
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 xl:hidden"
                onClick={() => setShowMobileFilters(true)}
              >
                <span className="text-slate-500">🔍</span> ตัวกรอง {activeFilter ? '(1)' : ''}
              </button>
            </div>
            <select
              aria-label="กรองสถานะใช้งาน"
              className="h-9 rounded-md border border-slate-300 px-3 text-sm hidden xl:block"
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
          <div className="flex flex-wrap items-center justify-end gap-2 w-full xl:w-auto xl:ml-auto">
            <button className="h-9 flex-1 xl:flex-none justify-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 hidden xl:inline-flex" type="button" onClick={resetFilters}>
              ล้างตัวกรอง
            </button>
            <button className="inline-flex h-9 w-full xl:w-auto justify-center items-center gap-1 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hidden xl:inline-flex" type="button" onClick={openCreateForm}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              เพิ่มสิ่งเจือปน
            </button>
          </div>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 xl:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform"
          onClick={openCreateForm}
          type="button"
          aria-label="เพิ่มสิ่งเจือปน"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 xl:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 animate-slide-up max-h-[80vh] overflow-y-auto">
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
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะใช้งาน</span>
                <select
                  aria-label="กรองสถานะใช้งานมือถือ"
                  className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
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
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setActiveFilter('')
                  setPage(1)
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
              <Button className="hidden md:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>
                Set col to default
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
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
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

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <div className="w-full max-w-4xl">
            <ImpurityForm
              impurity={selectedImpurity}
              isSaving={isSaving}
              onCancel={() => {
                setFormOpen(false)
                setSelectedImpurity(null)
              }}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="rounded-md bg-white p-6 text-center text-sm text-slate-500 shadow">กำลังโหลดข้อมูลสิ่งเจือปน</div> : null}

      {!isLoading ? (
        <>
          {/* Desktop Table View */}
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm hidden md:block">
            <div className="overflow-x-auto">
              <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {impurityColumns.map((column) => (
                    <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <TableHeader>
                  <tr>
                    <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ชื่อสิ่งเจือปน" resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อสิ่งเจือปน')} sortKey="name" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={setSort} />
                    <ResizableTableHead align="center" label="แก้ไข" resizeProps={columnResize.getResizeHandleProps('action', 'แก้ไข')} />
                  </tr>
                </TableHeader>
                <TableBody>
                  {paginatedImpurities.map((impurity) => (
                    <TableRow
                      key={impurity.id}
                      className="cursor-pointer border-slate-100 hover:bg-slate-50"
                      role="button"
                      tabIndex={0}
                      onClick={() => openEditForm(impurity)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openEditForm(impurity)
                        }
                      }}
                    >
                      <TableCell className="text-xs font-semibold text-slate-700">{impurity.name}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-slate-700">
                        <ActiveToggle
                          checked={impurity.active}
                          disabled={pendingToggleIds.has(impurity.id)}
                          label={impurity.active ? 'ใช้งาน' : 'ปิด'}
                          onChange={(checked) => void handleToggleActive(impurity, checked)}
                        />
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold text-slate-700">
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openEditForm(impurity)
                          }}
                        >
                          แก้ไข
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedImpurities.length === 0 ? (
                    <TableRow>
                      <TableCell className="p-4 text-center text-sm text-slate-500" colSpan={3}>ไม่พบข้อมูลที่ค้นหา</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="block md:hidden space-y-3">
            {paginatedImpurities.map((impurity) => (
              <div
                key={impurity.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => openEditForm(impurity)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-[15px]">
                      {impurity.name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <ActiveToggle
                      checked={impurity.active}
                      disabled={pendingToggleIds.has(impurity.id)}
                      label={impurity.active ? 'ใช้งาน' : 'ปิด'}
                      onChange={(checked) => void handleToggleActive(impurity, checked)}
                    />
                  </div>
                </div>

              </div>
            ))}
            {paginatedImpurities.length === 0 ? (
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

type ImpurityFormProps = {
  impurity: Impurity | null
  isSaving: boolean
  onCancel: () => void
  onSubmit: (values: ImpurityFormValues) => Promise<void>
}

function ImpurityForm({ impurity, isSaving, onCancel, onSubmit }: ImpurityFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<ImpurityFormValues>(() => (impurity ? impurityToForm(impurity) : emptyImpurityForm))

  useEffect(() => {
    setForm(impurity ? impurityToForm(impurity) : emptyImpurityForm)
    setErrors({})
  }, [impurity])

  function update<K extends keyof ImpurityFormValues>(key: K, value: ImpurityFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = impurityFormSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }

    setErrors({})
    await onSubmit(parsed.data)
  }

  return (
    <form className="overflow-hidden rounded-md bg-slate-900 shadow-xl flex flex-col w-full max-h-[90vh]" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 bg-slate-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <h3 className="text-lg font-bold text-slate-100">{form.id ? 'แก้ไขสิ่งเจือปน' : 'เพิ่มสิ่งเจือปน'}</h3>
        <ActiveToggle checked={form.active} labelClassName="text-sm font-medium text-slate-200" onChange={(checked) => update('active', checked)} />
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 px-5 py-5 space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ข้อมูลสิ่งเจือปน</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField className="md:col-span-2" error={errors.name} label="ชื่อสิ่งเจือปน *" value={form.name} onChange={(value) => update('name', value)} />
          </div>
        </section>
      </div>

      <div className="flex flex-wrap justify-end gap-3.5 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-normal text-slate-700 hover:bg-slate-50" type="button" onClick={onCancel}>
          ยกเลิก
        </button>
        <button className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-normal text-white hover:bg-slate-800 disabled:opacity-60 shadow-sm" disabled={isSaving} type="submit">
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
  value: string
  onChange: (value: string) => void
}

function TextField({ className = '', error, label, value, onChange }: TextFieldProps) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label

  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {labelText}{hasInlineRequired ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <input
        className={`w-full h-10 rounded-md border px-3 py-2 text-sm outline-none transition-all duration-150 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 bg-white text-slate-800 border-slate-300 hover:border-slate-400 ${error ? 'border-red-400 bg-red-50/50' : ''}`}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
