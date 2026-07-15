'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  User,
  Menu,
  LayoutDashboard,
  ClipboardList,
} from 'lucide-react'
import { canAccessPath, navigationItems, sidebarNavigationPath } from '@/lib/navigation'

type MobileBottomNavigationProps = {
  authContext: { permissions: string[] } | null
  onOpenSidebar?: () => void
}

const dailyCandidates = [
  '/daily/weight-ticket-list',
  '/daily-report',
  '/daily/expense',
]

const dashboardCandidates = [
  '/dashboard-overview',
  '/production/dashboard',
  '/finance-accounting/financial-dashboard',
  '/daily/expense-dashboard',
  '/trading/dashboard',
  '/analytics-dashboard',
]

export function MobileBottomNavigation({ authContext, onOpenSidebar }: MobileBottomNavigationProps) {
  const pathname = usePathname()

  if (!authContext) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-200/80 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.03)] pb-safe lg:hidden">
        <div className="mx-auto flex h-full max-w-lg items-center justify-around px-2 animate-pulse">
          <div className="h-10 w-12 rounded bg-slate-100" />
          <div className="h-10 w-12 rounded bg-slate-100" />
          <div className="h-10 w-12 rounded bg-slate-100" />
          <div className="h-10 w-12 rounded bg-slate-100" />
        </div>
      </nav>
    )
  }

  const dashboardHref = authContext
    ? dashboardCandidates.find((href) => canAccessPath(href, authContext))
    : null
  const dailyHref = authContext
    ? dailyCandidates.find((href) => canAccessPath(href, authContext))
    : null
  const activeNavigationPath = sidebarNavigationPath(pathname)
  const activeSection = navigationItems.find((item) => (
    item.href === activeNavigationPath || item.children?.some((child) => child.href === activeNavigationPath)
  ))?.section

  const rawTabs = [
    {
      icon: Menu,
      key: 'menu',
      label: 'เมนู',
      onClick: onOpenSidebar,
    },
    dailyHref ? {
      href: dailyHref,
      icon: ClipboardList,
      isActive: activeSection === 'daily' || activeNavigationPath === '/daily-report',
      key: 'daily',
      label: 'ประจำวัน',
    } : null,
    dashboardHref ? {
      href: dashboardHref,
      icon: LayoutDashboard,
      isActive: pathname === dashboardHref || pathname.startsWith(`${dashboardHref}/`),
      key: 'dashboard',
      label: 'แดชบอร์ด',
    } : null,
    {
      href: '/profile',
      icon: User,
      isActive: pathname === '/profile' || pathname.startsWith('/profile/'),
      key: 'account',
      label: 'บัญชี',
    },
  ]
  const displayedTabs = rawTabs.filter((tab): tab is Exclude<(typeof rawTabs)[number], null> => Boolean(tab)).slice(0, 4)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-200/80 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.03)] pb-safe lg:hidden">
      <div className="mx-auto flex h-full max-w-lg items-center justify-around px-2">
        {displayedTabs.map((tab) => {
          const Icon = tab.icon
          
          if ('onClick' in tab) {
            return (
              <button
                key={tab.key}
                aria-label={tab.label}
                onClick={tab.onClick}
                type="button"
                className="flex h-full flex-1 flex-col items-center justify-center gap-1 text-slate-400 outline-none transition-all duration-200 hover:text-slate-600"
              >
                <Icon className="size-[22px] transition-transform stroke-[2px]" />
                <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-xs font-medium leading-none">
                  {tab.label}
                </span>
              </button>
            )
          }

          const isActive = tab.isActive

          return (
            <Link
              href={tab.href!}
              key={tab.key}
              className={`flex h-full flex-1 flex-col items-center justify-center gap-1 outline-none transition-all duration-200 ${
                isActive
                  ? 'text-blue-600 scale-105'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className={`size-[22px] transition-transform ${isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
              <span className={`w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-xs font-medium leading-none ${isActive ? 'font-bold' : ''}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
