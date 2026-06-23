'use client'

import { FormEvent, useEffect, useState, startTransition } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { changePasswordSchema, userProfileSchema } from '@/lib/auth'
import { getSupabaseClient } from '@/lib/supabase'

type CurrentUser = {
  branchNames: string[]
  displayName: string
  email: string
  mustChangePassword: boolean
  roleNames: string[]
  username: string
}

type PasswordFieldErrors = Partial<Record<'confirmPassword' | 'currentPassword' | 'password', string>>
type ProfileFieldErrors = Partial<Record<'displayName', string>>

function issueMap(issues: { message: string; path: PropertyKey[] }[]) {
  const next: PasswordFieldErrors = {}
  issues.forEach((issue) => {
    const field = issue.path[0]
    if ((field === 'currentPassword' || field === 'password' || field === 'confirmPassword') && !next[field]) {
      next[field] = issue.message
    }
  })
  return next
}

export function ProfilePageClient() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile')

  // User Profile States
  const [displayName, setDisplayName] = useState('')
  const [profileErrors, setProfileErrors] = useState<ProfileFieldErrors>({})
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Security (Change Password) States
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordErrors, setPasswordErrors] = useState<PasswordFieldErrors>({})
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null)
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  // Common States
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
          roles?: Array<{ name: string }>
          appUser?: { branchIds?: string[] }
        }
        if (!mounted) return

        const fetchedUser: CurrentUser = {
          branchNames: payload.appUser?.branchIds ?? [],
          displayName: payload.user?.displayName ?? '',
          email: payload.email ?? '',
          mustChangePassword: payload.mustChangePassword === true,
          roleNames: (payload.roles ?? []).map((r) => r.name),
          username: payload.user?.username ?? '-',
        }

        setUser(fetchedUser)
        setDisplayName(fetchedUser.displayName)
      } catch (caught) {
        if (!mounted) return
        setProfileError(caught instanceof Error ? caught.message : 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ')
      } finally {
        if (mounted) setIsFetchingUser(false)
      }
    }

    void loadUser()
    return () => {
      mounted = false
    }
  }, [])

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileError(null)
    setProfileSuccess(null)
    setProfileErrors({})

    const parsed = userProfileSchema.safeParse({ displayName })
    if (!parsed.success) {
      setProfileErrors(parsed.error.flatten().fieldErrors as ProfileFieldErrors)
      setProfileError('กรุณากรอกชื่อแสดงผลให้ถูกต้อง')
      return
    }

    setIsSavingProfile(true)
    try {
      const response = await fetch('/api/auth/profile', {
        body: JSON.stringify({ displayName: parsed.data.displayName }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        throw new Error(errPayload.error || 'บันทึกโปรไฟล์ไม่สำเร็จ')
      }

      setProfileSuccess('บันทึกข้อมูลโปรไฟล์สำเร็จ')
      setUser((current) => current ? { ...current, displayName: parsed.data.displayName } : current)
      
      // Dispatch custom event to tell AppShell to update display name if they are listening
      window.dispatchEvent(new CustomEvent('app-user-profile-updated', {
        detail: { displayName: parsed.data.displayName }
      }))
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : 'บันทึกโปรไฟล์ไม่สำเร็จ')
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSecurityError(null)
    setSecuritySuccess(null)
    setPasswordErrors({})

    const parsed = changePasswordSchema.safeParse({ confirmPassword, currentPassword, password })

    if (!parsed.success) {
      setPasswordErrors(issueMap(parsed.error.issues))
      setSecurityError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }

    if (!supabase) {
      setSecurityError('ยังไม่ได้ตั้งค่า Supabase dev ใน environment')
      return
    }

    if (!user?.email) {
      setSecurityError('ไม่พบ email ของผู้ใช้ปัจจุบัน จึงยืนยัน password เดิมไม่ได้')
      return
    }

    setIsSavingPassword(true)
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    })

    if (verifyError) {
      setIsSavingPassword(false)
      setPasswordErrors({ currentPassword: 'Password เดิมไม่ถูกต้อง' })
      setSecurityError('Password เดิมไม่ถูกต้อง')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })

    if (updateError) {
      setIsSavingPassword(false)
      setSecurityError(`เปลี่ยน Password ไม่สำเร็จ: ${updateError.message}`)
      return
    }

    await fetch('/api/auth/password-changed', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    }).catch(() => undefined)

    setIsSavingPassword(false)
    setCurrentPassword('')
    setPassword('')
    setConfirmPassword('')
    setUser((current) => current ? { ...current, mustChangePassword: false } : current)
    setSecuritySuccess('เปลี่ยน Password สำเร็จ')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 font-sans">
      {/* Desktop Header */}
      <div className="hidden lg:block rounded-md bg-white p-4 shadow border border-slate-200/60">
        <h2 className="text-xl font-bold text-slate-900">โปรไฟล์ & ตั้งค่าบัญชี</h2>
        <p className="mt-1 text-sm text-slate-500">จัดการข้อมูลส่วนตัว ชื่อแสดงผล และความปลอดภัยของบัญชีผู้ใช้งาน</p>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden rounded-md bg-white p-3.5 shadow border border-slate-200/60 animate-fade-in">
        <h2 className="text-lg font-bold text-slate-900">โปรไฟล์ & ตั้งค่าบัญชี</h2>
        <p className="mt-0.5 text-xs text-slate-500">จัดการโปรไฟล์และรหัสผ่านของคุณ</p>
      </div>

      {/* Main Tabs Container */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] animate-fade-in">
        <div className="space-y-4">
          {/* Tabs header */}
          <div className="flex border-b border-slate-200">
            <button
              className={`px-4 py-2.5 text-sm font-semibold transition-colors duration-150 border-b-2 outline-none ${activeTab === 'profile' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              type="button"
              onClick={() => startTransition(() => setActiveTab('profile'))}
            >
              ข้อมูลส่วนตัว
            </button>
            <button
              className={`px-4 py-2.5 text-sm font-semibold transition-colors duration-150 border-b-2 outline-none ${activeTab === 'security' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              type="button"
              onClick={() => startTransition(() => setActiveTab('security'))}
            >
              ความปลอดภัย
            </button>
          </div>

          {/* Profile Tab Panel */}
          {activeTab === 'profile' && (
            <form className="space-y-4 rounded-md bg-white p-5 shadow border border-slate-200/60 animate-fade-in" onSubmit={updateProfile}>
              <div className="space-y-4">
                <div>
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">บัญชีผู้ใช้ (Username)</span>
                  <div className="mt-1.5 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-slate-600 text-sm font-semibold">
                    {isFetchingUser ? 'กำลังโหลด...' : user?.username}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">อีเมล (Email)</span>
                  <div className="mt-1.5 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-slate-600 text-sm font-semibold">
                    {isFetchingUser ? 'กำลังโหลด...' : user?.email}
                  </div>
                </div>

                <label className="block text-sm font-semibold text-slate-700">
                  ชื่อแสดงในระบบ (Display Name) <span className="text-red-500">*</span>
                  <Input
                    className={`mt-1.5 h-9 focus:ring-slate-400 focus:border-slate-400 outline-none ${profileErrors.displayName ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                    disabled={isFetchingUser || isSavingProfile}
                    placeholder="กรอกชื่อ-นามสกุล หรือชื่อแสดงผลในระบบ"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                  {profileErrors.displayName ? <span className="mt-1 block text-xs text-red-650">{profileErrors.displayName}</span> : null}
                </label>
              </div>

              {profileError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-750">{profileError}</div> : null}
              {profileSuccess ? <div className="rounded-md border border-emerald-250 bg-emerald-50 p-3 text-sm text-emerald-800">{profileSuccess}</div> : null}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button className="w-full sm:w-auto font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-md h-9 outline-none" disabled={isFetchingUser || isSavingProfile} type="submit">
                  {isSavingProfile ? 'กำลังบันทึก...' : 'บันทึกข้อมูลโปรไฟล์'}
                </Button>
              </div>
            </form>
          )}

          {/* Security Tab Panel */}
          {activeTab === 'security' && (
            <form className="space-y-4 rounded-md bg-white p-5 shadow border border-slate-200/60 animate-fade-in" onSubmit={updatePassword}>
              {user?.mustChangePassword ? (
                <div className="rounded-md border border-amber-250 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 animate-pulse">
                  รหัสผ่านของคุณยังเป็นค่าเริ่มต้น กรุณาเปลี่ยนรหัสผ่านเพื่อความปลอดภัยของระบบ
                </div>
              ) : null}

              {!isSupabaseReady ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ยังไม่ได้ตั้งค่า Supabase ในระบบ
                </div>
              ) : null}

              <PasswordField
                autoComplete="current-password"
                disabled={isSavingPassword || isFetchingUser}
                error={passwordErrors.currentPassword}
                label="รหัสผ่านเดิม"
                showPassword={showPassword}
                value={currentPassword}
                onChange={setCurrentPassword}
              />

              <PasswordField
                autoComplete="new-password"
                description="อย่างน้อย 8 ตัว มีตัวใหญ่ ตัวเล็ก และตัวเลข"
                disabled={isSavingPassword || isFetchingUser}
                error={passwordErrors.password}
                label="รหัสผ่านใหม่"
                showPassword={showPassword}
                value={password}
                onChange={setPassword}
              />

              <PasswordField
                autoComplete="new-password"
                disabled={isSavingPassword || isFetchingUser}
                error={passwordErrors.confirmPassword}
                label="ยืนยันรหัสผ่านใหม่"
                showPassword={showPassword}
                value={confirmPassword}
                onChange={setConfirmPassword}
              />

              <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none outline-none">
                <input checked={showPassword} className="size-4 rounded border-slate-300 text-slate-900 focus:ring-0 focus:border-slate-400 outline-none" onChange={(event) => setShowPassword(event.target.checked)} type="checkbox" />
                {showPassword ? <EyeOff className="size-4 text-slate-500" /> : <Eye className="size-4 text-slate-500" />}
                แสดงรหัสผ่าน
              </label>

              {securityError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-750">{securityError}</div> : null}
              {securitySuccess ? <div className="rounded-md border border-emerald-250 bg-emerald-50 p-3 text-sm text-emerald-800">{securitySuccess}</div> : null}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button className="w-full sm:w-auto font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-md h-9 outline-none" disabled={isSavingPassword || isFetchingUser || !isSupabaseReady} type="submit">
                  <KeyRound className="mr-2 size-4" />
                  {isSavingPassword ? 'กำลังเปลี่ยนรหัสผ่าน...' : 'บันทึกรหัสผ่านใหม่'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Sidebar Info Card */}
        <aside className="space-y-3">
          <div className="rounded-md bg-white p-4 shadow border border-slate-200/60">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded bg-slate-900 text-white shrink-0">
                <UserRound className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900">{isFetchingUser ? 'กำลังโหลด...' : user?.displayName || '-'}</div>
                <div className="truncate text-xs text-slate-500 mt-0.5">@{isFetchingUser ? '...' : user?.username}</div>
              </div>
            </div>
            
            <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider block">สิทธิ์การเข้าถึง (Roles)</span>
                <span className="mt-1 block text-slate-700 font-semibold">{isFetchingUser ? '...' : user?.roleNames.join(', ') || 'ไม่มีบทบาท'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider block">สาขาที่ดูแล (Branches)</span>
                <span className="mt-1 block text-slate-700 font-semibold">{isFetchingUser ? '...' : user?.branchNames.join(', ') || 'ไม่มีสาขา'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200/60 bg-slate-50 p-4 text-xs text-slate-650 leading-relaxed space-y-2">
            <div className="font-bold text-slate-900 uppercase tracking-wider">ระบบความปลอดภัย</div>
            <p>ระบบนี้ใช้ระบบการยืนยันตัวตนและการเข้าถึงที่มีมาตรฐานความปลอดภัยระดับสูง ข้อมูลรหัสผ่านของคุณจะถูกจัดเก็บและดูแลโดยตรงผ่านระบบ Supabase Auth</p>
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
    <label className="block text-sm font-semibold text-slate-700">
      {props.label} <span className="text-red-500">*</span>
      {props.description ? <span className="ml-1 text-[11px] font-normal text-slate-500">({props.description})</span> : null}
      <Input
        autoComplete={props.autoComplete}
        className={`mt-1.5 h-9 focus:ring-slate-400 focus:border-slate-400 outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
        disabled={props.disabled}
        type={props.showPassword ? 'text' : 'password'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.error ? <span className="mt-1 block text-xs text-red-650">{props.error}</span> : null}
    </label>
  )
}
