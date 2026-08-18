'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'

const warehouseCount = 5
const storageKey = 'ns-erp-company-warehouse-names'

function emptyNames() {
  return Array.from({ length: warehouseCount }, () => '')
}

function readNames() {
  if (typeof window === 'undefined') return emptyNames()
  try {
    const values = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
    if (!Array.isArray(values)) return emptyNames()
    return emptyNames().map((_, index) => typeof values[index] === 'string' ? values[index] : '')
  } catch {
    return emptyNames()
  }
}

export function CompanyWarehouseNamesPageClient() {
  const [names, setNames] = useState<string[]>(readNames)
  const [search, setSearch] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const filteredNames = useMemo(() => {
    const query = search.trim().toLowerCase()
    return names
      .map((name, index) => ({ index, name }))
      .filter(({ name }) => !query || name.toLowerCase().includes(query) || `โกดัง ${name}`.toLowerCase().includes(query))
  }, [names, search])

  function save() {
    const normalized = names.map((name) => name.trim())
    if (normalized.some((name) => !name)) {
      setError('กรุณากรอกชื่อโกดังให้ครบทั้ง 5 รายการ')
      setMessage(null)
      return
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(normalized))
      setNames(normalized)
      setMessage('บันทึกข้อมูลโกดังในเครื่องนี้แล้ว')
      setError(null)
    } catch {
      setError('บันทึกข้อมูลไม่ได้ กรุณาตรวจสอบสิทธิ์การใช้พื้นที่จัดเก็บของเบราว์เซอร์')
      setMessage(null)
    }
  }

  function openEdit(index: number) {
    setEditingIndex(index)
    setEditingName(names[index] ?? '')
    setError(null)
    setMessage(null)
  }

  function closeEdit() {
    setEditingIndex(null)
    setEditingName('')
  }

  function saveEdit() {
    if (editingIndex === null) return
    const normalizedName = editingName.trim()
    if (!normalizedName) {
      setError('กรุณากรอกชื่อโกดัง')
      return
    }
    const nextNames = names.map((name, index) => index === editingIndex ? normalizedName : name)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextNames))
      setNames(nextNames)
      setMessage(`แก้ไขชื่อโกดัง ${editingIndex + 1} แล้ว`)
      closeEdit()
    } catch {
      setError('บันทึกการแก้ไขไม่ได้ กรุณาตรวจสอบสิทธิ์การใช้พื้นที่จัดเก็บของเบราว์เซอร์')
    }
  }

  return (
    <section className="space-y-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 text-sm shadow-sm">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input aria-label="ค้นหาชื่อโกดัง" className="h-9 w-full rounded-md border border-slate-300 bg-yellow-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none focus:ring-0" placeholder="ค้นหา..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span>แสดง:</span><button className="rounded-md bg-slate-800 px-3 py-1.5 text-white" type="button">ทั้งหมด</button></div>
          <button className="inline-flex h-9 items-center gap-1 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white opacity-70" disabled type="button" title="กำหนดไว้ 5 รายการ"><Plus className="h-4 w-4" /> เพิ่มโกดัง</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700">พบทั้งหมด {filteredNames.length} รายการ</div>
        <div className="flex items-center gap-2 text-xs text-slate-600"><button className="rounded-md border border-slate-300 bg-white p-2 text-slate-400" disabled type="button" aria-label="หน้าก่อนหน้า"><ChevronLeft className="h-4 w-4" /></button><span className="rounded-md border border-slate-300 bg-white px-3 py-2">5 / หน้า <ChevronDown className="ml-1 inline h-3 w-3" /></span><span>หน้า 1 / 1</span><button className="rounded-md border border-slate-300 bg-white p-2 text-slate-400" disabled type="button" aria-label="หน้าถัดไป"><ChevronRight className="h-4 w-4" /></button></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[90px_minmax(0,1fr)_72px] border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700"><span>ลำดับ</span><span>ชื่อโกดัง</span><span className="text-center">จัดการ</span></div>
        <div className="divide-y divide-slate-200">
          {filteredNames.length ? filteredNames.map(({ index, name }) => (
            <div className="grid grid-cols-[90px_minmax(0,1fr)_72px] items-center gap-3 px-3 py-2.5" key={`company-warehouse-${index}`}><span className="text-sm font-semibold text-slate-600">{index + 1}</span><span className="text-sm font-semibold text-slate-800">{name}</span><button className="mx-auto rounded-md p-2 text-slate-500 hover:bg-slate-100" type="button" aria-label={`จัดการโกดัง ${index + 1}`} onClick={() => openEdit(index)}><MoreHorizontal className="h-4 w-4" /></button></div>
          )) : <div className="p-8 text-center text-sm text-slate-500">ไม่พบชื่อโกดัง</div>}
        </div>
      </div>

      <div className="flex justify-end"><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" type="button" onClick={save}>💾 บันทึก</button></div>

      <Dialog open={editingIndex !== null} onOpenChange={(open) => { if (!open) closeEdit() }}>
        <DialogContent className="max-w-md rounded-md !p-0" fallbackTitle="แก้ไขข้อมูลโกดัง" hideClose>
          <DialogHeader><DialogTitle>แก้ไขข้อมูลโกดัง</DialogTitle><DialogDescription>แก้ไขชื่อโกดัง {editingIndex === null ? '' : editingIndex + 1} แล้วกดบันทึก</DialogDescription></DialogHeader>
          <div className="bg-white px-5 py-4"><label className="block"><span className="mb-1 block text-xs font-bold text-slate-700">ชื่อโกดัง <span className="text-red-600">*</span></span><input autoFocus className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-700 focus:outline-none focus:ring-0" value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveEdit() }} /></label></div>
          <DialogFooter><button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={closeEdit}>ยกเลิก</button><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" type="button" onClick={saveEdit}>บันทึกการแก้ไข</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
