'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppNavigation } from '@/components/layout/AppNavigation'
import { pageTitleForPath } from '@/lib/navigation'

type AppShellProps = {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const title = pageTitleForPath(pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      <aside className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} w-64 flex-shrink-0 flex-col bg-slate-900 text-slate-200 lg:relative lg:flex`}>
        <div className="flex items-center gap-3 border-b border-slate-700 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white">NS</div>
          <div>
            <div className="font-bold text-white">NS Scrap ERP</div>
            <div className="text-xs text-slate-400">ระบบบริหารจัดการ</div>
          </div>
        </div>

        <AppNavigation onNavigate={() => setSidebarOpen(false)} />

        <div className="border-t border-slate-700 p-3 text-center text-[10px] text-slate-500">v1.0 NS Scrap ERP</div>
      </aside>

      {sidebarOpen ? <button aria-label="ปิดเมนู" className="fixed inset-0 z-30 bg-black/40 lg:hidden" type="button" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="เปิดเมนู" className="text-xl text-slate-600 lg:hidden" type="button" onClick={() => setSidebarOpen(!sidebarOpen)}>
              ☰
            </button>
            <h1 className="truncate text-lg font-semibold text-slate-800">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <select aria-label="เลือกสาขา" className="hidden rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm sm:block" defaultValue="all">
              <option value="all">ทุกสาขา</option>
            </select>
            <Link className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" href="/login">
              Login
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
