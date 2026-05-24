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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getSupabaseClient } from '@/lib/supabase'

export function AuthStatus() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = getSupabaseClient()

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
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
    router.push('/login')
  }

  const userEmail = session?.user.email ?? ''

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
        <Button className="max-w-64 gap-2 text-slate-600" size="sm" variant="ghost">
          <UserRound className="size-4 shrink-0" />
          <span className="hidden max-w-40 truncate sm:inline">{userEmail}</span>
          <span className="sm:hidden">บัญชีผู้ใช้</span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Signed in as</div>
          <div className="truncate text-sm font-semibold text-slate-700">{userEmail}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
