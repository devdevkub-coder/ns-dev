'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, ImagePlus, Minus, Package2, Plus, Scale, Trash2, Truck } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

type TicketType = 'inbound' | 'outbound'
type DeductMode = 'none' | 'percent' | 'kg'
type AttachmentCategory = 'condition' | 'delivery' | 'onsite' | 'vehicle'

type AttachmentPreview = {
  fileName: string
  id: string
  url: string
}

type BucketRow = {
  id: string
  weight: string
}

type TicketItem = {
  attachments: AttachmentPreview[]
  buckets: BucketRow[]
  deductMode: DeductMode
  deductValue: string
  id: string
  note: string
  productId: string
}

type GeneralAttachmentGroup = {
  files: AttachmentPreview[]
  id: AttachmentCategory
  label: string
}

type FormState = {
  branchId: string
  date: string
  employeeId: string
  items: TicketItem[]
  partyId: string
  remark: string
  referenceNo: string
  sourceType: 'po' | 'spot'
  time: string
  vehicleNo: string
}

const branches: SearchComboboxOption[] = [
  { description: 'สาขาหลักสำหรับรับซื้อและคลัง RM', id: 'BR001', label: 'สมุทรสาคร · BR001' },
  { description: 'สาขาผลิตและคลัง WIP/FG', id: 'BR002', label: 'นครสวรรค์ · BR002' },
]

const employees: SearchComboboxOption[] = [
  { description: 'พนักงานชั่งกะเช้า', id: 'EMP-AOM', label: 'อ้อม · เครื่องชั่ง A' },
  { description: 'หัวหน้าคลัง', id: 'EMP-KWAN', label: 'กวาง · หัวหน้าคลัง' },
  { description: 'เจ้าหน้าที่ลานชั่ง', id: 'EMP-TIK', label: 'ติ๊ก · ลานรับซื้อ' },
]

const suppliers: SearchComboboxOption[] = [
  { description: 'Supplier · ซื้อสด', id: 'SUP-001', label: 'บริษัท รุ่งเศษโลหะ' },
  { description: 'Supplier · ตาม PO', id: 'SUP-002', label: 'หจก. โชคไพบูลย์รีไซเคิล' },
  { description: 'Supplier · หน้างาน', id: 'SUP-003', label: 'คุณสมชาย รถคอก' },
]

const customers: SearchComboboxOption[] = [
  { description: 'Customer · ส่งขายตรง', id: 'CUS-001', label: 'บริษัท ไทยเมททัลเทรด' },
  { description: 'Customer · โรงหล่อ', id: 'CUS-002', label: 'โรงหล่อสยามอินดัสเทรียล' },
  { description: 'Customer · ลานปลายทาง', id: 'CUS-003', label: 'บริษัท ยูไนเต็ดคอปเปอร์' },
]

const products: SearchComboboxOption[] = [
  { description: 'RM · ทองแดงเบอร์ 1', id: 'PROD-CU1', label: 'ทองแดงเบอร์ 1' },
  { description: 'RM · ทองแดงเบอร์ 2', id: 'PROD-CU2', label: 'ทองแดงเบอร์ 2' },
  { description: 'RM · ทองเหลืองป่น', id: 'PROD-BRASS', label: 'ทองเหลืองป่น' },
  { description: 'FG · อินกอตทองแดง', id: 'PROD-INGOT', label: 'อินกอตทองแดง' },
]

const attachmentLabels: Record<AttachmentCategory, string> = {
  condition: 'สภาพสินค้า',
  delivery: 'ใบส่งของ',
  onsite: 'หน้างาน',
  vehicle: 'รถ',
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function currentDate() {
  return new Date().toISOString().slice(0, 10)
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5)
}

function createBucket(): BucketRow {
  return {
    id: makeId('bucket'),
    weight: '',
  }
}

function createItem(): TicketItem {
  return {
    attachments: [],
    buckets: [createBucket()],
    deductMode: 'none',
    deductValue: '',
    id: makeId('item'),
    note: '',
    productId: '',
  }
}

function initialForm(): FormState {
  return {
    branchId: '',
    date: currentDate(),
    employeeId: '',
    items: [createItem()],
    partyId: '',
    remark: '',
    referenceNo: '',
    sourceType: 'spot',
    time: currentTime(),
    vehicleNo: '',
  }
}

function toNumber(value: string) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function formatWeight(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function itemTotals(item: TicketItem) {
  const grossWeight = item.buckets.reduce((sum, bucket) => sum + toNumber(bucket.weight), 0)
  const deductWeight = item.deductMode === 'percent'
    ? grossWeight * Math.max(0, toNumber(item.deductValue)) / 100
    : item.deductMode === 'kg'
      ? Math.max(0, toNumber(item.deductValue))
      : 0
  return {
    deductWeight: Math.min(deductWeight, grossWeight),
    grossWeight,
    netWeight: Math.max(0, grossWeight - Math.min(deductWeight, grossWeight)),
  }
}

function generalAttachmentState(): GeneralAttachmentGroup[] {
  return [
    { files: [], id: 'vehicle', label: attachmentLabels.vehicle },
    { files: [], id: 'delivery', label: attachmentLabels.delivery },
    { files: [], id: 'onsite', label: attachmentLabels.onsite },
    { files: [], id: 'condition', label: attachmentLabels.condition },
  ]
}

export function WeightTicketsPageClient() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [generalAttachments, setGeneralAttachments] = useState<GeneralAttachmentGroup[]>(generalAttachmentState)
  const [itemDialogId, setItemDialogId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [ticketType, setTicketType] = useState<TicketType>('inbound')
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const partyOptions = ticketType === 'inbound' ? suppliers : customers
  const partyLabel = ticketType === 'inbound' ? 'Supplier / ผู้ขาย*' : 'Customer / ลูกค้า*'
  const ticketTheme = ticketType === 'inbound'
    ? {
        accent: 'from-emerald-500 via-green-500 to-lime-400',
        badge: 'bg-emerald-100 text-emerald-800',
        panel: 'border-emerald-200 bg-emerald-50/70',
        ring: 'ring-emerald-100',
        summary: 'รับซื้อเข้า',
      }
    : {
        accent: 'from-rose-500 via-red-500 to-orange-400',
        badge: 'bg-rose-100 text-rose-800',
        panel: 'border-rose-200 bg-rose-50/70',
        ring: 'ring-rose-100',
        summary: 'ขายออก',
      }

  const itemMap = useMemo(() => new Map(form.items.map((item) => [item.id, item])), [form.items])
  const activeItem = itemDialogId ? itemMap.get(itemDialogId) ?? null : null

  const totals = useMemo(() => {
    return form.items.reduce((summary, item) => {
      const total = itemTotals(item)
      summary.grossWeight += total.grossWeight
      summary.deductWeight += total.deductWeight
      summary.netWeight += total.netWeight
      return summary
    }, { deductWeight: 0, grossWeight: 0, netWeight: 0 })
  }, [form.items])

  const errors = useMemo(() => {
    const next: Record<string, string> = {}
    if (!form.date) next.date = 'เลือกวันที่'
    if (!form.time) next.time = 'ระบุเวลา'
    if (!form.vehicleNo.trim()) next.vehicleNo = 'กรอกทะเบียนรถ'
    if (!form.partyId) next.partyId = `เลือก${ticketType === 'inbound' ? 'ผู้ขาย' : 'ลูกค้า'}`
    if (!form.branchId) next.branchId = 'เลือกสาขา'
    if (!form.employeeId) next.employeeId = 'เลือกพนักงานชั่ง'
    form.items.forEach((item, index) => {
      if (!item.productId) next[`item-${item.id}-product`] = `เลือกรายการสินค้าบรรทัดที่ ${index + 1}`
      const nonZeroBuckets = item.buckets.filter((bucket) => toNumber(bucket.weight) > 0)
      if (nonZeroBuckets.length === 0) next[`item-${item.id}-bucket`] = `กรอกน้ำหนักอย่างน้อย 1 ถังในบรรทัดที่ ${index + 1}`
    })
    return next
  }, [form, ticketType])

  const isValid = Object.keys(errors).length === 0

  function markTouched(key: string) {
    setTouched((current) => ({ ...current, [key]: true }))
  }

  function showError(key: string) {
    return touched[key] ? errors[key] : undefined
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateItem(itemId: string, updater: (item: TicketItem) => TicketItem) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? updater(item) : item),
    }))
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, createItem()] }))
  }

  function removeItem(itemId: string) {
    setForm((current) => ({
      ...current,
      items: current.items.length === 1 ? current.items : current.items.filter((item) => item.id !== itemId),
    }))
    setItemDialogId((current) => current === itemId ? null : current)
  }

  function addBucket(itemId: string) {
    updateItem(itemId, (item) => ({ ...item, buckets: [...item.buckets, createBucket()] }))
  }

  function removeBucket(itemId: string, bucketId: string) {
    updateItem(itemId, (item) => ({
      ...item,
      buckets: item.buckets.length === 1 ? item.buckets : item.buckets.filter((bucket) => bucket.id !== bucketId),
    }))
  }

  function updateBucket(itemId: string, bucketId: string, value: string) {
    updateItem(itemId, (item) => ({
      ...item,
      buckets: item.buckets.map((bucket) => bucket.id === bucketId ? { ...bucket, weight: value } : bucket),
    }))
  }

  function appendAttachment(files: FileList | null, onAppend: (nextFiles: AttachmentPreview[]) => void) {
    if (!files?.length) return
    const nextFiles = Array.from(files).map((file) => ({
      fileName: file.name,
      id: makeId('file'),
      url: URL.createObjectURL(file),
    }))
    onAppend(nextFiles)
  }

  function saveTicket() {
    setTouched({
      branchId: true,
      date: true,
      employeeId: true,
      partyId: true,
      time: true,
      vehicleNo: true,
      ...Object.fromEntries(form.items.flatMap((item) => [
        [`item-${item.id}-product`, true],
        [`item-${item.id}-bucket`, true],
      ])),
    })

    if (!isValid) return

    setIsSaving(true)
    setSaveState('idle')
    window.setTimeout(() => {
      setIsSaving(false)
      setSaveState('saved')
    }, 900)
  }

  return (
    <div className="space-y-5 pb-28">
      <section className={cn('overflow-hidden rounded-xl border bg-white shadow-sm', ticketTheme.ring)}>
        <div className={cn('bg-gradient-to-r px-4 py-4 text-white sm:px-6', ticketTheme.accent)}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className={cn('inline-flex rounded-full px-3 py-1 text-xs font-semibold shadow-sm', ticketTheme.badge)}>
                {ticketTheme.summary} · Warehouse Weight Ticket
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">ชั่งสินค้า (เข้า/ออก)</h2>
                <p className="mt-1 max-w-3xl text-sm text-white/90">
                  บันทึกน้ำหนักรถเข้า/ออกแบบหลายรายการสินค้า รองรับหลายถัง รูปประกอบ และส่งต่อให้งานออกบิลในขั้นถัดไป
                </p>
              </div>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              {['Realtime น้ำหนัก', 'รองรับหลายถัง', 'ต่อยอดกับ PO / Spot Buy'].map((chip) => (
                <div className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 backdrop-blur-sm" key={chip}>{chip}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {([
              { icon: <Truck className="size-4" />, key: 'inbound', label: 'เข้า (รับซื้อ)' },
              { icon: <Truck className="size-4 rotate-180" />, key: 'outbound', label: 'ออก (ขาย)' },
            ] as const).map((option) => {
              const active = option.key === ticketType
              return (
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
                    active
                      ? option.key === 'inbound'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-rose-500 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                  key={option.key}
                  type="button"
                  onClick={() => setTicketType(option.key)}
                >
                  {option.icon}
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 rounded-xl bg-slate-950 px-4 py-3 text-white shadow-xl">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryStat icon={<Scale className="size-4" />} label="น้ำหนักรวม" value={`${formatWeight(totals.grossWeight)} กก.`} />
          <SummaryStat icon={<Minus className="size-4" />} label="หักรวม" value={`${formatWeight(totals.deductWeight)} กก.`} />
          <SummaryStat icon={<Package2 className="size-4" />} label="น้ำหนักสุทธิ" value={`${formatWeight(totals.netWeight)} กก.`} />
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
            <SectionHeader title="ข้อมูลทั่วไป" subtitle="บังคับกรอกเพื่อส่งต่อไปยังงานออกบิลหรือเอกสารขนส่ง" />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FieldBlock error={showError('date')} label="วันที่*">
                <Input type="date" value={form.date} onBlur={() => markTouched('date')} onChange={(event) => updateForm('date', event.target.value)} />
              </FieldBlock>
              <FieldBlock error={showError('time')} label="เวลา*">
                <Input type="time" value={form.time} onBlur={() => markTouched('time')} onChange={(event) => updateForm('time', event.target.value)} />
              </FieldBlock>
              <FieldBlock error={showError('vehicleNo')} label="ทะเบียนรถ*">
                <Input placeholder="เช่น 83-5476" value={form.vehicleNo} onBlur={() => markTouched('vehicleNo')} onChange={(event) => updateForm('vehicleNo', event.target.value.toUpperCase())} />
              </FieldBlock>
              <SearchCombobox error={showError('partyId')} inputId="weight-party" label={partyLabel} options={partyOptions} placeholder={`ค้นหา${ticketType === 'inbound' ? 'ผู้ขาย' : 'ลูกค้า'}`} value={form.partyId} onChange={(value) => updateForm('partyId', value)} />
              <SearchCombobox error={showError('branchId')} inputId="weight-branch" label="สาขา*" options={branches} placeholder="เลือกสาขา" value={form.branchId} onChange={(value) => updateForm('branchId', value)} />
              <SearchCombobox error={showError('employeeId')} inputId="weight-employee" label="พนักงานชั่ง*" options={employees} placeholder="เลือกพนักงานชั่ง" value={form.employeeId} onChange={(value) => updateForm('employeeId', value)} />
            </div>
          </Card>

          <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
            <SectionHeader title="ข้อมูลอ้างอิงต้นทาง" subtitle="รองรับทั้ง PO Buy และ Spot Buy เพื่อส่งต่อไปงานออกบิลอย่างถูก flow" />
            <div className="mt-4 grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
              <FieldBlock label="Source Type">
                <Select value={form.sourceType} onChange={(event) => updateForm('sourceType', event.target.value as FormState['sourceType'])}>
                  <option value="spot">Spot Buy / สดหน้างาน</option>
                  <option value="po">PO Receipt / รับตาม PO</option>
                </Select>
              </FieldBlock>
              <FieldBlock label={form.sourceType === 'po' ? 'เลข PO / ใบรับเข้า' : 'เลขใบรับเข้า / หมายเลขอ้างอิง'}>
                <Input
                  placeholder={form.sourceType === 'po' ? 'เช่น POB012605-0018 / GRN012605-0004' : 'เช่น GRN012605-0008 หรือหมายเลขภายนอก'}
                  value={form.referenceNo}
                  onChange={(event) => updateForm('referenceNo', event.target.value.toUpperCase())}
                />
              </FieldBlock>
            </div>
          </Card>

          <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeader title="รายการสินค้า + น้ำหนักแต่ละถัง" subtitle="เพิ่มได้หลายรายการในใบเดียว แต่ละรายการมี bucket rows และหักน้ำหนักแบบ realtime" />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-blue-500 hover:to-indigo-500"
                type="button"
                onClick={addItem}
              >
                <Plus className="size-4" />
                เพิ่มรายการสินค้า
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {form.items.map((item, index) => {
                const totalsByItem = itemTotals(item)
                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm" key={item.id}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">รายการ {index + 1}</span>
                          <span className="text-xs text-slate-500">{item.buckets.length} ถัง</span>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_11rem_10rem]">
                          <SearchCombobox error={showError(`item-${item.id}-product`)} inputId={`product-${item.id}`} label="สินค้า*" options={products} placeholder="ค้นหาสินค้า" value={item.productId} onChange={(value) => updateItem(item.id, (current) => ({ ...current, productId: value }))} />
                          <FieldBlock label="รูปแบบหัก">
                            <Select value={item.deductMode} onChange={(event) => updateItem(item.id, (current) => ({ ...current, deductMode: event.target.value as DeductMode }))}>
                              <option value="none">ไม่หัก</option>
                              <option value="percent">หัก %</option>
                              <option value="kg">หักเป็นกก.</option>
                            </Select>
                          </FieldBlock>
                          <FieldBlock label={item.deductMode === 'percent' ? 'หัก %' : item.deductMode === 'kg' ? 'หัก กก.' : 'หัก'}>
                            <Input
                              disabled={item.deductMode === 'none'}
                              inputMode="decimal"
                              placeholder={item.deductMode === 'percent' ? '0.00' : '0.00 กก.'}
                              value={item.deductValue}
                              onChange={(event) => updateItem(item.id, (current) => ({ ...current, deductValue: event.target.value }))}
                            />
                          </FieldBlock>
                        </div>

                        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-slate-800">น้ำหนักแต่ละถัง</div>
                              <div className="text-xs text-slate-500">กรอกน้ำหนักแต่ละถังแล้วระบบจะรวมให้อัตโนมัติ</div>
                            </div>
                            <Button size="xs" type="button" variant="outline" onClick={() => addBucket(item.id)}>+ เพิ่มถัง</Button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {item.buckets.map((bucket, bucketIndex) => (
                              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" key={bucket.id}>
                                <span className="text-xs font-medium text-slate-500">ถัง {bucketIndex + 1}</span>
                                <Input
                                  className="h-9"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={bucket.weight}
                                  onBlur={() => markTouched(`item-${item.id}-bucket`)}
                                  onChange={(event) => updateBucket(item.id, bucket.id, event.target.value)}
                                />
                                <button className="text-slate-400 hover:text-red-500" type="button" onClick={() => removeBucket(item.id, bucket.id)}>
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                          {showError(`item-${item.id}-bucket`) ? <div className="mt-2 text-xs text-red-600">{showError(`item-${item.id}-bucket`)}</div> : null}
                        </div>
                      </div>

                      <div className="w-full rounded-xl bg-slate-950 p-4 text-white lg:w-72">
                        <div className="grid gap-3">
                          <MiniMetric label="น้ำหนักรวม" value={`${formatWeight(totalsByItem.grossWeight)} กก.`} />
                          <MiniMetric label="น้ำหนักหัก" value={`${formatWeight(totalsByItem.deductWeight)} กก.`} />
                          <MiniMetric label="สุทธิ" value={`${formatWeight(totalsByItem.netWeight)} กก.`} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="xs" type="button" variant="secondary" onClick={() => setItemDialogId(item.id)}>
                            รายละเอียดรายการ
                          </Button>
                          <Button size="xs" type="button" variant="outline" onClick={() => removeItem(item.id)}>
                            ลบรายการ
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
            <SectionHeader title="รูปประกอบทั่วไป" subtitle="รองรับหลายรูปต่อหมวดเพื่อเก็บหลักฐานหน้างาน" />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {generalAttachments.map((group) => (
                <AttachmentUploader
                  files={group.files}
                  key={group.id}
                  label={group.label}
                  onAdd={(files) => appendAttachment(files, (nextFiles) => setGeneralAttachments((current) => current.map((entry) => entry.id === group.id ? { ...entry, files: [...entry.files, ...nextFiles] } : entry)))}
                  onRemove={(fileId) => setGeneralAttachments((current) => current.map((entry) => entry.id === group.id ? { ...entry, files: entry.files.filter((file) => file.id !== fileId) } : entry))}
                />
              ))}
            </div>
          </Card>

          <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
            <SectionHeader title="หมายเหตุ" subtitle="จดสถานะสินค้า, ปัญหาหน้างาน, หักพิเศษ หรือคำสั่งเพิ่มเติม" />
            <textarea
              className="mt-4 min-h-36 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none ring-0 transition focus:border-blue-400"
              placeholder="ระบุหมายเหตุเพิ่มเติม..."
              value={form.remark}
              onChange={(event) => updateForm('remark', event.target.value)}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className={cn('rounded-xl border p-5 shadow-sm', ticketTheme.panel)}>
            <SectionHeader title="Ready Check" subtitle="เช็กความพร้อมก่อนบันทึกใบชั่ง" />
            <div className="mt-4 space-y-2 text-sm">
              <ChecklistItem done={Boolean(form.date && form.time)} label="วันที่และเวลา" />
              <ChecklistItem done={Boolean(form.vehicleNo.trim())} label="ทะเบียนรถ" />
              <ChecklistItem done={Boolean(form.partyId)} label={ticketType === 'inbound' ? 'Supplier / ผู้ขาย' : 'Customer / ลูกค้า'} />
              <ChecklistItem done={Boolean(form.branchId && form.employeeId)} label="สาขาและพนักงานชั่ง" />
              <ChecklistItem done={form.items.every((item) => Boolean(item.productId) && item.buckets.some((bucket) => toNumber(bucket.weight) > 0))} label="รายการสินค้าและน้ำหนัก" />
            </div>
          </Card>

          <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
            <SectionHeader title="Feature Roadmap" subtitle="ของที่ควรต่อใน batch ถัดไป" />
            <div className="mt-4 flex flex-wrap gap-2">
              {['Print ใบชั่ง', 'PDF Export', 'QR Code', 'Offline Mode', 'Auto Sync', 'Audit Log', 'เครื่องชั่งจริง'].map((feature) => (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600" key={feature}>{feature}</span>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {saveState === 'saved'
              ? <span className="inline-flex items-center gap-2 font-medium text-emerald-600"><CheckCircle2 className="size-4" />บันทึกใบชั่งตัวอย่างสำเร็จแล้ว</span>
              : `พร้อมบันทึก ${form.items.length} รายการ · สุทธิ ${formatWeight(totals.netWeight)} กก.`}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => {
              setForm(initialForm())
              setGeneralAttachments(generalAttachmentState())
              setTouched({})
              setSaveState('idle')
            }}
            >
              ยกเลิก
            </Button>
            <button
              className="inline-flex min-w-40 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={saveTicket}
            >
              {isSaving ? 'กำลังบันทึกใบชั่ง...' : saveState === 'saved' ? 'บันทึกแล้ว' : 'บันทึกใบชั่ง'}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(activeItem)} onOpenChange={(open) => setItemDialogId(open ? itemDialogId : null)}>
        <DialogContent className="h-[100svh] max-w-5xl rounded-none p-0 sm:h-[92svh] sm:rounded-xl" hideClose>
          {activeItem ? (
            <div className="flex h-full flex-col">
              <DialogHeader className="border-b bg-slate-950 px-5 py-4 text-white">
                <DialogTitle className="text-lg">รายละเอียดรายการสินค้า</DialogTitle>
                <DialogDescription className="text-slate-300">
                  แก้น้ำหนักแต่ละถัง, หักน้ำหนัก, รูปประกอบเฉพาะรายการ และหมายเหตุของรายการนี้
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="space-y-5">
                    <Card className="rounded-xl p-4">
                      <SectionHeader title="สินค้าและ Bucket Weight" subtitle="แก้ไขต่อถังได้ละเอียดใน modal แบบ full-height" />
                      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_10rem_10rem]">
                        <SearchCombobox inputId="dialog-product" label="สินค้า*" options={products} placeholder="ค้นหาสินค้า" value={activeItem.productId} onChange={(value) => updateItem(activeItem.id, (current) => ({ ...current, productId: value }))} />
                        <FieldBlock label="รูปแบบหัก">
                          <Select value={activeItem.deductMode} onChange={(event) => updateItem(activeItem.id, (current) => ({ ...current, deductMode: event.target.value as DeductMode }))}>
                            <option value="none">ไม่หัก</option>
                            <option value="percent">หัก %</option>
                            <option value="kg">หัก กก.</option>
                          </Select>
                        </FieldBlock>
                        <FieldBlock label="ค่าหัก">
                          <Input
                            disabled={activeItem.deductMode === 'none'}
                            inputMode="decimal"
                            placeholder="0.00"
                            value={activeItem.deductValue}
                            onChange={(event) => updateItem(activeItem.id, (current) => ({ ...current, deductValue: event.target.value }))}
                          />
                        </FieldBlock>
                      </div>
                      <div className="mt-4 space-y-3">
                        {activeItem.buckets.map((bucket, index) => (
                          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]" key={bucket.id}>
                            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">ถัง {index + 1}</div>
                            <Input inputMode="decimal" placeholder="0.00" value={bucket.weight} onChange={(event) => updateBucket(activeItem.id, bucket.id, event.target.value)} />
                            <Button size="xs" type="button" variant="outline" onClick={() => removeBucket(activeItem.id, bucket.id)}>ลบ</Button>
                          </div>
                        ))}
                      </div>
                      <Button className="mt-4" size="sm" type="button" variant="outline" onClick={() => addBucket(activeItem.id)}>+ เพิ่มถัง</Button>
                    </Card>

                    <Card className="rounded-xl p-4">
                      <SectionHeader title="รูปแนบรายการนี้" subtitle="เช่น รูปกองสินค้า, สภาพผิว, ป้าย lot หรือหน้างานเฉพาะรายการ" />
                      <div className="mt-4">
                        <AttachmentUploader
                          files={activeItem.attachments}
                          label="ถ่ายรูป / เลือกรูป"
                          onAdd={(files) => appendAttachment(files, (nextFiles) => updateItem(activeItem.id, (current) => ({ ...current, attachments: [...current.attachments, ...nextFiles] })))}
                          onRemove={(fileId) => updateItem(activeItem.id, (current) => ({ ...current, attachments: current.attachments.filter((file) => file.id !== fileId) }))}
                        />
                      </div>
                    </Card>

                    <Card className="rounded-xl p-4">
                      <SectionHeader title="หมายเหตุรายการ" subtitle="ใช้กับของเปียก, มีเศษปน, ต้องหักพิเศษ หรือบันทึกคำอธิบายสินค้า" />
                      <textarea
                        className="mt-4 min-h-32 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-400"
                        placeholder="หมายเหตุเฉพาะรายการ"
                        value={activeItem.note}
                        onChange={(event) => updateItem(activeItem.id, (current) => ({ ...current, note: event.target.value }))}
                      />
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <Card className="rounded-xl bg-slate-950 p-4 text-white">
                      <SectionHeader className="text-white" subtitleClassName="text-slate-300" title="สรุปรายการนี้" subtitle="อัปเดต realtime ตาม bucket และค่าหัก" />
                      <div className="mt-4 grid gap-3">
                        <MiniMetric label="Gross" value={`${formatWeight(itemTotals(activeItem).grossWeight)} กก.`} />
                        <MiniMetric label="Deduct" value={`${formatWeight(itemTotals(activeItem).deductWeight)} กก.`} />
                        <MiniMetric label="Net" value={`${formatWeight(itemTotals(activeItem).netWeight)} กก.`} />
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
              <DialogFooter className="border-t bg-white">
                <Button type="button" variant="secondary" onClick={() => setItemDialogId(null)}>ปิด</Button>
                <button
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  type="button"
                  onClick={() => setItemDialogId(null)}
                >
                  ใช้ข้อมูลรายการนี้
                </button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SectionHeader({
  className,
  subtitle,
  subtitleClassName,
  title,
}: {
  className?: string
  subtitle: string
  subtitleClassName?: string
  title: string
}) {
  return (
    <div>
      <h3 className={cn('text-base font-semibold text-slate-900', className)}>{title}</h3>
      <p className={cn('mt-1 text-sm text-slate-500', subtitleClassName)}>{subtitle}</p>
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
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}

function SummaryStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">{icon}{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-300">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</div>
    </div>
  )
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold', done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500')}>
        {done ? '✓' : '!'}
      </span>
      <span className={done ? 'text-slate-700' : 'text-slate-500'}>{label}</span>
    </div>
  )
}

function AttachmentUploader({
  files,
  label,
  onAdd,
  onRemove,
}: {
  files: AttachmentPreview[]
  label: string
  onAdd: (files: FileList | null) => void
  onRemove: (fileId: string) => void
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-slate-800">{label}</div>
          <div className="text-xs text-slate-500">ถ่ายรูป / เลือกรูป ได้หลายไฟล์ พร้อม preview</div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100">
          <ImagePlus className="size-4" />
          ถ่ายรูป / เลือกรูป
          <input className="hidden" multiple type="file" accept="image/*" onChange={(event) => {
            onAdd(event.target.files)
            event.target.value = ''
          }}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {files.length === 0 ? <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-400 shadow-sm">ยังไม่มีรูป</div> : null}
        {files.map((file) => (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" key={file.id}>
            <Image alt={file.fileName} className="h-32 w-full object-cover" height={128} src={file.url} unoptimized width={320} />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0 text-xs text-slate-600">
                <div className="truncate font-medium text-slate-800">{file.fileName}</div>
              </div>
              <button className="text-slate-400 hover:text-red-500" type="button" onClick={() => onRemove(file.id)}>
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
