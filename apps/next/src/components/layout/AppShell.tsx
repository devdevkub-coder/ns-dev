'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppNavigation } from '@/components/layout/AppNavigation'
import { AuthStatus } from '@/components/layout/AuthStatus'
import { pageTitleForPath } from '@/lib/navigation'

type AppShellProps = {
  children: React.ReactNode
}

type BranchOption = {
  code: string | null
  id: string
  name: string
}

const SELECTED_BRANCH_KEY = 'ns-scrap-erp-selected-branch-id'

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const lastActivityPathRef = useRef<string | null>(null)
  const title = pageTitleForPath(pathname)
  const isAuthPage = pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password'

  useEffect(() => {
    if (isAuthPage) return

    const savedBranchId = window.localStorage.getItem(SELECTED_BRANCH_KEY)
    if (savedBranchId) setSelectedBranchId(savedBranchId)

    let mounted = true
    async function loadBranches() {
      try {
        const response = await fetch('/api/branches', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!mounted || !response.ok) return
        const nextBranches = Array.isArray(payload?.branches) ? payload.branches : []
        setBranches(nextBranches)
        if (savedBranchId && savedBranchId !== 'all' && !nextBranches.some((branch: BranchOption) => branch.id === savedBranchId)) {
          setSelectedBranchId('all')
          window.localStorage.setItem(SELECTED_BRANCH_KEY, 'all')
        }
      } catch {
        if (mounted) setBranches([])
      }
    }

    void loadBranches()

    return () => {
      mounted = false
    }
  }, [isAuthPage])

  useEffect(() => {
    if (isAuthPage || lastActivityPathRef.current === pathname) return
    lastActivityPathRef.current = pathname

    void fetch('/api/activity', {
      body: JSON.stringify({
        key: 'page.view',
        metadata: { pageTitle: title },
        referrer: document.referrer || null,
        routePath: pathname,
        title,
        type: 'page_view',
      }),
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).catch(() => {
      // Activity logging is best-effort and must not block normal navigation.
    })
  }, [isAuthPage, pathname, title])

  function handleBranchChange(value: string) {
    setSelectedBranchId(value)
    window.localStorage.setItem(SELECTED_BRANCH_KEY, value)
    window.dispatchEvent(new CustomEvent('ns-scrap-erp-branch-change', { detail: { branchId: value === 'all' ? null : value } }))
    void fetch('/api/activity', {
      body: JSON.stringify({
        key: 'branch.selected',
        metadata: { branchId: value === 'all' ? null : value },
        routePath: pathname,
        title: 'เลือกสาขา',
        type: 'action',
      }),
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).catch(() => undefined)
  }

  if (isAuthPage) {
    return <div className="min-h-screen bg-slate-100 text-slate-900">{children}</div>
  }

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
            <select aria-label="เลือกสาขา" className="hidden rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm sm:block" value={selectedBranchId} onChange={(event) => handleBranchChange(event.target.value)}>
              <option value="all">ทุกสาขา</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code ? `${branch.code} · ${branch.name}` : branch.name}
                </option>
              ))}
            </select>
            <AuthStatus />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
