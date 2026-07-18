'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getSessionSafely, getSupabaseClient } from '@/lib/supabase'

type AuthStatusProfile = {
  roles: Array<{
    code: string
    id: string
    name: string
  }>
  userEmail: string
}

type AuthStatusProps = {
  compact?: boolean
  onMenuOpenChange?: (open: boolean) => void
  profile: AuthStatusProfile
  variant?: 'default' | 'sidebar'
}

export function AuthStatus({ compact = false, onMenuOpenChange, profile: profileFromShell, variant = 'default' }: AuthStatusProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AuthStatusProfile>({ roles: [], userEmail: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const supabase = getSupabaseClient()

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches)
    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => mediaQuery.removeEventListener('change', syncViewport)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
      return
    }

    let mounted = true

    async function loadProfile(nextSession: Session | null) {
      if (!mounted) return

      if (!nextSession) {
        setProfile({ roles: [], userEmail: '' })
        return
      }

      const fallbackEmail = nextSession.user.email ?? ''
      setProfile({
        roles: profileFromShell.roles,
        userEmail: profileFromShell.userEmail || fallbackEmail,
      })
    }

    void (async () => {
      try {
        const nextSession = await getSessionSafely(supabase)
        if (!mounted) return
        setSession(nextSession)
        void loadProfile(nextSession)
      } catch {
        if (!mounted) return
        setSession(null)
        setProfile({ roles: [], userEmail: '' })
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      void loadProfile(nextSession)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [profileFromShell, supabase])

  async function logout() {
    if (!supabase) return
    try {
      await supabase.auth.signOut()
    } finally {
      setSession(null)
      setProfile({ roles: [], userEmail: '' })
      window.location.replace('/login')
    }
  }

  const userEmail = profile.userEmail || session?.user.email || ''
  const roleNames = profile.roles.map((role: AuthStatusProfile['roles'][number]) => role.name).join(', ')

  const isSidebar = variant === 'sidebar'

  function toggleMobileMenu() {
    const nextOpen = !isMobileMenuOpen
    setIsMobileMenuOpen(nextOpen)
    onMenuOpenChange?.(nextOpen)
  }

  if (isLoading) {
    return (
      <span className={isSidebar ? 'block truncate rounded-md px-3 py-2 text-xs text-slate-400' : 'rounded-md px-3 py-1.5 text-sm text-slate-400'}>
        {compact ? '...' : 'กำลังตรวจ session'}
      </span>
    )
  }

  if (!session) {
    return (
      <Link
        className={isSidebar
          ? `flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white ${compact ? 'lg:justify-center lg:px-2' : ''}`
          : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100'}
        href="/login"
      >
        <UserRound className="size-4 shrink-0" />
        <span className={compact && isSidebar ? 'lg:hidden' : ''}>Login</span>
      </Link>
    )
  }

  if (isSidebar && isMobileViewport) {
    return (
      <div className="w-full">
        {isMobileMenuOpen ? (
          <div className="mb-2 overflow-hidden rounded-md border border-slate-700 bg-slate-800 shadow-sm">
            <Link
              className="flex h-11 items-center gap-2 px-3 text-sm text-slate-100 hover:bg-slate-700 focus:bg-slate-700 focus:outline-none"
              href="/profile"
              onClick={() => {
                setIsMobileMenuOpen(false)
                onMenuOpenChange?.(false)
              }}
            >
              <UserRound className="size-4 text-slate-300" />
              <span>ตั้งค่าโปรไฟล์ & บัญชี</span>
            </Link>
            <div className="h-px bg-slate-700" />
            <button
              className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm text-slate-100 hover:bg-slate-700 focus:bg-slate-700 focus:outline-none"
              type="button"
              onClick={logout}
            >
              <LogOut className="size-4 text-slate-300" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        ) : null}
        <Button
          aria-expanded={isMobileMenuOpen}
          className="h-auto min-h-11 w-full justify-start gap-3 rounded-md px-3 py-2 text-left text-slate-300 hover:bg-slate-800 hover:text-white"
          size="sm"
          type="button"
          variant="ghost"
          onClick={toggleMobileMenu}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-100">
            <UserRound className="size-4 shrink-0" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium text-slate-100">{userEmail}</span>
            <span className="block truncate text-xs text-slate-400">{roleNames || 'ยังไม่กำหนด role'}</span>
          </span>
          <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
        </Button>
      </div>
    )
  }

  return (
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          className={isSidebar
            ? `h-auto min-h-11 w-full justify-start gap-3 rounded-md px-3 py-2 text-left text-slate-300 hover:bg-slate-800 hover:text-white ${compact ? 'lg:justify-center lg:px-2' : ''}`
            : 'max-w-80 gap-2 text-slate-600'}
          size="sm"
          variant="ghost"
        >
          <span className={isSidebar ? 'flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-100' : ''}>
            <UserRound className="size-4 shrink-0" />
          </span>
          <span className={isSidebar
            ? `min-w-0 flex-1 text-left ${compact ? 'lg:hidden' : ''}`
            : 'hidden min-w-0 flex-1 text-left sm:block'}
          >
            <span className={isSidebar ? 'block truncate text-sm font-medium text-slate-100' : 'block max-w-52 truncate text-sm'}>{userEmail}</span>
            <span className={isSidebar ? 'block truncate text-xs text-slate-400' : 'block max-w-52 truncate text-xs text-slate-500'}>{roleNames || 'ยังไม่กำหนด role'}</span>
          </span>
          {!isSidebar ? <span className="sm:hidden">บัญชีผู้ใช้</span> : null}
          <ChevronDown className={`size-4 shrink-0 text-slate-400 ${compact && isSidebar ? 'lg:hidden' : ''}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isSidebar ? 'start' : 'end'}
        className="w-64 rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-100 shadow-2xl shadow-black/30"
        side={isSidebar && !isMobileViewport ? 'right' : isSidebar ? 'top' : 'bottom'}
        sideOffset={10}
      >
        <DropdownMenuItem asChild className="h-9 cursor-pointer text-slate-100 focus:bg-slate-800 focus:text-white">
          <Link className="flex items-center gap-2" href="/profile">
            <UserRound className="size-4 text-slate-300" />
            <span>ตั้งค่าโปรไฟล์ & บัญชี</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 bg-slate-700" />
        <DropdownMenuItem className="h-9 cursor-pointer text-slate-100 focus:bg-slate-800 focus:text-white" onClick={logout}>
          <LogOut className="mr-2 size-4 text-slate-300" />
          <span>ออกจากระบบ</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
