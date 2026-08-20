'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { Button } from '@/components/ui/Button'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import {
  readCompanyGodowns,
  writeCompanyGodowns,
  type GodownItem,
} from '@/lib/company-godowns'
import { emptyMasterDataForm, listMasterDataRecords, saveMasterDataRecord, setMasterDataRecordActive, type MasterDataRecord } from '@/lib/master-data'

type StatusFilter = 'all' | 'active' | 'inactive'
type SortKey = 'code' | 'name' | 'branchName' | 'inCharge' | 'active'
type TableColumnKey = SortKey | '__action'
type WarehouseItem = GodownItem

const pageSizeOptions = [10, 25, 50, 100]

const EMPTY_FORM: WarehouseItem = {
  active: true,
  branchId: '',
  branchName: '',
  code: '',
  id: '',
  name: '',
}

function getBranchDigits(branchCode?: string): string {
  if (!branchCode) return ''
  const digits = branchCode.replace(/\D/g, '')
  if (digits) {
    return digits.padStart(2, '0')
  }
  return branchCode.trim()
}

export function nextWarehouseCode(items: WarehouseItem[], branchCode?: string): string {
  if (!branchCode) return ''
  const branchDigits = getBranchDigits(branchCode)
  const regex = new RegExp(`^KD-${branchDigits}(\\d{2})$`, 'i')
  const nums = items
    .map((item) => item.code.match(regex))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => parseInt(match[1], 10))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `KD-${branchDigits}${String(next).padStart(2, '0')}`
}

function recordToItem(record: MasterDataRecord): WarehouseItem {
  return {
    active: record.active,
    branchId: record.branchId ?? undefined,
    branchName: record.branchName ?? undefined,
    code: record.code ?? '',
    createdAt: record.createdAt ?? undefined,
    id: record.id,
    inCharge: record.inCharge ?? undefined,
    name: record.name,
    targetBaleCount: record.targetBaleCount ?? undefined,
    targetSortKg: record.targetSortKg ?? undefined,
    updatedAt: record.updatedAt ?? undefined,
  }
}

function compareItems(left: WarehouseItem, right: WarehouseItem, key: SortKey, direction: 'asc' | 'desc') {
  const multiplier = direction === 'asc' ? 1 : -1
  const leftValue = left[key]
  const rightValue = right[key]
  if (typeof leftValue === 'boolean' || typeof rightValue === 'boolean') {
    return (Number(leftValue ?? false) - Number(rightValue ?? false)) * multiplier
  }
  return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th', { numeric: true }) * multiplier
}

function MatchButton({ active, label, onClick, tone = 'slate' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const toneActive = tone === 'emerald'
    ? 'border-emerald-700 bg-emerald-700 text-white'
    : tone === 'red'
    ? 'border-red-700 bg-red-700 text-white'
    : tone === 'amber'
    ? 'border-amber-600 bg-amber-600 text-white'
    : 'border-slate-700 bg-slate-700 text-white'
  const className = active ? toneActive : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${className}`} type="button" onClick={onClick}>{label}</button>
}

export function CompanyGodownsPageClient() {
  const [items, setItems] = useState<WarehouseItem[]>([])
  const [branches, setBranches] = useState<Array<{ code: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [formItem, setFormItem] = useState<WarehouseItem>(EMPTY_FORM)
  const [isEditing, setIsEditing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WarehouseItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offlineMode, setOfflineMode] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortKey, setSortKey] = useState<SortKey>('code')

  const resizableColumns = useMemo<Array<ResizableColumnDefinition<TableColumnKey>>>(() => ([
    { defaultWidth: 120, key: 'code', minWidth: 90, maxWidth: 160 },
    { defaultWidth: 220, key: 'name', minWidth: 150, maxWidth: 360 },
    { defaultWidth: 180, key: 'branchName', minWidth: 120, maxWidth: 260 },
    { defaultWidth: 180, key: 'inCharge', minWidth: 120, maxWidth: 260 },
    { defaultWidth: 100, key: 'active', minWidth: 80, maxWidth: 140 },
    { defaultWidth: 80, key: '__action', minWidth: 64, maxWidth: 96 },
  ]), [])
  const columnResize = useResizableColumns<TableColumnKey>('company-data.godown-names', resizableColumns)

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const [rows, branchRows] = await Promise.all([
        listMasterDataRecords('/api/master-data/godowns'),
        listMasterDataRecords('/api/master-data/branches').catch(() => []),
      ])
      const nextItems = rows.map(recordToItem)
      setItems(nextItems)
      setBranches(branchRows.filter((b) => b.active !== false).map((b) => ({ code: b.code || b.id, name: b.name })))
      writeCompanyGodowns(nextItems)
      setOfflineMode(false)
    } catch {
      const offline = readCompanyGodowns()
      if (offline.length > 0) {
        setItems(offline)
        setOfflineMode(true)
      } else {
        setError('โหลดข้อมูลโกดังไม่ได้ และไม่มีข้อมูลสำรองในเครื่อง กรุณาตรวจสอบการเชื่อมต่อ')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      if (statusFilter === 'active' && !item.active) return false
      if (statusFilter === 'inactive' && item.active) return false
      if (!query) return true
      return [item.code, item.name, item.branchName, item.branchId, item.inCharge]
        .some((value) => (value ?? '').toLowerCase().includes(query))
    })
  }, [items, search, statusFilter])

  const sortedItems = useMemo(() => {
    const next = [...filteredItems]
    next.sort((left, right) => compareItems(left, right, sortKey, sortDirection))
    return next
  }, [filteredItems, sortDirection, sortKey])

  const totalActive = useMemo(() => items.filter((item) => item.active).length, [items])
  const totalCount = items.length
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedItems.slice(start, start + pageSize)
  }, [currentPage, pageSize, sortedItems])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

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

  function resetFilters() {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }

  function openCreate() {
    const defaultBranch = branches[0]
    const defaultBranchCode = defaultBranch?.code || ''
    const initialCode = defaultBranchCode ? nextWarehouseCode(items, defaultBranchCode) : ''
    setFormItem({
      ...EMPTY_FORM,
      branchId: defaultBranchCode || undefined,
      branchName: defaultBranch?.name,
      code: initialCode,
    })
    setIsEditing(false)
    setError(null)
    setMessage(null)
    setFormOpen(true)
  }

  function openEdit(item: WarehouseItem) {
    setFormItem({ ...item })
    setIsEditing(true)
    setError(null)
    setMessage(null)
    setFormOpen(true)
  }

  async function persistLocally(nextItems: WarehouseItem[], actionMessage: string) {
    writeCompanyGodowns(nextItems)
    setItems(nextItems)
    setOfflineMode(true)
    setMessage(`${actionMessage} (บันทึกในเครื่องเท่านั้น ยังไม่ได้บันทึกที่ฐานข้อมูล)`)
  }

  async function handleSave() {
    if (!formItem.branchId) {
      setError('กรุณาเลือกสาขา')
      return
    }
    if (!formItem.name.trim()) {
      setError('กรุณากรอกชื่อโกดัง')
      return
    }
    if (!formItem.code.trim()) {
      setError('กรุณาเลือกสาขาเพื่อสร้างรหัสโกดัง')
      return
    }
    if (items.some((item) => item.code.toUpperCase() === formItem.code.trim().toUpperCase() && String(item.id) !== String(formItem.id))) {
      setError(`รหัสโกดัง ${formItem.code.trim()} ซ้ำกับรายการที่มีอยู่แล้ว`)
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await saveMasterDataRecord('/api/master-data/godowns', {
        ...emptyMasterDataForm,
        active: formItem.active,
        branchId: formItem.branchId || null,
        code: formItem.code,
        id: formItem.id ? String(formItem.id) : undefined,
        inCharge: formItem.inCharge?.trim() || null,
        name: formItem.name,
      })
      const savedItem = recordToItem(saved)
      const nextItems = isEditing
        ? items.map((item) => String(item.id) === String(savedItem.id) ? savedItem : item)
        : [...items, savedItem]
      writeCompanyGodowns(nextItems)
      setItems(nextItems)
      setOfflineMode(false)
      setMessage(isEditing ? `แก้ไขโกดัง ${savedItem.code} แล้ว` : `เพิ่มโกดัง ${savedItem.code} แล้ว`)
      setFormOpen(false)
    } catch (caught) {
      const fallbackItem: WarehouseItem = {
        ...formItem,
        id: formItem.id || `local-${Date.now()}`,
      }
      const nextItems = isEditing
        ? items.map((item) => String(item.id) === String(fallbackItem.id) ? fallbackItem : item)
        : [...items, fallbackItem]
      await persistLocally(nextItems, isEditing ? `แก้ไขโกดัง ${fallbackItem.code} (ออฟไลน์)` : `เพิ่มโกดัง ${fallbackItem.code} (ออฟไลน์)`)
      setFormOpen(false)
      void caught
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(item: WarehouseItem) {
    setError(null)
    setMessage(null)
    try {
      const saved = await setMasterDataRecordActive('/api/master-data/godowns', String(item.id), !item.active)
      const savedItem = recordToItem(saved)
      const nextItems = items.map((entry) => String(entry.id) === String(savedItem.id) ? savedItem : entry)
      writeCompanyGodowns(nextItems)
      setItems(nextItems)
      setOfflineMode(false)
      setMessage(`โกดัง ${savedItem.code} ${savedItem.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} แล้ว`)
    } catch {
      const nextItems = items.map((entry) => String(entry.id) === String(item.id) ? { ...entry, active: !entry.active } : entry)
      await persistLocally(nextItems, `เปลี่ยนสถานะโกดัง ${item.code} (ออฟไลน์)`)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setError(null)
    setMessage(null)
    let offlineError: unknown = null
    let rejected: string | null = null
    try {
      const response = await fetch(`/api/master-data/godowns/${encodeURIComponent(String(deleteTarget.id))}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'ลบโกดังไม่ได้' })) as { error?: string }
        rejected = payload.error ?? 'ลบโกดังไม่ได้'
      } else {
        const nextItems = items.filter((item) => String(item.id) !== String(deleteTarget.id))
        writeCompanyGodowns(nextItems)
        setItems(nextItems)
        setOfflineMode(false)
        setMessage(`ลบโกดัง ${deleteTarget.code} แล้ว`)
      }
    } catch (caught) {
      offlineError = caught
    } finally {
      if (offlineError !== null) {
        await persistLocally(
          items.filter((item) => String(item.id) !== String(deleteTarget.id)),
          `ลบโกดัง ${deleteTarget.code} (ออฟไลน์)`,
        )
      }
    }
    if (rejected !== null) setError(rejected)
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  function handleDeleteFromEdit() {
    setFormOpen(false)
    setDeleteTarget(formItem)
  }

  return (
    <section className="space-y-4">
      {offlineMode ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <span>กำลังทำงานในโหมดออฟไลน์ ข้อมูลถูกบันทึกไว้ในเครื่องนี้เท่านั้น และจะไม่ถูกแชร์กับผู้ใช้คนอื่น</span>
        </div>
      ) : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div> : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block lg:space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              aria-label="ค้นหาโกดัง"
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="ค้นหารหัส ชื่อโกดัง หรือหัวหน้าโกดัง..."
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
          {search || statusFilter !== 'all' ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" type="button" onClick={resetFilters}>
              ✕ ล้าง
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">สถานะ:</span>
          <MatchButton active={statusFilter === 'all'} label="ทั้งหมด" onClick={() => { setStatusFilter('all'); setPage(1) }} />
          <MatchButton active={statusFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => { setStatusFilter('active'); setPage(1) }} />
          <MatchButton active={statusFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => { setStatusFilter('inactive'); setPage(1) }} />
          <button
            className="ml-auto inline-flex h-10 items-center gap-1 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 focus:outline-none"
            type="button"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" /> เพิ่มโกดัง
          </button>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-2 space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              aria-label="ค้นหาโกดัง"
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="ค้นหารหัส ชื่อ หรือหัวหน้า..."
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <button
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            type="button"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง{statusFilter !== 'all' ? ' (มี)' : ''}
          </button>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
        <button
          aria-label="เพิ่มโกดัง"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform active:scale-95 focus:outline-none"
          type="button"
          onClick={openCreate}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองโกดัง"
          onClose={() => setShowMobileFilters(false)}
          footer={(
            <>
              <button
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                type="button"
                onClick={() => {
                  resetFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                type="button"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </>
          )}
        >
          <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">สถานะการใช้งาน</span>
          <div className="flex flex-wrap gap-2">
            <MatchButton active={statusFilter === 'all'} label="ทั้งหมด" onClick={() => { setStatusFilter('all'); setPage(1) }} />
            <MatchButton active={statusFilter === 'active'} label="ใช้งาน" tone="emerald" onClick={() => { setStatusFilter('active'); setPage(1) }} />
            <MatchButton active={statusFilter === 'inactive'} label="ปิด" tone="slate" onClick={() => { setStatusFilter('inactive'); setPage(1) }} />
          </div>
        </MobileFilterSheet>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดข้อมูล...
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
            <div>
              พบทั้งหมด <span className="font-semibold text-slate-900 dark:text-slate-100">{sortedItems.length}</span> รายการ
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                ใช้งาน {totalActive} / ทั้งหมด {totalCount}
              </span>
            </div>
            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto">
              {columnResize.hasCustomWidths ? (
                <Button className="hidden lg:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>
                  คืนค่าเดิมตาราง
                </Button>
              ) : null}
              <PageSizeDropdown options={pageSizeOptions} value={pageSize} onChange={(size) => {
                setPageSize(size)
                setPage(1)
              }} />
              <div className="flex items-center gap-2">
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
                <span className="px-1 text-xs">หน้า {currentPage} / {totalPages}</span>
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</button>
              </div>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
            <div className="overflow-x-auto">
              <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {resizableColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}
                </colgroup>
                <TableHeader>
                  <tr>
                    <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="รหัส" resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')} sortKey="code" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="ชื่อโกดัง" resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อโกดัง')} sortKey="name" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="สาขา" resizeProps={columnResize.getResizeHandleProps('branchName', 'สาขา')} sortKey="branchName" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="หัวหน้าโกดัง" resizeProps={columnResize.getResizeHandleProps('inCharge', 'หัวหน้าโกดัง')} sortKey="inCharge" onSort={setSort} />
                    <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={setSort} />
                    <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('__action', 'จัดการ')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {paginatedItems.map((item) => (
                    <TableRow key={`company-warehouse-${item.id}`} className="border-slate-100 hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/60 dark:focus-within:bg-slate-800/60">
                      <TableCell className="p-3 text-xs font-semibold text-slate-700 dark:text-slate-200 font-mono whitespace-nowrap">{item.code || '—'}</TableCell>
                      <TableCell className="p-3 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{item.name}</TableCell>
                      <TableCell className="p-3 text-xs text-slate-700 dark:text-slate-200 truncate">
                        {item.branchName ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/70 dark:text-sky-300">
                            🏢 {item.branchName}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="p-3 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{item.inCharge || '—'}</TableCell>
                      <TableCell className="p-3 text-center">
                        <ActiveToggle
                          checked={item.active}
                          label={item.active ? 'ใช้งาน' : 'ปิด'}
                          onChange={() => void handleToggleActive(item)}
                        />
                      </TableCell>
                      <TableCell className="p-3 text-center">
                        <TableActionButton
                          aria-label={`จัดการโกดัง ${item.code}`}
                          label="จัดการ"
                          menu={(
                            <>
                              <TableActionMenuItem onSelect={() => openEdit(item)}>แก้ไข</TableActionMenuItem>
                              <TableActionMenuItem onSelect={() => setDeleteTarget(item)}>ลบ</TableActionMenuItem>
                            </>
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {sortedItems.length === 0 ? (
                    <TableRow>
                      <TableCell className="p-8 text-center text-sm text-slate-500" colSpan={6}>ไม่พบข้อมูลโกดัง</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="block space-y-3 lg:hidden">
            {paginatedItems.map((item) => (
              <div key={`mobile-warehouse-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.code ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {item.code}
                        </span>
                      ) : null}
                      {item.branchName ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/70 dark:text-sky-300">
                          🏢 {item.branchName}
                        </span>
                      ) : null}
                    </div>
                    <h4 className="mt-1.5 text-[15px] font-bold text-slate-900 dark:text-slate-100">{item.name}</h4>
                    {item.inCharge ? <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">👤 {item.inCharge}</div> : null}
                  </div>
                  <div className="shrink-0">
                    <ActiveToggle
                      checked={item.active}
                      label={item.active ? 'ใช้งาน' : 'ปิด'}
                      onChange={() => void handleToggleActive(item)}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
                  <TableActionButton
                    aria-label={`จัดการโกดัง ${item.code}`}
                    mobileLabel
                    menu={(
                      <>
                        <TableActionMenuItem onSelect={() => openEdit(item)}>แก้ไข</TableActionMenuItem>
                        <TableActionMenuItem onSelect={() => setDeleteTarget(item)}>ลบ</TableActionMenuItem>
                      </>
                    )}
                  />
                </div>
              </div>
            ))}
            {sortedItems.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                ไม่พบข้อมูลโกดัง
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open && !isSaving) setFormOpen(false) }}>
        <DialogContent mobileAppShell={false} className="max-w-md rounded-md !p-0" fallbackTitle={isEditing ? 'แก้ไขโกดัง' : 'โกดังใหม่'} hideClose>
          <DialogHeader>
            <DialogTitle>{isEditing ? '✏️ แก้ไขโกดัง' : '➕ โกดังใหม่'}</DialogTitle>
            <DialogDescription>กรอกข้อมูลโกดัง แล้วกดบันทึก</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto bg-white px-5 py-4 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  สาขา <span className="text-red-600">*</span>
                </span>
                <select
                  aria-label="สาขา"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
                  disabled={isEditing}
                  value={formItem.branchId ?? ''}
                  onChange={(event) => {
                    const code = event.target.value
                    const matched = branches.find((b) => b.code === code)
                    const nextCode = code ? nextWarehouseCode(items, code) : ''
                    setFormItem((current) => ({
                      ...current,
                      branchId: code || undefined,
                      branchName: matched ? matched.name : undefined,
                      code: isEditing ? current.code : nextCode,
                    }))
                  }}
                >
                  <option value="">— เลือกสาขา —</option>
                  {branches.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  รหัสโกดัง (Auto) <span className="text-red-600">*</span>
                </span>
                <Input
                  aria-label="รหัสโกดัง"
                  className="h-10 cursor-not-allowed bg-slate-100 font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  disabled
                  placeholder="เช่น KD-0101"
                  readOnly
                  value={formItem.code || '(เลือกสาขาก่อน)'}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ชื่อโกดัง <span className="text-red-600">*</span>
                </span>
                <Input
                  aria-label="ชื่อโกดัง"
                  autoFocus
                  className="h-10"
                  placeholder="เช่น โกดัง 1"
                  value={formItem.name}
                  onChange={(event) => setFormItem((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  หัวหน้าโกดัง
                </span>
                <Input
                  aria-label="หัวหน้าโกดัง"
                  className="h-10"
                  placeholder="เช่น สมชาย"
                  value={formItem.inCharge ?? ''}
                  onChange={(event) => setFormItem((current) => ({ ...current, inCharge: event.target.value }))}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            {isEditing ? (
              <button
                className="mr-auto inline-flex items-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                disabled={isSaving}
                type="button"
                onClick={handleDeleteFromEdit}
              >
                <Trash2 className="h-4 w-4" /> ลบ
              </button>
            ) : null}
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              disabled={isSaving}
              type="button"
              onClick={() => setFormOpen(false)}
            >
              ยกเลิก
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={() => void handleSave()}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              บันทึก
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteTarget(null) }}>
        <DialogContent mobileAppShell={false} className="max-w-md rounded-md !p-0" fallbackTitle="ยืนยันการลบโกดัง" hideClose>
          <DialogHeader>
            <DialogTitle>ยืนยันการลบโกดัง</DialogTitle>
            <DialogDescription>การลบโกดังนี้จะถูกลบออกจากระบบถาวร และไม่สามารถกู้คืนได้ (หากโกดังถูกอ้างอิงในเอกสาร ระบบจะปิดการใช้งานแทน)</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 bg-white px-5 py-4 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <span>
              ต้องการลบโกดัง <strong>{deleteTarget?.code}</strong> — <strong>{deleteTarget?.name}</strong> ใช่หรือไม่?
            </span>
          </div>
          <DialogFooter>
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              disabled={isDeleting}
              type="button"
              onClick={() => setDeleteTarget(null)}
            >
              ยกเลิก
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              disabled={isDeleting}
              type="button"
              onClick={() => void handleDelete()}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              ลบโกดัง
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
