'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { ApiError, getErrorMessage, readJsonResponse } from '@/lib/api-client'

const settingsSchema = z.object({
  lineChannelAccessToken: z.string().trim().nullable().or(z.literal('')),
  lineChannelSecret: z.string().trim().nullable().or(z.literal('')),
  lineDefaultTargetId: z.string().trim().nullable().or(z.literal('')),
  pdfBucket: z.string().trim().min(1, 'กรุณาระบุชื่อ Storage Bucket'),
  appUrl: z.string().trim().url('รูปแบบ URL ไม่ถูกต้อง').or(z.literal('')),
  lineAutoSend: z.boolean().default(false),
  googleSheetsWebhookUrl: z.string().trim().url('รูปแบบ URL ไม่ถูกต้อง').or(z.literal('')).nullable().or(z.literal('')),
})

type SettingsFormValues = z.infer<typeof settingsSchema>
type FieldErrors = Partial<Record<keyof SettingsFormValues, string>>

type LineGroup = {
  groupId: string
  name: string
  pictureUrl: string | null
}

const emptySettings: SettingsFormValues = {
  lineChannelAccessToken: '',
  lineChannelSecret: '',
  lineDefaultTargetId: '',
  pdfBucket: 'weight-ticket-pdfs',
  appUrl: '',
  lineAutoSend: false,
  googleSheetsWebhookUrl: '',
}

export function LineSettingsPageClient() {
  const [form, setForm] = useState<SettingsFormValues>(emptySettings)
  const [groups, setGroups] = useState<LineGroup[]>([])
  const [isManualInput, setIsManualInput] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)

  // Password visibility states
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      // 1. Fetch settings
      const response = await fetch('/api/admin/line-settings', { cache: 'no-store' })
      const payload = await readJsonResponse(response, settingsSchema, 'โหลดข้อมูลตั้งค่า LINE ไม่สำเร็จ')
      setForm(payload)

      // 2. Fetch groups
      let fetchedGroups: LineGroup[] = []
      try {
        const groupsRes = await fetch('/api/admin/line-groups', { cache: 'no-store' })
        if (groupsRes.ok) {
          const groupsData = await groupsRes.json()
          fetchedGroups = groupsData.groups || []
          setGroups(fetchedGroups)
        }
      } catch (err) {
        console.error('Failed to load line groups list', err)
      }

      // 3. Determine if current target ID requires manual input mode
      const currentTarget = payload.lineDefaultTargetId
      const isKnownGroup = fetchedGroups.some((g) => g.groupId === currentTarget)
      if (currentTarget && !isKnownGroup) {
        setIsManualInput(true)
      } else {
        setIsManualInput(false)
      }

      setFieldErrors({})
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลตั้งค่า LINE ไม่สำเร็จ'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function update<K extends keyof SettingsFormValues>(key: K, value: SettingsFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setMessage(null)
  }

  async function save() {
    setError(null)
    setMessage(null)
    setFieldErrors({})

    const parsed = settingsSchema.safeParse(form)

    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as FieldErrors)
      setError('กรุณาตรวจสอบความถูกต้องของข้อมูล')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/admin/line-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || body.message || 'การตอบสนองจากเซิร์ฟเวอร์ผิดพลาด')
      }

      setMessage('บันทึกข้อมูลการตั้งค่า LINE สำเร็จ')
      setFieldErrors({})
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(caught.fieldErrors).map(([key, val]) => [key, val?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])
          ) as FieldErrors
        )
      }
      setError(getErrorMessage(caught, 'บันทึกข้อมูลตั้งค่า LINE ไม่สำเร็จ'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTestSend() {
    setError(null)
    setMessage(null)
    
    if (!form.lineChannelAccessToken) {
      setError('กรุณากรอก LINE Channel Access Token ก่อนทดสอบ')
      return
    }
    if (!form.lineDefaultTargetId) {
      setError('กรุณาเลือกกลุ่มไลน์หรือระบุ Target ID ปลายทางก่อนทดสอบ')
      return
    }

    setIsTesting(true)
    try {
      const res = await fetch('/api/admin/line-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: form.lineChannelAccessToken,
          targetId: form.lineDefaultTargetId,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || body.message || 'การตอบสนองจากเซิร์ฟเวอร์ผิดพลาด')
      }

      setMessage('🚀 ส่งข้อความทดสอบไปยัง LINE สำเร็จแล้ว! กรุณาเช็คในห้องแชทกลุ่ม LINE ของคุณ')
    } catch (caught) {
      setError(getErrorMessage(caught, 'ส่งข้อความทดสอบไม่สำเร็จ'))
    } finally {
      setIsTesting(false)
    }
  }

  const handleGroupSelect = (val: string) => {
    setMessage(null)
    if (val === 'manual') {
      setIsManualInput(true)
    } else {
      setIsManualInput(false)
      update('lineDefaultTargetId', val)
    }
  }

  // Determine current dropdown value
  const selectedDropdownValue = isManualInput
    ? 'manual'
    : form.lineDefaultTargetId && groups.some((g) => g.groupId === form.lineDefaultTargetId)
    ? form.lineDefaultTargetId
    : form.lineDefaultTargetId
    ? 'manual'
    : ''

  return (
    <section className="space-y-4 max-w-4xl mx-auto p-4 lg:p-6 animate-fade-in">
      {/* Page Header */}
      <div className="rounded-xl bg-slate-900 p-5 text-white shadow-md">
        <h1 className="text-xl font-bold">⚙️ ตั้งค่า LINE Notification</h1>
        <p className="mt-1 text-sm text-slate-400">
          ตั้งค่าการเชื่อมต่อ LINE Messaging API และการจัดการเอกสาร PDF สำหรับส่งใบแจ้งเตือนน้ำหนัก (Weight Ticket)
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 animate-fade-in flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 animate-fade-in flex items-center gap-2">
          <span>✅</span>
          <span>{message}</span>
        </div>
      ) : null}

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500 space-y-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            <p className="text-sm">กำลังโหลดข้อมูลตั้งค่าระบบ...</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Section 1: LINE Messaging API */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span className="text-lg">💬</span> LINE Messaging API Credentials
              </h2>
              
              <div className="space-y-4">
                {/* Channel Access Token */}
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-slate-700">
                    LINE Channel Access Token
                  </label>
                  <div className="relative flex items-stretch">
                    <input
                      className="w-full rounded-lg border border-slate-350 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-700 focus:outline-none focus:ring-0 pr-10 h-10"
                      type={showToken ? 'text' : 'password'}
                      placeholder="ป้อน Channel Access Token ยาวๆ ของบอทไลน์"
                      value={form.lineChannelAccessToken ?? ''}
                      onChange={(e) => update('lineChannelAccessToken', e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? '🐵' : '🙈'}
                    </button>
                  </div>
                  {fieldErrors.lineChannelAccessToken ? (
                    <p className="text-xs text-red-600">{fieldErrors.lineChannelAccessToken}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    ใช้เพื่อลงลายมือชื่อในการเรียกใช้งาน LINE API (Channel Access Token v4 หรือ Long-lived)
                  </p>
                </div>

                {/* Channel Secret */}
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-slate-700">
                    LINE Channel Secret
                  </label>
                  <div className="relative flex items-stretch">
                    <input
                      className="w-full rounded-lg border border-slate-350 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-700 focus:outline-none focus:ring-0 pr-10 h-10"
                      type={showSecret ? 'text' : 'password'}
                      placeholder="ป้อน Channel Secret ของ LINE App"
                      value={form.lineChannelSecret ?? ''}
                      onChange={(e) => update('lineChannelSecret', e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? '🐵' : '🙈'}
                    </button>
                  </div>
                  {fieldErrors.lineChannelSecret ? (
                    <p className="text-xs text-red-600">{fieldErrors.lineChannelSecret}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    ใช้สำหรับตรวจสอบความถูกต้องของ Signature จาก Webhook Payload
                  </p>
                </div>

                {/* Default Target ID (Selector & Manual Input) */}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">
                    LINE Default Target ID (กลุ่มส่งข้อมูลเริ่มต้น)
                  </label>
                  
                  {/* Dropdown list of groups */}
                  <select
                    className="w-full rounded-lg border border-slate-350 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-700 focus:outline-none focus:ring-0 h-10"
                    value={selectedDropdownValue}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                  >
                    <option value="">-- เลือกกลุ่มไลน์รับการแจ้งเตือน --</option>
                    {groups.map((group) => (
                      <option key={group.groupId} value={group.groupId}>
                        👥 {group.name} ({group.groupId.slice(0, 10)}...)
                      </option>
                    ))}
                    <option value="manual">⚙️ ระบุไอดีเองแบบกำหนดเอง (Manual Input)</option>
                  </select>

                  {/* Manual text input if chosen or not in list */}
                  {isManualInput ? (
                    <div className="mt-2 space-y-1 animate-fade-in">
                      <input
                        className="w-full rounded-lg border border-slate-350 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-700 focus:outline-none focus:ring-0 h-10"
                        type="text"
                        placeholder="กรอก Group ID หรือ User ID ปลายทาง เช่น C12345abcdef..."
                        value={form.lineDefaultTargetId ?? ''}
                        onChange={(e) => update('lineDefaultTargetId', e.target.value)}
                      />
                      <p className="text-xs text-amber-600">
                        * ป้อน Group ID ปลายทางโดยตรง (ตัวอักษรขึ้นต้นด้วย C หรือ U)
                      </p>
                    </div>
                  ) : null}

                  {fieldErrors.lineDefaultTargetId ? (
                    <p className="text-xs text-red-600">{fieldErrors.lineDefaultTargetId}</p>
                  ) : null}
                  
                  <p className="text-xs text-slate-400">
                    กลุ่มไลน์เริ่มต้นสำหรับรับแจ้งเตือน (รายชื่อกลุ่มจะบันทึกเข้าตารางอัตโนมัติเมื่อดึงบอทเข้ากลุ่มใหม่)
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Storage and App Config */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span className="text-lg">📁</span> Storage & Application Settings
              </h2>
              
              <div className="space-y-4">
                {/* PDF Storage Bucket */}
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-slate-700">
                    Weight Ticket PDF Bucket Name *
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-350 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-700 focus:outline-none focus:ring-0 h-10"
                    type="text"
                    placeholder="เช่น weight-ticket-pdfs"
                    value={form.pdfBucket}
                    onChange={(e) => update('pdfBucket', e.target.value)}
                  />
                  {fieldErrors.pdfBucket ? (
                    <p className="text-xs text-red-600">{fieldErrors.pdfBucket}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    ชื่อ Bucket บน Supabase Storage สำหรับเก็บไฟล์ใบชั่งน้ำหนัก PDF ที่จะใช้เปิดผ่าน Link ใน LINE
                  </p>
                </div>

                {/* App URL */}
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-slate-700">
                    Application URL (App URL)
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-350 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-700 focus:outline-none focus:ring-0 h-10"
                    type="url"
                    placeholder="เช่น https://new-ns-scrap-erp.vercel.app"
                    value={form.appUrl ?? ''}
                    onChange={(e) => update('appUrl', e.target.value)}
                  />
                  {fieldErrors.appUrl ? (
                    <p className="text-xs text-red-600">{fieldErrors.appUrl}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    URL ของหน้าเว็บแอพนี้ เพื่อใช้ประกอบเป็น Link ส่งไปในข้อความ LINE ให้กดเปิดดูใบ PDF ชั่งน้ำหนัก
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Notification Automation & Data Streams */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span className="text-lg">🤖</span> Automation & Data Streams
              </h2>
              
              <div className="space-y-4">
                {/* Auto Send Toggle */}
                <div className="flex items-start gap-3">
                  <div className="flex h-5 items-center">
                    <input
                      id="lineAutoSend"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-305 text-[#0F172A] focus:ring-0 cursor-pointer"
                      checked={form.lineAutoSend}
                      onChange={(e) => update('lineAutoSend', e.target.checked)}
                    />
                  </div>
                  <div className="text-sm">
                    <label htmlFor="lineAutoSend" className="font-bold text-slate-700 cursor-pointer">
                      เปิดระบบส่งแจ้งเตือนเข้า LINE อัตโนมัติ (Auto-Send Notification)
                    </label>
                    <p className="text-xs text-slate-400">
                      เมื่อสร้างใบชั่งน้ำหนัก WTI หรือ WTO สำเร็จ ระบบจะส่งใบแจ้งน้ำหนักพร้อมไฟล์ PDF เข้า LINE Group อัตโนมัติในเบื้องหลังทันที
                    </p>
                  </div>
                </div>

                {/* Google Sheets Webhook URL */}
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-slate-700">
                    Google Sheets Webhook URL (การเชื่อมต่อสตรีมข้อมูล)
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-350 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-700 focus:outline-none focus:ring-0 h-10"
                    type="url"
                    placeholder="เช่น https://script.google.com/macros/s/AKfycb.../exec"
                    value={form.googleSheetsWebhookUrl ?? ''}
                    onChange={(e) => update('googleSheetsWebhookUrl', e.target.value)}
                  />
                  {fieldErrors.googleSheetsWebhookUrl ? (
                    <p className="text-xs text-red-600">{fieldErrors.googleSheetsWebhookUrl}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    ลิงก์ Webhook URL สำหรับส่งข้อมูลผลสรุปใบชั่งไปบันทึกบน Google Sheets อัตโนมัติเมื่อส่งแจ้งเตือน LINE สำเร็จ (เว้นว่างไว้หากไม่เปิดใช้งาน)
                  </p>
                </div>
              </div>
            </div>

            {/* Footer buttons row */}
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition focus:outline-none h-10"
                onClick={() => void loadData()}
                disabled={isLoading || isSaving || isTesting}
              >
                โหลดใหม่
              </button>
              
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-emerald-600 border border-emerald-600 hover:bg-emerald-50 rounded-lg transition focus:outline-none h-10 flex items-center justify-center disabled:opacity-60"
                onClick={() => void handleTestSend()}
                disabled={isLoading || isSaving || isTesting}
              >
                {isTesting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                ) : (
                  '🔔 ทดสอบส่งข้อความ'
                )}
              </button>

              <button
                type="button"
                className="px-6 py-2 text-sm font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-lg transition disabled:opacity-60 focus:outline-none h-10 flex items-center justify-center min-w-[100px]"
                onClick={() => void save()}
                disabled={isLoading || isSaving || isTesting}
              >
                {isSaving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-white" />
                ) : (
                  '💾 บันทึกการตั้งค่า'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-2">
        <p className="font-bold">💡 ข้อมูลเพิ่มเติมและลำดับความสำคัญ:</p>
        <ul className="list-disc pl-5 space-y-1 text-xs">
          <li>หากเว็ปนี้ไม่มีค่าที่ตั้งไว้ในฐานข้อมูล ระบบจะใช้ค่าเริ่มต้นจากไฟล์คอนฟิก <code>.env.local</code> แทน</li>
          <li>สำหรับความปลอดภัย ค่า Channel Access Token และ Channel Secret จะถูกจัดเก็บแบบปกติ แต่ไม่แสดงเป็นตัวอักษรยกเว้นจะกดปุ่มแสดง</li>
          <li><b>วิธีการให้ระบบจำกลุ่มใหม่</b>: เชิญบอทเข้ากลุ่มไลน์ที่คุณต้องการ ➡️ พิมพ์คำอะไรก็ได้ในกลุ่ม บอทจะเชื่อมโยงรายละเอียดและดึงรายชื่อกลุ่มนั้นมาแสดงในรายการ Dropdown หน้านี้โดยอัตโนมัติ</li>
        </ul>
      </div>
    </section>
  )
}
