'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AppNavigation } from '@/components/layout/AppNavigation'
import { AuthStatus } from '@/components/layout/AuthStatus'
import { SELECTED_BRANCH_KEY } from '@/lib/branch-selection'
import { breadcrumbsForPath, pageSubtitleForPath, pageTitleForPath } from '@/lib/navigation'

type AppShellProps = {
  children: React.ReactNode
}

type BranchOption = {
  code: string | null
  id: string
  name: string
}

const PAGE_TITLE_EVENT = 'ns-scrap-erp-page-title'

export function AppShell({ children }: AppShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [breadcrumbLabelOverride, setBreadcrumbLabelOverride] = useState<string | null>(null)
  const [subtitleOverride, setSubtitleOverride] = useState<string | null>(null)
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const lastActivityPathRef = useRef<string | null>(null)
  const title = titleOverride ?? pageTitleForPath(pathname)
  const subtitle = subtitleOverride ?? pageSubtitleForPath(pathname)
  const breadcrumbs = breadcrumbsForPath(pathname)
  const renderedBreadcrumbs = breadcrumbLabelOverride && breadcrumbs.length > 0
    ? breadcrumbs.map((breadcrumb, index) => (index === breadcrumbs.length - 1 ? { ...breadcrumb, label: breadcrumbLabelOverride } : breadcrumb))
    : breadcrumbs
  const isAuthPage = pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password'

  useEffect(() => {
    setBreadcrumbLabelOverride(null)
    setSubtitleOverride(null)
    setTitleOverride(null)
  }, [pathname])

  useEffect(() => {
    function handlePageTitle(event: Event) {
      const detail = (event as CustomEvent<{ breadcrumbLabel?: string | null; subtitle?: string | null; title?: string | null }>).detail
      const nextBreadcrumbLabel = detail?.breadcrumbLabel
      const nextSubtitle = detail?.subtitle
      const nextTitle = detail?.title
      setBreadcrumbLabelOverride(nextBreadcrumbLabel || null)
      setSubtitleOverride(nextSubtitle || null)
      setTitleOverride(nextTitle || null)
    }

    window.addEventListener(PAGE_TITLE_EVENT, handlePageTitle)
    return () => window.removeEventListener(PAGE_TITLE_EVENT, handlePageTitle)
  }, [])

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

  useEffect(() => {
    if (isAuthPage || pathname === '/admin/change-password') return

    let mounted = true
    async function enforcePasswordChange() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
        const payload = await response.json().catch(() => null)
        if (!mounted || !response.ok) return
        if (payload?.appUser?.mustChangePassword === true) {
          router.replace(`/admin/change-password?redirect=${encodeURIComponent(pathname)}`)
        }
      } catch {
        // Auth enforcement is handled by the proxy; this guard only redirects active sessions.
      }
    }

    void enforcePasswordChange()

    return () => {
      mounted = false
    }
  }, [isAuthPage, pathname, router])

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
    return <div className="h-dvh overflow-y-auto bg-slate-100 text-slate-900">{children}</div>
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100 text-slate-900">
      <aside className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} w-64 flex-shrink-0 flex-col bg-slate-900 text-slate-200 lg:relative lg:flex`}>
        <div className="flex items-center gap-3 border-b border-slate-700 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white">NS</div>
          <div>
            <div className="font-bold text-white">NS Scrap ERP</div>
            <div className="text-xs text-slate-400">ระบบบริหารจัดการ</div>
          </div>
        </div>

        <AppNavigation onNavigate={() => setSidebarOpen(false)} />
      </aside>

      {sidebarOpen ? <button aria-label="ปิดเมนู" className="fixed inset-0 z-30 bg-black/40 lg:hidden" type="button" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="เปิดเมนู" className="text-xl text-slate-600 lg:hidden" type="button" onClick={() => setSidebarOpen(!sidebarOpen)}>
              ☰
            </button>
            <div className="min-w-0">
              <h1 className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-800 sm:text-base lg:text-lg">{title}</h1>
              {subtitle ? <p className="mt-0.5 min-w-0 break-words text-xs leading-snug text-slate-500 sm:text-sm">{subtitle}</p> : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select aria-label="เลือกสาขา" className="hidden rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm sm:block" value={selectedBranchId} onChange={(event) => handleBranchChange(event.target.value)}>
              <option value="all">ทุกสาขา</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <AuthStatus />
          </div>
        </header>

        {renderedBreadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 lg:px-6">
            <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
              {renderedBreadcrumbs.map((breadcrumb, index) => {
                const isLast = index === renderedBreadcrumbs.length - 1
                return (
                  <li className="flex min-w-0 items-center gap-1.5" key={`${breadcrumb.label}-${index}`}>
                    {breadcrumb.href && !isLast ? (
                      <Link className="max-w-52 truncate font-medium text-slate-600 hover:text-blue-700 hover:underline" href={breadcrumb.href}>
                        {breadcrumb.label}
                      </Link>
                    ) : (
                      <span className={isLast ? 'max-w-[36rem] truncate font-semibold text-slate-700' : 'max-w-52 truncate'}>{breadcrumb.label}</span>
                    )}
                    {!isLast ? <span className="text-slate-300">/</span> : null}
                  </li>
                )
              })}
            </ol>
          </nav>
        ) : null}

        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
