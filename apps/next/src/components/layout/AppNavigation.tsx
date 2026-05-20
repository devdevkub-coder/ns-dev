'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { canAccessPath, navigationItems, navigationSections } from '@/lib/navigation'

type AppNavigationProps = {
  onNavigate?: () => void
}

const SIDEBAR_SCROLL_KEY = 'ns-scrap-erp-sidebar-scroll-top'

export function AppNavigation({ onNavigate }: AppNavigationProps) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement | null>(null)
  const hasRestoredScrollRef = useRef(false)
  const suppressScrollSaveRef = useRef(false)
  const [authContext, setAuthContext] = useState<{ isAdmin: boolean; permissions: string[] } | null>(null)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true

    async function loadAuthContext() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)

        if (mounted && response.ok) {
          setAuthContext({
            isAdmin: payload?.isAdmin === true,
            permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
          })
        }
      } catch {
        if (mounted) {
          setAuthContext({ isAdmin: false, permissions: [] })
        }
      }
    }

    void loadAuthContext()

    return () => {
      mounted = false
    }
  }, [])

  const visibleItems = useMemo(() => {
    if (!authContext) return navigationItems
    return navigationItems
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) => canAccessPath(child.href, authContext)),
      }))
      .filter((item) => canAccessPath(item.href, authContext) || Boolean(item.children?.length))
  }, [authContext])

  useEffect(() => {
    const activeParent = navigationItems.find((item) => item.children?.some((child) => child.href === pathname))
    if (!activeParent) return

    setExpandedMenus((current) => new Set(current).add(activeParent.href))
  }, [pathname])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    if (hasRestoredScrollRef.current) return
    hasRestoredScrollRef.current = true

    const savedScrollTop = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY)
    if (savedScrollTop === null) return

    const parsedScrollTop = Number(savedScrollTop)
    if (!Number.isFinite(parsedScrollTop)) return

    const frame = requestAnimationFrame(() => {
      suppressScrollSaveRef.current = true
      nav.scrollTop = parsedScrollTop
      requestAnimationFrame(() => {
        suppressScrollSaveRef.current = false
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const frame = requestAnimationFrame(() => {
      const activeItem = nav.querySelector<HTMLElement>('[data-active-nav="true"]')
      if (!activeItem) return

      const navRect = nav.getBoundingClientRect()
      const activeRect = activeItem.getBoundingClientRect()
      const isVisible = activeRect.top >= navRect.top && activeRect.bottom <= navRect.bottom
      if (!isVisible) {
        suppressScrollSaveRef.current = true
        activeItem.scrollIntoView({ block: 'nearest' })
        requestAnimationFrame(() => {
          window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop))
          suppressScrollSaveRef.current = false
        })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [expandedMenus, pathname, visibleItems])

  function rememberSidebarScroll() {
    if (suppressScrollSaveRef.current) return
    const nav = navRef.current
    if (!nav) return
    window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop))
  }

  function toggleMenu(href: string) {
    setExpandedMenus((current) => {
      const next = new Set(current)
      if (next.has(href)) {
        next.delete(href)
      } else {
        next.add(href)
      }
      return next
    })
  }

  return (
    <nav ref={navRef} className="flex-1 overflow-y-auto py-3 text-sm" aria-label="Main navigation" onScroll={rememberSidebarScroll}>
      {navigationSections.map((section) => {
        const items = visibleItems.filter((item) => item.section === section.key)
        if (!items.length) return null

        return (
          <div key={section.key}>
            <div className="px-4 pb-1 pt-4 text-xs uppercase tracking-wider text-slate-500">{section.label}</div>
            {items.map((item) => {
              const childActive = item.children?.some((child) => child.href === pathname) ?? false
              const active = pathname === item.href || childActive
              const expanded = expandedMenus.has(item.href)

              return (
                <div key={item.href}>
                  <div className={`flex border-l-4 transition hover:bg-slate-800 ${active ? 'border-blue-500 bg-slate-800 text-white' : 'border-transparent text-slate-300'}`}>
                    {item.children?.length ? (
                      <button
                        aria-current={active ? 'page' : undefined}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
                        data-active-nav={active ? 'true' : undefined}
                        type="button"
                        onClick={() => {
                          rememberSidebarScroll()
                          toggleMenu(item.href)
                        }}
                      >
                        <span className="w-5 text-center">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    ) : (
                      <Link
                        aria-current={pathname === item.href ? 'page' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
                        data-active-nav={active ? 'true' : undefined}
                        href={item.href}
                        onClick={() => {
                          rememberSidebarScroll()
                          onNavigate?.()
                        }}
                      >
                        <span className="w-5 text-center">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    )}
                    {item.children?.length ? (
                      <button
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'ยุบ' : 'ขยาย'}เมนู ${item.label}`}
                        className="px-3 text-xs text-slate-400 hover:text-white"
                        type="button"
                        onClick={() => toggleMenu(item.href)}
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                    ) : null}
                  </div>
                  {item.children?.length && expanded ? (
                    <div className="bg-slate-950/30 py-1">
                      {item.children.map((child) => {
                        const childIsActive = pathname === child.href

                        return (
                          <Link
                            key={child.href}
                            aria-current={childIsActive ? 'page' : undefined}
                            className={`flex items-center gap-3 border-l-4 py-2 pl-11 pr-4 text-left transition hover:bg-slate-800 ${
                              childIsActive ? 'border-blue-400 bg-slate-800 text-white' : 'border-transparent text-slate-400'
                            }`}
                            data-active-nav={childIsActive ? 'true' : undefined}
                            href={child.href}
                            onClick={() => {
                              rememberSidebarScroll()
                              onNavigate?.()
                            }}
                          >
                            <span className="w-5 text-center">{child.icon}</span>
                            <span className="truncate">{child.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
