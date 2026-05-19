'use client'

import { FormEvent, useEffect, useState } from 'react'
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

export function ChangePasswordPageClient() {
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

    setCurrentPassword('')
    setPassword('')
    setConfirmPassword('')
    setMessage('เปลี่ยน Password สำเร็จ')
  }

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-purple-700 to-pink-600 p-4 text-white shadow">
        <h1 className="text-xl font-bold">🔒 เปลี่ยน Password ของฉัน</h1>
        <p className="mt-1 text-sm opacity-90">เพื่อความปลอดภัย — แนะนำให้เปลี่ยน password ทุก 3-6 เดือน</p>
      </div>

      <form className="space-y-3 rounded-xl bg-white p-5 shadow" onSubmit={submit}>
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {isFetchingUser ? 'กำลังโหลดผู้ใช้...' : <>👤 <b>{user?.name ?? '-'}</b> · @{user?.username ?? '-'} · {user?.email || '-'}</>}
        </div>

        {user?.mustChangePassword ? (
          <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-800">
            ⚠ Password ของคุณยังเป็นค่า default — กรุณาเปลี่ยนเพื่อความปลอดภัย
          </div>
        ) : null}

        {!isSupabaseReady ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ยังไม่ได้ตั้งค่า Supabase dev ใน environment
          </div>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          Password เดิม *
          <input
            autoComplete="current-password"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isLoading || isFetchingUser}
            onChange={(event) => setCurrentPassword(event.target.value)}
            type={showPassword ? 'text' : 'password'}
            value={currentPassword}
          />
          {fieldErrors.currentPassword ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.currentPassword}</span> : null}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password ใหม่ * (อย่างน้อย 8 ตัว มีตัวใหญ่ ตัวเล็ก และตัวเลข)
          <input
            autoComplete="new-password"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isLoading || isFetchingUser}
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? 'text' : 'password'}
            value={password}
          />
          {fieldErrors.password ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.password}</span> : null}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          ยืนยัน Password ใหม่ *
          <input
            autoComplete="new-password"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isLoading || isFetchingUser}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
          />
          {fieldErrors.confirmPassword ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.confirmPassword}</span> : null}
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} type="checkbox" />
          แสดง password
        </label>

        {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

        <button
          className="w-full rounded-lg bg-purple-600 py-2.5 font-bold text-white hover:bg-purple-700 disabled:opacity-60"
          disabled={isLoading || isFetchingUser || !isSupabaseReady}
          type="submit"
        >
          {isLoading ? 'กำลังเปลี่ยน Password...' : '🔒 เปลี่ยน Password'}
        </button>

        <div className="text-center text-xs text-slate-500">ใช้ Supabase Auth เป็น source of truth; ระบบไม่เก็บ password ในตารางของแอป</div>
      </form>

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        💡 <b>คำแนะนำ Password:</b> ใช้ทั้งตัวอักษร + ตัวเลข + อักขระพิเศษ (เช่น Ns@2026!) · ห้ามใช้ password เดียวกับเว็บอื่น · อย่าจดไว้ในที่ที่คนอื่นเห็น
      </div>
    </div>
  )
}
