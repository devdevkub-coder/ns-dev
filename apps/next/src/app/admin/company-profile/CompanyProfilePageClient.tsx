'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { ApiError, getErrorMessage, readJsonResponse } from '@/lib/api-client'
import { companyProfileDraftSchema, companyProfileSchema, emptyCompanyProfile, type CompanyProfileFormValues } from '@/lib/company-profile'
import { formatPhoneDisplay, sanitizePhoneInput } from '@/lib/format'

const payloadSchema = z.object({
  branches: z.array(z.object({
    address: z.string().nullable(),
    code: z.string(),
    hasProfile: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
  })).default([]),
  profile: companyProfileDraftSchema,
  profileConfigured: z.boolean().default(false),
  selectedBranchId: z.string().nullable().default(null),
  selectedBranchName: z.string().nullable().default(null),
})

type BranchOption = z.infer<typeof payloadSchema>['branches'][number]
type FieldErrors = Partial<Record<keyof CompanyProfileFormValues, string>>
type PreviewKind = 'delivery' | 'receipt'

function sanitizeEmail(value: string) {
  return value.replace(/[^\x20-\x7E]/g, '')
}

function normalizeWebsite(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatNumber(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function buildPreviewHtml(kind: PreviewKind, profile: CompanyProfileFormValues) {
  const isReceipt = kind === 'receipt'
  const docTitle = isReceipt ? 'บิลซื้อ / PURCHASE BILL' : 'ใบส่งของ / DELIVERY NOTE'
  const docStamp = isReceipt ? 'PURCHASE BILL' : 'DELIVERY NOTE'
  const docNoLabel = isReceipt ? 'เลขที่บิลซื้อ' : 'เลขที่ใบส่ง'
  const partyLabel = isReceipt ? 'ผู้ส่งสินค้า (Supplier)' : 'ผู้รับสินค้า (Customer)'
  const partyName = isReceipt ? 'ตัวอย่าง Supplier' : 'ตัวอย่าง Customer'
  const today = new Date().toISOString().slice(0, 10)
  const items = [
    { amount: 33750, code: 'AL-001', name: 'อลูมิเนียมเกรด A', price: 45, qty: 750, unit: 'กก.' },
    { amount: 16800, code: 'FE-002', name: 'เหล็กรวม', price: 12, qty: 1400, unit: 'กก.' },
  ]
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0)
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)
  const rows = items.map((item, index) => `<tr>
    <td class="c">${index + 1}</td>
    <td>${escapeHtml(item.code)}</td>
    <td>${escapeHtml(item.name)}<div style="font-size: 12px;color:#777">ตัวอย่างเอกสาร</div></td>
    <td class="r">${formatNumber(item.qty)}</td>
    <td class="c">${escapeHtml(item.unit)}</td>
    <td class="r">${formatNumber(item.price)}</td>
    <td class="r">${formatNumber(item.amount)}</td>
  </tr>`).join('')
  const emptyRows = Array.from({ length: 6 }, () => '<tr><td class="c">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')
  const companyInfo = `
    ${escapeHtml(profile.address)}<br>
    โทร ${escapeHtml(formatPhoneDisplay(profile.phone) || '-')} ${profile.fax ? ` · แฟกซ์ ${escapeHtml(formatPhoneDisplay(profile.fax))}` : ''}<br>
    เลขประจำตัวผู้เสียภาษี: ${escapeHtml(profile.taxId || '-')}
    ${profile.email ? `<br>Email: ${escapeHtml(profile.email)}` : ''}
    ${profile.website ? `<br>Website: ${escapeHtml(profile.website)}` : ''}
  `

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)} ตัวอย่าง</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 0; }
      .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
      .co-name { font-size: 18px; font-weight: bold; }
      .co-info { font-size: 12px; color: #444; line-height: 1.5; }
      .doc-title { text-align: right; }
      .doc-title h1 { font-size: 18px; margin: 0 0 4px 0; }
      .doc-meta { font-size: 12px; }
      .doc-meta span { display: inline-block; min-width: 110px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; font-size: 12px; }
      .info-box { border: 1px solid #999; padding: 6px 8px; border-radius: 4px; }
      .info-box .label { font-weight: bold; color: #333; font-size: 12px; }
      table.items { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
      table.items th, table.items td { border: 1px solid #555; padding: 4px 6px; }
      table.items th { background: #e8e8e8; text-align: left; font-weight: bold; }
      .r { text-align: right; }
      .c { text-align: center; }
      .totals { margin-top: 8px; font-size: 13px; }
      .totals td { padding: 4px 8px; }
      .totals .total-label { text-align: right; font-weight: bold; }
      .totals .total-val { text-align: right; min-width: 120px; border-bottom: 1px solid #111; }
      .signatures { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 12px; }
      .sig { text-align: center; }
      .sig .line { border-top: 1px dotted #555; margin-top: 50px; padding-top: 4px; }
      .footer-note { margin-top: 20px; text-align: center; font-size: 12px; color: #666; }
      .doc-stamp { display: inline-block; padding: 2px 8px; border: 2px solid #444; font-weight: bold; font-size: 12px; }
      .sample-badge { display:inline-block;padding:4px 12px;background:#10b981;color:white;font-weight:bold;border-radius:6px;font-size:13px;margin-top:4px; }
      @media print { .no-print { display: none; } }
      .toolbar { background: #f3f4f6; padding: 8px; text-align: center; border-bottom: 1px solid #ccc; }
      .toolbar button { background: #2563eb; color: white; border: none; padding: 8px 16px; margin: 0 4px; border-radius: 4px; cursor: pointer; font-size: 14px; }
      .toolbar button:hover { background: #1d4ed8; }
    </style>
  </head><body>
    <div class="no-print toolbar">
      <button onclick="window.print()">🖨 พิมพ์ / Print</button>
      <button onclick="window.close()" style="background:#64748b">✕ ปิด</button>
      <span style="margin-left:10px;color:#555;font-size:12px">ตัวอย่างจากหน้าข้อมูลบริษัท</span>
    </div>
    <div style="padding: 12px;">
      <div class="header">
        <div>
          ${profile.logoUrl ? `<img src="${escapeHtml(profile.logoUrl)}" style="max-height:60px;margin-bottom:6px"/>` : ''}
          <div class="co-name">${escapeHtml(profile.name || '-')}</div>
          ${profile.nameEn ? `<div style="font-size:12px;color:#444">${escapeHtml(profile.nameEn)}</div>` : ''}
          <div class="co-info">${companyInfo}</div>
        </div>
        <div class="doc-title">
          <h1>${escapeHtml(docTitle)}</h1>
          <div class="doc-stamp">${escapeHtml(docStamp)}</div>
          <div class="sample-badge">📦 STOCK สำนักงานใหญ่</div>
          <div class="doc-meta" style="margin-top:8px">
            <div><span>${escapeHtml(docNoLabel)}:</span> <b>SAMPLE-001</b></div>
            <div><span>วันที่:</span> ${escapeHtml(today)}</div>
            <div><span>สาขา:</span> สำนักงานใหญ่</div>
          </div>
        </div>
      </div>
      <div class="${isReceipt ? '' : 'info-grid'}">
        <div class="info-box" ${isReceipt ? 'style="margin-bottom:6px"' : ''}>
          <div class="label">${escapeHtml(partyLabel)}</div>
          <div style="font-weight:bold;font-size:14px">${escapeHtml(partyName)}</div>
          <div style="font-size: 12px;color:#555;margin-top:4px">📞 โทร: <b>000000000</b><br>🏢 ลูกค้าบริษัท</div>
        </div>
        ${isReceipt ? '' : `<div class="info-box">
          <div class="label">ผู้ส่ง (บริษัทเรา)</div>
          <div style="font-weight:bold;font-size:13px">${escapeHtml(profile.name || '-')}</div>
          <div style="font-size: 12px;color:#555">${companyInfo}</div>
        </div>`}
      </div>
      <table class="items">
        <thead><tr>
          <th class="c" style="width:30px">#</th>
          <th style="width:80px">รหัส</th>
          <th>รายการสินค้า</th>
          <th class="r" style="width:80px">จำนวน</th>
          <th class="c" style="width:50px">หน่วย</th>
          <th class="r" style="width:80px">ราคา/หน่วย</th>
          <th class="r" style="width:100px">จำนวนเงิน</th>
        </tr></thead>
        <tbody>${rows}${emptyRows}</tbody>
      </table>
      <table class="totals" style="width:100%">
        <tr>
          <td class="total-label">รวมจำนวนทั้งสิ้น (กก.):</td>
          <td class="total-val">${formatNumber(totalQty)} กก.</td>
          <td class="total-label">รวมเป็นเงิน:</td>
          <td class="total-val">${formatNumber(totalAmount)} บาท</td>
        </tr>
      </table>
      <div style="margin-top:10px;padding:8px;background:#fffbeb;border:1px solid #f59e0b;border-radius:4px;font-size:12px;min-height:40px">
        <div style="font-weight:bold;color:#92400e;margin-bottom:3px">📝 หมายเหตุ / Remarks:</div>
        <div style="color:#444;white-space:pre-wrap;min-height:20px">ตัวอย่างเอกสารสำหรับตรวจข้อมูลบริษัทก่อนพิมพ์จริง</div>
      </div>
      <div class="signatures">
        <div class="sig"><div class="line">${isReceipt ? 'ผู้ส่งสินค้า' : 'ผู้ส่งของ'}</div><div style="font-size: 12px;color:#888;margin-top:4px">วันที่ ____/____/____</div></div>
        <div class="sig"><div class="line">ผู้ตรวจรับ / ตรวจนับ</div><div style="font-size: 12px;color:#888;margin-top:4px">วันที่ ____/____/____</div></div>
        <div class="sig"><div class="line">${isReceipt ? 'ผู้รับสินค้า' : 'ผู้รับของ'}</div><div style="font-size: 12px;color:#888;margin-top:4px">วันที่ ____/____/____</div></div>
      </div>
      <div style="margin-top:12px;font-size: 12px;color:#777;border-top:1px dashed #ccc;padding-top:6px">👤 ผู้ทำบิล: <b>preview</b></div>
      <div class="footer-note">${escapeHtml(profile.footerNote || '')}</div>
    </div>
  </body></html>`
}

function fieldErrorsFromApi(caught: unknown): FieldErrors {
  if (!(caught instanceof ApiError)) return {}
  return Object.fromEntries(Object.entries(caught.fieldErrors).map(([key, value]) => [key, value?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])) as FieldErrors
}

export function CompanyProfilePageClient() {
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [form, setForm] = useState<CompanyProfileFormValues>(emptyCompanyProfile)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [profileConfigured, setProfileConfigured] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [selectedBranchName, setSelectedBranchName] = useState<string | null>(null)

  const loadData = useCallback(async (branchId?: string | null) => {
    setError(null)
    setIsLoading(true)
    try {
      const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
      const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
      const payload = await readJsonResponse(response, payloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
      setBranches(payload.branches)
      setForm(payload.profile)
      setProfileConfigured(payload.profileConfigured)
      setSelectedBranchId(payload.selectedBranchId)
      setSelectedBranchName(payload.selectedBranchName)
      setFieldErrors({})
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลบริษัทไม่สำเร็จ'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function selectBranch(branchId: string) {
    if (branchId === selectedBranchId) return
    setMessage(null)
    void loadData(branchId)
  }

  function update<K extends keyof CompanyProfileFormValues>(key: K, value: CompanyProfileFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setMessage(null)
  }

  async function save() {
    setError(null)
    setMessage(null)
    const parsed = companyProfileSchema.safeParse({
      ...form,
      website: normalizeWebsite(form.website ?? ''),
    })

    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as FieldErrors)
      setError('กรุณาตรวจสอบข้อมูลในฟอร์ม')
      return false
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/admin/company-profile', {
        body: JSON.stringify({ ...parsed.data, branchId: selectedBranchId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })
      const payload = await readJsonResponse(response, payloadSchema, 'บันทึกข้อมูลบริษัทไม่สำเร็จ')
      setBranches(payload.branches)
      setForm(payload.profile)
      setProfileConfigured(payload.profileConfigured)
      setSelectedBranchId(payload.selectedBranchId)
      setSelectedBranchName(payload.selectedBranchName)
      setFieldErrors({})
      setMessage(`บันทึกข้อมูลบริษัทสาขา${payload.selectedBranchName ? ` ${payload.selectedBranchName}` : ''}สำเร็จ`)
      return true
    } catch (caught) {
      setFieldErrors(fieldErrorsFromApi(caught))
      setError(getErrorMessage(caught, 'บันทึกข้อมูลบริษัทไม่สำเร็จ'))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  function uploadLogo(file: File | undefined) {
    if (!file) return
    if (file.size > 200 * 1024) {
      setError('ไฟล์ใหญ่เกิน 200KB กรุณาบีบอัดก่อน')
      return
    }
    const reader = new FileReader()
    reader.onload = () => update('logoUrl', String(reader.result ?? '') || null)
    reader.readAsDataURL(file)
  }

  async function openPreview(kind: PreviewKind) {
    const previewWindow = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes')
    if (!previewWindow) {
      window.alert('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
      return
    }
    previewWindow.document.open()
    previewWindow.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมตัวอย่าง</title></head><body style="font-family:\'Noto Sans Thai\',sans-serif;padding:24px">กำลังบันทึกและเตรียมตัวอย่าง...</body></html>')
    previewWindow.document.close()
    const saved = await save()
    if (!saved) {
      previewWindow.document.open()
      previewWindow.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>ไม่สามารถเปิดตัวอย่าง</title></head><body style="font-family:\'Noto Sans Thai\',sans-serif;padding:24px;color:#b91c1c">กรุณาตรวจสอบข้อมูลในฟอร์มก่อนเปิดตัวอย่าง</body></html>')
      previewWindow.document.close()
      previewWindow.focus()
      return
    }
    previewWindow.document.open()
    previewWindow.document.write(buildPreviewHtml(kind, form))
    previewWindow.document.close()
    previewWindow.focus()
  }

  async function previewReceipt() {
    await openPreview('receipt')
  }

  async function previewDelivery() {
    await openPreview('delivery')
  }

  return (
    <section className="space-y-3">
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block rounded-md bg-gradient-to-r from-blue-700 to-cyan-600 p-4 text-white shadow">
        <h1 className="text-xl font-bold">🏢 ข้อมูลบริษัทตามสาขา</h1>
        <p className="mt-1 text-sm opacity-90">เลือกสาขาก่อนแก้ไขข้อมูลหัวกระดาษสำหรับใบรับสินค้า / ใบส่งของ</p>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="lg:hidden rounded-md bg-gradient-to-r from-blue-700 to-cyan-600 p-3.5 text-white shadow animate-fade-in">
        <h1 className="text-lg font-bold">🏢 ข้อมูลบริษัทตามสาขา</h1>
        <p className="mt-0.5 text-xs opacity-90">เลือกสาขาก่อนแก้ไขข้อมูลหัวกระดาษสำหรับใบพิมพ์</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 animate-fade-in">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 animate-fade-in">{message}</div> : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-md bg-white p-3 text-sm shadow h-fit">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">สาขา</div>
            <div className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {branches.length.toLocaleString('th-TH')} สาขา
            </div>
          </div>
          <div className="space-y-2 max-h-[300px] lg:max-h-[60vh] overflow-y-auto pr-1">
            {branches.length ? branches.map((branch) => {
              const selected = branch.id === selectedBranchId
              return (
                <button
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${selected ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-100 bg-white text-slate-700 hover:border-blue-300 hover:bg-slate-50'}`}
                  disabled={isLoading || isSaving}
                  key={branch.id}
                  type="button"
                  onClick={() => selectBranch(branch.id)}
                >
                  <span className="block text-sm font-bold">{branch.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">รหัส {branch.code}</span>
                  <span className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs font-semibold ${branch.hasProfile ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {branch.hasProfile ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'}
                  </span>
                </button>
              )
            }) : <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">ยังไม่มีข้อมูลสาขาที่เปิดใช้งาน</div>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-md bg-white p-4 text-sm shadow md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ข้อมูลหัวกระดาษ</div>
            <div className="mt-1 text-base font-bold text-slate-900">{selectedBranchName ?? 'ยังไม่ได้เลือกสาขา'}</div>
            {!profileConfigured && selectedBranchId ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                สาขานี้ยังไม่มีข้อมูลบริษัทเฉพาะ ต้องกรอกและบันทึกก่อนนำไปใช้ในเอกสารพิมพ์
              </div>
            ) : null}
          </div>
          <TextField error={fieldErrors.name} label="ชื่อบริษัท (ไทย) *" value={form.name} onChange={(value) => update('name', value)} />
          <TextField error={fieldErrors.nameEn} label="ชื่อบริษัท (อังกฤษ)" value={form.nameEn ?? ''} onChange={(value) => update('nameEn', value || null)} />
          <TextField error={fieldErrors.taxId} inputMode="numeric" label="เลขประจำตัวผู้เสียภาษี (13 หลัก)" value={form.taxId ?? ''} onChange={(value) => update('taxId', value.replace(/\D/g, '').slice(0, 13) || null)} />
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-bold text-slate-700">ที่อยู่ (ตามใบทะเบียนพาณิชย์) *</span>
            <textarea className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-700 focus:outline-none focus:ring-0" rows={2} value={form.address} onChange={(event) => update('address', event.target.value)} />
            {fieldErrors.address ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.address}</span> : null}
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-700">โทรศัพท์ *</span>
            <PhoneInput className="w-full" error={Boolean(fieldErrors.phone)} value={form.phone} onChange={(value) => update('phone', sanitizePhoneInput(value))} />
            {fieldErrors.phone ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.phone}</span> : null}
          </label>
          <TextField error={fieldErrors.fax} inputMode="tel" label="แฟกซ์" value={form.fax ?? ''} onChange={(value) => update('fax', sanitizePhoneInput(value) || null)} />
          <TextField error={fieldErrors.email} inputMode="email" label="อีเมล" type="email" value={form.email ?? ''} onChange={(value) => update('email', sanitizeEmail(value) || null)} />
          <TextField error={fieldErrors.website} inputMode="url" label="เว็บไซต์" value={form.website ?? ''} onBlur={() => update('website', normalizeWebsite(form.website ?? ''))} onChange={(value) => update('website', sanitizeEmail(value) || null)} />
          <TextField className="md:col-span-2" error={fieldErrors.bankInfo} label="ข้อมูลธนาคาร / เลขบัญชี (สำหรับใบส่งของ)" placeholder="เช่น KBank 123-4-56789-0 บริษัท นิวโซลูชั่นส์ (ไทยแลนด์) จำกัด" value={form.bankInfo ?? ''} onChange={(value) => update('bankInfo', value || null)} />
          <TextField className="md:col-span-2" error={fieldErrors.footerNote} label="ข้อความท้ายเอกสาร" placeholder="เช่น ขอขอบคุณที่ใช้บริการ" value={form.footerNote ?? ''} onChange={(value) => update('footerNote', value || null)} />

          <div className="rounded-md border border-slate-300 bg-slate-50 p-3 md:col-span-2">
            <label className="mb-2 block text-xs font-bold text-slate-700">โลโก้บริษัท (สำหรับพิมพ์ในใบ — แนะนำไฟล์เล็กกว่า 200KB)</label>
            <div className="flex flex-wrap items-start gap-3">
              {form.logoUrl ? (
                <div className="rounded-md border border-slate-300 bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="โลโก้บริษัท" className="max-h-20 max-w-[200px]" src={form.logoUrl} />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-400">ยังไม่มีโลโก้</div>
              )}
              <div className="flex flex-col gap-2">
                <input accept="image/*" className="text-xs" type="file" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                {form.logoUrl ? <button className="text-left text-xs text-red-600 hover:underline" type="button" onClick={() => update('logoUrl', null)}>🗑 ลบโลโก้</button> : null}
                {fieldErrors.logoUrl ? <span className="text-xs text-red-600">{fieldErrors.logoUrl}</span> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 rounded-md bg-slate-50 p-4">
        <button className="w-full sm:w-auto rounded-md bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-60 h-10 flex items-center justify-center" disabled={isLoading || isSaving || !selectedBranchId} type="button" onClick={() => void save()}>
          {isSaving ? 'กำลังบันทึก...' : '💾 บันทึก'}
        </button>
        <button className="w-full sm:w-auto rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60 h-10 flex items-center justify-center font-semibold" disabled={isLoading || isSaving || !selectedBranchId} type="button" onClick={() => void previewReceipt()}>👁 ดูตัวอย่างใบรับสินค้า</button>
        <button className="w-full sm:w-auto rounded-md bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-60 h-10 flex items-center justify-center font-semibold" disabled={isLoading || isSaving || !selectedBranchId} type="button" onClick={() => void previewDelivery()}>👁 ดูตัวอย่างใบส่งของ</button>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        💡 <b>วิธีใช้:</b> หลังบันทึกข้อมูลบริษัทแล้ว — ไปหน้าบิลซื้อ/บิลขาย → กดปุ่ม &quot;🖨 ใบรับ&quot; หรือ &quot;🖨 ใบส่ง&quot; ในแต่ละบิล → จะเปิดหน้าต่างใหม่พร้อมพิมพ์ (Ctrl+P) หรือ Save as PDF ได้เลย
      </div>
    </section>
  )
}

function TextField({
  className,
  error,
  inputMode,
  label,
  onBlur,
  onChange,
  placeholder,
  type = 'text',
  value,
}: {
  className?: string
  error?: string
  inputMode?: 'email' | 'numeric' | 'tel' | 'url'
  label: string
  onBlur?: () => void
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  value: string
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
      <input className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-700 focus:outline-none focus:ring-0" inputMode={inputMode} placeholder={placeholder} type={type} value={value} onBlur={onBlur} onChange={(event) => onChange(event.target.value)} />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  )
}
