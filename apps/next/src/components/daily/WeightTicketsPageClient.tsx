'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ChevronDown, ImagePlus, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Card } from '@/components/ui/Card'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  calculateLineTotals,
  calculateTicketTotals,
  createWeightTicketLine,
  decodeStoredImageAsset,
  encodeStoredImageAsset,
  formatWeight,
  getWeightTicket,
  normalizeDecimalInput,
  normalizeVehicleNo,
  saveWeightTicket,
  type DeductionMode,
  type OptionItem,
  type WeightTicketRecord,
  type WeightTicketLine,
  type WeightTicketType,
} from '@/lib/weight-tickets'

type AttachmentPreview = {
  fileName: string
  id: string
  rawValue: string
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
  vehicleImageFiles: AttachmentPreview[]
  vehicleNo: string
}

type WeightTicketOptionsPayload = {
  branches?: Array<{ code?: string | null; id: string; name: string }>
  customers?: Array<{ code?: string | null; id: string; name: string }>
  impurities?: Array<{ id: string; label: string }>
  suppliers?: Array<{ code?: string | null; id: string; name: string }>
}

type WeightTicketProductsPayload = {
  rows?: Array<{ code?: string | null; id: string; imageStorageKey?: string | null; name: string; thumbnailUrl?: string | null; type?: string | null; unit?: string | null }>
}

type WtoStockWarehouseOption = {
  availableQty: number
  code: string
  id: string
  name: string
  onHandQty: number
  onHoldQty: number
  type: string
}

type WtoStockOptionsPayload = {
  warehouses?: WtoStockWarehouseOption[]
}

type WtoStockOptionsState = Record<string, {
  options: OptionItem[]
  warehousesById: Record<string, WtoStockWarehouseOption>
}>

function createFormWeightTicketLine(id?: string): FormWeightTicketLine {
  return {
    ...createWeightTicketLine(id),
    imageFiles: [],
  }
}

function initialForm(type: WeightTicketType = 'WTI'): FormState {
  return {
    branchId: '',
    lines: [createFormWeightTicketLine('line-1')],
    partyId: '',
    remark: '',
    type,
    vehicleImageFiles: [],
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

function createAttachmentPreview(fileName: string): AttachmentPreview {
  const parsed = decodeStoredImageAsset(fileName)
  return {
    fileName: parsed.fileName,
    id: makeFileId(),
    rawValue: parsed.rawValue,
    url: parsed.url ?? '',
  }
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  })
}

async function createAttachmentPreviewFromFile(file: File): Promise<AttachmentPreview> {
  const dataUrl = await fileToDataUrl(file)
  return {
    fileName: file.name,
    id: makeFileId(),
    rawValue: encodeStoredImageAsset(file.name, dataUrl),
    url: dataUrl,
  }
}

function ticketToFormState(ticket: WeightTicketRecord): FormState {
  return {
    branchId: ticket.branchId,
    lines: ticket.lines.map((line) => ({
      deductionMode: line.deductionMode,
      deductionValue: line.deductionValue,
      grossWeight: line.grossWeight,
      id: line.id,
      imageNames: line.imageNames,
      imageFiles: line.imageNames.map(createAttachmentPreview),
      impurityId: line.impurityId,
      note: line.note,
      productId: line.productId,
      warehouseId: line.warehouseId,
    })),
    partyId: ticket.partyId,
    remark: ticket.remark,
    type: ticket.type,
    vehicleImageFiles: ticket.vehicleImageNames.map(createAttachmentPreview),
    vehicleNo: ticket.vehicleNo,
  }
}

export function WeightTicketsPageClient({
  initialType = 'WTI',
  lockType = false,
  ticketId = '',
  onClose,
  onSaveSuccess,
}: {
  initialType?: WeightTicketType
  lockType?: boolean
  ticketId?: string
  onClose?: () => void
  onSaveSuccess?: (ticket: WeightTicketRecord) => void
}) {
  const router = useRouter()
  const editingTicketId = ticketId.trim()
  const [form, setForm] = useState<FormState>(() => initialForm(initialType))
  const [branches, setBranches] = useState<OptionItem[]>([])
  const [suppliers, setSuppliers] = useState<OptionItem[]>([])
  const [customers, setCustomers] = useState<OptionItem[]>([])
  const [products, setProducts] = useState<OptionItem[]>([])
  const [stockOptions, setStockOptions] = useState<WtoStockOptionsState>({})
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [impurities, setImpurities] = useState<OptionItem[]>([])
  const [loadedTicket, setLoadedTicket] = useState<WeightTicketRecord | null>(null)
  const [savedTicket, setSavedTicket] = useState<WeightTicketRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingTicket, setIsLoadingTicket] = useState(Boolean(editingTicketId))
  const [loadError, setLoadError] = useState('')
  const [previewImage, setPreviewImage] = useState<AttachmentPreview | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [activeLineId, setActiveLineId] = useState(form.lines[0]?.id ?? '')

  const partyOptions = form.type === 'WTI' ? suppliers : customers
  const totals = useMemo(() => calculateTicketTotals(form.lines), [form.lines])
  const wtoProductKeys = useMemo(() => {
    if (form.type !== 'WTO' || !form.branchId) return []
    return [...new Set(form.lines.map((line) => line.productId).filter(Boolean))]
  }, [form.branchId, form.lines, form.type])
  const activeLine = useMemo(
    () => form.lines.find((line) => line.id === activeLineId) ?? form.lines[0] ?? null,
    [activeLineId, form.lines],
  )
  const loadProducts = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingProducts(true)
    try {
      const response = await fetch('/api/daily/weight-tickets/products', { cache: 'no-store', signal })
      if (!response.ok) throw new Error('โหลดรายการสินค้าไม่ได้')
      const data = await response.json() as WeightTicketProductsPayload
      if (signal?.aborted) return
      setProducts((data.rows ?? []).map((product) => ({
        category: product.type ?? undefined,
        code: product.code ?? undefined,
        description: product.type || undefined,
        id: product.id,
        imageUrl: product.thumbnailUrl ?? undefined,
        label: `${product.code ? `${product.code} - ` : ''}${product.name}${product.unit ? ` - ${product.unit}` : ''}`,
        name: product.name,
      })))
    } catch (caught) {
      if (!signal?.aborted) setLoadError(getErrorMessage(caught, 'โหลดรายการสินค้าไม่ได้'))
    } finally {
      if (!signal?.aborted) setIsLoadingProducts(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function loadOptionData() {
      try {
        const response = await fetch('/api/daily/weight-tickets/options', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('โหลดข้อมูลอ้างอิงสำหรับใบรับ-ส่งของไม่ได้')
        const data = await response.json() as WeightTicketOptionsPayload

        if (!cancelled) {
          setBranches((data.branches ?? []).map((branch) => ({
            code: branch.code ?? undefined,
            description: branch.code ? `รหัสสาขา ${branch.code}` : undefined,
            id: branch.id,
            label: branch.name,
          })))
          setSuppliers((data.suppliers ?? []).map((supplier) => {
            const code = supplier.code?.trim() ?? ''
            return {
              code: code || undefined,
              description: code ? `Supplier · ${code}` : 'Supplier',
              id: supplier.id,
              label: supplier.name,
              searchText: [code, supplier.name].filter(Boolean).join(' '),
            }
          }))
          setCustomers((data.customers ?? []).map((customer) => {
            const code = customer.code?.trim() ?? ''
            return {
              code: code || undefined,
              description: code ? `Customer · ${code}` : 'Customer',
              id: customer.id,
              label: customer.name,
              searchText: [code, customer.name].filter(Boolean).join(' '),
            }
          }))
          setImpurities(data.impurities ?? [])
          void loadProducts(controller.signal)
        }
      } catch (caught) {
        if (!cancelled && !controller.signal.aborted) setLoadError(getErrorMessage(caught, 'โหลดข้อมูลอ้างอิงสำหรับใบรับ-ส่งของไม่ได้'))
      }
    }

    void loadOptionData()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [loadProducts])

  useEffect(() => {
    if (form.type !== 'WTO' || !form.branchId || wtoProductKeys.length === 0) {
      setStockOptions({})
      return
    }

    const controller = new AbortController()
    let cancelled = false

    async function loadStockOptions() {
      const entries = await Promise.all(wtoProductKeys.map(async (productId) => {
        const params = new URLSearchParams({ branchId: form.branchId, productId })
        const response = await fetch(`/api/daily/weight-tickets/stock-options?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('โหลดข้อมูลคลังและคงเหลือไม่ได้')
        const data = await response.json() as WtoStockOptionsPayload
        const warehouses = data.warehouses ?? []
        const key = `${form.branchId}:${productId}`
        return [key, {
          options: warehouses.map((warehouse) => ({
            description: `${warehouse.type} · พร้อมส่ง ${formatWeight(warehouse.availableQty)} กก.`,
            id: warehouse.id,
            label: `${warehouse.code} - ${warehouse.name}`,
            searchText: `${warehouse.code} ${warehouse.name} ${warehouse.type}`,
          })),
          warehousesById: Object.fromEntries(warehouses.map((warehouse) => [warehouse.id, warehouse] as const)),
        }] as const
      }))
      if (!cancelled) setStockOptions(Object.fromEntries(entries))
    }

    void loadStockOptions().catch((caught) => {
      if (!cancelled && !controller.signal.aborted) setLoadError(getErrorMessage(caught, 'โหลดข้อมูลคลังและคงเหลือไม่ได้'))
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [form.branchId, form.type, wtoProductKeys])

  useEffect(() => {
    if (!editingTicketId) {
      setIsLoadingTicket(false)
      setLoadedTicket(null)
      return
    }

    let cancelled = false

    async function loadTicket() {
      setIsLoadingTicket(true)
      setLoadError('')
      try {
        const ticket = await getWeightTicket(editingTicketId)
        if (cancelled) return
        setLoadedTicket(ticket)
        setForm(ticketToFormState(ticket))
        setSavedTicket(null)
        setActiveLineId(ticket.lines[0]?.id ?? '')
        setTouched({})
      } catch (caught) {
        if (!cancelled) setLoadError(getErrorMessage(caught, 'โหลดใบรับ-ส่งของที่ต้องการแก้ไขไม่ได้'))
      } finally {
        if (!cancelled) setIsLoadingTicket(false)
      }
    }

    void loadTicket()
    return () => {
      cancelled = true
    }
  }, [editingTicketId])

  useEffect(() => {
    if (form.lines.length === 0) {
      setActiveLineId('')
      return
    }
    if (!form.lines.some((line) => line.id === activeLineId)) {
      setActiveLineId(form.lines[0]?.id ?? '')
    }
  }, [activeLineId, form.lines])

  const errors = useMemo(() => {
    const next: Record<string, string> = {}
    if (!form.branchId) next.branchId = 'เลือกสาขา'
    if (!form.partyId) next.partyId = form.type === 'WTI' ? 'เลือกผู้ขาย' : 'เลือกลูกค้า'
    if (form.vehicleNo.trim().length < 2) next.vehicleNo = 'กรอกทะเบียนรถ'

    form.lines.forEach((line, index) => {
      const lineTotals = calculateLineTotals(line)
      if (!line.productId) next[`line-${line.id}-product`] = `เลือกสินค้าบรรทัดที่ ${index + 1}`
      if (form.type === 'WTO' && !line.warehouseId) next[`line-${line.id}-warehouse`] = `เลือกคลังบรรทัดที่ ${index + 1}`
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
  const typeSelectionLocked = lockType || Boolean(editingTicketId)

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
    const nextLine = createFormWeightTicketLine()
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }))
    setActiveLineId(nextLine.id)
  }

  function removeLine(lineId: string) {
    setForm((current) => {
      if (current.lines.length === 1) return current
      const nextLines = current.lines.filter((line) => line.id !== lineId)
      return {
        ...current,
        lines: nextLines,
      }
    })
  }

  async function appendLineImages(lineId: string, files: FileList | null) {
    if (!files?.length) return
    const nextFiles = await Promise.all(Array.from(files).map(createAttachmentPreviewFromFile))
    updateLine(lineId, (line) => ({ ...line, imageFiles: [...getLineImages(line), ...nextFiles] }))
    markTouched(`line-${lineId}-images`)
  }

  async function appendVehicleImages(files: FileList | null) {
    if (!files?.length) return
    const nextFiles = await Promise.all(Array.from(files).map(createAttachmentPreviewFromFile))
    setForm((current) => ({ ...current, vehicleImageFiles: [...current.vehicleImageFiles, ...nextFiles] }))
  }

  function removeVehicleImage(fileId: string) {
    setForm((current) => ({
      ...current,
      vehicleImageFiles: current.vehicleImageFiles.filter((file) => file.id !== fileId),
    }))
  }

  function backToList() {
    if (onClose) {
      onClose()
    } else {
      router.push(`/daily/weight-ticket-list?type=${form.type}`)
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
      nextTouched[`line-${line.id}-warehouse`] = true
      nextTouched[`line-${line.id}-gross`] = true
      nextTouched[`line-${line.id}-deduction`] = true
      nextTouched[`line-${line.id}-images`] = true
      nextTouched[`line-${line.id}-impurity`] = true
    })
    setTouched(nextTouched)
    if (Object.keys(errors).length > 0) return

    setIsSaving(true)
    try {
      const ticket = await saveWeightTicket({
        branchId: form.branchId,
        id: editingTicketId || undefined,
        lines: form.lines.map((line) => ({
          deductionMode: line.deductionMode,
          deductionValue: Number(line.deductionValue || 0),
          grossWeight: Number(line.grossWeight || 0),
          id: line.id,
          imageNames: getLineImages(line).map((file) => file.rawValue),
          impurityId: getLineImpurityId(line),
          note: line.note,
          productId: line.productId,
          warehouseId: line.warehouseId,
        })),
        partyId: form.partyId,
        remark: form.remark.trim(),
        type: form.type,
        vehicleImageNames: form.vehicleImageFiles.map((file) => file.rawValue),
        vehicleNo: form.vehicleNo.trim(),
      })
      setLoadError('')
      setLoadedTicket(ticket)
      setSavedTicket(ticket)
      setForm(ticketToFormState(ticket))
      if (onSaveSuccess) {
        onSaveSuccess(ticket)
      } else {
        router.push(`/daily/weight-ticket-list?type=${ticket.type}`)
      }
    } catch (caught) {
      setLoadError(getErrorMessage(caught, editingTicketId ? 'แก้ไขใบรับ-ส่งของไม่ได้' : 'บันทึกใบรับ-ส่งของไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-w-0 overflow-x-hidden">
      <div className={cn("min-w-0 space-y-5", onClose ? "p-4 sm:p-5 pb-6" : "pb-32")}>
        {!onClose && (
        <div>
          <Button type="button" variant="outline" onClick={backToList}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            กลับไปหน้ารายการ
          </Button>
        </div>
      )}
      <div>
        {typeSelectionLocked ? (
          <div className={cn('inline-flex rounded-md px-3 py-1.5 text-sm font-semibold', ticketTheme.badge)}>
            {form.type === 'WTI' ? 'ใบรับของ WTI' : 'ใบส่งของ WTO'}
          </div>
        ) : (
          <Tabs value={form.type} onValueChange={(value) => setForm((current) => ({
            ...current,
            lines: current.lines.map((line) => ({ ...line, warehouseId: '' })),
            partyId: '',
            type: value as WeightTicketType,
          }))}>
            <TabsList className="w-full justify-start" variant="line">
              <TabsTrigger value="WTI" variant="line">ใบรับของ WTI</TabsTrigger>
              <TabsTrigger value="WTO" variant="line">ใบส่งของ WTO</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {loadError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}

      <div>
        <div className="space-y-5">
          <Card className={cn(onClose ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
            <SectionHeader title="ข้อมูลหัวเอกสาร" subtitle="ผู้ใช้เลือกเฉพาะข้อมูลหน้างาน ส่วนวันที่ เวลา และผู้กรอกเป็นข้อมูลระบบ" />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <BranchSelectCombobox
                branches={branches.map((branch) => ({
                  id: branch.id,
                  name: branch.label,
                }))}
                error={showError('branchId')}
                inputId="weight-ticket-branch"
                label="สาขา*"
                placeholder="เลือกสาขา"
                value={form.branchId}
	                onChange={(value) => {
	                  markTouched('branchId')
	                  setForm((current) => ({
	                    ...current,
	                    branchId: value ?? '',
	                    lines: current.lines.map((line) => ({ ...line, warehouseId: '' })),
	                  }))
	                }}
              />
              <SearchCombobox
                error={showError('partyId')}
                inputId="weight-ticket-party"
                label={form.type === 'WTI' ? 'ผู้ขาย*' : 'ลูกค้า*'}
                options={partyOptions}
                placeholder={form.type === 'WTI' ? 'ค้นหาชื่อหรือรหัสผู้ขาย' : 'ค้นหารหัสหรือชื่อลูกค้า'}
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
              <FieldBlock label="รูปภาพรถส่งของ">
                <AttachmentProfileGrid
                  addLabel="เพิ่มรูป"
                  emptyLabel="ยังไม่มีรูปภาพรถ"
                  files={form.vehicleImageFiles}
                  onAppend={(files) => void appendVehicleImages(files)}
                  onPreview={setPreviewImage}
                  onRemove={removeVehicleImage}
                />
              </FieldBlock>
            </div>
          </Card>

          <Card className={cn(onClose ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
            <SectionHeader title="สินค้าและน้ำหนัก" subtitle="เลือกสินค้า กรอกน้ำหนัก และเลือกวิธีหักสิ่งเจือปนต่อรายการ" />
            <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="min-w-0 space-y-3 xl:max-h-[calc(100vh-16rem)] xl:overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-700">รายการทั้งหมด {form.lines.length} รายการ</div>
                  <Button size="xs" type="button" onClick={addLine}>
                    <Plus className="mr-1 size-3" />
                    เพิ่ม
                  </Button>
                </div>
                <div className="space-y-2 xl:max-h-[calc(100vh-19rem)] xl:overflow-y-auto xl:pr-1">
                  {form.lines.map((line, index) => {
                    const lineTotals = calculateLineTotals(line)
                    const hasError = Boolean(
                      errors[`line-${line.id}-product`]
                      || errors[`line-${line.id}-gross`]
	                      || errors[`line-${line.id}-images`]
	                      || errors[`line-${line.id}-impurity`]
	                      || errors[`line-${line.id}-warehouse`]
	                      || errors[`line-${line.id}-deduction`],
                    )
                    const active = activeLine?.id === line.id

                    return (
                      <button
                        className={cn(
                          'block w-full rounded-md border px-3 py-3 text-left transition',
                          active ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                        )}
                        key={line.id}
                        type="button"
                        onClick={() => setActiveLineId(line.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-slate-500">รายการ {index + 1}</div>
                            <div className="mt-1 line-clamp-1 text-sm font-medium text-slate-900">
                              {products.find((option) => option.id === line.productId)?.label || line.productId || 'ยังไม่ได้เลือกสินค้า'}
                            </div>
                          </div>
                          {hasError ? <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">ไม่ครบ</span> : null}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                          <div>สุทธิ {formatWeight(lineTotals.netWeight)} กก.</div>
                          <div className="text-right">{getLineImages(line).length} รูป</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {activeLine ? (() => {
                const line = activeLine
                const index = form.lines.findIndex((entry) => entry.id === line.id)
                const lineTotals = calculateLineTotals(line)

                return (
                  <div className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-3 sm:p-4 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto">
                    <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
                      <div className="inline-flex rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">รายการ {index + 1}</div>
                      <Button disabled={form.lines.length === 1} size="xs" type="button" variant="outline" onClick={() => removeLine(line.id)}>
                        <Trash2 className="mr-1 size-3" />
                        ลบ
                      </Button>
                    </div>
                    <div className={cn(
                      'grid min-w-0 gap-4',
	                      line.deductionMode === 'none'
	                        ? form.type === 'WTO'
	                          ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_10rem_10rem_10rem]'
	                          : 'xl:grid-cols-[minmax(0,1.4fr)_10rem_10rem_10rem]'
	                        : form.type === 'WTO'
	                          ? 'xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_10rem_10rem_minmax(0,1fr)_10rem]'
	                          : 'xl:grid-cols-[minmax(0,1.3fr)_10rem_10rem_minmax(0,1fr)_10rem]',
                    )}
                    >
                      <div className="min-w-0">
                        <SearchCombobox
                          disabled={isLoadingProducts}
                          error={showError(`line-${line.id}-product`)}
                          inputId={`weight-product-${line.id}`}
                          label="สินค้า*"
                          options={products}
                          placeholder={isLoadingProducts ? 'กำลังโหลดสินค้า...' : 'เลือกสินค้า'}
                          value={line.productId}
	                          onChange={(value) => {
	                            markTouched(`line-${line.id}-product`)
	                            updateLine(line.id, (current) => ({ ...current, productId: value, warehouseId: '' }))
	                          }}
                        />
	                      </div>
	                      {form.type === 'WTO' ? (() => {
	                        const stockKey = `${form.branchId}:${line.productId}`
	                        const stock = stockOptions[stockKey]
	                        const selectedWarehouse = line.warehouseId ? stock?.warehousesById[line.warehouseId] : null
	                        return (
	                          <div className="min-w-0">
	                            <SearchCombobox
	                              disabled={!form.branchId || !line.productId}
	                              error={showError(`line-${line.id}-warehouse`)}
	                              inputId={`weight-warehouse-${line.id}`}
	                              label="คลัง*"
	                              options={stock?.options ?? []}
	                              placeholder={!form.branchId ? 'เลือกสาขาก่อน' : !line.productId ? 'เลือกสินค้าก่อน' : 'เลือกคลัง RM/FG'}
	                              value={line.warehouseId}
	                              onChange={(value) => {
	                                markTouched(`line-${line.id}-warehouse`)
	                                updateLine(line.id, (current) => ({ ...current, warehouseId: value }))
	                              }}
	                            />
	                            {selectedWarehouse ? (
	                              <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-slate-500">
	                                <span>คงเหลือ {formatWeight(selectedWarehouse.onHandQty)}</span>
	                                <span>จอง {formatWeight(selectedWarehouse.onHoldQty)}</span>
	                                <span className="font-medium text-slate-700">พร้อมส่ง {formatWeight(selectedWarehouse.availableQty)}</span>
	                              </div>
	                            ) : null}
	                          </div>
	                        )
	                      })() : null}
	                      <FieldBlock error={showError(`line-${line.id}-gross`)} label="น้ำหนักรวม (กก. / ลัง) *">
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={line.grossWeight}
                          onBlur={() => markTouched(`line-${line.id}-gross`)}
                          onChange={(event) => updateLine(line.id, (current) => ({ ...current, grossWeight: normalizeDecimalInput(event.target.value) }))}
                        />
                      </FieldBlock>
                      <FieldBlock label="หักสิ่งเจือปน">
                        <SimpleDropdown
                          options={[
                            { label: 'ไม่หัก', value: 'none' },
                            { label: 'หัก', value: 'kg' },
                            { label: 'หัก %', value: 'percent' },
                          ]}
                          value={line.deductionMode}
                          onChange={(value) => {
                            const deductionMode = value as DeductionMode
                            updateLine(line.id, (current) => ({
                              ...current,
                              deductionMode,
                              deductionValue: '',
                              impurityId: deductionMode === 'none' ? '' : getLineImpurityId(current),
                            }))
                          }}
                        />
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
                      {line.deductionMode !== 'none' ? (
                        <FieldBlock error={showError(`line-${line.id}-deduction`)} label={line.deductionMode === 'percent' ? 'ค่าหัก %' : 'น้ำหนักหัก กก.'}>
                          <Input
                            inputMode="decimal"
                            placeholder="0.00"
                            value={line.deductionValue}
                            onBlur={() => markTouched(`line-${line.id}-deduction`)}
                            onChange={(event) => updateLine(line.id, (current) => ({ ...current, deductionValue: normalizeDecimalInput(event.target.value) }))}
                          />
                        </FieldBlock>
                      ) : null}
                    </div>

                    <ProductImagePicker
                      key={`${form.branchId}:${form.partyId}:${form.type}`}
                      disabled={isLoadingProducts}
                      products={products}
                      value={line.productId}
                      onChange={(value) => {
                        markTouched(`line-${line.id}-product`)
                        updateLine(line.id, (current) => ({ ...current, productId: value, warehouseId: '' }))
                      }}
                      buttonClassName={ticketTheme.button}
                    />

                    <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4">
                      <MiniMetric label="Gross" value={`${formatWeight(lineTotals.grossWeight)} กก.`} />
                      <MiniMetric label="Deduct" value={`${formatWeight(lineTotals.deductionWeight)} กก.`} />
                      <MiniMetric label="Net" value={`${formatWeight(lineTotals.netWeight)} กก.`} />
                    </div>
                    <div className="mt-4">
                      <FieldBlock error={showError(`line-${line.id}-images`)} label="รูปภาพรายการสินค้า*">
                        <AttachmentProfileGrid
                          addLabel="เพิ่มรูป"
                          emptyLabel="ยังไม่มีรูปภาพรายการนี้"
                          files={getLineImages(line)}
                          onAppend={(files) => void appendLineImages(line.id, files)}
                          onPreview={setPreviewImage}
                          onRemove={(fileId) => updateLine(line.id, (current) => ({
                            ...current,
                            imageFiles: getLineImages(current).filter((entry) => entry.id !== fileId),
                          }))}
                        />
                      </FieldBlock>
                    </div>
                    <div className="mt-4">
                      <FieldBlock label="หมายเหตุรายการ">
                        <textarea
                          className="min-h-[88px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                          placeholder="เช่น ของเปียก มีเศษปน หรือรายละเอียดหน้างาน"
                          rows={3}
                          value={line.note}
                          onChange={(event) => updateLine(line.id, (current) => ({ ...current, note: event.target.value.slice(0, 160) }))}
                        />
                      </FieldBlock>
                    </div>
                  </div>
                )
              })() : null}
            </div>
          </Card>

          <Card className={cn(onClose ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
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
      </div>

      <div className={cn(
        onClose
          ? "sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50 px-4 py-3 shrink-0"
          : "fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm lg:left-64"
      )}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 w-full sm:w-auto flex justify-center sm:block">
            {savedTicket ? (
              <div className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="size-4" />
                บันทึก {savedTicket.documentNo} แล้ว
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm sm:justify-start sm:gap-x-8">
                <MetricInline label="รายการ" value={`${form.lines.length} รายการ`} />
                <MetricInline label="น้ำหนักรวม" value={`${formatWeight(totals.grossWeight)} กก.`} />
                <MetricInline label="หัก" value={`${formatWeight(totals.deductionWeight)} กก.`} />
                <MetricInline emphasis label="สุทธิ" value={`${formatWeight(totals.netWeight)} กก.`} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end sm:justify-end ml-auto">
            <Button disabled={isLoadingTicket || isSaving} type="button" variant="outline" onClick={backToList}>
              {!onClose && <ArrowLeft className="mr-1 h-4 w-4" />}
              {onClose ? 'ปิด' : 'กลับไปหน้ารายการ'}
            </Button>
            <Button className="bg-slate-900 font-normal hover:bg-slate-800 text-white" disabled={isLoadingTicket || isSaving} type="button" onClick={saveTicket}>
              {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => setPreviewImage(open ? previewImage : null)}>
        <DialogContent className="max-w-4xl !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
          {previewImage ? (
            <>
              <DialogHeader>
                <DialogTitle>รูปภาพแนบ</DialogTitle>
                <DialogDescription>{previewImage.fileName}</DialogDescription>
              </DialogHeader>
              <div className="overflow-hidden rounded-md bg-slate-950">
                <Image
                  alt={previewImage.fileName}
                  className="max-h-[70vh] w-full object-contain"
                  height={1200}
                  src={previewImage.url}
                  unoptimized
                  width={1600}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
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

function SimpleDropdown({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <Combobox
        items={options.map((option) => ({ label: option.label, value: option.value }))}
        value={value}
        onValueChange={onChange}
      >
        <ComboboxInput
          className="h-10 rounded-md py-2 pl-4 text-sm text-slate-900"
          inputGroupClassName="h-10 rounded-md border-slate-300 bg-white"
          placeholder=""
          readOnly
          withDropdownButton
        />
        <ComboboxContent>
          <ComboboxEmpty>ไม่พบข้อมูลที่ตรงกับคำค้นหา</ComboboxEmpty>
          <ComboboxList>
            {(item) => {
              const option = typeof item === 'string' ? { label: item, value: item } : item
              const active = option.value === value
              return (
                <button
                  key={option.value}
                  aria-selected={active}
                  className={cn(
                    'block w-full rounded-md px-4 py-2 text-left text-sm hover:bg-blue-50',
                    active ? 'bg-blue-100 text-blue-800' : 'text-slate-700',
                  )}
                  role="option"
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onChange(option.value)
                  }}
                >
                  <span className="block font-medium">{option.label}</span>
                </button>
              )
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
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

function ProductImagePicker({
  disabled,
  products,
  value,
  onChange,
  buttonClassName,
}: {
  disabled: boolean
  products: OptionItem[]
  value: string
  onChange: (value: string) => void
  buttonClassName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [category, setCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [tempSelectedId, setTempSelectedId] = useState('')

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category?.trim()).filter((item): item is string => Boolean(item)))).sort((a, b) => a.localeCompare(b, 'th', { numeric: true })),
    [products],
  )

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = category === 'all' || product.category === category
      const matchesQuery = !searchQuery.trim() ||
        (product.name ?? product.label ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (product.code ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      return matchesCategory && matchesQuery
    })
  }, [category, searchQuery, products])

  const selectedProduct = useMemo(() => products.find((p) => p.id === value), [products, value])

  if (disabled) return null

  const handleConfirmSelection = () => {
    onChange(tempSelectedId)
    setIsOpen(false)
    setSearchQuery('')
    setCategory('all')
  }

  const handleCancel = () => {
    setIsOpen(false)
    setSearchQuery('')
    setCategory('all')
  }

  return (
    <div className="mt-2">
      <Button
        type="button"
        onClick={() => {
          setTempSelectedId(value)
          setIsOpen(true)
        }}
        className={cn(
          "w-full text-white flex items-center justify-center gap-1.5 h-10 rounded-md text-xs font-semibold",
          buttonClassName || "bg-slate-900 hover:bg-slate-800"
        )}
      >
        <Plus className="h-4 w-4" />
        เพิ่มสินค้า
      </Button>

      {selectedProduct ? (
        <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2 shadow-sm">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-100 border border-slate-100">
            {selectedProduct.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedProduct.imageUrl} alt={selectedProduct.name ?? selectedProduct.label} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <ImagePlus className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{selectedProduct.category || 'ทั่วไป'}</div>
            <div className="truncate text-xs font-semibold text-slate-800">{selectedProduct.name ?? selectedProduct.label}</div>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 transition"
          >
            ล้าง
          </button>
        </div>
      ) : null}

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel() }}>
        <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="px-5 pt-4 pb-4 rounded-t-xl flex flex-row items-center justify-between bg-slate-900 border-none">
            <div className="flex items-center gap-2">
              <span className="text-lg">📦</span>
              <DialogTitle className="text-base font-bold text-white">เพิ่มสินค้า</DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 min-h-0">
            {/* Search input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 h-10 w-full text-slate-800 border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="ค้นหาสินค้า..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Category pills */}
            <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200">
              <button
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  category === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
                )}
                type="button"
                onClick={() => setCategory('all')}
              >
                ทั้งหมด
              </button>
              {categories.map((item) => (
                <button
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    category === item ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
                  )}
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            {/* Grid of products */}
            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filteredProducts.map((product) => {
                  const selected = product.id === tempSelectedId
                  return (
                    <button
                      className={cn(
                        'overflow-hidden rounded-xl border bg-white text-left transition duration-150 flex flex-col group relative',
                        selected
                          ? 'border-blue-600 ring-2 ring-blue-100 bg-blue-50/20'
                          : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
                      )}
                      key={product.id}
                      type="button"
                      onClick={() => setTempSelectedId(product.id)}
                    >
                      <div className="aspect-square w-full bg-slate-50 overflow-hidden border-b border-slate-100 relative">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt={product.name ?? product.label} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" src={product.imageUrl} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-300 bg-slate-50">
                            <ImagePlus className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className={cn(
                        'w-full px-2.5 py-2 text-center text-xs sm:text-sm font-bold leading-tight flex-1 flex items-center justify-center min-h-[3rem]',
                        selected ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-800 group-hover:bg-slate-100'
                      )}>
                        <span className="line-clamp-2 break-words">{product.name ?? product.label}</span>
                      </div>
                    </button>
                  )
                })}
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">ไม่พบสินค้า</div>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-row justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="h-10 px-4 font-semibold text-slate-700 border-slate-300 bg-white hover:bg-slate-50"
            >
              ยกเลิก
            </Button>
            <Button
              disabled={!tempSelectedId}
              type="button"
              onClick={handleConfirmSelection}
              className={cn(
                "h-10 px-5 font-semibold text-white transition",
                tempSelectedId ? "bg-slate-900 hover:bg-slate-800" : "bg-slate-300 cursor-not-allowed"
              )}
            >
              + เพิ่ม
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AttachmentProfileGrid({
  addLabel,
  emptyLabel,
  files,
  onAppend,
  onPreview,
  onRemove,
}: {
  addLabel: string
  emptyLabel: string
  files: AttachmentPreview[]
  onAppend: (files: FileList | null) => void
  onPreview: (file: AttachmentPreview) => void
  onRemove: (fileId: string) => void
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap gap-3">
        {files.map((file) => (
          <div className="w-28 min-w-0" key={file.id}>
            <button
              className="group relative block h-28 w-28 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 hover:border-slate-400"
              disabled={!file.url}
              title={file.fileName}
              type="button"
              onClick={() => file.url ? onPreview(file) : undefined}
            >
              {file.url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={file.fileName} className="h-full w-full object-cover" src={file.url} />
                  <span className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-2 py-1.5 text-center text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                    เปิดรูปภาพ
                  </span>
                </>
              ) : (
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-400">รูปเดิม</span>
              )}
            </button>
            <div className="mt-2 truncate text-xs text-slate-600" title={file.fileName}>{file.fileName}</div>
            <button className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline" type="button" onClick={() => onRemove(file.id)}>
              <Trash2 className="h-3 w-3" />
              ลบ
            </button>
          </div>
        ))}
        <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white p-3 text-center text-xs font-medium text-slate-500 shadow-sm hover:border-slate-400 hover:bg-slate-50">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <ImagePlus className="h-5 w-5" />
          </span>
          {files.length === 0 ? emptyLabel : addLabel}
          <input
            accept="image/*"
            className="hidden"
            multiple
            type="file"
            onChange={(event) => {
              onAppend(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
      </div>
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

function MetricInline({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={cn('font-semibold tabular-nums', emphasis ? 'text-emerald-700' : 'text-slate-900')}>{value}</div>
    </div>
  )
}

