'use client'

import type { FocusEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Search, Sun, Moon, X } from 'lucide-react'
import { AppNavigation } from '@/components/layout/AppNavigation'
import { AuthStatus } from '@/components/layout/AuthStatus'
import { MobileBottomNavigation } from '@/components/layout/MobileBottomNavigation'
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

function emptyAuthContext(): AuthContextSummary {
  return { authUserEmail: '', mustChangePassword: false, permissions: [], roles: [] }
}

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
  const [breadcrumbLabelOverride, setBreadcrumbLabelOverride] = useState<string | null>(null)
  const [menuSearch, setMenuSearch] = useState('')
  const [menuSearchFocused, setMenuSearchFocused] = useState(false)
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const activeTheme = savedTheme || systemTheme
    setTheme(activeTheme)
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
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
          setAuthContext({
            authUserEmail: typeof payload?.authUser?.email === 'string' ? payload.authUser.email : '',
            mustChangePassword: payload?.appUser?.mustChangePassword === true,
            permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
            roles: normalizeAuthRoles(payload?.roles),
          })
        } else if (mounted) {
          setAuthContext(emptyAuthContext())
        }
      } catch {
        if (mounted) {
          setAuthContext(emptyAuthContext())
        }
      }
    }

    void loadAuthContext()

    return () => {
      mounted = false
    }
  }, [isAuthPage])

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
        <div className={`flex min-h-[72px] items-center border-b border-slate-700 px-4 py-4 ${desktopSidebarExpanded ? 'gap-5' : 'gap-3 lg:justify-center lg:gap-0'}`}>
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
              className="h-10 w-full rounded-md border border-slate-700 bg-slate-950/60 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-slate-950 focus:ring-2 focus:ring-blue-400/20 disabled:cursor-wait disabled:text-slate-500"
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
        <header className="flex min-h-[72px] items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {!showMobileBottomNav && (
              <button
                aria-label="เปิดเมนู"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 lg:hidden"
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu aria-hidden="true" className="h-7 w-7 stroke-[2.4]" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-800 sm:text-base lg:text-lg">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden w-[min(360px,38vw)] min-w-64 shrink-0 lg:block" onBlur={handleMenuSearchBlur}>
              <label className="relative block">
                <span className="sr-only">ค้นหาเมนู</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 disabled:cursor-wait disabled:text-slate-400"
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
                <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(70vh,28rem)] w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  {!authContext ? (
                    <div className="px-3 py-4 text-center text-sm text-slate-500">กำลังโหลดเมนู</div>
                  ) : menuSearchResults.length ? menuSearchResults.map((item) => (
                    <Link
                      className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-50 focus:outline-none"
                      href={item.href}
                      key={`${item.href}-${item.label}`}
                      onClick={clearMenuSearch}
                    >
                      <span className="w-5 shrink-0 text-center">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        <span className="block truncate text-xs text-slate-500">{item.parentLabel ? `${item.parentLabel} / ` : ''}{item.sectionLabel}</span>
                      </span>
                    </Link>
                  )) : (
                    <div className="px-3 py-4 text-center text-sm text-slate-500">ไม่พบเมนูที่ค้นหา</div>
                  )}
                </div>
              ) : null}
            </div>

            <button
              aria-label="เปลี่ยนธีม"
              className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              type="button"
              onClick={toggleTheme}
            >
              {!mounted ? (
                <span className="h-5 w-5 shrink-0" />
              ) : theme === 'dark' ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
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

        <main className={`min-h-0 flex-1 overflow-y-auto p-4 lg:p-6 ${showMobileBottomNav ? 'pb-20 lg:pb-6' : ''}`}>{children}</main>
      </div>
      {showMobileBottomNav && !sidebarOpen ? (
        <MobileBottomNavigation authContext={authContext} onOpenSidebar={() => setSidebarOpen(true)} />
      ) : null}
    </div>
  )
}
