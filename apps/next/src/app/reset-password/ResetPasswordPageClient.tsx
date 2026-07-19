'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resetPasswordSchema } from '@/lib/auth'
import { acknowledgePasswordChanged, PASSWORD_UPDATE_ERROR } from '@/lib/auth-client-contract'
import { getSessionSafely, getSupabaseClient } from '@/lib/supabase'

export function ResetPasswordPageClient() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSessionReady, setIsSessionReady] = useState(false)
  const [sessionEmail, setSessionEmail] = useState('')
  const supabase = getSupabaseClient()
  const isSupabaseReady = Boolean(supabase)

  useEffect(() => {
    if (!supabase) return

    let mounted = true

    void (async () => {
      try {
        const session = await getSessionSafely(supabase)
        if (!mounted) return
        setIsSessionReady(Boolean(session))
        setSessionEmail(session?.user.email ?? '')
      } catch {
        if (!mounted) return
        setIsSessionReady(false)
        setSessionEmail('')
      }
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSessionReady(Boolean(session))
      setSessionEmail(session?.user.email ?? '')
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }

    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase dev ใน environment')
      return
    }

    setIsLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })
    setIsLoading(false)

    if (updateError) {
      setError(PASSWORD_UPDATE_ERROR)
      return
    }

    const acknowledgement = await acknowledgePasswordChanged({ fetchImpl: fetch })
    if (!acknowledgement.ok) {
      setError(acknowledgement.message)
      return
    }

    setPassword('')
    setConfirmPassword('')
    setMessage('ตั้งรหัสผ่านใหม่สำเร็จ กำลังพาไปหน้าเข้าสู่ระบบ')
    await supabase.auth.signOut()
    setTimeout(() => router.push('/login'), 800)
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white">
            NS
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ตั้งรหัสผ่านใหม่</h1>
        </div>

        {!isSupabaseReady ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ยังไม่ได้ตั้งค่า Supabase dev ใน environment
          </div>
        ) : null}

        {isSupabaseReady && !isSessionReady ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ลิงก์ reset password ยังไม่พร้อมหรือหมดอายุ กรุณาขอลิงก์ใหม่
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={submit}>
          <input autoComplete="email" className="hidden" readOnly type="email" value={sessionEmail} />
          <label className="block text-sm font-medium text-slate-700">
            Password ใหม่ <span className="text-red-600">*</span>
            <span className="relative mt-1 block">
              <input
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading || !isSessionReady}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md-r-md text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                disabled={isLoading}
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? '◉' : '◎'}
              </button>
            </span>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            ยืนยัน Password ใหม่ <span className="text-red-600">*</span>
            <input
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading || !isSessionReady}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              required
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
            />
          </label>

          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

          <button
            className="w-full rounded-md bg-gradient-to-r from-blue-600 to-indigo-700 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            disabled={isLoading || !isSupabaseReady || !isSessionReady}
            type="submit"
          >
            {isLoading ? 'กำลังตั้งรหัสผ่าน...' : 'ตั้งรหัสผ่านใหม่'}
          </button>

          <div className="text-center">
            <Link className="text-sm font-medium text-slate-600 hover:underline" href="/forgot-password">
              ขอลิงก์ใหม่
            </Link>
          </div>
        </form>
      </div>
    </section>
  )
}
