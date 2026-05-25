'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { CheckCircle2, ImagePlus, Plus, Trash2, Truck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { listImpurities } from '@/lib/impurity'
import { cn } from '@/lib/utils'
import {
  branchOptions,
  calculateLineTotals,
  calculateTicketTotals,
  createWeightTicketLine,
  currentDocumentDate,
  findOptionLabel,
  formatWeight,
  generateDocumentNo,
  getPartyOptions,
  loadStoredWeightTickets,
  normalizeDecimalInput,
  normalizeVehicleNo,
  productOptions,
  saveStoredWeightTicket,
  type DeductionMode,
  type OptionItem,
  type StoredWeightTicket,
  type WeightTicketLine,
  type WeightTicketType,
} from '@/lib/weight-tickets'

type AttachmentPreview = {
  fileName: string
  id: string
  url: string
}

type FormWeightTicketLine = WeightTicketLine & {
  imageFiles: AttachmentPreview[]
}

type FormState = {
  branchId: string
  lines: FormWeightTicketLine[]
  partyId: string
  remark: string
  type: WeightTicketType
  vehicleNo: string
}

function createFormWeightTicketLine(id?: string): FormWeightTicketLine {
  return {
    ...createWeightTicketLine(id),
    imageFiles: [],
  }
}

function initialForm(): FormState {
  return {
    branchId: '',
    lines: [createFormWeightTicketLine('line-1')],
    partyId: '',
    remark: '',
    type: 'WTI',
    vehicleNo: '',
  }
}

function makeFileId() {
  return `file-${Math.random().toString(36).slice(2, 10)}`
}

function getLineImages(line: FormWeightTicketLine) {
  return line.imageFiles ?? []
}

function getLineImpurityId(line: FormWeightTicketLine) {
  return line.impurityId ?? ''
}

export function WeightTicketsPageClient() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [branches, setBranches] = useState<OptionItem[]>(branchOptions)
  const [suppliers, setSuppliers] = useState<OptionItem[]>(getPartyOptions('WTI'))
  const [customers, setCustomers] = useState<OptionItem[]>(getPartyOptions('WTO'))
  const [products, setProducts] = useState<OptionItem[]>(productOptions)
  const [impurities, setImpurities] = useState<OptionItem[]>([])
  const [savedTicket, setSavedTicket] = useState<StoredWeightTicket | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const partyOptions = form.type === 'WTI' ? suppliers : customers
  const totals = useMemo(() => calculateTicketTotals(form.lines), [form.lines])

  useEffect(() => {
    let cancelled = false

    async function loadOptionData() {
      try {
        const [branchResponse, supplierResponse, customerResponse, productResponse] = await Promise.all([
          fetch('/api/branches'),
          fetch('/api/master-data/suppliers?all=1'),
          fetch('/api/master-data/customers?all=1'),
          fetch('/api/master-data/products?all=1&active=active'),
        ])

        if (branchResponse.ok) {
          const data = await branchResponse.json() as { branches?: Array<{ code?: string | null; id: string; name: string }> }
          const nextBranches = (data.branches ?? []).map((branch) => ({
            code: branch.code ?? undefined,
            description: branch.code ? `รหัสสาขา ${branch.code}` : undefined,
            id: branch.id,
            label: branch.name,
          }))
          if (!cancelled && nextBranches.length) setBranches(nextBranches)
        }

        if (supplierResponse.ok) {
          const data = await supplierResponse.json() as { rows?: Array<{ code?: string | null; id: string; name: string }> }
          const nextSuppliers = (data.rows ?? []).map((supplier) => ({
            code: supplier.code ?? undefined,
            description: supplier.code ? `Supplier · ${supplier.code}` : 'Supplier',
            id: supplier.id,
            label: supplier.name,
          }))
          if (!cancelled && nextSuppliers.length) setSuppliers(nextSuppliers)
        }

        if (customerResponse.ok) {
          const data = await customerResponse.json() as { rows?: Array<{ code?: string | null; id: string; name: string }> }
          const nextCustomers = (data.rows ?? []).map((customer) => ({
            code: customer.code ?? undefined,
            description: customer.code ? `Customer · ${customer.code}` : 'Customer',
            id: customer.id,
            label: customer.name,
          }))
          if (!cancelled && nextCustomers.length) setCustomers(nextCustomers)
        }

        if (productResponse.ok) {
          const data = await productResponse.json() as { rows?: Array<{ code?: string | null; id: string; itemStatus?: string | null; name: string; unit?: string | null }> }
          const nextProducts = (data.rows ?? []).map((product) => ({
            code: product.code ?? undefined,
            description: [product.itemStatus, product.unit].filter(Boolean).join(' · ') || product.code || undefined,
            id: product.id,
            label: product.name,
          }))
          if (!cancelled && nextProducts.length) setProducts(nextProducts)
        }

        const nextImpurities = await listImpurities()
        if (!cancelled) {
          setImpurities(nextImpurities
            .filter((impurity) => impurity.active)
            .map((impurity) => ({ id: impurity.id, label: impurity.name })))
        }
      } catch {
        // Keep fallback prototype options if a protected master-data endpoint is unavailable.
      }
    }

    void loadOptionData()

    return () => {
      cancelled = true
    }
  }, [])

  const errors = useMemo(() => {
    const next: Record<string, string> = {}
    if (!form.branchId) next.branchId = 'เลือกสาขา'
    if (!form.partyId) next.partyId = form.type === 'WTI' ? 'เลือกผู้ขาย' : 'เลือกลูกค้า'
    if (form.vehicleNo.trim().length < 2) next.vehicleNo = 'กรอกทะเบียนรถ'

    form.lines.forEach((line, index) => {
      const lineTotals = calculateLineTotals(line)
      if (!line.productId) next[`line-${line.id}-product`] = `เลือกสินค้าบรรทัดที่ ${index + 1}`
      if (lineTotals.grossWeight <= 0) next[`line-${line.id}-gross`] = `กรอกน้ำหนักบรรทัดที่ ${index + 1}`
      if (getLineImages(line).length === 0) next[`line-${line.id}-images`] = `แนบรูปภาพบรรทัดที่ ${index + 1} อย่างน้อย 1 รูป`
      if (line.deductionMode !== 'none' && !getLineImpurityId(line)) {
        next[`line-${line.id}-impurity`] = impurities.length > 0 ? `เลือกสิ่งเจือปนบรรทัดที่ ${index + 1}` : 'ยังไม่มีสิ่งเจือปนที่ใช้งานใน master data'
      }
      if (line.deductionMode === 'percent' && Number(line.deductionValue || 0) > 100) {
        next[`line-${line.id}-deduction`] = 'หัก % ต้องไม่เกิน 100'
      }
      if (line.deductionMode === 'kg' && Number(line.deductionValue || 0) > lineTotals.grossWeight) {
        next[`line-${line.id}-deduction`] = 'น้ำหนักหักต้องไม่เกินน้ำหนักรวม'
      }
    })
    return next
  }, [form, impurities.length])

  const ticketTheme = form.type === 'WTI'
    ? {
        badge: 'bg-emerald-100 text-emerald-800',
        border: 'border-emerald-200',
        button: 'bg-emerald-600 hover:bg-emerald-700',
        panel: 'bg-emerald-50',
        summary: 'ใบรับของ / Weight Ticket In',
      }
    : {
        badge: 'bg-rose-100 text-rose-800',
        border: 'border-rose-200',
        button: 'bg-rose-600 hover:bg-rose-700',
        panel: 'bg-rose-50',
        summary: 'ใบส่งของ / Weight Ticket Out',
      }

  function showError(key: string) {
    return touched[key] ? errors[key] : undefined
  }

  function markTouched(key: string) {
    setTouched((current) => ({ ...current, [key]: true }))
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateLine(lineId: string, updater: (line: FormWeightTicketLine) => FormWeightTicketLine) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === lineId ? updater(line) : line),
    }))
  }

  function addLine() {
    setForm((current) => ({ ...current, lines: [...current.lines, createFormWeightTicketLine()] }))
  }

  function removeLine(lineId: string) {
    setForm((current) => ({
      ...current,
      lines: current.lines.length === 1 ? current.lines : current.lines.filter((line) => line.id !== lineId),
    }))
  }

  function appendLineImages(lineId: string, files: FileList | null) {
    if (!files?.length) return
    const nextFiles = Array.from(files).map((file) => ({
      fileName: file.name,
      id: makeFileId(),
      url: URL.createObjectURL(file),
    }))
    updateLine(lineId, (line) => ({ ...line, imageFiles: [...getLineImages(line), ...nextFiles] }))
    markTouched(`line-${lineId}-images`)
  }

  function resetForm() {
    setForm(initialForm())
    setSavedTicket(null)
    setTouched({})
    setIsSaving(false)
  }

  async function resolveEnteredBy() {
    try {
      const response = await fetch('/api/auth/me')
      if (!response.ok) return 'ผู้ใช้ปัจจุบัน'
      const data = await response.json() as {
        appUser?: { displayName?: string | null; email?: string | null; username?: string | null } | null
        authUser?: { email?: string | null }
        user?: { displayName?: string | null; username?: string | null } | null
      }
      return data.appUser?.displayName
        || data.user?.displayName
        || data.appUser?.username
        || data.user?.username
        || data.appUser?.email
        || data.authUser?.email
        || 'ผู้ใช้ปัจจุบัน'
    } catch {
      return 'ผู้ใช้ปัจจุบัน'
    }
  }

  async function saveTicket() {
    const nextTouched: Record<string, boolean> = {
      branchId: true,
      partyId: true,
      vehicleNo: true,
    }
    form.lines.forEach((line) => {
      nextTouched[`line-${line.id}-product`] = true
      nextTouched[`line-${line.id}-gross`] = true
      nextTouched[`line-${line.id}-deduction`] = true
      nextTouched[`line-${line.id}-images`] = true
      nextTouched[`line-${line.id}-impurity`] = true
    })
    setTouched(nextTouched)
    if (Object.keys(errors).length > 0) return

    setIsSaving(true)
    const existingTickets = loadStoredWeightTickets()
    const documentNo = generateDocumentNo(form.type, form.branchId, existingTickets, branches)
    const documentDate = currentDocumentDate()
    const enteredBy = await resolveEnteredBy()
    const storedLines = form.lines.map((line) => {
      const { imageFiles = [], ...lineData } = line
      const lineTotals = calculateLineTotals(line)
      const impurityId = getLineImpurityId(line)
      return {
        ...lineData,
        deductionWeight: lineTotals.deductionWeight,
        grossWeightValue: lineTotals.grossWeight,
        imageCount: imageFiles.length,
        imageNames: imageFiles.map((file) => file.fileName),
        impurityId,
        impurityName: impurityId ? findOptionLabel(impurities, impurityId) : '',
        netWeight: lineTotals.netWeight,
        productName: findOptionLabel(products, line.productId),
      }
    })
    const imageNames = form.lines.flatMap((line) => getLineImages(line).map((file) => file.fileName))
    const ticket: StoredWeightTicket = {
      branchId: form.branchId,
      branchName: findOptionLabel(branches, form.branchId),
      createdAt: new Date().toISOString(),
      documentDate,
      documentNo,
      enteredBy,
      id: crypto.randomUUID(),
      imageCount: imageNames.length,
      imageNames,
      lines: storedLines,
      partyId: form.partyId,
      partyName: findOptionLabel(partyOptions, form.partyId),
      remark: form.remark.trim(),
      status: form.type === 'WTI' ? 'received' : 'delivered',
      totals,
      type: form.type,
      vehicleNo: form.vehicleNo.trim(),
    }
    saveStoredWeightTicket(ticket)
    window.setTimeout(() => {
      setSavedTicket(ticket)
      setIsSaving(false)
    }, 250)
  }

  return (
    <div className="space-y-5 pb-32">
      <div>
        <Card className={cn('border p-4', ticketTheme.border, ticketTheme.panel)}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={cn('inline-flex rounded-md px-2.5 py-1 text-xs font-semibold', ticketTheme.badge)}>
                {ticketTheme.summary}
              </div>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">ชั่งสินค้า / รับ-ส่งของ</h2>
              <p className="mt-1 text-sm text-slate-600">
                ระบบจะออกเลขเอกสาร วันที่ เวลา และผู้กรอกหลังบันทึก
              </p>
            </div>
            <div className="inline-flex rounded-md bg-white p-1 shadow-sm ring-1 ring-slate-200">
              {([
                { icon: <Truck className="size-4" />, label: 'ใบรับของ WTI', value: 'WTI' },
                { icon: <Truck className="size-4 rotate-180" />, label: 'ใบส่งของ WTO', value: 'WTO' },
              ] as const).map((option) => {
                const active = form.type === option.value
                return (
                  <button
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition',
                      active ? `${ticketTheme.button} text-white` : 'text-slate-600 hover:bg-slate-100',
                    )}
                    key={option.value}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, partyId: '', type: option.value }))}
                  >
                    {option.icon}
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      <div>
        <div className="space-y-5">
          <Card className="p-5">
            <SectionHeader title="ข้อมูลหัวเอกสาร" subtitle="ผู้ใช้เลือกเฉพาะข้อมูลหน้างาน ส่วนวันที่ เวลา และผู้กรอกเป็นข้อมูลระบบ" />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SearchCombobox
                error={showError('branchId')}
                inputId="weight-ticket-branch"
                label="สาขา*"
                options={branches}
                placeholder="เลือกสาขา"
                value={form.branchId}
                onChange={(value) => {
                  markTouched('branchId')
                  updateForm('branchId', value)
                }}
              />
              <SearchCombobox
                error={showError('partyId')}
                inputId="weight-ticket-party"
                label={form.type === 'WTI' ? 'ผู้ขาย*' : 'ลูกค้า*'}
                options={partyOptions}
                placeholder={form.type === 'WTI' ? 'ค้นหาผู้ขาย' : 'ค้นหาลูกค้า'}
                value={form.partyId}
                onChange={(value) => {
                  markTouched('partyId')
                  updateForm('partyId', value)
                }}
              />
              <FieldBlock error={showError('vehicleNo')} label="ทะเบียนรถ*">
                <Input
                  placeholder="เช่น 83-5476"
                  value={form.vehicleNo}
                  onBlur={() => markTouched('vehicleNo')}
                  onChange={(event) => updateForm('vehicleNo', normalizeVehicleNo(event.target.value))}
                />
              </FieldBlock>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="สินค้าและน้ำหนัก" subtitle="เลือกสินค้า กรอกน้ำหนัก และเลือกวิธีหักสิ่งเจือปนต่อรายการ" />

            <div className="mt-4 space-y-4">
              {form.lines.map((line, index) => {
                const lineTotals = calculateLineTotals(line)
                return (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4" key={line.id}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="inline-flex rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">รายการ {index + 1}</div>
                      <Button disabled={form.lines.length === 1} size="xs" type="button" variant="outline" onClick={() => removeLine(line.id)}>
                        <Trash2 className="mr-1 size-3" />
                        ลบ
                      </Button>
                    </div>
                    <div className={cn(
                      'grid gap-4',
                      line.deductionMode === 'none'
                        ? 'xl:grid-cols-[minmax(0,1.4fr)_10rem_10rem_10rem]'
                        : 'xl:grid-cols-[minmax(0,1.3fr)_10rem_10rem_minmax(0,1fr)_10rem]',
                    )}
                    >
                      <SearchCombobox
                        error={showError(`line-${line.id}-product`)}
                        inputId={`weight-product-${line.id}`}
                        label="สินค้า*"
                        options={products}
                        placeholder="เลือกสินค้า"
                        value={line.productId}
                        onChange={(value) => {
                          markTouched(`line-${line.id}-product`)
                          updateLine(line.id, (current) => ({ ...current, productId: value }))
                        }}
                      />
                      <FieldBlock error={showError(`line-${line.id}-gross`)} label="น้ำหนักรวม กก.*">
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={line.grossWeight}
                          onBlur={() => markTouched(`line-${line.id}-gross`)}
                          onChange={(event) => updateLine(line.id, (current) => ({ ...current, grossWeight: normalizeDecimalInput(event.target.value) }))}
                        />
                      </FieldBlock>
                      <FieldBlock label="หักสิ่งเจือปน">
                        <Select
                          value={line.deductionMode}
                          onChange={(event) => {
                            const deductionMode = event.target.value as DeductionMode
                            updateLine(line.id, (current) => ({
                              ...current,
                              deductionMode,
                              deductionValue: '',
                              impurityId: deductionMode === 'none' ? '' : getLineImpurityId(current),
                            }))
                          }}
                        >
                          <option value="none">ไม่หัก</option>
                          <option value="kg">หัก</option>
                          <option value="percent">หัก %</option>
                        </Select>
                      </FieldBlock>
                      {line.deductionMode !== 'none' ? (
                        <SearchCombobox
                          error={showError(`line-${line.id}-impurity`)}
                          inputId={`weight-impurity-${line.id}`}
                          label="สิ่งเจือปน*"
                          options={impurities}
                          placeholder={impurities.length > 0 ? 'เลือกสิ่งเจือปน' : 'ยังไม่มีสิ่งเจือปนที่ใช้งาน'}
                          value={getLineImpurityId(line)}
                          onChange={(value) => {
                            markTouched(`line-${line.id}-impurity`)
                            updateLine(line.id, (current) => ({ ...current, impurityId: value }))
                          }}
                        />
                      ) : null}
                      <FieldBlock error={showError(`line-${line.id}-deduction`)} label={line.deductionMode === 'percent' ? 'ค่าหัก %' : 'น้ำหนักหัก กก.'}>
                        <Input
                          disabled={line.deductionMode === 'none'}
                          inputMode="decimal"
                          placeholder={line.deductionMode === 'percent' ? '0.00' : '0.00'}
                          value={line.deductionValue}
                          onBlur={() => markTouched(`line-${line.id}-deduction`)}
                          onChange={(event) => updateLine(line.id, (current) => ({ ...current, deductionValue: normalizeDecimalInput(event.target.value) }))}
                        />
                      </FieldBlock>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <MiniMetric label="Gross" value={`${formatWeight(lineTotals.grossWeight)} กก.`} />
                      <MiniMetric label="Deduct" value={`${formatWeight(lineTotals.deductionWeight)} กก.`} />
                      <MiniMetric label="Net" value={`${formatWeight(lineTotals.netWeight)} กก.`} />
                    </div>
                    <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            รูปภาพรายการสินค้า<span className="ml-1 text-red-600">*</span>
                          </div>
                          <div className="text-xs text-slate-500">ต้องมีอย่างน้อย 1 รูปต่อรายการสินค้า</div>
                          {showError(`line-${line.id}-images`) ? <div className="mt-1 text-xs text-red-600">{showError(`line-${line.id}-images`)}</div> : null}
                        </div>
                        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
                          <ImagePlus className="size-4" />
                          เพิ่มรูปภาพ
                          <input
                            accept="image/*"
                            className="hidden"
                            multiple
                            type="file"
                            onChange={(event) => {
                              appendLineImages(line.id, event.target.files)
                              event.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {getLineImages(line).length === 0 ? <div className="rounded-md bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">ยังไม่มีรูปภาพรายการนี้</div> : null}
                        {getLineImages(line).map((file) => (
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={file.id}>
                            <div className="truncate text-sm font-medium text-slate-800">{file.fileName}</div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-500">แนบกับรายการ {index + 1}</span>
                              <Button
                                size="xs"
                                type="button"
                                variant="outline"
                                onClick={() => updateLine(line.id, (current) => ({
                                  ...current,
                                  imageFiles: getLineImages(current).filter((entry) => entry.id !== file.id),
                                }))}
                              >
                                ลบ
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <FieldBlock label="หมายเหตุรายการ">
                      <Input
                        className="mt-3"
                        placeholder="เช่น ของเปียก มีเศษปน หรือรายละเอียดหน้างาน"
                        value={line.note}
                        onChange={(event) => updateLine(line.id, (current) => ({ ...current, note: event.target.value.slice(0, 160) }))}
                      />
                    </FieldBlock>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <Button className="w-full sm:w-auto" type="button" onClick={addLine}>
                <Plus className="mr-2 size-4" />
                เพิ่มสินค้า
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="หมายเหตุท้ายเอกสาร" subtitle="ใช้บันทึกข้อมูลหน้างานที่ office ต้องเห็นตอนเลือกเอกสารไปออกบิล" />
            <textarea
              className="mt-4 min-h-28 w-full rounded-md border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-400"
              placeholder="ระบุหมายเหตุเพิ่มเติม"
              value={form.remark}
              onChange={(event) => updateForm('remark', event.target.value.slice(0, 500))}
            />
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {savedTicket ? (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="size-4" />
                บันทึก {savedTicket.documentNo} แล้ว
              </span>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-5">
                <FooterMetric label="รายการ" value={`${form.lines.length} รายการ`} />
                <FooterMetric label="น้ำหนักรวม" value={`${formatWeight(totals.grossWeight)} กก.`} />
                <FooterMetric label="หัก" value={`${formatWeight(totals.deductionWeight)} กก.`} />
                <FooterMetric emphasis label="สุทธิ" value={`${formatWeight(totals.netWeight)} กก.`} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={resetForm}>ล้างฟอร์ม</Button>
            {savedTicket ? (
              <Button asChild variant="outline">
                <Link href="/daily/weight-ticket-list">ดูในรายการ</Link>
              </Button>
            ) : null}
            <Button className={ticketTheme.button} disabled={isSaving} type="button" onClick={saveTicket}>
              {isSaving ? 'กำลังบันทึก...' : `บันทึก${form.type === 'WTI' ? 'ใบรับของ' : 'ใบส่งของ'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}

function FieldBlock({
  children,
  error,
  label,
}: {
  children: ReactNode
  error?: string
  label: string
}) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {labelText}
        {hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-950 px-3 py-3 text-white">
      <div className="text-xs uppercase text-slate-300">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function FooterMetric({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={cn('font-semibold tabular-nums', emphasis ? 'text-emerald-700' : 'text-slate-900')}>{value}</div>
    </div>
  )
}
