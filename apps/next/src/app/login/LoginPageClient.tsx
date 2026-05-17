'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isEmailIdentifier, loginSchema } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

type LoginPageClientProps = {
  devLogin?: {
    identifier: string
    password: string
  }
}

export function LoginPageClient({ devLogin }: LoginPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [identifier, setIdentifier] = useState(devLogin?.identifier ?? '')
  const [password, setPassword] = useState(devLogin?.password ?? '')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = getSupabaseClient()
  const isSupabaseReady = Boolean(supabase)

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

    if (!isEmailIdentifier(parsed.data.identifier)) {
      setError('ตอนนี้ระบบ Next รองรับการเข้าสู่ระบบด้วย email ของ Supabase ก่อน')
      return
    }

    setIsLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.identifier,
      password: parsed.data.password,
    })

    setIsLoading(false)

    if (signInError) {
      setError(`เข้าสู่ระบบไม่สำเร็จ: ${signInError.message}`)
      return
    }

    setPassword('')
    router.push(searchParams.get('redirect') || '/')
    router.refresh()
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white">
            NS
          </div>
          <h1 className="text-2xl font-bold text-slate-800">NS Scrap ERP</h1>
          <p className="text-sm text-slate-500">ระบบบริหารโรงงานรับซื้อ-ขายเศษโลหะ</p>
        </div>

        {!isSupabaseReady ? (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ยังไม่ได้ตั้งค่า Supabase dev ใน environment
          </div>
        ) : null}

        {devLogin?.identifier || devLogin?.password ? (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            เติมบัญชีทดสอบจาก local dev env แล้ว
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            Email / Username
            <input
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                disabled={isLoading}
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? '◉' : '◎'}
              </button>
            </span>
          </label>

          {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-700 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            disabled={isLoading || !isSupabaseReady}
            type="submit"
          >
            {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>

          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer hover:text-slate-700">ข้อมูลระบบ login</summary>
            <div className="mt-2 rounded border bg-slate-50 p-2 text-xs leading-relaxed">
              ระบบใหม่ใช้ Supabase Auth เป็นเป้าหมาย ไม่ใช้รหัสผ่านจาก application table เดิม
            </div>
          </details>
        </form>
      </div>
    </section>
  )
}
