'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { forgotPasswordSchema } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

export function ForgotPasswordPageClient() {
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = getSupabaseClient()
  const isSupabaseReady = Boolean(supabase)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const parsed = forgotPasswordSchema.safeParse({ identifier })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }

    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase dev ใน environment')
      return
    }

    setIsLoading(true)
    const response = await fetch('/api/auth/forgot-password', {
      body: JSON.stringify({
        identifier: parsed.data.identifier,
        redirectTo: `${window.location.origin}/reset-password`,
      }),
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)
    setIsLoading(false)

    if (!response.ok) {
      setError(typeof payload?.error === 'string' ? payload.error : 'ส่งอีเมล reset password ไม่สำเร็จ')
      return
    }

    setMessage('ถ้าพบบัญชีในระบบ ระบบจะส่งลิงก์ reset password ไปที่อีเมลที่ผูกไว้')
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white">
            NS
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ลืมรหัสผ่าน</h1>
        </div>

        {!isSupabaseReady ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ยังไม่ได้ตั้งค่า Supabase dev ใน environment
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
              placeholder="name@example.com หรือ username"
              type="text"
              value={identifier}
            />
          </label>

          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

          <button
            className="w-full rounded-md bg-gradient-to-r from-blue-600 to-indigo-700 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            disabled={isLoading || !isSupabaseReady}
            type="submit"
          >
            {isLoading ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์ reset password'}
          </button>

          <div className="text-center">
            <Link className="text-sm font-medium text-slate-600 hover:underline" href="/login">
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        </form>
      </div>
    </section>
  )
}
