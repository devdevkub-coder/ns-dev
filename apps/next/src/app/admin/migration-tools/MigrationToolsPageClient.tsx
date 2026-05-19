'use client'

import { useEffect, useMemo, useState } from 'react'

type StorageInfo = {
  dbSizeMB: string
  pctUsed: number
  sizeMB: string
  snapshotCount: number
  warningLevel: 'critical' | 'normal' | 'warning'
}

const recordStats = [
  ['บิลซื้อ', 0],
  ['บิลขาย', 0],
  ['จ่ายเงิน', 0],
  ['รับเงิน', 0],
  ['โอน', 0],
  ['ค่าใช้จ่าย', 0],
  ['ผลิต', 0],
  ['PO ซื้อ', 0],
  ['PO ขาย', 0],
  ['Stock Ledger', 0],
  ['ลูกค้า', 0],
  ['Supplier', 0],
] as const

const destructiveActions = [
  'Restore จากไฟล์ Backup',
  'Push LocalStorage → Cloud',
  'Pull Cloud → LocalStorage',
  'Migrate Users',
  'Reset Transactions',
  'Reset ข้อมูลทั้งหมด',
]

function readStorageInfo(): StorageInfo {
  if (typeof window === 'undefined') {
    return { dbSizeMB: '0.00', pctUsed: 0, sizeMB: '0.00', snapshotCount: 0, warningLevel: 'normal' }
  }

  let totalBytes = 0
  let dbBytes = 0
  let snapshotCount = 0

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) ?? ''
    const value = window.localStorage.getItem(key) ?? ''
    const bytes = new Blob([key, value]).size
    totalBytes += bytes
    if (key === 'ns_scrap_erp' || key === 'ns_erp_db') dbBytes += bytes
    if (key.startsWith('ns_erp_backup_') || key.startsWith('ns_erp_snapshot_') || key.includes('_pre_pull')) snapshotCount += 1
  }

  const limitBytes = 9 * 1024 * 1024
  const pctUsed = Math.min(100, Math.round((totalBytes / limitBytes) * 100))
  return {
    dbSizeMB: (dbBytes / 1024 / 1024).toFixed(2),
    pctUsed,
    sizeMB: (totalBytes / 1024 / 1024).toFixed(2),
    snapshotCount,
    warningLevel: pctUsed >= 85 ? 'critical' : pctUsed >= 65 ? 'warning' : 'normal',
  }
}

function DisabledActionButton({ children, tone = 'slate' }: { children: string; tone?: 'blue' | 'cyan' | 'emerald' | 'orange' | 'red' | 'slate' | 'violet' }) {
  const color = {
    blue: 'bg-blue-100 text-blue-700',
    cyan: 'bg-cyan-100 text-cyan-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    slate: 'bg-slate-100 text-slate-500',
    violet: 'bg-violet-100 text-violet-700',
  }[tone]
  return (
    <button className={`rounded-lg px-4 py-2.5 text-sm font-bold ${color} opacity-70`} disabled type="button">
      {children}
    </button>
  )
}

export function MigrationToolsPageClient() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo>(() => ({ dbSizeMB: '0.00', pctUsed: 0, sizeMB: '0.00', snapshotCount: 0, warningLevel: 'normal' }))

  useEffect(() => {
    setStorageInfo(readStorageInfo())
  }, [])

  const barColor = useMemo(() => {
    if (storageInfo.warningLevel === 'critical') return 'bg-red-500'
    if (storageInfo.warningLevel === 'warning') return 'bg-amber-500'
    return 'bg-emerald-500'
  }, [storageInfo.warningLevel])

  return (
    <section className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-purple-700 to-pink-600 p-4 text-white shadow">
        <h1 className="text-xl font-bold">💾 Backup / Restore — สำรองข้อมูล</h1>
        <p className="mt-1 text-sm opacity-90">สำคัญมาก — หน้านี้เป็น safe baseline สำหรับตรวจสถานะและแผนกู้คืนเท่านั้น</p>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <h2 className="mb-2 font-bold text-slate-700">📊 สถานะ Storage (browser localStorage)</h2>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <div><div className="text-xs text-slate-500">ขนาดรวม</div><div className="text-lg font-bold text-emerald-700">{storageInfo.sizeMB} MB</div></div>
          <div><div className="text-xs text-slate-500">% ใช้งาน (~9MB limit)</div><div className="text-lg font-bold text-emerald-700">{storageInfo.pctUsed}%</div></div>
          <div><div className="text-xs text-slate-500">Database จริง</div><div className="text-sm font-medium">{storageInfo.dbSizeMB} MB</div></div>
          <div><div className="text-xs text-slate-500">Snapshots/Backups</div><div className="text-sm font-medium">{storageInfo.snapshotCount} รายการ</div></div>
          <div>
            <div className="text-xs text-slate-500">Auto-backup รายวัน</div>
            <button className="rounded bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600" disabled type="button">⚪ ปิด</button>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
          <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${storageInfo.pctUsed}%` }} />
        </div>
        <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
          Safe baseline: อ่าน localStorage ได้เท่านั้น ยังไม่ล้าง snapshot, ไม่ restore, ไม่ sync cloud และไม่ reset ข้อมูล
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <h2 className="mb-2 font-bold text-slate-700">📋 จำนวน Records ในระบบ</h2>
        <div className="grid grid-cols-3 gap-2 text-sm md:grid-cols-6">
          {recordStats.map(([label, value]) => (
            <div className="rounded bg-slate-50 p-2" key={label}>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="font-bold">{value.toLocaleString('th-TH')}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Record count wiring จะทำใน SYS2 hardening หลังออกแบบ source/API ที่ไม่กระทบ performance</p>
      </div>

      <div className="rounded-xl border-l-4 border-emerald-500 bg-white p-4 shadow">
        <h2 className="mb-2 font-bold text-emerald-700">📤 Export Backup (สำคัญที่สุด)</h2>
        <p className="mb-3 text-sm text-slate-600">ดาวน์โหลดข้อมูลทั้งหมดเป็น JSON file → เก็บใน Google Drive / OneDrive / USB / Email หาตัวเอง</p>
        <DisabledActionButton tone="emerald">💾 Export Backup ตอนนี้</DisabledActionButton>
        <div className="mt-3 text-xs text-slate-500">
          <div>📌 Export จริงต้องออกแบบ scope, masking, audit log, และ retention ก่อน</div>
          <div>📌 ไฟล์ตัวอย่าง legacy: <code>ns_erp_backup_2026-05-07.json</code></div>
        </div>
      </div>

      <div className="rounded-xl border-l-4 border-blue-500 bg-white p-4 shadow">
        <h2 className="mb-2 font-bold text-blue-700">📥 Restore จากไฟล์ Backup</h2>
        <p className="mb-3 text-sm text-slate-600">ใช้เมื่อต้องการกู้ข้อมูลกลับ หรือย้ายข้อมูลจากเครื่องอื่น</p>
        <input className="mb-2 text-sm" disabled type="file" />
        <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
          <h3 className="mb-2 font-bold text-blue-700">📄 ตัวอย่างข้อมูลในไฟล์</h3>
          <DisabledActionButton tone="blue">✅ ยืนยัน Restore (เขียนทับข้อมูลปัจจุบัน)</DisabledActionButton>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <h2 className="mb-2 font-bold text-slate-700">🗂 Snapshot อัตโนมัติ (Browser นี้ — เก็บ 7 วันล่าสุด)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr><th className="p-2 text-left">วันที่</th><th className="p-2 text-right">ขนาด (KB)</th><th className="p-2 text-center">การกระทำ</th></tr>
            </thead>
            <tbody>
              <tr><td className="py-6 text-center text-slate-400" colSpan={3}>ยังไม่มี snapshot — เปิด Auto-backup หลังออกแบบ write flow</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border-2 border-cyan-400 bg-gradient-to-br from-cyan-50 to-blue-50 p-4">
        <h2 className="mb-2 flex items-center gap-2 font-bold text-cyan-700">☁️ Migrate ไป Supabase Cloud</h2>
        <p className="mb-3 text-sm text-slate-700">Upload ข้อมูลจาก LocalStorage → Supabase Cloud ต้องมี dry-run, audit, rollback, และ branch/environment guard ก่อน</p>
        <div className="mb-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
          <div className="rounded border-l-4 border-emerald-500 bg-white p-2"><div className="text-slate-500">📊 Records ทั้งหมด</div><div className="text-lg font-bold text-emerald-700">0</div></div>
          <div className="rounded border-l-4 border-blue-500 bg-white p-2"><div className="text-slate-500">🌐 Supabase Status</div><div className="text-sm font-bold text-amber-700">design only</div></div>
          <div className="rounded border-l-4 border-amber-500 bg-white p-2"><div className="text-slate-500">⏱ เวลาประมาณการ</div><div className="text-sm font-bold text-slate-700">deferred</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DisabledActionButton tone="cyan">☁️ ⬆ Push (LocalStorage → Cloud)</DisabledActionButton>
          <DisabledActionButton tone="emerald">☁️ ⬇ Pull (Cloud → LocalStorage)</DisabledActionButton>
          <DisabledActionButton tone="violet">👥 Migrate Users (Local → Supabase Auth)</DisabledActionButton>
        </div>
      </div>

      <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4">
        <h2 className="mb-2 font-bold text-orange-700">🧹 Reset Transactions — เริ่มคีย์ข้อมูลจริง (Go-Live)</h2>
        <p className="mb-2 text-sm text-orange-700">ลบเฉพาะ transaction โดยเก็บ Master Data ทั้งหมด ต้องแยก batch ออกแบบ confirmation, backup, audit, และ rollback ก่อน</p>
        <div className="mb-3 grid grid-cols-1 gap-3 rounded bg-white p-3 text-xs md:grid-cols-2">
          <div><div className="mb-1 font-bold text-red-600">❌ จะถูกลบถ้าอนุมัติในอนาคต:</div><ul className="space-y-0.5 text-red-700"><li>• บิลซื้อ + บิลขาย + ใบสำคัญรับเงิน</li><li>• Payment + Receipt + Transfer</li><li>• ค่าใช้จ่าย + เงินสำรองจ่าย</li><li>• Stock Ledger + Stock Issues</li></ul></div>
          <div><div className="mb-1 font-bold text-emerald-600">✅ จะถูกเก็บไว้:</div><ul className="space-y-0.5 text-emerald-700"><li>• Suppliers ทั้งหมด</li><li>• Customers ทั้งหมด</li><li>• Products ทั้งหมด</li><li>• Users + Roles + Permissions</li></ul></div>
        </div>
        <DisabledActionButton tone="orange">🧹 Reset Transactions (เก็บ Master)</DisabledActionButton>
      </div>

      <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
        <h2 className="mb-2 font-bold text-red-700">⚠️ Danger Zone — Reset ทั้งหมด (รวม Master Data)</h2>
        <p className="mb-3 text-sm text-red-600">ลบข้อมูลทั้งหมดรวม Master Data และกลับไปใช้ค่าเริ่มต้น เป็น destructive action ที่ยังไม่อนุมัติในระบบ Next</p>
        <DisabledActionButton tone="red">🚨 Reset ข้อมูลทั้งหมด (รวม Suppliers/Customers/Products)</DisabledActionButton>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <h3 className="font-bold text-amber-700">📘 คู่มือ Backup ที่แนะนำ</h3>
        <ul className="mt-2 space-y-1 text-amber-800">
          <li>1. ทุกวัน: ก่อนปิดเครื่อง ให้ใช้ export ที่ผ่านการออกแบบแล้วเท่านั้น</li>
          <li>2. ทุกสัปดาห์: copy ไฟล์ backup ใหม่สุดใส่ External HDD / USB เพิ่ม</li>
          <li>3. ทุกเดือน: ทดสอบ Restore กับเครื่องสำรองหลังมี sandbox restore flow</li>
          <li>4. ห้าม Clear Browsing Data โดยไม่ Export ก่อน</li>
          <li>5. ห้ามใช้ Incognito/InPrivate mode สำหรับงานจริง</li>
          <li>6. ระยะยาว: ให้ใช้ dev-target/staging/new production migration plan แทน localStorage backup</li>
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow">
        <h3 className="font-bold text-slate-700">Deferred destructive actions</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {destructiveActions.map((action) => <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600" key={action}>{action}</span>)}
        </div>
      </div>
    </section>
  )
}
