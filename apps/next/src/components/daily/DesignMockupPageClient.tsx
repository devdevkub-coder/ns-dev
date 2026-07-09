'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type ResponsiveDemoColumnKey = 'code' | 'customer' | 'qty' | 'status'
type BulkDemoColumnKey = 'select' | 'docNo' | 'customer' | 'amount' | 'status'

const responsiveDemoColumns: ResizableColumnDefinition<ResponsiveDemoColumnKey>[] = [
  { key: 'code', defaultWidth: 110, minWidth: 90 },
  { key: 'customer', defaultWidth: 200, minWidth: 140 },
  { key: 'qty', defaultWidth: 120, minWidth: 90 },
  { key: 'status', defaultWidth: 120, minWidth: 100 },
]

const bulkDemoColumns: ResizableColumnDefinition<BulkDemoColumnKey>[] = [
  { key: 'select', defaultWidth: 56, minWidth: 48 },
  { key: 'docNo', defaultWidth: 180, minWidth: 140 },
  { key: 'customer', defaultWidth: 240, minWidth: 160 },
  { key: 'amount', defaultWidth: 140, minWidth: 110 },
  { key: 'status', defaultWidth: 150, minWidth: 120 },
]

export function DesignMockupPageClient() {
  // States for interactivity
  const [isMockModalOpen, setIsMockModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'ap' | 'expense' | 'history'>('ap')
  const [isToggleActive, setIsToggleActive] = useState(true)
  const [splitItems, setSplitItems] = useState([{ id: 1, amount: '5,000.00' }])
  const responsiveDemoResize = useResizableColumns('daily.design-mockup.responsive-demo.v1', responsiveDemoColumns)
  const bulkDemoResize = useResizableColumns('daily.design-mockup.bulk-demo.v1', bulkDemoColumns)

  const addSplitItem = () => {
    setSplitItems([...splitItems, { id: Date.now(), amount: '' }])
  }

  const removeSplitItem = (id: number) => {
    setSplitItems(splitItems.filter(item => item.id !== id))
  }

  return (
    <section className="flex flex-col p-4 md:p-6 lg:p-8 bg-slate-50 rounded-2xl shadow-sm border border-slate-200">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Design Mockup: รายการประจำวัน (Interactive)</h1>
        </div>
      </div>

      <div className="space-y-8">

        {/* 1. Page Header & Actions */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">1. ส่วนหัวของหน้าจอ (Page Header)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left: Current */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">หัวข้อหลักของหน้า</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">ส่งออก</Button>
                  <Button size="sm">+ สร้างใหม่</Button>
                </div>
              </div>
            </div>

            {/* Middle: AcexPOS */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between shadow-sm">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">หัวข้อหลักของหน้า</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="bg-white">ส่งออก</Button>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700">+ สร้างใหม่</Button>
                </div>
              </div>
            </div>

            {/* Right: Ultimate SaaS */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-[#F8FAFC] border border-slate-200/60 rounded-2xl p-6 shadow-xl shadow-slate-200/50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-xl border border-indigo-100">📄</div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">หัวข้อหลัก</h1>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="h-10 px-4 rounded-full bg-white text-slate-700 font-medium shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors">ส่งออก</button>
                  <button className="h-10 px-6 rounded-full bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:-translate-y-0.5 transition-all">+ สร้างใหม่</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Filters & Search */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">2. แถบค้นหาและตัวกรอง (Filters & Search)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left: Current */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">ค้นหาเอกสาร</label>
                  <Input className="mt-1 h-9" placeholder="พิมพ์เลขที่, ชื่อ..." type="text" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">สถานะ</label>
                  <Select className="mt-1 h-9"><option>ทั้งหมด</option></Select>
                </div>
              </div>
            </div>

            {/* Middle: AcexPOS */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">ค้นหา</label>
                  <Input className="h-9 bg-slate-50" placeholder="พิมพ์เลขที่, ชื่อ..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">สถานะ</label>
                  <Select className="h-9 bg-slate-50"><option>ทั้งหมด</option></Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" className="h-9 w-full bg-white">ล้าง</Button>
                </div>
              </div>
            </div>

            {/* Right: Ultimate SaaS */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-full shadow-sm border border-slate-200/80">
                <div className="relative w-full max-w-[200px]">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 text-xs"></div>
                  <input type="text" className="h-9 w-full bg-transparent pl-8 pr-3 text-sm focus:outline-none placeholder-slate-400" placeholder="ค้นหาเอกสาร..." />
                </div>
                <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
                <button className="h-9 px-4 text-slate-600 text-sm font-medium hover:bg-slate-50 rounded-full transition-colors flex items-center gap-2">
                  <span className="text-indigo-500">🏷️</span> สถานะ: ทั้งหมด
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Status Badges */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">3. ป้ายสถานะ (Status Badges)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">ปกติ</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">อนุมัติแล้ว</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">ยกเลิก</span>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="flex flex-wrap gap-3 bg-white p-4 border border-slate-200 rounded-xl">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  <span className="size-1.5 rounded-full bg-emerald-500" />อนุมัติแล้ว
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  <span className="size-1.5 rounded-full bg-amber-500" />รอตรวจสอบ
                </span>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="flex flex-wrap gap-3 bg-white p-4 border border-slate-200/60 rounded-2xl shadow-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/50 px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm shadow-emerald-100">
                  <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" /> อนุมัติแล้ว
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/50 px-3 py-1 text-xs font-bold text-amber-700 shadow-sm shadow-amber-100">
                  <span className="size-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" /> กำลังดำเนินการ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Action Buttons (in tables) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">4. ปุ่มจัดการในตาราง (Action Buttons)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="flex gap-2 items-center">
                <button className="text-blue-600 underline text-xs font-medium hover:text-blue-800">แก้ไข</button>
                <span className="text-slate-300">|</span>
                <button className="text-red-600 underline text-xs font-medium hover:text-red-800">ลบ</button>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white p-4 border border-slate-200 rounded-xl flex gap-2">
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 transition-colors">✏️ แก้ไข</button>
                <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors">🗑️ ลบ</button>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-white p-4 border border-slate-200/60 rounded-2xl flex justify-center gap-1 shadow-sm">
                <button className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition-colors" title="แก้ไข">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button className="w-8 h-8 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors" title="ลบ">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <button className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors" title="ตัวเลือกเพิ่มเติม">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Text Inputs */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">5. ช่องกรอกข้อความ (Text Inputs)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อลูกค้า</label>
                <Input className="w-full" placeholder="กรอกชื่อ..." />
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white p-4 border border-slate-200 rounded-xl">
                <label className="block text-xs font-semibold text-slate-600 mb-1">ชื่อลูกค้า <span className="text-red-500">*</span></label>
                <Input className="h-9 w-full border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" placeholder="กรอกชื่อ..." />
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-white p-4 border border-slate-200/60 rounded-2xl shadow-sm group">
                <div className="relative">
                  <Input className="h-12 w-full border-slate-200 bg-slate-50/50 px-4 pt-4 pb-1 text-sm focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all rounded-xl" placeholder=" " defaultValue="บริษัท ตัวอย่าง" />
                  <label className="absolute left-4 top-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider transition-all group-focus-within:text-indigo-500">ชื่อลูกค้า</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Selects & Dropdowns */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">6. ตัวเลือก (Select & Dropdown)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div>
                <Select className="w-full">
                  <option>ตัวเลือกที่ 1</option>
                </Select>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white p-4 border border-slate-200 rounded-xl">
                <Select className="h-9 w-full border-slate-300 focus:border-emerald-500 focus:ring-emerald-500 text-sm">
                  <option>ตัวเลือกที่ 1</option>
                </Select>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-white p-4 border border-slate-200/60 rounded-2xl shadow-sm">
                <div className="relative">
                  <Select className="h-12 w-full appearance-none border-slate-200 bg-slate-50/50 px-4 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all rounded-xl cursor-pointer">
                    <option>ตัวเลือกที่ 1</option>
                  </Select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 7. Toggles & Checkboxes */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">7. สวิตช์เปิดปิด (Toggles & Checkboxes)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-600" defaultChecked />
                <span className="text-sm font-medium">เปิดใช้งาน</span>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-3">
                <button type="button" className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2">
                  <span className="pointer-events-none absolute mx-auto h-4 w-9 rounded-full bg-emerald-600 transition-colors duration-200"></span>
                  <span className="pointer-events-none absolute left-0 inline-block h-5 w-5 transform translate-x-4 rounded-full border border-slate-200 bg-white shadow transition-transform duration-200"></span>
                </button>
                <span className="text-sm font-medium text-slate-900">เปิดใช้งาน</span>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-white p-4 border border-slate-200/60 rounded-2xl shadow-sm flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                <div>
                  <div className="text-sm font-bold text-slate-900">เปิดใช้งานระบบอัตโนมัติ</div>
                  <div className="text-xs text-slate-400">ระบบจะทำงานแทนคุณเมื่อไม่ได้เข้าสู่ระบบ</div>
                </div>
                <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-500 shadow-inner">
                  <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition shadow-sm"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 8. File Uploads */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">8. อัปโหลดไฟล์ (File Upload)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div>
                <Input type="file" className="w-full" />
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white p-6 border-2 border-dashed border-slate-300 rounded-xl text-center hover:border-emerald-400 hover:bg-slate-50 cursor-pointer transition-colors">
                <div className="text-2xl mb-2">📁</div>
                <div className="text-sm font-medium text-slate-700">คลิกเพื่ออัปโหลดไฟล์</div>
                <div className="text-xs text-slate-500 mt-1">รองรับ PDF, JPG (สูงสุด 5MB)</div>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-indigo-50/50 p-6 border border-indigo-100 rounded-2xl text-center hover:bg-indigo-50 hover:shadow-md cursor-pointer transition-all relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-12 h-12 bg-white rounded-full shadow-sm border border-indigo-50 flex items-center justify-center mx-auto mb-3 group-hover:-translate-y-1 transition-transform">
                  <span className="text-xl text-indigo-500">☁️</span>
                </div>
                <div className="text-sm font-bold text-indigo-900">ลากไฟล์มาวาง หรือ คลิกเพื่อเรียกดู</div>
                <div className="text-xs font-medium text-indigo-400 mt-1">อัปโหลดอัตโนมัติเมื่อเลือกไฟล์เสร็จสิ้น</div>
              </div>
            </div>
          </div>
        </div>

        {/* 9. Dynamic Rows / Split Items */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">9. ตารางกรอกรายการย่อย (Dynamic Rows / Split Items)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="p-2"><Input className="h-8" placeholder="รายการที่ 1" /></TableCell>
                      <TableCell className="p-2 w-10"><Button variant="ghost" size="sm" className="h-8 text-red-600">ลบ</Button></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Button variant="outline" size="sm" className="mt-2 w-full border-dashed">+ เพิ่มแถวใหม่</Button>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-800">รายการย่อย</span>
                  <button className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-white px-2 py-1 rounded border border-emerald-200">+ เพิ่มรายการ</button>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-2 items-center">
                  <span className="text-xs text-slate-400 font-medium w-6">#1</span>
                  <Input className="h-8 flex-1 text-sm" placeholder="ชื่อรายการ" />
                  <Input className="h-8 w-24 text-sm text-right" placeholder="ยอดเงิน" />
                  <button className="text-slate-400 hover:text-red-600 px-2 text-lg">×</button>
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-white p-2 border border-slate-200/60 rounded-2xl shadow-sm">
                <div className="group relative bg-slate-50 border border-slate-100 rounded-xl p-3 flex gap-3 items-center hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer">
                  <div className="w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center text-xs font-bold text-slate-400 cursor-move">⋮⋮</div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-700 mb-0.5">รายการค่าใช้จ่ายทั่วไป</div>
                    <div className="text-xs text-slate-400">หมวดหมู่: อื่นๆ</div>
                  </div>
                  <div className="font-bold text-slate-900">500.00</div>
                  <button className="w-8 h-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <button className="w-full mt-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all">
                  + เพิ่มรายการใหม่
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 10. Modals & Dialogs */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">10. ป๊อปอัป / หน้าต่าง (Modals & Dialogs)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50 relative">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm relative z-10">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg mx-2 mt-4 p-6 relative z-10">
                <div className="font-semibold text-lg leading-none tracking-tight mb-2">ยืนยันการลบ</div>
                <div className="text-sm text-slate-500 mb-6">คุณต้องการลบข้อมูลนี้หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้</div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline">ยกเลิก</Button>
                  <Button className="bg-red-600 hover:bg-red-700 text-white">ยืนยัน</Button>
                </div>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100 relative overflow-hidden">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm relative z-10">✨ สไตล์ AcexPOS</div>
              <div className="absolute inset-0 bg-slate-900/20 z-0"></div>
              <div className="bg-white rounded-xl shadow-xl mx-4 mt-8 relative z-10 overflow-hidden">
                <div className="p-5">
                  <h3 className="text-lg font-bold text-slate-900">ยืนยันการลบข้อมูล</h3>
                </div>
                <div className="bg-slate-50 px-5 py-3 flex justify-end gap-2 border-t border-slate-100">
                  <button className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
                  <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">ลบข้อมูล</button>
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50 relative overflow-hidden">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md relative z-10">💎 Ultimate SaaS</div>
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-0"></div>
              <div className="bg-white rounded-2xl shadow-2xl mx-4 mt-8 relative z-10 overflow-hidden transform scale-100 border border-slate-100 text-center p-6">
                <div className="mx-auto w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                  <span className="text-red-500 text-xl">⚠️</span>
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-1">ต้องการลบข้อมูล?</h3>
                <div className="flex gap-3">
                  <button className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">ยกเลิก</button>
                  <button className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 shadow-lg shadow-red-500/30 transition-all">ยืนยันการลบ</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 11. Alerts & Notifications */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">11. ข้อความแจ้งเตือน (Alerts & Toasts)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium">บันทึกข้อมูลสำเร็จ</div>
                <div className="text-sm text-slate-500">ระบบได้บันทึกข้อมูลเรียบร้อยแล้ว</div>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3 items-start">
                <span className="text-emerald-500">✅</span>
                <div>
                  <div className="text-sm font-bold text-emerald-800">บันทึกสำเร็จ</div>
                  <div className="text-xs text-emerald-600 mt-0.5">ระบบได้ทำการบันทึกข้อมูลของคุณเรียบร้อยแล้ว</div>
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-slate-900 rounded-xl p-4 flex gap-3 items-center shadow-xl shadow-slate-900/20 transform hover:-translate-y-1 transition-transform cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">บันทึกเสร็จสมบูรณ์</div>
                  <div className="text-xs text-slate-400">สร้างเอกสาร WT-001 เรียบร้อย</div>
                </div>
                <button className="text-slate-500 hover:text-white transition-colors">✕</button>
              </div>
            </div>
          </div>
        </div>

        {/* 12. Advanced UI (Steppers, Autocomplete) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">12. ฟังก์ชันขั้นสูง (Advanced UI / Steppers / Autocomplete)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="space-y-4">
                <div className="flex gap-2 text-sm text-slate-500 font-medium">
                  <span className="text-slate-900">1</span> &rarr; <span>2</span> &rarr; <span>3</span>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">ค้นหา</label>
                  <Input placeholder="ค้นหาข้อมูล..." />
                </div>
              </div>
            </div>

            {/* Middle */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white p-4 border border-slate-200 rounded-xl space-y-6">
                {/* Stepper */}
                <div className="flex items-center justify-between relative">
                  <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-100 -z-10"></div>
                  <div className="bg-emerald-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white">1</div>
                  <div className="bg-emerald-100 text-emerald-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white">2</div>
                  <div className="bg-slate-100 text-slate-400 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white">3</div>
                </div>

                {/* Autocomplete */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">พิมพ์เพื่อค้นหา (Autocomplete)</label>
                  <div className="relative">
                    <Input className="h-9 w-full pr-8" defaultValue="สมช" />
                    <div className="absolute top-10 left-0 w-full bg-white border border-slate-200 shadow-lg rounded-xl z-10 py-1">
                      <div className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer text-slate-800">นาย <span className="font-bold text-emerald-600">สมช</span>าย ใจดี</div>
                      <div className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer text-slate-800">บจก. <span className="font-bold text-emerald-600">สมช</span>าญกิจ</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-white p-5 border border-slate-200/60 rounded-2xl shadow-sm space-y-6">
                {/* Stepper */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-xs font-bold">ข้อมูลหลัก</span>
                  </div>
                  <div className="h-px w-4 bg-indigo-200"></div>
                  <div className="flex items-center gap-2 text-slate-800">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-sm shadow-indigo-600/30">2</div>
                    <span className="text-xs font-bold">การชั่ง</span>
                  </div>
                  <div className="h-px w-4 bg-slate-200"></div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold">3</div>
                    <span className="text-xs font-medium">สรุปผล</span>
                  </div>
                </div>

                {/* Command Palette / Autocomplete */}
                <div className="relative">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 h-10 ring-2 ring-indigo-500/20 border-indigo-300">
                    <span className="text-slate-400 mr-2 text-sm"></span>
                    <input className="bg-transparent flex-1 outline-none text-sm font-medium text-slate-900" defaultValue="สมช" />
                    <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">⌘K</span>
                  </div>
                  <div className="absolute top-12 left-0 w-full bg-white border border-slate-100 shadow-xl shadow-slate-200/50 rounded-xl overflow-hidden z-20">
                    <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">ลูกค้าระบบ</div>
                    <div className="px-3 py-2.5 text-sm hover:bg-indigo-50 cursor-pointer flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">ส</div>
                      <span className="text-slate-700">นาย <strong className="text-indigo-600 font-bold">สมช</strong>าย ใจดี</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 13. Summary Cards / Stats Widgets */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">13. การ์ดสรุปข้อมูลสถิติ (Stats / Summary Cards)</h2>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left: Current */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full shadow-sm">💻 ปัจจุบัน (Shadcn UI)</div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-500">ยอดขายวันนี้</span>
                <span className="text-2xl font-bold text-slate-900">฿45,200.00</span>
              </div>
            </div>

            {/* Middle: AcexPOS */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS</div>
              <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl">
                  💰
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">ยอดขายวันนี้</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">฿45,200.00</div>
                </div>
              </div>
            </div>

            {/* Right: Ultimate SaaS */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS</div>
              <div className="bg-white p-5 border border-slate-200/60 rounded-2xl shadow-lg shadow-slate-200/50 relative overflow-hidden group hover:-translate-y-1 transition-transform cursor-pointer">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110">
                  <span className="text-6xl">📈</span>
                </div>
                <div className="relative z-10 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-500">ยอดขายวันนี้</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                      <span>↑</span> 12.5%
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 tracking-tight">฿45,200<span className="text-lg text-slate-400">.00</span></div>
                  <div className="text-xs text-slate-400 mt-1">เทียบกับเมื่อวาน (฿40,150.00)</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 14. Before vs After Comparison (Real Component) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">14. เปรียบเทียบ UI บันทึกเบิกเงินสำรองจ่าย</h2>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">

            {/* ---------------- BEFORE: Current NS Scrap ERP Style ---------------- */}
            <div className="border-2 border-dashed border-slate-300 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 rounded-full">
                1️⃣ สไตล์เดิม (NS Scrap ERP)
              </div>

              <div className="border border-slate-200 bg-white rounded-lg shadow-lg overflow-hidden">
                {/* Header (DialogHeader) */}
                <div className="px-6 pt-6 pb-2">
                  <h3 className="text-lg font-semibold text-slate-900 tracking-tight">บันทึกเบิกเงินสำรองจ่าย</h3>
                </div>

                {/* Content (DialogContent grid) */}
                <div className="px-6 py-4 grid gap-4 md:grid-cols-2">

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">ประเภท<span className="ml-1 text-red-600">*</span></span>
                    <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none text-slate-900" disabled>
                      <option>เบิกเงินสำรองจ่าย</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">วันที่<span className="ml-1 text-red-600">*</span></span>
                    <input type="date" className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none text-slate-900" defaultValue="2026-06-10" disabled />
                  </label>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">ผู้รับเงิน<span className="ml-1 text-red-600">*</span></label>
                    <div className="relative">
                      <input className="h-9 w-full rounded-md border border-slate-300 px-3 pr-8 text-sm outline-none text-slate-900 bg-white" placeholder="ค้นหา..." disabled />
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">ยอดเงิน<span className="ml-1 text-red-600">*</span></span>
                    <input type="text" className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-sm outline-none text-slate-900" defaultValue="5,000.00" disabled />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">บัญชีที่จ่าย (ถ้ามี)</span>
                    <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none text-slate-400" disabled>
                      <option>ไม่ระบุ</option>
                    </select>
                  </label>

                  <div className="md:col-span-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">หมายเหตุ</span>
                      <textarea className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none text-slate-900" rows={3} disabled></textarea>
                    </label>
                  </div>
                </div>

                {/* Footer (DialogFooter) */}
                <div className="px-6 py-4 flex justify-end gap-2">
                  <button className="h-9 px-4 py-2 inline-flex items-center justify-center rounded-md bg-slate-900 text-sm font-medium text-slate-50 shadow hover:bg-slate-900/90 transition-colors" disabled>
                    บันทึก
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-600 font-medium leading-relaxed">
                ข้อสังเกต: พื้นที่กรอกข้อมูลอยู่รวมกันในกล่องเดียว ไม่มีส่วนหัวหรือส่วนแยกชัดเจน สีปุ่มบันทึกเป็นสีดำปกติ และไม่มีการแยกโครงสร้างฟิลด์ประเภทข้อมูลที่เข้าใจง่าย
              </p>
            </div>

            {/* ---------------- NEW: AcexPOS Style with Dark Header (ที่เราเพิ่งทำไป) ---------------- */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">
                ⚡ แบบที่ทำวันนี้ (AcexPOS - Dark Header)
              </div>

              <div className="rounded-xl bg-slate-50 overflow-hidden shadow-lg">
                {/* Header (Dark Header, ไร้ขอบขาว) */}
                <div className="bg-slate-900 px-6 py-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-white">บันทึกเบิกเงินสำรองจ่าย</h3>
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <span className="relative inline-flex h-[18.4px] w-8 shrink-0 items-center rounded-full bg-emerald-600 cursor-pointer">
                      <span className="block size-4 translate-x-[14px] rounded-full bg-white"></span>
                    </span>
                    <span className="text-xs font-semibold text-slate-200">ใช้งาน</span>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Card 1: ข้อมูลหลัก */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ข้อมูลหลัก</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">ประเภท <span className="text-red-500">*</span></span>
                        <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" disabled>
                          <option>เบิกเงินสำรองจ่าย</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">วันที่ <span className="text-red-500">*</span></span>
                        <input type="date" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" defaultValue="2026-06-10" disabled />
                      </label>
                      <div className="md:col-span-2">
                        <label className="block mb-1.5 text-xs font-semibold text-slate-600">ผู้รับเงิน <span className="text-red-500">*</span></label>
                        <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="พิมพ์เพื่อค้นหาพนักงาน..." disabled />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: ข้อมูลการเงิน */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">รายละเอียดการเงิน</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">ยอดเงิน (บาท) <span className="text-red-500">*</span></span>
                        <input type="text" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" defaultValue="5,000.00" disabled />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">บัญชีที่จ่าย (ถ้ามี)</span>
                        <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" disabled>
                          <option>ไม่ระบุ</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Footer Style (AcexPOS - Dark Header) */}
                <div className="bg-white px-6 py-4 flex items-center justify-end gap-3.5 border-t border-slate-100">
                  <button className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors" disabled>
                    ยกเลิก
                  </button>
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md bg-[#0F172A] text-sm font-semibold text-white shadow-sm hover:bg-[#1E293B] transition-colors" disabled>
                    บันทึก
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs text-emerald-700 font-medium leading-relaxed">
                ข้อสังเกต: การดีไซน์สไตล์ Dark Header สีเดียวกับ Sidebar ไร้ขอบขาว ทำให้หน้าตาของ Popup ดูกลืนเป็นอันหนึ่งอันเดียวกับระบบหลัก และปรับ Footer ปุ่มยกเลิก/บันทึกให้อยู่ชิดขวาร่วมกันอย่างสะอาดตาโดยปุ่มยกเลิกเป็นแบบข้อความไร้กรอบ
              </p>
            </div>

            {/* ---------------- ORIGINAL: AcexPOS Style (Clean White Header) ---------------- */}
            <div className="border-2 border-dashed border-blue-200 p-4 rounded-lg bg-blue-50/50">
              <div className="mb-4 inline-block bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800 rounded-full shadow-sm">
                ✨ สไตล์ AcexPOS แท้ (Modern SaaS)
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shadow-lg">
                {/* Header Style (แยกส่วนชัดเจน หัวขาว) */}
                <div className="border-b border-slate-200 bg-white px-6 py-5">
                  <h3 className="text-xl font-bold tracking-tight text-slate-900">บันทึกเบิกเงินสำรองจ่าย</h3>
                </div>

                <div className="p-6 space-y-6">
                  {/* Card 1: ข้อมูลหลัก */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ข้อมูลหลัก</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">ประเภท <span className="text-red-500">*</span></span>
                        <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" disabled>
                          <option>เบิกเงินสำรองจ่าย</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">วันที่ <span className="text-red-500">*</span></span>
                        <input type="date" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" defaultValue="2026-06-10" disabled />
                      </label>
                      <div className="md:col-span-2">
                        <label className="block mb-1.5 text-xs font-semibold text-slate-600">ผู้รับเงิน <span className="text-red-500">*</span></label>
                        <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="พิมพ์เพื่อค้นหาพนักงาน..." disabled />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: ข้อมูลการเงิน */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">รายละเอียดการเงิน</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">ยอดเงิน (บาท) <span className="text-red-500">*</span></span>
                        <input type="text" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-base font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" defaultValue="5,000.00" disabled />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">บัญชีที่จ่าย (ถ้ามี)</span>
                        <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" disabled>
                          <option>ไม่ระบุ</option>
                        </select>
                      </label>
                      <div className="md:col-span-2">
                        <label className="block mb-1.5 text-xs font-semibold text-slate-600">หมายเหตุ</label>
                        <textarea className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" rows={2} placeholder="ระบุเหตุผล..." disabled></textarea>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Style (AcexPOS) */}
                <div className="border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md bg-red-600 text-sm font-bold text-white shadow-sm hover:bg-red-700 transition-colors" disabled>
                    ยกเลิก
                  </button>
                  <button className="h-10 px-8 inline-flex items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors" disabled>
                    บันทึก
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs text-blue-700 font-medium leading-relaxed">
                ข้อสังเกต: สไตล์ AcexPOS แท้ (Clean White Header) จะใช้การจัดวางแบบ Card แยกส่วนชัดเจน และมี Header สีขาวดูสะอาดตา เหมาะสำหรับแอปพลิเคชัน SaaS สมัยใหม่ที่ต้องการความคลีนและความเป็นมิตรกับผู้ใช้งาน
              </p>
            </div>

          </div>
        </div>

        {/* 15. Card vs Section Layout Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">15. เปรียบเทียบ Layout สำหรับ &quot;หน้ารายละเอียด&quot; (PMA012606-0008)</h2>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">

            {/* ---------------- 1: Section Layout (Read-only) ---------------- */}
            <div className="border-2 border-dashed border-purple-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-800 rounded-full shadow-sm">
                📑 1. แบบ Section (ใช้เส้นคั่น)
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden">
                <div className="border-b border-slate-200 px-6 py-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-slate-900">PMA012606-0008</h3>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <div className="px-6 py-6">

                  {/* Section 1 */}
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-4">ข้อมูลเอกสารอ้างอิง</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-5">
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">เลขที่เอกสารอ้างอิง</div>
                        <div className="text-sm font-semibold text-slate-900">PB012606-0009</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ประเภทเอกสารอ้างอิง</div>
                        <div className="text-sm font-semibold text-slate-900">บิลซื้อ</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">วันที่</div>
                        <div className="text-sm font-semibold text-slate-900">10/06/2026</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ผู้ขาย</div>
                        <div className="text-sm font-semibold text-slate-900">MR.KYAW MIN TUN</div>
                      </div>
                    </div>
                  </div>

                  <hr className="my-6 border-slate-200" />

                  {/* Section 2 */}
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-4">รายละเอียดการเงิน</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-5">
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ยอดเต็ม (บาท)</div>
                        <div className="text-sm font-semibold text-slate-900">963.00</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ชำระแล้ว (บาท)</div>
                        <div className="text-sm font-semibold text-slate-900">0.00</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">คงเหลือสุทธิ (บาท)</div>
                        <div className="text-sm font-semibold text-slate-900">963.00</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">สถานะ</div>
                        <div className="text-sm font-bold text-emerald-600">อนุมัติแล้ว</div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-end gap-3">
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md border border-amber-600 bg-amber-600 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors">
                    🖨️ พิมพ์ใบอนุมัตินี้
                  </button>
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                    ปิด
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs text-purple-700 font-medium leading-relaxed">
                แบบ Section: เป็นแผ่นสีขาวเดียวกัน อาศัยระยะห่าง (Whitespace) และเส้นบางๆ (Divider) ในการแยกหมวดหมู่ ดูสะอาดตา ลื่นไหล
              </p>
            </div>

            {/* ---------------- 2: Card Layout (Read-only) ---------------- */}
            <div className="border-2 border-dashed border-orange-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-800 rounded-full shadow-sm">
                📦 2. แบบ Grouped Card (แบ่งเป็นกล่องใหญ่)
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shadow-md">

                <div className="border-b border-slate-200 bg-white px-6 py-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-slate-900">PMA012606-0008</h3>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <div className="p-4 space-y-4">

                  {/* Card 1 */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">ข้อมูลเอกสารอ้างอิง</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-5">
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">เลขที่เอกสารอ้างอิง</div>
                        <div className="text-sm font-semibold text-slate-900">PB012606-0009</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ประเภทเอกสารอ้างอิง</div>
                        <div className="text-sm font-semibold text-slate-900">บิลซื้อ</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">วันที่</div>
                        <div className="text-sm font-semibold text-slate-900">10/06/2026</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ผู้ขาย</div>
                        <div className="text-sm font-semibold text-slate-900">MR.KYAW MIN TUN</div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">รายละเอียดการเงิน</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-5">
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ยอดเต็ม (บาท)</div>
                        <div className="text-sm font-semibold text-slate-900">963.00</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">ชำระแล้ว (บาท)</div>
                        <div className="text-sm font-semibold text-slate-900">0.00</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">คงเหลือสุทธิ (บาท)</div>
                        <div className="text-sm font-semibold text-slate-900">963.00</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-0.5">สถานะ</div>
                        <div className="text-sm font-bold text-emerald-600">อนุมัติแล้ว</div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-end gap-3">
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md border border-amber-600 bg-amber-600 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors">
                    🖨️ พิมพ์ใบอนุมัตินี้
                  </button>
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                    ปิด
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs text-orange-700 font-medium leading-relaxed">
                แบบ Grouped Card: พื้นหลังสีเทาจะตีกรอบสายตาให้สนใจแต่กล่องสีขาว แบ่ง &quot;หมวดหมู่ข้อมูล&quot; ได้ชัดเจนแข็งแรงกว่าแบบเส้นคั่น
              </p>
            </div>

            {/* ---------------- 3: Field Cards Layout (Read Only) ---------------- */}
            <div className="border-2 border-dashed border-sky-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-800 rounded-full shadow-sm">
                3. แบบ Field Cards (ตีกรอบทุกช่อง)
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden">

                <div className="border-b border-slate-100 bg-white px-6 py-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-slate-900">PMA012606-0008</h3>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                {/* Content - Field Cards Grid */}
                <div className="p-6 bg-white space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    <div className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                      <div className="text-xs font-medium text-slate-500 mb-1">เลขที่เอกสารอ้างอิง</div>
                      <div className="text-base font-semibold text-slate-900">PB012606-0009</div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                      <div className="text-xs font-medium text-slate-500 mb-1">ประเภทเอกสารอ้างอิง</div>
                      <div className="text-base font-semibold text-slate-900">บิลซื้อ</div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                      <div className="text-xs font-medium text-slate-500 mb-1">วันที่</div>
                      <div className="text-base font-semibold text-slate-900">10/06/2026</div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                      <div className="text-xs font-medium text-slate-500 mb-1">ผู้ขาย</div>
                      <div className="text-base font-semibold text-slate-900">MR.KYAW MIN TUN</div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                      <div className="text-xs font-medium text-slate-500 mb-1">ยอดเต็ม</div>
                      <div className="text-base font-semibold text-slate-900">963.00</div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                      <div className="text-xs font-medium text-slate-500 mb-1">ชำระแล้ว</div>
                      <div className="text-base font-semibold text-slate-900">0.00</div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 bg-emerald-50/30">
                      <div className="text-xs font-medium text-slate-500 mb-1">สถานะ</div>
                      <div className="text-base font-bold text-emerald-700">อนุมัติแล้ว</div>
                    </div>

                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 bg-white px-6 py-4 flex items-center justify-end gap-3">
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md border border-amber-600 bg-amber-600 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors">
                    🖨️ พิมพ์ใบอนุมัตินี้
                  </button>
                  <button className="h-10 px-6 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                    ปิด
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs text-sky-700 font-medium leading-relaxed">
                แบบ Field Cards: ตีกรอบล้อมรอบข้อมูลทุกช่อง เหมาะกับการทำหน้า &quot;ดูรายละเอียด (Read-only)&quot; เพื่อให้คนเช็คข้อมูลกวาดสายตาได้ง่าย ไม่ตกหล่น แต่ไม่เหมาะกับหน้าฟอร์มที่ต้องพิมพ์ข้อมูลเยอะๆ
              </p>
            </div>

          </div>
        </div>

        {/* 16. Full Page (Table & Filter) Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">16. เปรียบเทียบหน้าต่างรวม (List View & Table)</h2>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">

            {/* ---------------- Left: Current NS Scrap Style ---------------- */}
            <div className="border-2 border-dashed border-red-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-red-100 px-3 py-1 text-sm font-semibold text-red-800 rounded-full shadow-sm">
                ❌ ปัจจุบัน (Flat & Basic)
              </div>

              {/* Mock App Window */}
              <div className="bg-white border border-slate-300 h-[600px] overflow-hidden text-sm flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="text-lg font-bold">รายการใบชั่งน้ำหนัก</h3>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">สร้างรายการใหม่</button>
                </div>

                {/* Filters */}
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold mb-1">ค้นหาเอกสาร</label>
                      <input type="text" className="w-full border border-slate-300 rounded p-2 text-sm" placeholder="เลขที่เอกสาร..." />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold mb-1">วันที่</label>
                      <input type="date" className="w-full border border-slate-300 rounded p-2 text-sm" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold mb-1">สถานะ</label>
                      <select className="w-full border border-slate-300 rounded p-2 text-sm">
                        <option>ทั้งหมด</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button className="bg-slate-200 text-slate-800 px-4 py-2 rounded text-sm hover:bg-slate-300">ค้นหา</button>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="flex-1 p-4 overflow-auto">
                  <table className="ns-table w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-300">
                        <th className="py-2 px-2 font-bold">เลขที่เอกสาร</th>
                        <th className="py-2 px-2 font-bold">วันที่</th>
                        <th className="py-2 px-2 font-bold">ลูกค้า/ซัพพลายเออร์</th>
                        <th className="py-2 px-2 font-bold text-right">น้ำหนักสุทธิ</th>
                        <th className="py-2 px-2 font-bold">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="py-2 px-2 text-blue-600">WT-2606-001</td>
                        <td className="py-2 px-2">10/06/2026</td>
                        <td className="py-2 px-2">บจก. สมชายโลหะกิจ</td>
                        <td className="py-2 px-2 text-right">1,250 kg</td>
                        <td className="py-2 px-2">เสร็จสิ้น</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2 px-2 text-blue-600">WT-2606-002</td>
                        <td className="py-2 px-2">10/06/2026</td>
                        <td className="py-2 px-2">ร้าน รับซื้อของเก่าเจ๊จู</td>
                        <td className="py-2 px-2 text-right">840 kg</td>
                        <td className="py-2 px-2">กำลังชั่ง</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2 px-2 text-blue-600">WT-2606-003</td>
                        <td className="py-2 px-2">09/06/2026</td>
                        <td className="py-2 px-2">นาย สมหมาย ขายเหล็ก</td>
                        <td className="py-2 px-2 text-right">2,100 kg</td>
                        <td className="py-2 px-2 text-red-600">ยกเลิก</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="mt-4 text-xs text-red-700 font-medium leading-relaxed">
                ข้อสังเกต: ดีไซน์เก่าจะดูแบน (Flat) สีสันและน้ำหนักตัวอักษรไม่ค่อยมีลำดับชั้น ทำให้เวลาดูข้อมูลเยอะๆ จะตาลายและดูเชย
              </p>
            </div>

            {/* ---------------- Right: AcexPOS Style ---------------- */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">
                ✨ สไตล์ AcexPOS (Modern SaaS, Card-based)
              </div>

              {/* Mock App Window */}
              <div className="bg-slate-100 border border-slate-200 rounded-xl shadow-inner h-[600px] overflow-hidden text-sm flex flex-col p-6 space-y-4">

                {/* Header */}
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">ใบชั่งน้ำหนัก</h3>
                  </div>
                  <button className="h-10 bg-emerald-600 text-white px-5 rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors flex items-center gap-2">
                    <span className="text-lg leading-none">+</span> สร้างใบชั่งใหม่
                  </button>
                </div>

                {/* Filters Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex flex-wrap md:flex-nowrap gap-3">
                    <div className="w-full md:w-64 relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <span className="text-slate-400"></span>
                      </div>
                      <input type="text" className="h-10 w-full border border-slate-300 rounded-lg pl-10 pr-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow" placeholder="ค้นหาเลขที่, ชื่อลูกค้า..." />
                    </div>
                    <input type="date" className="h-10 border border-slate-300 rounded-lg px-3 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500" defaultValue="2026-06-10" />
                    <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                      <option>สถานะทั้งหมด</option>
                      <option>กำลังชั่ง</option>
                      <option>เสร็จสิ้น</option>
                    </select>
                    <button className="h-10 px-4 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 bg-slate-50">ล้างตัวกรอง</button>
                  </div>
                </div>

                {/* Table Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
                  <div className="overflow-auto flex-1">
                    <table className="ns-table w-full text-left border-collapse">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">เลขที่เอกสาร</th>
                          <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">วันที่</th>
                          <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">ลูกค้า/ซัพพลายเออร์</th>
                          <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right">น้ำหนักสุทธิ</th>
                          <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="hover:bg-slate-50 transition-colors group cursor-pointer">
                          <td className="py-3 px-4 font-semibold text-slate-900">WT-2606-001</td>
                          <td className="py-3 px-4 text-slate-500">10/06/2026</td>
                          <td className="py-3 px-4 text-slate-700">บจก. สมชายโลหะกิจ</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900">1,250 kg</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              เสร็จสิ้น
                            </span>
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors group cursor-pointer">
                          <td className="py-3 px-4 font-semibold text-slate-900">WT-2606-002</td>
                          <td className="py-3 px-4 text-slate-500">10/06/2026</td>
                          <td className="py-3 px-4 text-slate-700">ร้าน รับซื้อของเก่าเจ๊จู</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900">840 kg</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              กำลังชั่ง
                            </span>
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors group cursor-pointer">
                          <td className="py-3 px-4 font-semibold text-slate-900">WT-2606-003</td>
                          <td className="py-3 px-4 text-slate-500">09/06/2026</td>
                          <td className="py-3 px-4 text-slate-700">นาย สมหมาย ขายเหล็ก</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900">2,100 kg</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              ยกเลิก
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination Footer */}
                  <div className="bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">แสดง 1 ถึง 3 จาก 3 รายการ</span>
                    <div className="flex gap-1">
                      <button className="px-3 py-1 text-sm border border-slate-200 rounded text-slate-400 cursor-not-allowed">ก่อนหน้า</button>
                      <button className="px-3 py-1 text-sm border border-emerald-600 bg-emerald-50 text-emerald-700 rounded font-medium">1</button>
                      <button className="px-3 py-1 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">ถัดไป</button>
                    </div>
                  </div>
                </div>

              </div>

              <p className="mt-4 text-xs text-emerald-700 font-medium leading-relaxed">
                ข้อสังเกต: พื้นหลังจอหลักเป็นสีเทา (slate-100), Filter และ Table ถูกจับใส่ Card สีขาวขอบมน (rounded-xl), หัวตารางเป็นตัวพิมพ์เล็กสีเทาอ่อน (uppercase text-slate-500), และใช้ Badges สีสันในการบอกสถานะ
              </p>
            </div>

            {/* ---------------- Right: Ultimate SaaS Style ---------------- */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">
                💎 Ultimate SaaS (เหนือกว่า AcexPOS)
              </div>

              {/* Mock App Window */}
              <div className="bg-[#F8FAFC] border border-slate-200/60 rounded-2xl shadow-xl shadow-slate-200/50 h-[600px] overflow-hidden text-sm flex flex-col p-6 space-y-5 relative">

                {/* Header */}
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      ใบชั่งน้ำหนัก <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">24 รายการ</span>
                    </h3>
                  </div>
                  <button className="h-10 bg-slate-900 text-white px-5 rounded-full text-sm font-bold shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:-translate-y-0.5 transition-all flex items-center gap-2">
                    <span className="text-lg leading-none">+</span> สร้างใบชั่งใหม่
                  </button>
                </div>

                {/* Filters - Pill Style */}
                <div className="flex flex-wrap items-center gap-3 bg-white p-1.5 rounded-full shadow-sm border border-slate-200/80 w-fit">
                  <div className="relative w-48">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <span className="text-slate-400 text-xs"></span>
                    </div>
                    <input type="text" className="h-8 w-full bg-transparent pl-8 pr-3 text-sm focus:outline-none placeholder-slate-400" placeholder="ค้นหาเอกสาร..." />
                  </div>
                  <div className="h-5 w-px bg-slate-200"></div>
                  <button className="h-8 px-4 text-slate-600 text-sm font-medium hover:bg-slate-50 rounded-full transition-colors flex items-center gap-2">
                    📅 วันที่: วันนี้
                  </button>
                  <div className="h-5 w-px bg-slate-200"></div>
                  <button className="h-8 px-4 text-slate-600 text-sm font-medium hover:bg-slate-50 rounded-full transition-colors flex items-center gap-2">
                    🏷️ สถานะ: ทั้งหมด
                  </button>
                </div>

                {/* Table - Floating Rows */}
                <div className="flex-1 flex flex-col -mx-2">
                  <div className="px-4 py-2 grid grid-cols-12 gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <div className="col-span-3">เลขที่เอกสาร</div>
                    <div className="col-span-4">ลูกค้า/ซัพพลายเออร์</div>
                    <div className="col-span-2 text-right">น้ำหนัก</div>
                    <div className="col-span-3 text-right">สถานะ</div>
                  </div>

                  <div className="flex-1 overflow-auto space-y-2 px-2 pb-2">
                    <div className="bg-white rounded-xl p-4 grid grid-cols-12 gap-4 items-center shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group">
                      <div className="col-span-3 font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">WT-2606-001 <span className="block text-xs font-normal text-slate-400 mt-0.5">10/06/2026</span></div>
                      <div className="col-span-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">สม</div>
                        <span className="font-medium text-slate-700">บจก. สมชายโลหะกิจ</span>
                      </div>
                      <div className="col-span-2 text-right font-bold text-slate-900">1,250 kg</div>
                      <div className="col-span-3 flex justify-end">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> เสร็จสิ้น
                        </span>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-4 grid grid-cols-12 gap-4 items-center shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group">
                      <div className="col-span-3 font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">WT-2606-002 <span className="block text-xs font-normal text-slate-400 mt-0.5">10/06/2026</span></div>
                      <div className="col-span-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">เจ๊</div>
                        <span className="font-medium text-slate-700">ร้าน รับซื้อของเก่าเจ๊จู</span>
                      </div>
                      <div className="col-span-2 text-right font-bold text-slate-900">840 kg</div>
                      <div className="col-span-3 flex justify-end">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> กำลังชั่ง
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Modern Pagination */}
                  <div className="mt-auto pt-4 flex items-center justify-between px-2">
                    <span className="text-xs font-medium text-slate-500">3 รายการ</span>
                    <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-200">
                      <button className="px-2 py-1 text-slate-400 hover:text-slate-900 transition-colors">←</button>
                      <button className="px-3 py-1 rounded-md bg-slate-900 text-white text-xs font-bold shadow-sm">1</button>
                      <button className="px-3 py-1 rounded-md text-slate-600 hover:bg-slate-100 text-xs font-medium transition-colors">2</button>
                      <button className="px-2 py-1 text-slate-400 hover:text-slate-900 transition-colors">→</button>
                    </div>
                  </div>
                </div>

              </div>

              <p className="mt-4 text-xs text-indigo-700 font-medium leading-relaxed">
                ข้อสังเกต: ยกระดับจาก AcexPOS โดยใช้ &quot;ตัวกรองแบบแคปซูล (Pill Filters)&quot; ลดพื้นที่หน้าจอ, ตารางเปลี่ยนเป็น &quot;กล่องข้อมูลลอยตัว (Floating Rows)&quot; แทนเส้นตารางแข็งๆ, ใช้สัญลักษณ์สีกลมๆ (Dot) คู่กับสถานะ, และปุ่มหลักใช้การดีไซน์แบบ Shadow & Hover Translate ให้อารมณ์พรีเมียมระดับโลก
              </p>
            </div>

          </div>
        </div>

        {/* 17. Tabs Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">17. เปรียบเทียบ Tabs (แท็บเมนูย่อย)</h2>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left: Basic */}
            <div className="border-2 border-dashed border-red-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-red-100 px-3 py-1 text-sm font-semibold text-red-800 rounded-full shadow-sm">❌ ปัจจุบัน (ปุ่มกดทื่อๆ)</div>

              <div className="bg-white border border-slate-300 p-4">
                <div className="flex gap-2 border-b border-slate-300 pb-2">
                  <button className="bg-blue-600 text-white px-3 py-1 text-sm">ข้อมูลทั่วไป</button>
                  <button className="bg-slate-200 text-black px-3 py-1 text-sm">ประวัติการชั่ง</button>
                  <button className="bg-slate-200 text-black px-3 py-1 text-sm">การเงิน</button>
                </div>
                <div className="p-4 text-center text-slate-500 text-sm">เนื้อหาข้อมูลทั่วไป...</div>
              </div>
            </div>

            {/* Right: AcexPOS */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS (Underline Tabs)</div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 px-6 flex gap-6">
                  <button className="py-4 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600">ข้อมูลทั่วไป</button>
                  <button className="py-4 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">ประวัติการชั่ง</button>
                  <button className="py-4 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2">
                    การเงิน
                    <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">ใหม่</span>
                  </button>
                </div>
                <div className="p-8 text-center text-slate-400 text-sm bg-slate-50">เนื้อหาข้อมูลทั่วไป...</div>
              </div>
            </div>

            {/* Right: Ultimate SaaS */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS (Segmented Control)</div>

              <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/40 overflow-hidden border border-slate-100">
                <div className="p-4 bg-[#F8FAFC]">
                  <div className="flex bg-slate-200/70 p-1 rounded-xl w-fit">
                    <button className="px-6 py-2 text-sm font-bold text-slate-900 bg-white rounded-lg shadow-sm">ข้อมูลทั่วไป</button>
                    <button className="px-6 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">ประวัติการชั่ง</button>
                    <button className="px-6 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-2">
                      การเงิน
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    </button>
                  </div>
                </div>
                <div className="p-8 text-center text-slate-400 text-sm">เนื้อหาข้อมูลทั่วไป...</div>
              </div>
            </div>
          </div>
        </div>

        {/* 18. Empty State Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">18. เปรียบเทียบ Empty State (หน้าจอตอนไม่มีข้อมูล)</h2>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left: Basic */}
            <div className="border-2 border-dashed border-red-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-red-100 px-3 py-1 text-sm font-semibold text-red-800 rounded-full shadow-sm">❌ ปัจจุบัน (ตารางว่างๆ)</div>

              <div className="bg-white border border-slate-300 overflow-hidden">
                <table className="ns-table w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr><th className="py-2 px-2">เลขที่</th><th className="py-2 px-2">วันที่</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-slate-500">ไม่พบข้อมูล</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: AcexPOS */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS (Illustration & Call-to-action)</div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                  <span className="text-4xl opacity-50">📦</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">ยังไม่มีรายการใบชั่งน้ำหนัก</h3>
                <button className="h-10 bg-emerald-600 text-white px-6 rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors">
                  + สร้างใบชั่งใหม่
                </button>
              </div>
            </div>

            {/* Right: Ultimate SaaS */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS (Micro-interactions)</div>

              <div className="bg-white rounded-2xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all p-12 flex flex-col items-center justify-center text-center group cursor-pointer">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-indigo-200 blur-xl rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-500"></div>
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-50 to-white rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm relative group-hover:-translate-y-2 transition-transform duration-300">
                    <span className="text-3xl text-indigo-600">✨</span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">ปลดล็อกการจัดการชั่งน้ำหนัก</h3>
                <button className="h-10 bg-slate-900 text-white px-6 rounded-full text-sm font-bold shadow-lg shadow-slate-900/20 group-hover:scale-105 transition-transform">
                  เริ่มต้นใช้งานเลย
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 19. Sidebar Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">19. เปรียบเทียบ Sidebar (เมนูนำทางหลัก)</h2>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left: Basic */}
            <div className="border-2 border-dashed border-red-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-red-100 px-3 py-1 text-sm font-semibold text-red-800 rounded-full shadow-sm">❌ ปัจจุบัน (เมนูรกๆ ตัวหนังสือติดกัน)</div>

              <div className="w-64 bg-slate-800 h-96 text-white p-4">
                <div className="font-bold text-xl mb-6">NS SCRAP ERP</div>
                <ul className="space-y-2 text-sm">
                  <li>หน้าแรก</li>
                  <li className="text-blue-400 font-bold">ใบชั่งน้ำหนัก</li>
                  <li>เบิกเงินสำรองจ่าย</li>
                  <li>อนุมัติจ่ายเงิน</li>
                  <li>ตั้งค่า</li>
                </ul>
              </div>
            </div>

            {/* Right: AcexPOS */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">✨ สไตล์ AcexPOS (Clean White + Icons)</div>

              <div className="w-64 bg-white border-r border-slate-200 h-96 flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-slate-100">
                  <div className="font-black text-xl text-emerald-600 tracking-tight">NS<span className="text-slate-800">ERP</span></div>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 mb-2 mt-4">งานประจำวัน</div>

                  <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="text-lg opacity-50">🏠</span> หน้าแรก
                  </button>

                  <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100">
                    <span className="text-lg">⚖️</span> ใบชั่งน้ำหนัก
                  </button>

                  <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="text-lg opacity-50">💸</span> เบิกเงินสำรองจ่าย
                  </button>

                  <button className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-lg opacity-50">✅</span> คิวอนุมัติ
                    </div>
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">3</span>
                  </button>
                </div>

                <div className="p-4 border-t border-slate-100">
                  <button className="flex items-center gap-3 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                    <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300 text-xs">U</span>
                    พนักงานทดสอบ
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Ultimate SaaS */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">💎 Ultimate SaaS (Dark Glassmorphism)</div>

              <div className="w-64 bg-[#0B0F19] h-96 flex flex-col rounded-2xl overflow-hidden relative shadow-2xl shadow-slate-900/50 border border-slate-800">
                {/* Glow Effect */}
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-500/20 to-transparent pointer-events-none"></div>

                <div className="h-16 flex items-center px-6 relative">
                  <div className="font-black text-xl text-white tracking-tight flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs">N</span>
                    NS<span className="text-slate-400 font-medium">ERP</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-4 space-y-1 relative">
                  <div className="text-xs font-black text-slate-500 uppercase tracking-widest px-2 mb-3 mt-2">Main Menu</div>

                  <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-400 rounded-xl hover:text-white hover:bg-white/5 transition-all">
                    <span className="text-slate-500">⌂</span> หน้าแรก
                  </button>

                  <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-white bg-white/10 rounded-xl border border-white/10 shadow-inner">
                    <span className="text-indigo-400">⚖️</span> ใบชั่งน้ำหนัก
                  </button>

                  <button className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-400 rounded-xl hover:text-white hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">✓</span> คิวอนุมัติ
                    </div>
                    <span className="bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg shadow-indigo-500/50">3</span>
                  </button>
                </div>

                <div className="p-4 relative">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                  <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-white/5 transition-all text-left">
                    <div className="w-8 h-8 rounded-full border border-slate-700 bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">U</div>
                    <div>
                      <div className="text-sm font-bold text-white leading-none">พนักงานทดสอบ</div>
                      <div className="text-xs text-slate-500 mt-1">Admin</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 20. Brand Colors & Theme Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">20. สีประจำแบรนด์และธีม (Brand Colors & Theme)</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Blue */}
            <div className="rounded-xl border-2 border-blue-100 p-5 bg-white shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">B</div>
                <div>
                  <div className="font-bold text-slate-900">โทนน้ำเงิน (Trust & Corporate)</div>
                  <div className="text-xs text-slate-500">ดูเป็นทางการ น่าเชื่อถือ</div>
                </div>
              </div>
              <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-md shadow-blue-600/20 transition-all">ปุ่มหลัก (Primary)</button>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-md">Badge</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-md border border-blue-200">Outline</span>
              </div>
            </div>
            {/* Emerald */}
            <div className="rounded-xl border-2 border-emerald-100 p-5 bg-white shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">E</div>
                <div>
                  <div className="font-bold text-slate-900">โทนเขียว (Eco & Recycle)</div>
                  <div className="text-xs text-slate-500">สื่อถึงสิ่งแวดล้อม รีไซเคิล</div>
                </div>
              </div>
              <button className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 transition-all">ปุ่มหลัก (Primary)</button>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-md">Badge</span>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-md border border-emerald-200">Outline</span>
              </div>
            </div>
            {/* Orange/Amber */}
            <div className="rounded-xl border-2 border-amber-100 p-5 bg-white shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold">O</div>
                <div>
                  <div className="font-bold text-slate-900">โทนส้ม (Industrial & Energy)</div>
                  <div className="text-xs text-slate-500">พลังงาน อุตสาหกรรม ลานเหล็ก</div>
                </div>
              </div>
              <button className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-amber-500/20 transition-all">ปุ่มหลัก (Primary)</button>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-md">Badge</span>
                <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-md border border-amber-200">Outline</span>
              </div>
            </div>
          </div>
        </div>

        {/* 21. Responsive Design */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">21. การแสดงผลบนมือถือ (Responsive Design)</h2>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Desktop Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-bold text-slate-500 flex items-center gap-2"><span className="text-lg">💻</span> มุมมองจอคอมพิวเตอร์ (Desktop)</div>
              <div className="p-4">
                <table className="ns-table w-full text-sm" style={{ minWidth: responsiveDemoResize.tableMinWidth, tableLayout: 'fixed' }}>
                  <colgroup>
                    {responsiveDemoColumns.map((column) => (
                      <col key={column.key} style={responsiveDemoResize.getColumnStyle(column.key)} />
                    ))}
                  </colgroup>
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <ResizableTableHead label="รหัส" resizeProps={responsiveDemoResize.getResizeHandleProps('code', 'รหัส')} />
                      <ResizableTableHead label="ลูกค้า" resizeProps={responsiveDemoResize.getResizeHandleProps('customer', 'ลูกค้า')} />
                      <ResizableTableHead align="right" label="จำนวน" resizeProps={responsiveDemoResize.getResizeHandleProps('qty', 'จำนวน')} />
                      <ResizableTableHead align="center" label="สถานะ" resizeProps={responsiveDemoResize.getResizeHandleProps('status', 'สถานะ')} />
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3 font-medium text-indigo-600">WT-001</td>
                      <td className="py-3 px-3">บจก. สมชาย</td>
                      <td className="py-3 px-3 text-right font-medium">1,500 kg</td>
                      <td className="py-3 px-3 text-center"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-bold">เสร็จสิ้น</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {/* Mobile Card */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 relative flex justify-center">
              <div className="absolute top-2 left-4 text-sm font-bold text-slate-500 flex items-center gap-2"><span className="text-lg">📱</span> มุมมองมือถือ (Mobile)</div>
              {/* Fake Mobile Screen */}
              <div className="w-[320px] bg-slate-100 border-x-8 border-t-8 border-slate-800 rounded-t-[2rem] mt-10 p-4 shadow-xl">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-3 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">รหัสรายการ</div>
                      <div className="font-bold text-indigo-600">WT-001</div>
                    </div>
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">เสร็จสิ้น</span>
                  </div>
                  <div className="h-px bg-slate-100 w-full my-2"></div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">ลูกค้า: <strong className="text-slate-900">บจก. สมชาย</strong></span>
                    <span className="font-bold text-slate-900">1,500 kg</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 22. Error Handling */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">22. การจัดการข้อผิดพลาด (Error Handling & Validation)</h2>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Submit Error */}
            <div className="border-2 border-dashed border-red-200 p-5 rounded-xl bg-slate-50">
              <div className="mb-4 text-sm font-bold text-slate-600">1. แจ้งเตือนตอนกดบันทึก (Submit Error)</div>
              <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
                <div className="bg-red-50 text-red-600 border border-red-200 p-3 rounded-lg text-sm mb-4 flex items-start gap-2">
                  <span>❌</span>
                  <div>
                    <div className="font-bold">ไม่สามารถบันทึกได้</div>
                    <div>กรุณากรอก &quot;หมายเลขเอกสาร&quot; ให้ครบถ้วน</div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">หมายเลขเอกสาร <span className="text-red-500">*</span></label>
                    <Input placeholder="" className="border-slate-300" />
                  </div>
                  <Button className="w-full bg-slate-900">บันทึกข้อมูล</Button>
                </div>
              </div>
            </div>
            {/* Realtime Error */}
            <div className="border-2 border-dashed border-emerald-200 p-5 rounded-xl bg-slate-50">
              <div className="mb-4 text-sm font-bold text-slate-600">2. แจ้งเตือนทันทีขณะพิมพ์ (Real-time Validation) ✨</div>
              <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-end mb-1">
                      <label className="text-sm font-bold text-red-600">หมายเลขเอกสาร <span className="text-red-500">*</span></label>
                      <span className="text-xs text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">จำเป็นต้องระบุ</span>
                    </div>
                    <div className="relative">
                      <Input placeholder="" className="border-red-400 bg-red-50 text-red-900 focus-visible:ring-red-500 pr-8" defaultValue="INV-" />
                      <div className="absolute right-3 top-2.5 text-red-500 text-sm">!</div>
                    </div>
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><span>↳</span> โปรดระบุหมายเลขเอกสารอย่างน้อย 8 หลัก</p>
                  </div>
                  <Button className="w-full bg-indigo-600 opacity-50 cursor-not-allowed">บันทึกข้อมูล</Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 23. Dark Mode vs Light Mode */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">23. โหมดการแสดงผล (Dark Mode vs Light Mode)</h2>
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 rounded-2xl overflow-hidden border border-slate-300 shadow-lg">
            {/* Light Mode */}
            <div className="bg-[#F8FAFC] p-8 border-r border-slate-200">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">☀️</span>
                <span className="font-bold text-slate-800">Light Mode</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-slate-900 mb-2">สรุปยอดประจำวัน</h3>
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">ดูรายงาน</div>
                  <div className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-200">ตั้งค่า</div>
                </div>
              </div>
            </div>
            {/* Dark Mode */}
            <div className="bg-[#0F172A] p-8">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🌙</span>
                <span className="font-bold text-white">Dark Mode</span>
              </div>
              <div className="bg-[#1E293B] border border-slate-700/50 rounded-xl p-5 shadow-xl shadow-black/20">
                <h3 className="font-bold text-white mb-2">สรุปยอดประจำวัน</h3>
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 bg-indigo-500/20 text-indigo-300 text-xs font-bold rounded-lg border border-indigo-500/30">ดูรายงาน</div>
                  <div className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700">ตั้งค่า</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* 24. Advanced Data Tables & Bulk Actions */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">24. ตารางข้อมูลขั้นสูง (Advanced Data Tables & Bulk Actions)</h2>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
              <div className="text-sm font-medium text-slate-600">
                เลือกแล้ว <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-bold">2</span> รายการ
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50">ส่งออก (Export)</button>
                <button className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">อนุมัติทั้งหมด</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="ns-table w-full text-sm text-left" style={{ minWidth: bulkDemoResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {bulkDemoColumns.map((column) => (
                    <col key={column.key} style={bulkDemoResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4 w-12 sticky left-0 bg-slate-50 z-10 shadow-[1px_0_0_0_#e2e8f0]">
                      <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked onChange={() => {}} />
                    </th>
                    <ResizableTableHead label="เลขที่เอกสาร" resizeProps={bulkDemoResize.getResizeHandleProps('docNo', 'เลขที่เอกสาร')} />
                    <ResizableTableHead label="ลูกค้า" resizeProps={bulkDemoResize.getResizeHandleProps('customer', 'ลูกค้า')} />
                    <ResizableTableHead align="right" label="ยอดเงิน" resizeProps={bulkDemoResize.getResizeHandleProps('amount', 'ยอดเงิน')} />
                    <ResizableTableHead align="center" label="สถานะ" resizeProps={bulkDemoResize.getResizeHandleProps('status', 'สถานะ')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-indigo-50/30 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 sticky left-0 bg-white shadow-[1px_0_0_0_#e2e8f0] z-10 group-hover:bg-slate-50">
                      <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked onChange={() => {}} />
                    </td>
                    <td className="py-3 px-4 font-medium text-indigo-600">PO-2023-001</td>
                    <td className="py-3 px-4">บจก. สมชาย</td>
                    <td className="py-3 px-4 font-medium text-slate-900">฿45,000</td>
                    <td className="py-3 px-4"><span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-bold">รอตรวจสอบ</span></td>
                  </tr>
                  <tr className="bg-indigo-50/30 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 sticky left-0 bg-white shadow-[1px_0_0_0_#e2e8f0] z-10">
                      <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked onChange={() => {}} />
                    </td>
                    <td className="py-3 px-4 font-medium text-indigo-600">PO-2023-002</td>
                    <td className="py-3 px-4">ร้านสมเกียรติโลหะ</td>
                    <td className="py-3 px-4 font-medium text-slate-900">฿12,500</td>
                    <td className="py-3 px-4"><span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-bold">รอตรวจสอบ</span></td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 sticky left-0 bg-white shadow-[1px_0_0_0_#e2e8f0] z-10">
                      <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" onChange={() => {}} />
                    </td>
                    <td className="py-3 px-4 font-medium text-indigo-600">PO-2023-003</td>
                    <td className="py-3 px-4">บมจ. เหล็กไทย</td>
                    <td className="py-3 px-4 font-medium text-slate-900">฿150,000</td>
                    <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-bold">อนุมัติแล้ว</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="bg-white p-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
              <div>แสดง 1 ถึง 3 จาก 128 รายการ</div>
              <div className="flex gap-1">
                <button className="px-2 py-1 border border-slate-200 rounded text-slate-400 cursor-not-allowed">ก่อนหน้า</button>
                <button className="px-2 py-1 border border-indigo-600 bg-indigo-50 text-indigo-600 rounded font-bold">1</button>
                <button className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">2</button>
                <button className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">ถัดไป</button>
              </div>
            </div>
          </div>
        </div>

        {/* 25. Data Visualization & Charts */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">25. กราฟและการแสดงผลข้อมูล (Data Visualization)</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
              <div className="w-full h-full absolute inset-0 opacity-10 flex items-end justify-between px-8 pb-4">
                <div className="w-8 bg-indigo-600 h-[40%] rounded-t-sm"></div>
                <div className="w-8 bg-indigo-600 h-[60%] rounded-t-sm"></div>
                <div className="w-8 bg-indigo-600 h-[30%] rounded-t-sm"></div>
                <div className="w-8 bg-indigo-600 h-[80%] rounded-t-sm"></div>
                <div className="w-8 bg-emerald-500 h-[100%] rounded-t-sm"></div>
              </div>
              <div className="relative z-10 text-center">
                <div className="text-4xl mb-2">📊</div>
                <div className="font-bold text-slate-800">Bar Chart Component</div>
                <div className="text-xs text-slate-500">ใช้สำหรับสรุปปริมาณรับซื้อเศษเหล็กรายวัน</div>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
               <div className="w-full h-full absolute inset-0 opacity-10 flex items-center justify-center">
                 <div className="w-32 h-32 rounded-full border-[16px] border-emerald-500 border-r-indigo-500 border-b-amber-400"></div>
               </div>
               <div className="relative z-10 text-center">
                <div className="text-4xl mb-2">🍩</div>
                <div className="font-bold text-slate-800">Donut Chart Component</div>
                <div className="text-xs text-slate-500">ใช้สำหรับดูสัดส่วนประเภทเศษเหล็กในสต็อก</div>
              </div>
            </div>
          </div>
        </div>

        {/* 26. Drawer / Slide-over */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">26. พาเนลแบบลิ้นชักเปิดด้านข้าง (Drawer / Slide-over)</h2>
          <div className="relative h-[400px] border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
            {/* Fake Main App Background */}
            <div className="p-6 opacity-30 pointer-events-none">
              <div className="h-8 bg-slate-300 w-1/4 rounded mb-6"></div>
              <div className="space-y-2">
                <div className="h-12 bg-white rounded shadow-sm w-full"></div>
                <div className="h-12 bg-white rounded shadow-sm w-full"></div>
                <div className="h-12 bg-white rounded shadow-sm w-full"></div>
              </div>
            </div>
            {/* Overlay */}
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]"></div>
            {/* Drawer Panel */}
            <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <div className="font-bold text-slate-800">รายละเอียดใบชั่ง WT-001</div>
                <button className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold hover:bg-slate-200">✕</button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">ข้อมูลลูกค้า</div>
                  <div className="text-sm font-semibold bg-slate-50 p-2 rounded border border-slate-100">บจก. สมชาย (รหัส: C009)</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">สถานะปัจจุบัน</div>
                  <div className="inline-flex bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-bold">อนุมัติเรียบร้อยแล้ว</div>
                </div>
                <div className="h-32 bg-slate-50 rounded border border-slate-200 border-dashed flex items-center justify-center text-xs text-slate-400">รูปภาพทะเบียนรถ</div>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button className="flex-1 py-2 border border-slate-300 rounded-lg text-sm font-semibold bg-white text-slate-700">พิมพ์</button>
                <button className="flex-1 py-2 bg-indigo-600 rounded-lg text-sm font-semibold text-white shadow-sm shadow-indigo-600/20">แก้ไขข้อมูล</button>
              </div>
            </div>
          </div>
        </div>

        {/* 27. Display Density */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">27. โหมดปรับความหนาแน่นของข้อมูล (Display Density)</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div>
              <div className="mb-2 font-bold text-sm text-slate-600">Comfortable (สบายตา - สำหรับมือถือ/แท็บเล็ต)</div>
              <table className="ns-table w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50"><tr className="border-b border-slate-200"><th className="p-4 text-left">รายการ</th><th className="p-4 text-right">ยอดเงิน</th></tr></thead>
                <tbody>
                  <tr className="border-b border-slate-100"><td className="p-4">ชำระค่าสินค้า</td><td className="p-4 text-right">15,000</td></tr>
                  <tr><td className="p-4">ค่าบริการ</td><td className="p-4 text-right">500</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <div className="mb-2 font-bold text-sm text-slate-600">Compact (กะทัดรัด - สำหรับจอคอม / นักบัญชี)</div>
              <table className="ns-table w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50"><tr className="border-b border-slate-200"><th className="p-2 text-left">รายการ</th><th className="p-2 text-right">ยอดเงิน</th></tr></thead>
                <tbody>
                  <tr className="border-b border-slate-100"><td className="p-2">ชำระค่าสินค้า</td><td className="p-2 text-right">15,000</td></tr>
                  <tr className="border-b border-slate-100"><td className="p-2">ค่าบริการ</td><td className="p-2 text-right">500</td></tr>
                  <tr className="border-b border-slate-100"><td className="p-2">ภาษีหัก ณ ที่จ่าย</td><td className="p-2 text-right">-150</td></tr>
                  <tr><td className="p-2 font-bold bg-slate-50">สุทธิ</td><td className="p-2 text-right font-bold bg-slate-50">15,350</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 28. Audit Trail / Activity Log */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">28. ประวัติการทำรายการ (Audit Trail / Activity Log)</h2>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 max-w-md">
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white bg-emerald-500 text-slate-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">✓</div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded-xl border border-slate-200 shadow-sm ml-4 md:ml-0 md:mr-4 md:group-even:ml-4 md:group-even:mr-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-sm text-slate-800">อนุมัติจ่ายเงิน</div>
                    <div className="text-xs text-slate-400">10:45</div>
                  </div>
                  <div className="text-xs text-slate-500">โดย: คุณสุชาติ (ผู้จัดการ)</div>
                </div>
              </div>
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white bg-indigo-500 text-slate-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">✏️</div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded-xl border border-slate-200 shadow-sm ml-4 md:ml-0 md:mr-4 md:group-even:ml-4 md:group-even:mr-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-sm text-slate-800">แก้ไขจำนวนเงิน</div>
                    <div className="text-xs text-slate-400">09:12</div>
                  </div>
                  <div className="text-xs text-slate-500">โดย: น้องสมปอง (บัญชี)</div>
                </div>
              </div>
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white bg-slate-300 text-slate-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">📝</div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded-xl border border-slate-200 shadow-sm ml-4 md:ml-0 md:mr-4 md:group-even:ml-4 md:group-even:mr-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-sm text-slate-800">สร้างรายการ</div>
                    <div className="text-xs text-slate-400">08:30</div>
                  </div>
                  <div className="text-xs text-slate-500">โดย: ลานรับซื้อ 1</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 29. Print-friendly Layout */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">29. มุมมองสำหรับสั่งพิมพ์ (Print-friendly Layout)</h2>
          <div className="bg-slate-200 p-8 rounded-xl flex items-center justify-center">
            {/* Simulated A4 Paper */}
            <div className="bg-white w-[400px] h-[500px] shadow-lg border border-slate-300 p-8 flex flex-col relative overflow-hidden">
              {/* Header */}
              <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
                <h1 className="font-bold text-xl uppercase tracking-widest text-black">NS SCRAP ERP</h1>
                <p className="text-xs text-slate-600 mt-1">ใบรับซื้อเศษโลหะ (Weight Ticket)</p>
              </div>
              {/* Info */}
              <div className="flex justify-between text-xs mb-4 text-black">
                <div>
                  <div><span className="font-bold">ลูกค้า:</span> บจก. สมชาย</div>
                  <div><span className="font-bold">ทะเบียนรถ:</span> กข 1234</div>
                </div>
                <div className="text-right">
                  <div><span className="font-bold">เลขที่:</span> WT-001</div>
                  <div><span className="font-bold">วันที่:</span> 15/06/2026</div>
                </div>
              </div>
              {/* Table */}
              <table className="ns-table w-full text-xs text-black border-collapse border border-slate-800 mb-6">
                <thead>
                  <tr><th className="border border-slate-800 p-1 text-left">รายการ</th><th className="border border-slate-800 p-1 text-right">น้ำหนัก</th></tr>
                </thead>
                <tbody>
                  <tr><td className="border border-slate-800 p-1">เหล็กหนา</td><td className="border border-slate-800 p-1 text-right">5,000 kg</td></tr>
                  <tr><td className="border border-slate-800 p-1 font-bold">รวมสุทธิ</td><td className="border border-slate-800 p-1 text-right font-bold">5,000 kg</td></tr>
                </tbody>
              </table>
              {/* Signature */}
              <div className="mt-auto flex justify-between text-xs text-black pt-8">
                <div className="text-center w-24">
                  <div className="border-b border-slate-800 mb-1 h-4"></div>
                  <div>ผู้ส่งมอบ</div>
                </div>
                <div className="text-center w-24">
                  <div className="border-b border-slate-800 mb-1 h-4"></div>
                  <div>ผู้รับมอบ</div>
                </div>
              </div>
              <div className="absolute inset-0 border-[10px] border-indigo-500/10 pointer-events-none"></div>
            </div>
          </div>
        </div>

        {/* 30. Command Palette */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">30. การค้นหาแบบครอบจักรวาล (Command Palette / Global Search)</h2>
          <div className="relative h-[350px] bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-4">
            {/* Background Blur */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 to-slate-900/50"></div>

            {/* Command Palette Modal */}
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden relative z-10 flex flex-col border border-slate-200">
              <div className="flex items-center px-4 border-b border-slate-100 h-14">
                <span className="text-slate-400 mr-3 text-lg"></span>
                <input className="flex-1 outline-none text-slate-900 placeholder:text-slate-400 bg-transparent" placeholder="พิมพ์เพื่อค้นหา (เช่น 'สมชาย', 'เบิกเงิน')..." defaultValue="สมช" />
                <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold border border-slate-200">ESC</span>
              </div>
              <div className="max-h-[250px] overflow-y-auto py-2">
                <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">ลูกค้า (Customers)</div>
                <div className="px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex items-center gap-2 border-l-2 border-indigo-500 bg-indigo-50/50">
                  <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">C</span>
                  <span>บจก. <strong className="text-indigo-600">สมช</strong>ายกิจเจริญ</span>
                  <span className="ml-auto text-xs text-slate-400">⏎</span>
                </div>
                <div className="px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex items-center gap-2 border-l-2 border-transparent">
                  <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">C</span>
                  <span>นาย <strong className="text-indigo-600">สมช</strong>าญ ใจดี</span>
                </div>

                <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">ประวัติการค้นหาล่าสุด</div>
                <div className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-2 border-l-2 border-transparent">
                  <span className="text-slate-400">🕒</span>
                  <span>รายงานสรุปยอดรายวัน</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 31. Form Modal Header Comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-800">31. เปรียบเทียบส่วนหัวของฟอร์ม (Form Modal Header)</h2>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
            {/* Left: Basic (แบบเดิม) */}
            <div className="border-2 border-dashed border-red-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-red-100 px-3 py-1 text-sm font-semibold text-red-800 rounded-full shadow-sm">
                ❌ แบบเดิม (Flat & Grey)
              </div>

              <div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-md">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-bold text-slate-900">แก้ไขลูกค้า</h3>
                  <div className="inline-flex items-center gap-2">
                    <span className="relative inline-flex h-[18.4px] w-8 shrink-0 items-center rounded-full bg-emerald-600">
                      <span className="block size-4 translate-x-[14px] rounded-full bg-white"></span>
                    </span>
                    <span className="text-sm font-medium text-slate-600">ใช้งาน</span>
                  </div>
                </div>
                <div className="p-8 text-center text-xs text-slate-400 bg-white">เนื้อหาข้อมูลฟอร์มด้านล่าง...</div>
              </div>
              <p className="mt-4 text-xs text-red-700 font-medium leading-relaxed">
                ข้อสังเกต: พื้นหลังส่วนหัวกลมกลืนกับสีฟอร์มมากเกินไป, ป้ายกำกับคำว่า &quot;ใช้งาน&quot; ค้างไว้ไม่เปลี่ยนตามการคลิกปิด Toggle, มีเส้นขอบขาวรอบนอกตัดกับกรอบฟอร์ม
              </p>
            </div>

            {/* Middle: AcexPOS (แบบที่เราเพิ่งทำ) */}
            <div className="border-2 border-dashed border-emerald-200 p-4 rounded-lg bg-slate-100">
              <div className="mb-4 inline-block bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 rounded-full shadow-sm">
                ⚡ สไตล์ AcexPOS / แบบปรับปรุงใหม่
              </div>

              <div className="bg-white rounded-lg overflow-hidden shadow-xl">
                <div className="flex flex-col gap-3 bg-slate-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-bold text-slate-100">แก้ไขลูกค้า</h3>
                  <div className="inline-flex items-center gap-2">
                    <span className="relative inline-flex h-[18.4px] w-8 shrink-0 items-center rounded-full bg-emerald-600 cursor-pointer">
                      <span className="block size-4 translate-x-[14px] rounded-full bg-white"></span>
                    </span>
                    <span className="text-sm font-medium text-slate-200">ใช้งาน</span>
                  </div>
                </div>
                <div className="p-8 text-center text-xs text-slate-400 bg-white">เนื้อหาข้อมูลฟอร์มด้านล่าง...</div>
              </div>
              <p className="mt-4 text-xs text-emerald-700 font-medium leading-relaxed">
                ข้อสังเกต: ส่วนหัวเปลี่ยนเป็นสีน้ำเงินเข้มเหมือน Sidebar ปิดขอบขาวด้านบนเพื่อความกลมกลืน และป้ายกำกับ Toggle สามารถเปลี่ยนเป็นคำว่า &quot;ปิด&quot; หรือ &quot;ใช้งาน&quot; ตามการกดจริงได้โดยอัตโนมัติ
              </p>
            </div>

            {/* Right: Ultimate SaaS */}
            <div className="border-2 border-dashed border-indigo-200 p-4 rounded-lg bg-slate-50">
              <div className="mb-4 inline-block bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-sm font-semibold text-white rounded-full shadow-md">
                💎 Ultimate SaaS (Premium Glass)
              </div>

              <div className="bg-white rounded-xl overflow-hidden shadow-2xl border border-slate-100">
                <div className="flex flex-col gap-3 border-b border-indigo-950/20 bg-gradient-to-r from-[#0F172A] via-[#1E1B4B] to-[#0F172A] px-5 py-4 sm:flex-row sm:items-center sm:justify-between relative">
                  <h3 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
                    แก้ไขลูกค้า
                    <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5 rounded-full font-bold">MASTER</span>
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="inline-flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
                      <span className="text-xs font-bold text-slate-300">ACTIVE</span>
                    </div>
                    <button className="text-slate-400 hover:text-white transition-colors text-xs" type="button">✕</button>
                  </div>
                </div>
                <div className="p-8 text-center text-xs text-slate-400 bg-white">เนื้อหาข้อมูลฟอร์มด้านล่าง...</div>
              </div>
              <p className="mt-4 text-xs text-indigo-700 font-medium leading-relaxed">
                ข้อสังเกต: ไล่เฉดสีเข้มพรีเมียม, มี Dot Status ส่องสว่างระบุสถานะแทนสวิตช์ Toggle ขนาดใหญ่, แสดง Badges หมวดหมู่ข้อมูล และเพิ่มปุ่มปิด (X) เพื่ออำนวยความสะดวกในการกดปิดหน้าต่าง
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actual Working Dialog */}
      <Dialog open={isMockModalOpen} onOpenChange={setIsMockModalOpen}>
        <DialogContent hideClose className="max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 outline-none focus:outline-none" fallbackTitle="หัวข้อของ Popup">
          <DialogHeader className="px-6 py-4 bg-slate-900 text-white rounded-t-md">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-white">หัวข้อของ Popup (Interactive Modal)</DialogTitle>
                <DialogDescription className="truncate text-slate-300">นี่คือ Dialog ที่ทำงานได้จริง (เปิด/ปิด ได้ตามต้องการ)</DialogDescription>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button className="h-9 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700" variant="outline" onClick={() => { alert('บันทึกสำเร็จ!'); setIsMockModalOpen(false) }}>บันทึก</Button>
                <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700" variant="outline" onClick={() => setIsMockModalOpen(false)}>ยกเลิก</Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 bg-slate-50 px-6 py-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-slate-500">หัวข้อ A</div>
                <div className="mt-1 text-sm font-medium">รายละเอียดแบบ Live A</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-slate-500">หัวข้อ B</div>
                <div className="mt-1 text-sm font-medium">รายละเอียดแบบ Live B</div>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
              <div className="text-sm font-semibold mb-2">ส่วนย่อยใน Modal (Inner Section)</div>
              <div className="text-xs text-slate-500 mb-4">ลองพิมพ์ข้อมูลลงไปได้เลย</div>
              <Input placeholder="พิมพ์อะไรบางอย่าง..." className="w-full bg-white" />
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </section>
  )
}
