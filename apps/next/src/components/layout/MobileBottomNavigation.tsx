'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ClipboardList,
  BarChart3,
  Factory,
  User,
  Download,
  Upload,
  Package,
  Truck,
  Menu,
  LayoutDashboard,
} from 'lucide-react'
import { canAccessPath } from '@/lib/navigation'

type MobileBottomNavigationProps = {
  onOpenSidebar?: () => void
}

export function MobileBottomNavigation({ onOpenSidebar }: MobileBottomNavigationProps) {
  const pathname = usePathname()
  const [authContext, setAuthContext] = useState<{ isAdmin: boolean; permissions: string[] } | null>(null)
  const [loading, setLoading] = useState(true)

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
      } catch (err) {
        console.error('Failed to load auth context in bottom navigation', err)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    void loadAuthContext()
    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-200/80 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.03)] pb-safe md:hidden">
        <div className="mx-auto flex h-full max-w-lg items-center justify-around px-2 animate-pulse">
          <div className="h-10 w-12 rounded bg-slate-100" />
          <div className="h-10 w-12 rounded bg-slate-100" />
          <div className="h-10 w-12 rounded bg-slate-100" />
          <div className="h-10 w-12 rounded bg-slate-100" />
        </div>
      </nav>
    )
  }

  const candidateTabs = [
    {
      icon: Menu,
      label: 'เมนู',
      isMenuTrigger: true,
    },
    {
      href: '/daily/weight-ticket-list',
      icon: ClipboardList,
      label: 'รับ-ส่งของ',
    },
    {
      href: '/production/dashboard',
      icon: LayoutDashboard,
      label: 'แดชบอร์ด',
    },
    {
      href: '/production/orders',
      icon: Factory,
      label: 'สั่งผลิต',
    },
    {
      href: '/production/report',
      icon: BarChart3,
      label: 'รายงาน',
    },
    {
      href: '/profile',
      icon: User,
      label: 'บัญชี',
    },
  ]

  // Filter allowed tabs based on permissions
  const displayedTabs = candidateTabs.filter((tab) => {
    if (tab.isMenuTrigger || tab.href === '/profile') return true
    if (!authContext || !tab.href) return false
    return canAccessPath(tab.href, authContext)
  })

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-200/80 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.03)] pb-safe md:hidden">
      <div className="mx-auto flex h-full max-w-lg items-center justify-around px-2">
        {displayedTabs.map((tab, idx) => {
          const Icon = tab.icon
          
          if (tab.isMenuTrigger) {
            return (
              <button
                key="menu-trigger"
                onClick={onOpenSidebar}
                type="button"
                className="flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 outline-none text-slate-400 hover:text-slate-600"
              >
                <Icon className="size-[22px] transition-transform stroke-[2px]" />
                <span className="text-[10px] sm:text-xs font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
                  {tab.label}
                </span>
              </button>
            )
          }

          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)

          return (
            <Link
              href={tab.href!}
              key={tab.href || idx}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 outline-none ${
                isActive
                  ? 'text-blue-600 scale-105'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className={`size-[22px] transition-transform ${isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
              <span className={`text-[10px] sm:text-xs font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis w-full text-center ${isActive ? 'font-bold' : ''}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

