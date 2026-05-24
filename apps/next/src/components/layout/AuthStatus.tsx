'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ChevronDown, KeyRound, LogOut, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getSupabaseClient } from '@/lib/supabase'

type AuthStatusProfile = {
  roles: Array<{
    code: string
    id: string
    name: string
  }>
  userEmail: string
}

export function AuthStatus() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AuthStatusProfile>({ roles: [], userEmail: '' })
  const [isLoading, setIsLoading] = useState(true)
  const supabase = getSupabaseClient()

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

      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!mounted || !response.ok) {
          setProfile({ roles: [], userEmail: fallbackEmail })
          return
        }

        const roles = Array.isArray(payload?.roles)
          ? payload.roles
            .map((role: unknown) => {
              if (!role || typeof role !== 'object') return null
              const candidate = role as Record<string, unknown>
              return typeof candidate.id === 'string'
                && typeof candidate.code === 'string'
                && typeof candidate.name === 'string'
                ? { code: candidate.code, id: candidate.id, name: candidate.name }
                : null
            })
            .filter((role: AuthStatusProfile['roles'][number] | null): role is AuthStatusProfile['roles'][number] => role !== null)
          : []

        setProfile({
          roles,
          userEmail: typeof payload?.authUser?.email === 'string' ? payload.authUser.email : fallbackEmail,
        })
      } catch {
        if (mounted) {
          setProfile({ roles: [], userEmail: fallbackEmail })
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      void loadProfile(data.session)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      void loadProfile(nextSession)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  async function logout() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setProfile({ roles: [], userEmail: '' })
    router.push('/login')
  }

  const userEmail = profile.userEmail || session?.user.email || ''
  const roleNames = profile.roles.map((role: AuthStatusProfile['roles'][number]) => role.name).join(', ')

  if (isLoading) {
    return <span className="rounded-md px-3 py-1.5 text-sm text-slate-400">กำลังตรวจ session</span>
  }

  if (!session) {
    return (
      <Link className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100" href="/login">
        Login
      </Link>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="max-w-80 gap-2 text-slate-600" size="sm" variant="ghost">
          <UserRound className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 text-left sm:block">
            <span className="block max-w-52 truncate text-sm">{userEmail}</span>
            <span className="block max-w-52 truncate text-xs text-slate-500">{roleNames || 'ยังไม่กำหนด role'}</span>
          </span>
          <span className="sm:hidden">บัญชีผู้ใช้</span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem asChild>
          <Link className="flex items-center gap-2" href="/admin/change-password">
            <KeyRound className="size-4 text-slate-500" />
            <span>เปลี่ยนรหัสผ่าน</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-700" onClick={logout}>
          <LogOut className="mr-2 size-4" />
          <span>ออกจากระบบ</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
