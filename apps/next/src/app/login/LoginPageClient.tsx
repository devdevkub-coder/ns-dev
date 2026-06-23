'use client'

import { FormEvent, KeyboardEvent, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { isEmailIdentifier, loginSchema } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

type LoginPageClientProps = {
  devLogin?: {
    identifier: string
    password: string
  }
}

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

export function LoginPageClient({ devLogin }: LoginPageClientProps) {
  const searchParams = useSearchParams()
  const [identifier, setIdentifier] = useState(devLogin?.identifier ?? '')
  const [password, setPassword] = useState(devLogin?.password ?? '')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = getSupabaseClient()
  const isSupabaseReady = Boolean(supabase)

  async function resolveLoginEmail(loginIdentifier: string) {
    if (!supabase) return null
    if (isEmailIdentifier(loginIdentifier)) return loginIdentifier

    const { data, error: lookupError } = await supabase.rpc('lookup_app_login_email', {
      _identifier: loginIdentifier,
    })

    if (lookupError) {
      throw new Error(lookupError.message)
    }

    return typeof data === 'string' && data.includes('@') ? data : null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse({ identifier, password })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูล login ไม่ถูกต้อง')
      return
    }

    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase dev ใน environment')
      return
    }

    setIsLoading(true)

    let loginEmail: string | null = null

    try {
      loginEmail = await resolveLoginEmail(parsed.data.identifier)
    } catch (caught) {
      setIsLoading(false)
      setError(caught instanceof Error ? `ตรวจสอบบัญชีไม่สำเร็จ: ${caught.message}` : 'ตรวจสอบบัญชีไม่สำเร็จ')
      return
    }

    if (!loginEmail) {
      setIsLoading(false)
      setError('ไม่พบบัญชีผู้ใช้งานที่เปิดใช้งานอยู่')
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: parsed.data.password,
    })

    setIsLoading(false)

    if (signInError) {
      setError(`เข้าสู่ระบบไม่สำเร็จ: ${signInError.message}`)
      return
    }

    setPassword('')
    window.location.assign(safeRedirectPath(searchParams.get('redirect')))
  }

  function submitOnPasswordEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || isLoading) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-md bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white">
            NS
          </div>
          <h1 className="text-2xl font-bold text-slate-800">NS Scrap ERP</h1>
          <p className="text-sm text-slate-500">ระบบบริหารโรงงานรับซื้อ-ขายเศษโลหะ</p>
        </div>

        {!isSupabaseReady ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ยังไม่ได้ตั้งค่า Supabase dev ใน environment
          </div>
        ) : null}

        {devLogin?.identifier || devLogin?.password ? (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            เติมบัญชีทดสอบแล้ว
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            Email / Username
            <input
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="ns-aom@nsscrap.com"
              type="text"
              value={identifier}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <span className="relative mt-1 block">
              <input
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={submitOnPasswordEnter}
                placeholder="••••••••"
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
