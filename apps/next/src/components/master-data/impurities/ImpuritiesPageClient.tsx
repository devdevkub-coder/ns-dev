'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
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
          <div className="grid w-full gap-2 md:grid-cols-2 xl:max-w-2xl xl:grid-cols-[minmax(0,1fr)_130px]">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(event) => {
                setPage(1)
                setSearch(event.target.value)
              }}
              placeholder="ค้นหา..."
              type="search"
              value={search}
            />
            <select
              aria-label="กรองสถานะใช้งาน"
              className="rounded-md border px-3 py-2 text-sm"
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
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" type="button" onClick={resetFilters}>
              ล้างตัวกรอง
            </button>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="button" onClick={openCreateForm}>
              + เพิ่มสิ่งเจือปน
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
              className="rounded-md border border-slate-300 px-2 py-1"
              value={pageSize}
              onChange={(event) => {
                setPage(1)
                setPageSize(Number(event.target.value))
              }}
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
            </select>
            <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage(Math.max(1, page - 1))}>
              ก่อนหน้า
            </button>
            <span className="px-1">
              หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
            </span>
            <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>
              ถัดไป
            </button>
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
        <div className="overflow-x-auto rounded-md bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="min-w-[260px] p-2 text-left"><button className="font-semibold" type="button" onClick={() => setSort('name')}>ชื่อสิ่งเจือปน{sortLabel('name')}</button></th>
                <th className="w-44 p-2 text-center"><button className="font-semibold" type="button" onClick={() => setSort('active')}>สถานะ{sortLabel('active')}</button></th>
                <th className="w-28 p-2 text-center">แก้ไข</th>
              </tr>
            </thead>
            <tbody>
              {paginatedImpurities.map((impurity) => (
                <tr
                  key={impurity.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
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
                  <td className="p-2 font-medium">{impurity.name}</td>
                  <td className="p-2 text-center">
                    <ActiveToggle
                      checked={impurity.active}
                      disabled={pendingToggleIds.has(impurity.id)}
                      label={impurity.active ? 'ใช้งาน' : 'ปิด'}
                      onChange={(active) => void handleToggleActive(impurity, active)}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      className="text-blue-600"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openEditForm(impurity)
                      }}
                    >
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedImpurities.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-sm text-slate-500" colSpan={3}>ไม่พบข้อมูลที่ค้นหา</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
    <form className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-bold text-slate-900">{form.id ? 'แก้ไขสิ่งเจือปน' : 'เพิ่มสิ่งเจือปน'}</h3>
        <ActiveToggle checked={form.active} onChange={(checked) => update('active', checked)} />
      </div>

      <div className="max-h-[76vh] space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <h4 className="mb-3 text-sm font-bold text-slate-700">ข้อมูลสิ่งเจือปน</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField className="md:col-span-2" error={errors.name} label="ชื่อสิ่งเจือปน *" value={form.name} onChange={(value) => update('name', value)} />
          </div>
        </section>
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

type TextFieldProps = {
  className?: string
  error?: string
  label: string
  value: string
  onChange: (value: string) => void
}

function TextField({ className = '', error, label, value, onChange }: TextFieldProps) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <input
        className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-700"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
