'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { changePasswordSchema } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

type FieldErrors = Partial<Record<'confirmPassword' | 'currentPassword' | 'password', string>>

type CurrentUser = {
  email: string
  mustChangePassword: boolean
  name: string
  username: string
}

function issueMap(issues: { message: string; path: PropertyKey[] }[]) {
  const next: FieldErrors = {}
  issues.forEach((issue) => {
    const field = issue.path[0]
    if ((field === 'currentPassword' || field === 'password' || field === 'confirmPassword') && !next[field]) {
      next[field] = issue.message
    }
  })
  return next
}

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null

  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin) return null
    if (['/login', '/forgot-password', '/reset-password', '/admin/change-password'].includes(parsed.pathname)) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

export function ChangePasswordPageClient() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingUser, setIsFetchingUser] = useState(true)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const supabase = getSupabaseClient()
  const isSupabaseReady = Boolean(supabase)

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      setIsFetchingUser(true)
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' })
        if (!response.ok) throw new Error('โหลดข้อมูลผู้ใช้ไม่สำเร็จ')
        const payload = await response.json() as {
          email?: string | null
          mustChangePassword?: boolean
          user?: { displayName?: string | null; username?: string | null }
        }
        if (!mounted) return
        setUser({
          email: payload.email ?? '',
          mustChangePassword: payload.mustChangePassword === true,
          name: payload.user?.displayName ?? payload.user?.username ?? payload.email ?? 'ผู้ใช้งาน',
          username: payload.user?.username ?? '-',
        })
      } catch (caught) {
        if (!mounted) return
        setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ')
      } finally {
        if (mounted) setIsFetchingUser(false)
      }
    }

    void loadUser()
    return () => {
      mounted = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setFieldErrors({})

    const parsed = changePasswordSchema.safeParse({ confirmPassword, currentPassword, password })

    if (!parsed.success) {
      setFieldErrors(issueMap(parsed.error.issues))
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }

    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase dev ใน environment')
      return
    }

    if (!user?.email) {
      setError('ไม่พบ email ของผู้ใช้ปัจจุบัน จึงยืนยัน password เดิมไม่ได้')
      return
    }

    setIsLoading(true)
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    })

    if (verifyError) {
      setIsLoading(false)
      setFieldErrors({ currentPassword: 'Password เดิมไม่ถูกต้อง' })
      setError('Password เดิมไม่ถูกต้อง')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })
    setIsLoading(false)

    if (updateError) {
      setError(`เปลี่ยน Password ไม่สำเร็จ: ${updateError.message}`)
      return
    }

    await fetch('/api/auth/password-changed', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    }).catch(() => undefined)

    setCurrentPassword('')
    setPassword('')
    setConfirmPassword('')
    setUser((current) => current ? { ...current, mustChangePassword: false } : current)
    setMessage('เปลี่ยน Password สำเร็จ')

    const redirectTo = safeRedirectPath(new URLSearchParams(window.location.search).get('redirect'))
    if (redirectTo) {
      setTimeout(() => router.replace(redirectTo), 600)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:block rounded-md bg-white p-4 shadow border border-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">เปลี่ยนรหัสผ่าน</h2>
            <p className="mt-1 text-sm text-slate-500">ยืนยันรหัสผ่านเดิมก่อนตั้งรหัสผ่านใหม่ของบัญชีผู้ใช้ปัจจุบัน</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 shrink-0">
            <ShieldCheck className="size-4" />
            Supabase Auth
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="md:hidden rounded-md bg-white p-3.5 shadow space-y-2.5 border border-slate-200 animate-fade-in">
        <div>
          <h2 className="text-lg font-bold text-slate-900">เปลี่ยนรหัสผ่าน</h2>
          <p className="mt-0.5 text-xs text-slate-500">ยืนยันรหัสผ่านเดิมก่อนตั้งรหัสผ่านใหม่</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 w-fit shrink-0">
          <ShieldCheck className="size-3.5" />
          Supabase Auth
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] animate-fade-in">
        <form className="space-y-4 rounded-md bg-white p-5 shadow border border-slate-200" onSubmit={submit}>
          {user?.mustChangePassword ? (
            <div className="rounded-md border border-amber-250 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 animate-pulse">
              รหัสผ่านของคุณยังเป็นค่าเริ่มต้น กรุณาเปลี่ยนก่อนใช้งานต่อ
            </div>
          ) : null}

          {!isSupabaseReady ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ยังไม่ได้ตั้งค่า Supabase dev ใน environment
            </div>
          ) : null}

          <PasswordField
            autoComplete="current-password"
            disabled={isLoading || isFetchingUser}
            error={fieldErrors.currentPassword}
            label="รหัสผ่านเดิม"
            showPassword={showPassword}
            value={currentPassword}
            onChange={setCurrentPassword}
          />

          <PasswordField
            autoComplete="new-password"
            description="อย่างน้อย 8 ตัว มีตัวใหญ่ ตัวเล็ก และตัวเลข"
            disabled={isLoading || isFetchingUser}
            error={fieldErrors.password}
            label="รหัสผ่านใหม่"
            showPassword={showPassword}
            value={password}
            onChange={setPassword}
          />

          <PasswordField
            autoComplete="new-password"
            disabled={isLoading || isFetchingUser}
            error={fieldErrors.confirmPassword}
            label="ยืนยันรหัสผ่านใหม่"
            showPassword={showPassword}
            value={confirmPassword}
            onChange={setConfirmPassword}
          />

          <label className="inline-flex items-center gap-2 text-sm text-slate-650 cursor-pointer select-none">
            <input checked={showPassword} className="size-4 rounded border-slate-300 text-slate-900 focus:ring-blue-500 focus:border-blue-500" onChange={(event) => setShowPassword(event.target.checked)} type="checkbox" />
            {showPassword ? <EyeOff className="size-4 text-slate-500" /> : <Eye className="size-4 text-slate-500" />}
            แสดงรหัสผ่าน
          </label>

          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-fade-in">{error}</div> : null}
          {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 animate-fade-in">{message}</div> : null}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button className="w-full sm:w-auto font-semibold" disabled={isLoading || isFetchingUser || !isSupabaseReady} type="submit">
              <KeyRound className="mr-2 size-4" />
              {isLoading ? 'กำลังเปลี่ยนรหัสผ่าน...' : 'บันทึกรหัสผ่านใหม่'}
            </Button>
          </div>
        </form>

        <aside className="space-y-3">
          <div className="rounded-md bg-white p-4 shadow border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded bg-slate-900 text-white shrink-0">
                <UserRound className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900">{isFetchingUser ? 'กำลังโหลดผู้ใช้...' : user?.name ?? '-'}</div>
                <div className="truncate text-xs text-slate-500 mt-0.5">@{user?.username ?? '-'}</div>
              </div>
            </div>
            <div className="mt-3 truncate rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 font-medium">{user?.email || '-'}</div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-bold text-slate-900 text-xs uppercase tracking-wide">คำแนะนำรหัสผ่าน</div>
            <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
              <li>ใช้ตัวอักษรใหญ่ ตัวอักษรเล็ก และตัวเลขร่วมกัน</li>
              <li>หลีกเลี่ยงรหัสผ่านเดียวกับระบบอื่น</li>
              <li>ระบบใช้ Supabase Auth เป็นแหล่งข้อมูลรหัสผ่าน ไม่บันทึกในตารางของแอป</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function PasswordField(props: {
  autoComplete: string
  description?: string
  disabled: boolean
  error?: string
  label: string
  onChange: (value: string) => void
  showPassword: boolean
  value: string
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {props.label} <span className="text-red-650">*</span>
      {props.description ? <span className="ml-1 text-[11px] font-normal text-slate-500">({props.description})</span> : null}
      <Input
        autoComplete={props.autoComplete}
        className={`mt-1.5 h-9 focus:ring-blue-500 focus:border-blue-500 ${props.error ? 'border-red-400 bg-red-50 focus:border-red-400' : ''}`}
        disabled={props.disabled}
        type={props.showPassword ? 'text' : 'password'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}
