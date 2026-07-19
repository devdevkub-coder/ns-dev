'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { loginSchema } from '@/lib/auth'
import { completeBrowserLoginSession } from '@/lib/auth-client-contract'
import { getSessionSafely, getSupabaseClient } from '@/lib/supabase'

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'

  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin) return '/'
    if (['/login', '/forgot-password', '/reset-password'].includes(parsed.pathname)) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

async function resolveDefaultLandingPath() {
  return '/'
}

export function LoginPageClient() {
  const searchParams = useSearchParams()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const hasValidatedExistingSession = useRef(false)
  const supabase = getSupabaseClient()
  const isSupabaseReady = Boolean(supabase)

  useEffect(() => {
    if (!supabase || hasValidatedExistingSession.current) return
    hasValidatedExistingSession.current = true

    let mounted = true

    void (async () => {
      const session = await getSessionSafely(supabase).catch(() => null)
      if (!mounted || !session) return

      await supabase.auth.refreshSession().catch(() => undefined)
      const completion = await completeBrowserLoginSession({
        fetchImpl: fetch,
        signOut: () => supabase.auth.signOut({ scope: 'local' }),
      })
      if (!mounted) return

      if (!completion.ok) {
        setError(completion.message)
        return
      }

      const redirectParam = searchParams.get('redirect')
      const redirectPath = redirectParam ? safeRedirectPath(redirectParam) : await resolveDefaultLandingPath()
      window.location.replace(redirectPath)
    })()

    return () => {
      mounted = false
    }
  }, [searchParams, supabase])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse({ email: identifier, password })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูล login ไม่ถูกต้อง')
      return
    }

    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase dev ใน environment')
      return
    }

    setIsLoading(true)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      })

      if (signInError) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        return
      }

      const completion = await completeBrowserLoginSession({
        fetchImpl: fetch,
        signOut: () => supabase.auth.signOut({ scope: 'local' }),
      })

      if (!completion.ok) {
        setError(completion.message)
        return
      }

      await supabase.auth.getSession().catch(() => undefined)
      setPassword('')
      const redirectParam = searchParams.get('redirect')
      const redirectPath = redirectParam ? safeRedirectPath(redirectParam) : await resolveDefaultLandingPath()
      window.location.assign(redirectPath)
    } catch {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      setError('เชื่อมต่อระบบเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsLoading(false)
    }
  }

  function submitOnPasswordEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || isLoading) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white">
            NS
          </div>
          <h1 className="text-2xl font-bold text-slate-800">NS Scrap ERP</h1>
        </div>

        {!isSupabaseReady ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ยังไม่ได้ตั้งค่า Supabase dev ใน environment
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            Email <span className="text-red-600">*</span>
            <input
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="name@company.com"
              required
              type="email"
              value={identifier}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password <span className="text-red-600">*</span>
            <span className="relative mt-1 block">
              <input
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={submitOnPasswordEnter}
                placeholder="••••••••"
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
                {showPassword ? (
                  <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.9 10.9 0 0 1 12 20c-5 0-9.27-3.11-11-7.5a11.8 11.8 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A10.8 10.8 0 0 1 12 4c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-2.9 4.26" />
                    <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
                    <path d="M1 1l22 22" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </span>
          </label>

          <div className="text-right">
            <Link className="text-sm font-medium text-blue-700 hover:underline" href="/forgot-password">
              ลืมรหัสผ่าน?
            </Link>
          </div>

          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button
            className="w-full rounded-md bg-gradient-to-r from-blue-600 to-indigo-700 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            disabled={isLoading || !isSupabaseReady}
            type="submit"
          >
            {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </section>
  )
}
