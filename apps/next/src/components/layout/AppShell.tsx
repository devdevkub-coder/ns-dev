'use client'

import type { FocusEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Search, X } from 'lucide-react'
import { AppNavigation } from '@/components/layout/AppNavigation'
import { AuthStatus } from '@/components/layout/AuthStatus'
import { MobileBottomNavigation } from '@/components/layout/MobileBottomNavigation'
import { ThemeModeToggle } from '@/components/layout/ThemeModeToggle'
import { breadcrumbsForPath, canAccessPath, navigationItems, navigationSections, pageTitleForPath, type NavigationItem } from '@/lib/navigation'

type AppShellProps = {
  children: React.ReactNode
}

type AuthContextSummary = {
  authUserEmail: string
  mustChangePassword: boolean
  permissions: string[]
  roles: Array<{ code: string; id: string; name: string }>
}

type MenuSearchResult = {
  href: string
  icon: string
  label: string
  parentLabel?: string
  sectionLabel: string
}

const PAGE_TITLE_EVENT = 'ns-scrap-erp-page-title'

function normalizeAuthRoles(value: unknown): AuthContextSummary['roles'] {
  if (!Array.isArray(value)) return []
  return value
    .map((role) => {
      if (!role || typeof role !== 'object') return null
      const candidate = role as Record<string, unknown>
      return typeof candidate.id === 'string'
        && typeof candidate.code === 'string'
        && typeof candidate.name === 'string'
        ? { code: candidate.code, id: candidate.id, name: candidate.name }
        : null
    })
    .filter((role): role is AuthContextSummary['roles'][number] => role !== null)
}

function flattenSearchItems(items: NavigationItem[], authContext: AuthContextSummary): MenuSearchResult[] {
  const sectionLabelByKey = new Map(navigationSections.map((section) => [section.key, section.label]))

  return items.flatMap((item) => {
    const visibleChildren = item.children?.filter((child) => canAccessPath(child.href, authContext)) ?? []
    const parentVisible = canAccessPath(item.href, authContext) || visibleChildren.length > 0
    if (!parentVisible) return []

    const sectionLabel = sectionLabelByKey.get(item.section) ?? item.section
    const parentResult: MenuSearchResult[] = !item.children?.length || canAccessPath(item.href, authContext)
      ? [{
          href: item.href,
          icon: item.icon,
          label: item.label,
          sectionLabel,
        }]
      : []

    const childResults = visibleChildren.map((child) => ({
      href: child.href,
      icon: child.icon,
      label: child.label,
      parentLabel: item.label,
      sectionLabel: sectionLabelByKey.get(child.section) ?? sectionLabel,
    }))

    return [...parentResult, ...childResults]
  })
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarUserMenuOpen, setSidebarUserMenuOpen] = useState(false)
  const [authContext, setAuthContext] = useState<AuthContextSummary | null>(null)
  const [authLoadError, setAuthLoadError] = useState<string | null>(null)
  const [breadcrumbLabelOverride, setBreadcrumbLabelOverride] = useState<string | null>(null)
  const [menuSearch, setMenuSearch] = useState('')
  const [menuSearchFocused, setMenuSearchFocused] = useState(false)
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const lastActivityPathRef = useRef<string | null>(null)
  const title = titleOverride ?? pageTitleForPath(pathname)
  const breadcrumbs = breadcrumbsForPath(pathname)
  const renderedBreadcrumbs = breadcrumbLabelOverride && breadcrumbs.length > 0
    ? breadcrumbs.map((breadcrumb, index) => (index === breadcrumbs.length - 1 ? { ...breadcrumb, label: breadcrumbLabelOverride } : breadcrumb))
    : breadcrumbs
  const isAuthPage = pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password'
  const showMobileBottomNav = !isAuthPage
  const menuSearchResults = useMemo(() => {
    const query = menuSearch.trim().toLowerCase()
    if (!query || !authContext) return []

    return flattenSearchItems(navigationItems, authContext)
      .filter((item) => `${item.label} ${item.href} ${item.parentLabel ?? ''} ${item.sectionLabel}`.toLowerCase().includes(query))
      .slice(0, 10)
  }, [authContext, menuSearch])
  const authStatusProfile = useMemo(() => ({
    roles: authContext?.roles ?? [],
    userEmail: authContext?.authUserEmail ?? '',
  }), [authContext])

  useEffect(() => {
    setBreadcrumbLabelOverride(null)
    setTitleOverride(null)
  }, [pathname])

  useEffect(() => {
    function handlePageTitle(event: Event) {
      const detail = (event as CustomEvent<{ breadcrumbLabel?: string | null; title?: string | null }>).detail
      const nextBreadcrumbLabel = detail?.breadcrumbLabel
      const nextTitle = detail?.title
      setBreadcrumbLabelOverride(nextBreadcrumbLabel || null)
      setTitleOverride(nextTitle || null)
    }

    window.addEventListener(PAGE_TITLE_EVENT, handlePageTitle)
    return () => window.removeEventListener(PAGE_TITLE_EVENT, handlePageTitle)
  }, [])

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
    if (isAuthPage) return

    let mounted = true

    async function loadAuthContext() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
        const payload = await response.json().catch(() => null)

        if (mounted && response.ok) {
          setAuthLoadError(null)
          setAuthContext({
            authUserEmail: typeof payload?.authUser?.email === 'string' ? payload.authUser.email : '',
            mustChangePassword: payload?.appUser?.mustChangePassword === true,
            permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
            roles: normalizeAuthRoles(payload?.roles),
          })
        } else if (mounted && response.status === 401) {
          const redirect = `${pathname}${window.location.search}`
          router.replace(`/login?redirect=${encodeURIComponent(redirect)}`)
        } else if (mounted) {
          setAuthContext(null)
          setAuthLoadError(
            typeof payload?.error === 'string'
              ? payload.error
              : response.status === 403
                ? 'บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบ'
                : 'โหลดข้อมูลบัญชีและสิทธิ์ไม่สำเร็จ',
          )
        }
      } catch {
        if (mounted) {
          setAuthContext(null)
          setAuthLoadError('เชื่อมต่อระบบบัญชีและสิทธิ์ไม่สำเร็จ')
        }
      }
    }

    void loadAuthContext()

    return () => {
      mounted = false
    }
  }, [isAuthPage, pathname, router])

  useEffect(() => {
    if (isAuthPage || pathname === '/admin/change-password') return
    if (authContext?.mustChangePassword === true) {
      router.replace(`/admin/change-password?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authContext?.mustChangePassword, isAuthPage, pathname, router])

  function handleSidebarBlur(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return
    if (sidebarUserMenuOpen) return
    setDesktopSidebarExpanded(false)
  }

  function handleSidebarMouseLeave() {
    if (sidebarUserMenuOpen) return
    setDesktopSidebarExpanded(false)
  }

  function handleMenuSearchBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setMenuSearchFocused(false)
  }

  function clearMenuSearch() {
    setMenuSearch('')
    setMenuSearchFocused(false)
  }

  if (isAuthPage) {
    return <div className="h-dvh overflow-y-auto bg-slate-100 text-slate-900">{children}</div>
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100 text-slate-900">
      <aside
        className={`${sidebarOpen ? 'fixed inset-0 z-50 flex w-full' : 'hidden'} flex-shrink-0 flex-col overflow-hidden bg-slate-900 text-slate-200 transition-[width] duration-200 ease-out lg:relative lg:flex ${desktopSidebarExpanded ? 'lg:w-64' : 'lg:w-16'}`}
        onBlur={handleSidebarBlur}
        onFocus={() => setDesktopSidebarExpanded(true)}
        onMouseEnter={() => setDesktopSidebarExpanded(true)}
        onMouseLeave={handleSidebarMouseLeave}
      >
        <div className={`flex min-h-[72px] items-center border-b border-slate-700 px-4 py-3.5 dark:border-[var(--ns-dark-border-strong)] ${desktopSidebarExpanded ? 'gap-5' : 'gap-3 lg:justify-center lg:gap-0'}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white">NS</div>
          <div className={`min-w-0 flex-1 pl-1 ${desktopSidebarExpanded ? '' : 'lg:hidden'}`.trim()}>
            <div className="truncate font-bold text-white">NS Scrap ERP</div>
            <div className="truncate text-xs text-slate-400">ระบบบริหารจัดการ</div>
          </div>
          <button
            aria-label="ปิดเมนู"
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-200 outline-none transition hover:bg-slate-700 focus:ring-2 focus:ring-blue-400/30 lg:hidden"
            type="button"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="relative border-b border-slate-800 p-3 lg:hidden" onBlur={handleMenuSearchBlur}>
          <label className="relative block">
            <span className="sr-only">ค้นหาเมนู</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              className="h-9 w-full rounded-md border border-[#282828] bg-[#343434] pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 disabled:cursor-wait disabled:text-slate-500"
              disabled={!authContext}
              placeholder={authContext ? 'ค้นหาเมนู...' : 'กำลังโหลดเมนู...'}
              type="search"
              value={menuSearch}
              onChange={(event) => {
                setMenuSearch(event.target.value)
                setMenuSearchFocused(true)
              }}
              onFocus={() => setMenuSearchFocused(true)}
            />
          </label>
          {menuSearchFocused && menuSearch.trim() ? (
            <div className="absolute left-3 right-3 top-full z-50 mt-2 max-h-[min(60vh,24rem)] overflow-y-auto rounded-md border border-slate-700 bg-slate-950 py-1 shadow-xl">
              {!authContext ? (
                <div className="px-3 py-4 text-center text-sm text-slate-400">กำลังโหลดเมนู</div>
              ) : menuSearchResults.length ? menuSearchResults.map((item) => (
                <Link
                  className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:outline-none"
                  href={item.href}
                  key={`${item.href}-${item.label}-mobile`}
                  onClick={() => {
                    clearMenuSearch()
                    setSidebarOpen(false)
                  }}
                >
                  <span className="w-5 shrink-0 text-center">{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-slate-500">{item.parentLabel ? `${item.parentLabel} / ` : ''}{item.sectionLabel}</span>
                  </span>
                </Link>
              )) : (
                <div className="px-3 py-4 text-center text-sm text-slate-400">ไม่พบเมนูที่ค้นหา</div>
              )}
            </div>
          ) : null}
        </div>

        <AppNavigation authContext={authContext} compact={!desktopSidebarExpanded} onNavigate={() => setSidebarOpen(false)} />
        <div className="border-t border-slate-800 p-2">
          <AuthStatus
            compact={!desktopSidebarExpanded}
            profile={authStatusProfile}
            variant="sidebar"
            onMenuOpenChange={(open) => {
              setSidebarUserMenuOpen(open)
              if (open) setDesktopSidebarExpanded(true)
            }}
          />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#e2e8f0] bg-[#ffffff] px-4 py-3 text-slate-800 dark:border-[rgb(148_163_184_/_0.12)] dark:bg-[var(--ns-dark-surface-soft)] dark:text-[#e2e8f0] lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {!showMobileBottomNav && (
              <button
                aria-label="เปิดเมนู"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:text-[#cbd5e1] dark:hover:bg-[#1e293b] dark:hover:text-white dark:focus-visible:ring-blue-400/50 lg:hidden"
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu aria-hidden="true" className="h-7 w-7 stroke-[2.4]" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-800 dark:text-[#f8fafc] sm:text-base lg:text-lg">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden w-[min(360px,38vw)] min-w-64 shrink-0 lg:block" onBlur={handleMenuSearchBlur}>
              <label className="relative block">
                <span className="sr-only">ค้นหาเมนู</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#64748b] dark:text-[#94a3b8]" />
                <input
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-[#172033] outline-none transition placeholder:text-[#64748b] disabled:cursor-wait disabled:text-[#64748b] dark:text-[#f1f5f9] dark:placeholder:text-[#94a3b8] dark:disabled:text-[#94a3b8]"
                  disabled={!authContext}
                  placeholder={authContext ? 'ค้นหาเมนู...' : 'กำลังโหลดเมนู...'}
                  type="search"
                  value={menuSearch}
                  onChange={(event) => {
                    setMenuSearch(event.target.value)
                    setMenuSearchFocused(true)
                  }}
                  onFocus={() => setMenuSearchFocused(true)}
                />
              </label>
              {menuSearchFocused && menuSearch.trim() ? (
                <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(70vh,28rem)] w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg shadow-slate-950/15 dark:border-[#334155] dark:bg-[#1e293b] dark:shadow-slate-950/35">
                  {!authContext ? (
                    <div className="px-3 py-4 text-center text-sm text-slate-500 dark:text-[#94a3b8]">กำลังโหลดเมนู</div>
                  ) : menuSearchResults.length ? menuSearchResults.map((item) => (
                    <Link
                      className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 focus:bg-slate-100 focus:outline-none dark:text-[#e2e8f0] dark:hover:bg-[#334155] dark:hover:text-white dark:focus:bg-[#334155]"
                      href={item.href}
                      key={`${item.href}-${item.label}`}
                      onClick={clearMenuSearch}
                    >
                      <span className="w-5 shrink-0 text-center">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-[#94a3b8]">{item.parentLabel ? `${item.parentLabel} / ` : ''}{item.sectionLabel}</span>
                      </span>
                    </Link>
                  )) : (
                    <div className="px-3 py-4 text-center text-sm text-slate-500 dark:text-[#94a3b8]">ไม่พบเมนูที่ค้นหา</div>
                  )}
                </div>
              ) : null}
            </div>

            <ThemeModeToggle />
          </div>
        </header>

        {renderedBreadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="bg-slate-50 px-4 py-2 text-xs text-slate-500 lg:px-6">
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

        <main className={`min-h-0 flex-1 overflow-y-auto p-4 lg:p-6 ${showMobileBottomNav ? 'pb-20 lg:pb-6' : ''}`}>
          {authLoadError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200" role="alert">
              {authLoadError}
            </div>
          ) : null}
          {children}
        </main>
      </div>
      {showMobileBottomNav && !sidebarOpen ? (
        <MobileBottomNavigation authContext={authContext} onOpenSidebar={() => setSidebarOpen(true)} />
      ) : null}
    </div>
  )
}
