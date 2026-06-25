'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ChevronDown, ImagePlus, Plus, Search, Trash2, Scale, Box, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Card } from '@/components/ui/Card'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError, getErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  calculateLineTotals,
  calculateTicketTotals,
  createWeightTicketLine,
  decodeStoredImageAsset,
  encodeStoredImageAsset,
  formatWeight,
  getWeightTicket,
  isOtherProductImpurityId,
  isOtherProductImpurityLabel,
  normalizeDecimalInput,
  normalizeVehicleNo,
  OTHER_PRODUCT_IMPURITY_ID,
  OTHER_PRODUCT_IMPURITY_LABEL,
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
  impurityPurchaseAction?: 'none' | 'buy'
  impurityProductId?: string
  impuritySourceLineId?: string
}

type FormState = {
  branchId: string
  lines: FormWeightTicketLine[]
  partyId: string
  remark: string
  type: WeightTicketType
  vehicleImageFiles: AttachmentPreview[]
  vehicleNo: string
  warehouseName: string
}

type WeightTicketOptionsPayload = {
  branches?: Array<{ code?: string | null; id: string; name: string }>
  customers?: Array<{ branchIds?: string[]; code?: string | null; id: string; name: string }>
  impurities?: Array<{ id: string; label: string }>
  suppliers?: Array<{ branchIds?: string[]; code?: string | null; id: string; name: string }>
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
    warehouseName: '',
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

function isOtherProductImpurityOption(impurityId: string) {
  return isOtherProductImpurityId(impurityId)
}

function isImpurityPurchaseLine(line: FormWeightTicketLine) {
  return Boolean(line.impuritySourceLineId)
}

function getMainParentLines(lines: FormWeightTicketLine[]) {
  return lines.filter((line) => !line.parentId)
}

function getBoughtImpurityEntriesForLine(line: FormWeightTicketLine, allLines: FormWeightTicketLine[]) {
  const targetEntries = allLines
    .filter((entry) => entry.impuritySourceLineId && (entry.id === line.id || entry.parentId === line.id))
    .map((purchaseLine) => ({
      purchaseLine,
      sourceLine: allLines.find((entry) => entry.id === purchaseLine.impuritySourceLineId),
    }))
    .filter((entry): entry is { purchaseLine: FormWeightTicketLine; sourceLine: FormWeightTicketLine } =>
      Boolean(entry.sourceLine?.impurityPurchaseAction === 'buy' && entry.sourceLine.impurityProductId),
    )

  const byId = new Map<string, { purchaseLine?: FormWeightTicketLine; sourceLine: FormWeightTicketLine }>()
  targetEntries.forEach((entry) => byId.set(entry.sourceLine.id, entry))
  return [...byId.values()]
}

function removeImpurityPurchaseLinesForSource(lines: FormWeightTicketLine[], sourceLineId: string) {
  const purchaseLines = lines.filter((line) => line.impuritySourceLineId === sourceLineId)
  const purchaseLineIds = new Set(purchaseLines.map((line) => line.id))
  const promotedParentByPurchaseId = new Map<string, string>()
  const promotedLineIds = new Set<string>()

  purchaseLines.forEach((purchaseLine) => {
    if (purchaseLine.parentId) return
    const realChildLots = lines.filter((line) =>
      line.parentId === purchaseLine.id
      && !isImpurityPurchaseLine(line)
      && (Number(line.grossWeight || 0) > 0 || !line.impurityId)
    )
    const promotedLine = realChildLots[0]
    if (!promotedLine) return
    promotedParentByPurchaseId.set(purchaseLine.id, promotedLine.id)
    promotedLineIds.add(promotedLine.id)
  })

  return lines.flatMap((line) => {
    if (purchaseLineIds.has(line.id)) return []
    if (promotedLineIds.has(line.id)) {
      return [{ ...line, parentId: undefined }]
    }
    if (line.parentId && promotedParentByPurchaseId.has(line.parentId)) {
      return [{ ...line, parentId: promotedParentByPurchaseId.get(line.parentId)! }]
    }
    return [line]
  })
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

function calculateAdjustedLineTotals(line: FormWeightTicketLine, allLines: FormWeightTicketLine[]) {
  const isImpurity = !!line.parentId && line.deductionMode !== 'none';
  const isSecondaryLot = !!line.parentId && line.deductionMode === 'none';

  if (isImpurity) {
    const parentLine = allLines.find(l => l.id === line.parentId)
    const realLotSummary = parentLine
      ? calculateRealLotSummary(parentLine, allLines)
      : { netBeforeImpurityWeight: 0 }
    const deductionWeight = line.deductionMode === 'percent'
      ? realLotSummary.netBeforeImpurityWeight * Math.max(0, Number(line.deductionValue || 0)) / 100
      : line.deductionMode === 'kg'
        ? Math.max(0, Number(line.deductionValue || 0))
        : 0
    return {
      containerDeductionWeight: 0,
      deductionWeight,
      grossWeight: 0,
      netWeight: 0,
    }
  }

  if (isSecondaryLot) {
    const childTotals = calculateLineTotals(line)
    return {
      containerDeductionWeight: childTotals.containerDeductionWeight,
      deductionWeight: 0,
      grossWeight: childTotals.grossWeight,
      netWeight: childTotals.netWeight,
    }
  }

  // Parent line: sum up parent totals + secondary lots' totals - impurities
  const parentTotals = calculateLineTotals(line)
  const children = allLines.filter(l => l.parentId === line.id)
  
  const secondaryLots = children.filter(l => l.deductionMode === 'none')
  const impurities = children.filter(l => l.deductionMode !== 'none')

  let totalGross = parentTotals.grossWeight
  let totalContainer = parentTotals.containerDeductionWeight
  
  secondaryLots.forEach(lot => {
    const lotTotals = calculateLineTotals(lot)
    totalGross += lotTotals.grossWeight
    totalContainer += lotTotals.containerDeductionWeight
  })

  const realLotSummary = calculateRealLotSummary(line, allLines)
  let childrenDeduction = 0
  impurities.forEach(child => {
    const childDeduction = child.deductionMode === 'percent'
      ? realLotSummary.netBeforeImpurityWeight * Math.max(0, Number(child.deductionValue || 0)) / 100
      : child.deductionMode === 'kg'
        ? Math.max(0, Number(child.deductionValue || 0))
        : 0
    childrenDeduction += childDeduction
  })

  return {
    containerDeductionWeight: totalContainer,
    deductionWeight: parentTotals.deductionWeight + childrenDeduction,
    grossWeight: totalGross,
    netWeight: Math.max(0, totalGross - totalContainer - (parentTotals.deductionWeight + childrenDeduction)),
  }
}

function calculateRealLotSummary(line: FormWeightTicketLine, allLines: FormWeightTicketLine[]) {
  const childLots = allLines.filter((entry) => (
    entry.parentId === line.id
    && !isImpurityPurchaseLine(entry)
    && entry.deductionMode === 'none'
  ))
  const lots = isImpurityPurchaseLine(line) ? childLots : [line, ...childLots]

  return lots.reduce(
    (summary, lot) => {
      const grossWeight = Math.max(0, Number(lot.grossWeight || 0))
      const containerWeight = Math.max(0, Number(lot.containerDeductionWeight || 0))

      return {
        containerDeductionWeight: summary.containerDeductionWeight + containerWeight,
        grossWeight: summary.grossWeight + grossWeight,
        lotCount: summary.lotCount + 1,
        netBeforeImpurityWeight: summary.netBeforeImpurityWeight + Math.max(0, grossWeight - containerWeight),
      }
    },
    {
      containerDeductionWeight: 0,
      grossWeight: 0,
      lotCount: 0,
      netBeforeImpurityWeight: 0,
    },
  )
}

function isStoredPurchaseFromImpurityLine(line: WeightTicketRecord['lines'][number]) {
  return line.grossWeightValue > 0 && line.note.includes('มาจากสิ่งเจือปน')
}

function ticketToFormState(ticket: WeightTicketRecord): FormState {
  const lineIdByLineNo = new Map(ticket.lines.map((line) => [line.lineNo, line.id] as const))
  const productParentMap = new Map<string, string>()
  let lastParentId: string | undefined = undefined
  const lines: FormWeightTicketLine[] = ticket.lines.map((line) => {
    const isImpurity = Number(line.grossWeight || 0) === 0 && !!line.impurityId
    const relationSourceLineId = line.impuritySourceLineNo ? lineIdByLineNo.get(line.impuritySourceLineNo) : undefined
    const relationParentId = line.parentLineNo ? lineIdByLineNo.get(line.parentLineNo) : undefined
    const isPurchaseFromImpurity = Boolean(relationSourceLineId) || isStoredPurchaseFromImpurityLine(line)
    let parentId: string | undefined = undefined

    if (relationParentId) {
      parentId = relationParentId
    } else if (isImpurity) {
      parentId = lastParentId
    } else {
      const existingParentId = !isPurchaseFromImpurity ? productParentMap.get(line.productId) : undefined
      if (existingParentId) {
        parentId = existingParentId
      } else {
        if (!isPurchaseFromImpurity) productParentMap.set(line.productId, line.id)
        if (!isPurchaseFromImpurity) lastParentId = line.id
      }
    }
    return {
      containerDeductionWeight: line.containerDeductionWeight,
      deductionMode: line.deductionMode,
      deductionValue: line.deductionValue,
      grossWeight: line.grossWeight,
      id: line.id,
      imageNames: line.imageNames,
      imageFiles: line.imageNames.map(createAttachmentPreview),
      impurityId: line.impurityId,
      impurityProductId: line.impurityProductId || '',
      impuritySourceLineId: relationSourceLineId ?? (isPurchaseFromImpurity ? '' : undefined),
      impurityPurchaseAction: 'none',
      note: line.note,
      productId: line.productId,
      warehouseId: line.warehouseId,
      parentId,
    }
  })

  const assignedSourceIds = new Set<string>()
  const purchaseLineIds = new Set(
    ticket.lines
      .filter((line) => Boolean(line.impuritySourceLineNo) || isStoredPurchaseFromImpurityLine(line))
      .map((line) => line.id),
  )

  purchaseLineIds.forEach((purchaseLineId) => {
    const purchaseLine = lines.find((line) => line.id === purchaseLineId)
    const purchaseSource = ticket.lines.find((line) => line.id === purchaseLineId)
    if (!purchaseLine || !purchaseSource) return

    if (purchaseSource.impuritySourceLineNo) {
      const sourceLineId = lineIdByLineNo.get(purchaseSource.impuritySourceLineNo)
      const sourceLine = sourceLineId ? lines.find((candidate) => candidate.id === sourceLineId) : undefined
      if (!sourceLine) return

      assignedSourceIds.add(sourceLine.id)
      sourceLine.impurityPurchaseAction = 'buy'
      sourceLine.impurityProductId = purchaseLine.productId
      purchaseLine.impuritySourceLineId = sourceLine.id

      const existingTargetParentLine = lines.find((line) =>
        line.id !== purchaseLine.id
        && !line.parentId
        && !line.impuritySourceLineId
        && line.productId === purchaseLine.productId
      )
      purchaseLine.parentId = purchaseLine.parentId ?? existingTargetParentLine?.id
      if (purchaseLine.imageFiles.length === 0) {
        purchaseLine.imageFiles = sourceLine.imageFiles
        purchaseLine.imageNames = sourceLine.imageNames
      }
      return
    }

    const purchaseWeight = Number(purchaseLine.grossWeight || 0)
    const sourceLine = lines.find((candidate) => {
      if (assignedSourceIds.has(candidate.id)) return false
      if (!(Number(candidate.grossWeight || 0) === 0 && candidate.impurityId)) return false
      if (candidate.productId === purchaseLine.productId) return false

      const deductionMatches = Math.abs(Number(candidate.deductionValue || 0) - purchaseWeight) < 0.001
        || Math.abs((ticket.lines.find((line) => line.id === candidate.id)?.deductionWeight ?? 0) - purchaseWeight) < 0.001
      if (!deductionMatches) return false

      const sourceProductName = ticket.lines.find((line) => line.id === candidate.id)?.productName ?? ''
      return !sourceProductName || purchaseSource.note.includes(sourceProductName) || purchaseSource.note.includes(candidate.productId)
    })

    if (!sourceLine) return

    assignedSourceIds.add(sourceLine.id)
    sourceLine.impurityPurchaseAction = 'buy'
    sourceLine.impurityProductId = purchaseLine.productId
    purchaseLine.impuritySourceLineId = sourceLine.id

    const existingTargetParentLine = lines.find((line) =>
      line.id !== purchaseLine.id
      && !line.parentId
      && !line.impuritySourceLineId
      && line.productId === purchaseLine.productId
    )
    purchaseLine.parentId = existingTargetParentLine?.id
    if (purchaseLine.imageFiles.length === 0) {
      purchaseLine.imageFiles = sourceLine.imageFiles
      purchaseLine.imageNames = sourceLine.imageNames
    }
  })

  return {
    branchId: ticket.branchId,
    lines,
    partyId: ticket.partyId,
    remark: ticket.remark,
    type: ticket.type,
    vehicleImageFiles: ticket.vehicleImageNames.map(createAttachmentPreview),
    vehicleNo: ticket.vehicleNo,
    warehouseName: ticket.warehouseName ?? '',
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
  const [activeLineId, setActiveLineId] = useState('')
  const [collapsedLotIds, setCollapsedLotIds] = useState<Record<string, boolean>>({})
  const [pendingFocusField, setPendingFocusField] = useState<string | null>(null)

  const partyOptions = useMemo(() => {
    const options = form.type === 'WTI' ? suppliers : customers
    if (!form.branchId) return []
    return options.filter((option) => option.branchIds?.includes(form.branchId))
  }, [customers, form.branchId, form.type, suppliers])
  const totals = useMemo(() => calculateTicketTotals(form.lines), [form.lines])

  const isImpurityProduct = useCallback((p: OptionItem) => {
    const cat = p.category?.toLowerCase() || ''
    return cat.includes('สิ่งเจือปน') || cat.includes('impurity')
  }, [])

  const normalProducts = useMemo(() => {
    return products.filter(p => !isImpurityProduct(p))
  }, [products, isImpurityProduct])

  const impurityProducts = useMemo(() => {
    return products.filter(p => isImpurityProduct(p))
  }, [products, isImpurityProduct])
  const impurityOptions = useMemo(() => {
    const masterOptions = impurities.filter((impurity) => !isOtherProductImpurityLabel(impurity.label))
    if (form.type !== 'WTI') return masterOptions
    return [
      ...masterOptions,
      {
        description: 'ใช้เฉพาะใบรับของ เมื่อสิ่งที่ปนมาเป็นสินค้าอีกตัว',
        id: OTHER_PRODUCT_IMPURITY_ID,
        label: OTHER_PRODUCT_IMPURITY_LABEL,
      },
    ]
  }, [form.type, impurities])
  const wtoProductKeys = useMemo(() => {
    if (form.type !== 'WTO' || !form.branchId) return []
    return [...new Set(form.lines.map((line) => line.productId).filter(Boolean))]
  }, [form.branchId, form.lines, form.type])
  const activeLine = useMemo(
    () => {
      const parentLines = getMainParentLines(form.lines)
      const found = parentLines.find((line) => line.id === activeLineId)
      return found ?? parentLines[0] ?? null
    },
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
              branchIds: supplier.branchIds ?? [],
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
              branchIds: customer.branchIds ?? [],
              id: customer.id,
              label: customer.name,
              searchText: [code, customer.name].filter(Boolean).join(' '),
            }
          }))
          setImpurities((data.impurities ?? []).filter((impurity) => !isOtherProductImpurityLabel(impurity.label)))
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
            label: warehouse.name,
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
        setActiveLineId('')
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
    const parentLines = getMainParentLines(form.lines)
    if (parentLines.length === 0) {
      setActiveLineId('')
      return
    }
    if (!activeLineId || !parentLines.some((line) => line.id === activeLineId)) {
      setActiveLineId(parentLines[0].id)
    }
  }, [activeLineId, form.lines])

  function getElementId(errorKey: string): string | null {
    if (errorKey === 'branchId') return 'weight-ticket-branch'
    if (errorKey === 'partyId') return 'weight-ticket-party'
    if (errorKey === 'vehicleNo') return 'weight-ticket-vehicleNo'

    const match = errorKey.match(/^line-(.+?)-(product|warehouse|gross|container|images|impurity|impurity-product|deduction)$/)
    if (match) {
      const [_, lineId, field] = match
      if (field === 'product') return `weight-product-${lineId}`
      if (field === 'warehouse') return `weight-warehouse-${lineId}`
      if (field === 'gross') return `weight-gross-${lineId}`
      if (field === 'container') return `weight-container-${lineId}`
      if (field === 'images') return `weight-images-${lineId}`
      if (field === 'impurity') return `weight-impurity-${lineId}`
      if (field === 'impurity-product') return `weight-impurity-product-${lineId}`
      if (field === 'deduction') return `weight-deduction-${lineId}`
    }
    return null
  }

  useEffect(() => {
    if (!pendingFocusField) return

    const elementId = getElementId(pendingFocusField)
    if (!elementId) {
      setPendingFocusField(null)
      return
    }

    let timeoutId: number
    const tryFocus = () => {
      const element = document.getElementById(elementId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
          element.focus()
        }
        setPendingFocusField(null)
      } else {
        timeoutId = window.setTimeout(() => {
          const secondTry = document.getElementById(elementId)
          if (secondTry) {
            secondTry.scrollIntoView({ behavior: 'smooth', block: 'center' })
            if (secondTry.tagName === 'INPUT' || secondTry.tagName === 'SELECT' || secondTry.tagName === 'TEXTAREA') {
              secondTry.focus()
            }
          }
          setPendingFocusField(null)
        }, 50)
      }
    }

    tryFocus()

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [activeLineId, pendingFocusField])

  const errors = useMemo(() => {
    const next: Record<string, string> = {}
    if (!form.branchId) next.branchId = 'เลือกสาขา'
    if (!form.partyId) next.partyId = form.type === 'WTI' ? 'เลือกผู้ขาย' : 'เลือกลูกค้า'
    if (form.vehicleNo.trim().length < 2) next.vehicleNo = 'กรอกทะเบียนรถ'

    const parentLines = getMainParentLines(form.lines)

    form.lines.forEach((line) => {
      if (isImpurityPurchaseLine(line)) return
      const isImpurity = !!line.parentId && line.deductionMode !== 'none';
      const isSecondaryLot = !!line.parentId && line.deductionMode === 'none';
      const isParent = !line.parentId;

      if (!line.productId) {
        const parentIndex = line.parentId
          ? parentLines.findIndex((p) => p.id === line.parentId)
          : parentLines.findIndex((p) => p.id === line.id)
        next[`line-${line.id}-product`] = `เลือกสินค้าบรรทัดที่ ${parentIndex + 1}`
      }

      if (form.type === 'WTO' && !line.warehouseId) {
        const parentIndex = line.parentId
          ? parentLines.findIndex((p) => p.id === line.parentId)
          : parentLines.findIndex((p) => p.id === line.id)
        next[`line-${line.id}-warehouse`] = `เลือกคลังบรรทัดที่ ${parentIndex + 1}`
      }

      if (isParent || isSecondaryLot) {
        const rawGross = Number(line.grossWeight || 0)
        const rawContainer = Number(line.containerDeductionWeight || 0)
        const parentIndex = isParent
          ? parentLines.findIndex((p) => p.id === line.id)
          : parentLines.findIndex((p) => p.id === line.parentId)

        if (rawGross <= 0) {
          next[`line-${line.id}-gross`] = `กรอกน้ำหนักบรรทัดที่ ${parentIndex + 1}`
        }
        if (rawContainer > rawGross) {
          next[`line-${line.id}-container`] = 'หักภาชนะต้องไม่เกินน้ำหนักรวม'
        }
        if (getLineImages(line).length === 0) {
          next[`line-${line.id}-images`] = `แนบรูปภาพบรรทัดที่ ${parentIndex + 1} อย่างน้อย 1 รูป`
        }

        if (isParent) {
          const lineTotals = calculateAdjustedLineTotals(line, form.lines)
          const children = form.lines.filter((l) => l.parentId === line.id)
          const impurities = children.filter((l) => l.deductionMode !== 'none')
          if (lineTotals.containerDeductionWeight + lineTotals.deductionWeight > lineTotals.grossWeight) {
            if (impurities.length > 0) {
              const lastChild = impurities[impurities.length - 1]
              next[`line-${lastChild.id}-deduction`] = 'ยอดหักรวมต้องไม่เกินน้ำหนักรวม'
            } else {
              next[`line-${line.id}-container`] = 'ยอดหักรวมต้องไม่เกินน้ำหนักรวม'
            }
          }
        }
      } else if (isImpurity) {
        if (line.deductionMode === 'none') {
          next[`line-${line.id}-impurity`] = 'เลือกสิ่งเจือปน'
        }
        if (line.deductionMode !== 'none' && !getLineImpurityId(line)) {
          next[`line-${line.id}-impurity`] = impurityOptions.length > 0 ? 'เลือกสิ่งเจือปน' : 'ยังไม่มีสิ่งเจือปนที่ใช้งานใน master data'
        }
        if (isOtherProductImpurityOption(getLineImpurityId(line)) && line.impurityPurchaseAction === 'buy' && !line.impurityProductId) {
          next[`line-${line.id}-impurity-product`] = 'เลือกสินค้าที่ปนมา'
        }
        if (line.impurityProductId) {
          const parentLine = line.parentId ? form.lines.find((entry) => entry.id === line.parentId) : null
          if (parentLine?.productId && line.impurityProductId === parentLine.productId) {
            next[`line-${line.id}-impurity-product`] = 'สินค้าที่ปนมาต้องไม่ใช่สินค้าหลักของเต๋านี้'
          }
        }
        if (line.deductionMode === 'percent' && Number(line.deductionValue || 0) > 100) {
          next[`line-${line.id}-deduction`] = 'หัก % ต้องไม่เกิน 100'
        }
        if (Number(line.deductionValue || 0) <= 0) {
          next[`line-${line.id}-deduction`] = 'กรอกน้ำหนักหักสิ่งเจือปน'
        }
      }
    })
    return next
  }, [form, impurityOptions])

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

  function getLineEvidenceImages(line: FormWeightTicketLine) {
    if (!isImpurityPurchaseLine(line)) return getLineImages(line)
    const sourceLine = form.lines.find((entry) => entry.id === line.impuritySourceLineId)
    const sourceParentLine = sourceLine?.parentId
      ? form.lines.find((entry) => entry.id === sourceLine.parentId)
      : null
    return getLineImages(sourceParentLine ?? sourceLine ?? line)
  }

  function markTouched(key: string) {
    setTouched((current) => ({ ...current, [key]: true }))
  }

  function toggleLotCollapsed(lotId: string) {
    setCollapsedLotIds((current) => ({ ...current, [lotId]: !current[lotId] }))
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateLine(lineId: string, updater: (line: FormWeightTicketLine) => FormWeightTicketLine) {
    setForm((current) => {
      const updatedLines = current.lines.map((line) => line.id === lineId ? updater(line) : line)
      const target = updatedLines.find((line) => line.id === lineId)
      const cleanedLines = target?.impurityPurchaseAction === 'buy'
        ? updatedLines
        : removeImpurityPurchaseLinesForSource(updatedLines, lineId)
      if (target && !target.parentId) {
        return {
          ...current,
          lines: cleanedLines.map((line) => {
            if (line.parentId === target.id) {
              return {
                ...line,
                productId: target.productId,
                warehouseId: target.warehouseId,
              }
            }
            return line
          }),
        }
      }
      return {
        ...current,
        lines: cleanedLines,
      }
    })
  }

  function changeLineProduct(lineId: string, productId: string) {
    setForm((current) => {
      const targetLine = current.lines.find((line) => line.id === lineId)
      if (!targetLine || targetLine.productId === productId) return current

      const childIds = current.lines
        .filter((line) => line.parentId === lineId)
        .map((line) => line.id)
      const resetLine = {
        ...createFormWeightTicketLine(lineId),
        productId,
      }

      return {
        ...current,
        lines: current.lines
          .filter((line) => line.id === lineId || (line.parentId !== lineId && !childIds.includes(line.impuritySourceLineId ?? '')))
          .map((line) => line.id === lineId ? resetLine : line),
      }
    })
  }

  function addLine() {
    const nextLine = createFormWeightTicketLine()
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }))
    setActiveLineId(nextLine.id)
  }

  function addSameProductLot(sourceLine: FormWeightTicketLine) {
    const nextLine = createFormWeightTicketLine()
    nextLine.productId = sourceLine.productId
    nextLine.warehouseId = sourceLine.warehouseId
    nextLine.parentId = sourceLine.id
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }))
  }

  function removeLine(lineId: string) {
    setForm((current) => {
      const targetLine = current.lines.find((line) => line.id === lineId)
      if (targetLine && isImpurityPurchaseLine(targetLine)) {
        const childIds = current.lines.filter((line) => line.parentId === lineId).map((line) => line.id)
        const purchaseSourceIds = [
          targetLine.impuritySourceLineId,
          ...current.lines
            .filter((line) => line.parentId === lineId && line.impuritySourceLineId)
            .map((line) => line.impuritySourceLineId),
        ].filter((id): id is string => Boolean(id))
        return {
          ...current,
          lines: current.lines
            .filter((line) => line.id !== lineId && line.parentId !== lineId && !childIds.includes(line.impuritySourceLineId ?? ''))
            .map((line) => purchaseSourceIds.includes(line.id)
              ? { ...line, impurityPurchaseAction: 'none' as const }
              : line),
        }
      }

      const parentLines = getMainParentLines(current.lines)
      if (parentLines.length === 1) return current
      const childIds = current.lines.filter((line) => line.parentId === lineId).map((line) => line.id)
      const purchaseSourceIds = current.lines
        .filter((line) => line.parentId === lineId && line.impuritySourceLineId)
        .map((line) => line.impuritySourceLineId!)
      const nextLines = current.lines
        .filter((line) => line.id !== lineId && line.parentId !== lineId && !childIds.includes(line.impuritySourceLineId ?? ''))
        .map((line) => purchaseSourceIds.includes(line.id)
          ? { ...line, impurityPurchaseAction: 'none' as const }
          : line)
      return {
        ...current,
        lines: nextLines,
      }
    })
  }

  function addImpurityLine(sourceLine: FormWeightTicketLine) {
    if (calculateRealLotSummary(sourceLine, form.lines).lotCount === 0) return
    const nextLine = createFormWeightTicketLine()
    nextLine.productId = sourceLine.productId
    nextLine.warehouseId = sourceLine.warehouseId
    nextLine.grossWeight = '0'
    nextLine.containerDeductionWeight = '0'
    nextLine.deductionMode = 'kg'
    nextLine.deductionValue = ''
    nextLine.impurityId = impurityOptions[0]?.id || ''
    nextLine.impurityPurchaseAction = 'none'
    nextLine.note = 'หักสิ่งเจือปนเพิ่มเติม'
    nextLine.parentId = sourceLine.id
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }))
  }

  function removeImpurityLine(sourceLine: FormWeightTicketLine) {
    setForm((current) => {
      return {
        ...current,
        lines: removeImpurityPurchaseLinesForSource(current.lines, sourceLine.id)
          .filter((line) => line.id !== sourceLine.id),
      }
    })
  }

  function buyImpurityDirect(sourceLine: FormWeightTicketLine, targetProductId: string) {
    setForm((current) => ({
      ...current,
      lines: (() => {
        const currentSourceLine = current.lines.find((line) => line.id === sourceLine.id)
        if (!currentSourceLine || !targetProductId) return current.lines
        const baseLines = current.lines.filter((line) => line.impuritySourceLineId !== currentSourceLine.id)
        const lineTotals = calculateAdjustedLineTotals(currentSourceLine, current.lines)
        const deductionWeight = String(lineTotals.deductionWeight)
        const parentLine = current.lines.find(l => l.id === currentSourceLine.parentId)
        const existingTargetParentLine = baseLines.find((line) =>
          !line.parentId
          && line.productId === targetProductId
        )
        const parentProduct = parentLine ? products.find(p => p.id === parentLine.productId) : null
        const parentProductLabel = parentProduct
          ? (parentProduct.code ? `${parentProduct.code} - ${parentProduct.name || parentProduct.label}` : (parentProduct.name || parentProduct.label))
          : 'สินค้า'
        const parentLines = current.lines.filter(l => !l.parentId && !l.impuritySourceLineId)
        const parentIndex = parentLine ? parentLines.findIndex(l => l.id === parentLine.id) + 1 : 1
        const impurityLabel = impurityOptions.find(i => i.id === currentSourceLine.impurityId)?.label || 'สิ่งเจือปน'

        const nextLine = createFormWeightTicketLine()
        nextLine.productId = targetProductId
        nextLine.warehouseId = parentLine?.warehouseId || ''
        nextLine.grossWeight = deductionWeight
        nextLine.containerDeductionWeight = '0'
        nextLine.impuritySourceLineId = currentSourceLine.id
        nextLine.parentId = existingTargetParentLine?.id
        nextLine.imageFiles = getLineImages(currentSourceLine)
        nextLine.note = `มาจากสิ่งเจือปน (${impurityLabel} ${deductionWeight} กก.) ของรายการที่ ${parentIndex}: ${parentProductLabel}`

        return [
          ...baseLines
            .map((line) => line.id === currentSourceLine.id ? { ...line, impurityPurchaseAction: 'buy' as const } : line),
          nextLine,
        ]
      })(),
    }))
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
      nextTouched[`line-${line.id}-container`] = true
      nextTouched[`line-${line.id}-deduction`] = true
      nextTouched[`line-${line.id}-images`] = true
      nextTouched[`line-${line.id}-impurity`] = true
      nextTouched[`line-${line.id}-impurity-product`] = true
    })
    setTouched(nextTouched)
    const errorKeys = Object.keys(errors)
    if (errorKeys.length > 0) {
      const firstErrorKey = errorKeys[0]
      const match = firstErrorKey.match(/^line-(.+?)-(product|warehouse|gross|container|images|impurity|impurity-product|deduction)$/)
      if (match) {
        const targetLineId = match[1]
        const lineInForm = form.lines.find(l => l.id === targetLineId)
        const parentLineId = lineInForm?.parentId || targetLineId
        if (activeLineId !== parentLineId) {
          setActiveLineId(parentLineId)
        }
      }
      setPendingFocusField(firstErrorKey)
      return
    }

    setIsSaving(true)
    try {
      const ticket = await saveWeightTicket({
        branchId: form.branchId,
        id: editingTicketId || undefined,
        lines: form.lines.map((line) => ({
          containerDeductionWeight: Number(line.containerDeductionWeight || 0),
          deductionMode: line.deductionMode,
          deductionValue: Number(line.deductionValue || 0),
          grossWeight: Number(line.grossWeight || 0),
          id: line.id,
          imageNames: getLineEvidenceImages(line).map((file) => file.rawValue),
          impurityId: getLineImpurityId(line),
          impurityProductId: line.impurityProductId ?? '',
          impuritySourceLineId: line.impuritySourceLineId,
          note: line.note,
          productId: line.productId,
          warehouseId: line.warehouseId,
          parentId: line.parentId,
        })),
        partyId: form.partyId,
        remark: form.remark.trim(),
        type: form.type,
        vehicleImageNames: form.vehicleImageFiles.map((file) => file.rawValue),
        vehicleNo: form.vehicleNo.trim(),
        warehouseName: form.warehouseName.trim() || null,
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
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setTouched((current) => ({ ...current, ...nextTouched }))
      }
      setLoadError(getErrorMessage(caught, editingTicketId ? 'แก้ไขใบรับ-ส่งของไม่ได้' : 'บันทึกใบรับ-ส่งของไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={cn("min-w-0", onClose ? "flex flex-col h-full overflow-hidden" : "overflow-x-hidden")}>
      <div className={cn("min-w-0", onClose ? "flex-1 overflow-y-auto p-4 sm:p-5 space-y-5" : "space-y-5 pb-32")}>
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

      {isLoadingTicket ? (
        <Card className={cn(onClose ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
          <div className="p-16 text-center text-sm font-medium text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse">
            กำลังโหลดข้อมูล...
          </div>
        </Card>
      ) : (
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
	                    partyId: (current.type === 'WTI' ? suppliers : customers)
	                      .some((option) => option.id === current.partyId && option.branchIds?.includes(value ?? ''))
	                      ? current.partyId
	                      : '',
	                  }))
	                }}
              />
              <SearchCombobox
                disabled={!form.branchId}
                error={showError('partyId')}
                inputId="weight-ticket-party"
                label={form.type === 'WTI' ? 'ผู้ขาย*' : 'ลูกค้า*'}
                options={partyOptions}
                placeholder={!form.branchId ? 'เลือกสาขาก่อน' : form.type === 'WTI' ? 'ค้นหาชื่อหรือรหัสผู้ขาย' : 'ค้นหารหัสหรือชื่อลูกค้า'}
                value={form.partyId}
                onChange={(value) => {
                  markTouched('partyId')
                  updateForm('partyId', value)
                }}
              />
              <FieldBlock error={showError('vehicleNo')} label="ทะเบียนรถ*">
                <Input
                  id="weight-ticket-vehicleNo"
                  placeholder="เช่น 83-5476"
                  value={form.vehicleNo}
                  onBlur={() => markTouched('vehicleNo')}
                  onChange={(event) => updateForm('vehicleNo', normalizeVehicleNo(event.target.value))}
                />
              </FieldBlock>
              <FieldBlock error={showError('warehouseName')} label={form.type === 'WTI' ? "โกดัง*" : "โกดัง"}>
                <Input
                  placeholder="เช่น โกดัง A"
                  value={form.warehouseName}
                  onBlur={() => markTouched('warehouseName')}
                  onChange={(event) => updateForm('warehouseName', event.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="รูปภาพรถส่งของ">
                <AttachmentProfileGrid
                  id="weight-vehicle-images"
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



            {/* รายการเต๋า (Lines List) แบบ Split-panel ซ้ายขวา */}
            <div className={cn(
              "mt-4 grid min-w-0 items-start gap-4 border-b border-slate-100 pb-6",
              activeLine ? "xl:grid-cols-[18rem_minmax(0,1fr)]" : "grid-cols-1"
            )}>
              <div className="min-w-0 space-y-3 xl:max-h-[calc(100vh-16rem)] xl:overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-700">รายการทั้งหมด {getMainParentLines(form.lines).length} รายการ</div>
                  <Button size="xs" type="button" onClick={addLine}>
                    <Plus className="mr-1 size-3" />
                    เพิ่มสินค้า
                  </Button>
                </div>
                <div className="space-y-2 xl:max-h-[calc(100vh-19rem)] xl:overflow-y-auto xl:pr-1">
                  {(() => {
                    const parentLines = getMainParentLines(form.lines)
                    return parentLines.map((line, index) => {
                      const lineTotals = calculateAdjustedLineTotals(line, form.lines)
                      const childIds = form.lines.filter((l) => l.parentId === line.id).map((l) => l.id)
                      const allRelatedIds = [line.id, ...childIds]
                      const hasError = allRelatedIds.some((id) =>
                        errors[`line-${id}-product`]
                        || errors[`line-${id}-gross`]
                        || errors[`line-${id}-container`]
                        || errors[`line-${id}-images`]
                        || errors[`line-${id}-impurity`]
                        || errors[`line-${id}-warehouse`]
                        || errors[`line-${id}-deduction`],
                      )
                      const active = activeLine?.id === line.id

                      return (
                        <button
                          className={cn(
                            'block w-full rounded-md border px-3 py-3 text-left transition outline-none',
                            active ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50',
                          )}
                          key={line.id}
                          type="button"
                          onClick={() => setActiveLineId(line.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm text-slate-500 font-semibold">รายการ {index + 1}</div>
                              <div className="mt-1 line-clamp-1 text-sm font-medium text-slate-900">
                                {products.find((option) => option.id === line.productId)?.name || 'ยังไม่ได้เลือกสินค้า'}
                              </div>
                            </div>
                            {hasError ? <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">ไม่ครบ</span> : null}
                          </div>
	                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-500 font-medium">
	                            <div>สุทธิ {formatWeight(lineTotals.netWeight)} กก.</div>
	                            <div className="text-right">{calculateRealLotSummary(line, form.lines).lotCount} เต๋า</div>
	                          </div>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>

              {activeLine ? (() => {
                const line = activeLine
                const parentLines = getMainParentLines(form.lines)
                const index = parentLines.findIndex((entry) => entry.id === line.id)
                const lineTotals = calculateAdjustedLineTotals(line, form.lines)
                const hasSelectedProduct = Boolean(line.productId)
                const isPurchaseOnlyLine = isImpurityPurchaseLine(line)
                const realLotSummary = calculateRealLotSummary(line, form.lines)
                const canAddImpurityLine = hasSelectedProduct && realLotSummary.lotCount > 0
                const boughtImpurityLinesForLine = getBoughtImpurityEntriesForLine(line, form.lines)
                const boughtImpurityTotal = boughtImpurityLinesForLine.reduce((sum, entry) => sum + calculateAdjustedLineTotals(entry.sourceLine, form.lines).deductionWeight, 0)
                const purchaseOnlyNote = isPurchaseOnlyLine && boughtImpurityLinesForLine.length > 0
                  ? `ซื้อเพิ่มจากสิ่งเจือปน ${boughtImpurityLinesForLine.length} รายการ รวม ${formatWeight(boughtImpurityTotal)} กก.`
                  : ''
                const isLineProductImpurity = (() => {
                  if (!line.productId) return false
                  const p = products.find((prod) => prod.id === line.productId)
                  return p ? isImpurityProduct(p) : false
                })()

                return (
                  <div className="min-w-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-3 sm:p-4 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto">
                    <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
                      <div className="inline-flex rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">รายการ {index + 1}</div>
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={parentLines.length === 1}
                          size="xs"
                          type="button"
                          variant="outline"
                          onClick={() => removeLine(line.id)}
                          className="outline-none flex items-center gap-1"
                        >
                          <Trash2 className="size-3" />
                          ลบ
                        </Button>
                      </div>
                    </div>

                    {/* ส่วนที่ 1: ข้อมูลสินค้าและคลังสินค้า */}
                    <div className="space-y-4">
                      <div className={cn("grid gap-4 items-start", form.type === 'WTO' ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
                        <FieldBlock error={showError(`line-${line.id}-product`)} label="สินค้า*">
                          <div className="flex gap-2 items-center">
                            <div className="min-w-0 flex-1">
	                              <SearchCombobox
	                                hideLabel
                                inputId={`weight-product-${line.id}`}
                                label="สินค้า*"
                                options={isLineProductImpurity ? impurityProducts : normalProducts}
                                placeholder={isLoadingProducts ? 'กำลังโหลดสินค้า...' : 'เลือกสินค้า'}
                                disabled={isLoadingProducts || isPurchaseOnlyLine}
                                value={line.productId}
                                onChange={(value) => {
                                  markTouched(`line-${line.id}-product`)
                                  changeLineProduct(line.id, value)
                                }}
                              />
                            </div>
                            <div className="shrink-0">
                              <ProductImagePicker
                                key={`${form.branchId}:${form.partyId}:${form.type}`}
                                disabled={isLoadingProducts || isPurchaseOnlyLine}
                                products={isLineProductImpurity ? impurityProducts : normalProducts}
                                value={line.productId}
                                onChange={(value) => {
                                  markTouched(`line-${line.id}-product`)
                                  changeLineProduct(line.id, value)
                                }}
                                hideSelectedCard
                                buttonClassName={cn("text-white font-semibold h-10 px-3 flex items-center justify-center gap-1.5 outline-none", ticketTheme.button)}
                              />
                            </div>
                          </div>
                          {(() => {
                            const selectedProduct = products.find((p) => p.id === line.productId)
                            if (!selectedProduct) return null
                            return (
                              <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-100 bg-white p-2 shadow-sm">
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
                                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{selectedProduct.category || 'ทั่วไป'}</div>
                                  <div className="truncate text-sm font-bold text-slate-900">{selectedProduct.name ?? selectedProduct.label}</div>
                                </div>
                                {!isPurchaseOnlyLine ? (
                                  <button
                                    type="button"
                                    onClick={() => changeLineProduct(line.id, '')}
                                    className="text-sm text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 transition outline-none"
                                  >
                                    ล้าง
                                  </button>
                                ) : null}
                              </div>
                            )
                          })()}
                        </FieldBlock>

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
                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                                  <span>คงเหลือ {formatWeight(selectedWarehouse.onHandQty)} กก.</span>
                                  <span>จอง {formatWeight(selectedWarehouse.onHoldQty)} กก.</span>
                                  <span>พร้อมส่ง {formatWeight(selectedWarehouse.availableQty)} กก.</span>
                                </div>
                              ) : null}
                            </div>
                          )
                        })() : null}
                      </div>

                      {/* รายการเต๋าสินค้า */}
                      <div className="mt-4 border-t border-slate-200/60 pt-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">เต๋าสินค้า</div>
                        </div>
                        {!hasSelectedProduct ? (
                          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            เลือกสินค้าก่อน จึงจะกรอกน้ำหนัก เพิ่มล็อต และแนบรูปได้
                          </div>
                        ) : null}
                        <div className="space-y-4">
                          {(() => {
                            const secondaryLots = form.lines.filter((l) => l.parentId === line.id && !isImpurityPurchaseLine(l) && l.deductionMode === 'none')
                            const lots = isPurchaseOnlyLine ? secondaryLots : [line, ...secondaryLots]
                            if (lots.length === 0) {
                              return (
                                <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
                                  รายการนี้มาจากการซื้อเพิ่มจากสิ่งเจือปน ยังไม่มีเต๋าสินค้าหลัก
                                </div>
                              )
                            }
                            return lots.map((lot, lotIndex) => {
                              const isParent = !lot.parentId
                              const isCollapsed = Boolean(collapsedLotIds[lot.id])
                              const lotGrossWeight = Math.max(0, Number(lot.grossWeight || 0))
                              const lotContainerWeight = Math.max(0, Number(lot.containerDeductionWeight || 0))
                              const lotNetBeforeImpurityWeight = Math.max(0, lotGrossWeight - lotContainerWeight)
                              return (
                                <div key={lot.id} className="bg-white p-3 rounded-lg border border-slate-200/60 space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                                      aria-expanded={!isCollapsed}
                                      onClick={() => toggleLotCollapsed(lot.id)}
                                    >
                                      <ChevronDown className={cn("size-4 shrink-0 text-slate-500 transition-transform", isCollapsed ? "-rotate-90" : "rotate-0")} />
                                      <div className="min-w-0">
                                        <div className="text-sm font-bold text-slate-700">เต๋าที่ {lotIndex + 1}</div>
                                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold text-slate-500">
                                          <span>รวม {formatWeight(lotGrossWeight)} กก.</span>
                                          <span>ภาชนะ {formatWeight(lotContainerWeight)} กก.</span>
                                          <span className="text-emerald-700 font-bold">หลังหัก {formatWeight(lotNetBeforeImpurityWeight)} กก.</span>
                                          <span>{getLineImages(lot).length} รูป</span>
                                        </div>
                                      </div>
                                    </button>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="xs"
                                        type="button"
                                        variant="ghost"
                                        className="h-9 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 outline-none"
                                        onClick={() => toggleLotCollapsed(lot.id)}
                                      >
                                        {isCollapsed ? 'ขยาย' : 'ยุบ'}
                                      </Button>
                                      {!isParent && (
                                      <Button
                                        size="xs"
                                        type="button"
                                        variant="ghost"
                                        className="text-rose-600 hover:bg-rose-50 h-9 px-3 text-sm font-semibold outline-none flex items-center"
                                        onClick={() => {
                                          setForm((current) => ({
                                            ...current,
                                            lines: current.lines.filter((l) => l.id !== lot.id),
                                          }))
                                        }}
                                      >
                                        <Trash2 className="size-3.5 mr-1" />
                                        ลบเต๋า
                                      </Button>
                                      )}
                                    </div>
                                  </div>
                                  {!isCollapsed ? (
                                    <>
                                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 items-start">
                                        <FieldBlock error={showError(`line-${lot.id}-gross`)} label="น้ำหนักรวม (กก. / ลัง) *">
                                          <Input
                                            id={`weight-gross-${lot.id}`}
                                            disabled={!hasSelectedProduct}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            value={lot.grossWeight}
                                            onBlur={() => markTouched(`line-${lot.id}-gross`)}
                                            onChange={(event) => updateLine(lot.id, (current) => ({ ...current, grossWeight: normalizeDecimalInput(event.target.value) }))}
                                          />
                                        </FieldBlock>
                                        <FieldBlock error={showError(`line-${lot.id}-container`)} label="หักภาชนะ(กก.)">
                                          <Input
                                            id={`weight-container-${lot.id}`}
                                            disabled={!hasSelectedProduct}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            value={lot.containerDeductionWeight}
                                            onBlur={() => markTouched(`line-${lot.id}-container`)}
                                            onChange={(event) => updateLine(lot.id, (current) => ({ ...current, containerDeductionWeight: normalizeDecimalInput(event.target.value) }))}
                                          />
                                        </FieldBlock>
                                        <div className="col-span-2 sm:col-span-1">
                                          <FieldBlock label="น้ำหนักหลังหักภาชนะ">
                                            <Input
                                              disabled
                                              value={formatWeight(lotNetBeforeImpurityWeight)}
                                            />
                                          </FieldBlock>
                                        </div>
                                      </div>
                                      <FieldBlock error={showError(`line-${lot.id}-images`)} label="รูปภาพประกอบ*">
                                        <AttachmentProfileGrid
                                          id={`weight-images-${lot.id}`}
                                          addLabel="เพิ่มรูป"
                                          emptyLabel="ยังไม่มีรูปภาพสำหรับเต๋านี้"
                                          files={getLineImages(lot)}
                                          disabled={!hasSelectedProduct}
                                          onAppend={(files) => void appendLineImages(lot.id, files)}
                                          onPreview={setPreviewImage}
                                          onRemove={(fileId) => updateLine(lot.id, (current) => ({
                                            ...current,
                                            imageFiles: getLineImages(current).filter((entry) => entry.id !== fileId),
                                          }))}
                                          noWrapper
                                        />
                                      </FieldBlock>
                                    </>
                                  ) : null}
                                </div>
                              )
                            })
                          })()}
                        </div>

                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            disabled={!hasSelectedProduct}
                            onClick={() => addSameProductLot(line)}
                            className="outline-none flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white disabled:bg-slate-100 disabled:text-slate-400 h-9 px-3 text-sm font-semibold"
                          >
                            <Plus className="size-4" />
                            เพิ่มล็อต
                          </Button>
                        </div>
                        {(() => {
                          const lotSummary = calculateRealLotSummary(line, form.lines)
                          return (
                            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-sm font-bold text-slate-700">สรุปน้ำหนักเต๋า</div>
                                <div className="text-xs font-bold text-slate-500">{lotSummary.lotCount} เต๋า</div>
                              </div>
                              {lotSummary.lotCount > 0 ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  <MetricInline label="น้ำหนักรวมทุกเต๋า" value={`${formatWeight(lotSummary.grossWeight)} กก.`} />
                                  <MetricInline label="หักภาชนะ" value={`${formatWeight(lotSummary.containerDeductionWeight)} กก.`} />
                                  <div className="col-span-2 sm:col-span-1">
                                    <MetricInline emphasis label="หลังหักภาชนะ" value={`${formatWeight(lotSummary.netBeforeImpurityWeight)} กก.`} />
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm text-slate-400 font-medium">ยังไม่มีเต๋าสินค้าหลัก</div>
                              )}
                            </div>
                          )
                        })()}
                      </div>

	                      {/* ซื้อเพิ่มจากสิ่งเจือปน */}
	                      {(() => {
	                        const boughtImpurityLines = boughtImpurityLinesForLine
	                        if (boughtImpurityLines.length === 0) return null
	                        return (
	                          <div className="mt-4 border-t border-slate-200/60 pt-4">
	                            <div className="mb-2 text-sm font-bold text-slate-700 uppercase tracking-wider">ซื้อเพิ่มจากสิ่งเจือปน</div>
	                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
	                              <div className="hidden md:grid grid-cols-[minmax(160px,1fr)_120px_120px_minmax(150px,0.9fr)_minmax(180px,1fr)] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
	                                <div>สินค้า</div>
	                                <div>น้ำหนักซื้อเพิ่ม</div>
	                                <div>ประเภท</div>
	                                <div>ที่มา</div>
	                                <div>หมายเหตุ</div>
	                              </div>
	                              <div className="divide-y divide-slate-100">
	                                {boughtImpurityLines.map(({ purchaseLine, sourceLine }) => {
	                                  const product = products.find((entry) => entry.id === sourceLine.impurityProductId)
	                                  const impurityName = impurityOptions.find((entry) => entry.id === sourceLine.impurityId)?.label ?? 'สิ่งเจือปน'
	                                  const sourceParentLine = sourceLine.parentId ? form.lines.find((entry) => entry.id === sourceLine.parentId) : null
	                                  const sourceProduct = sourceParentLine ? products.find((entry) => entry.id === sourceParentLine.productId) : null
	                                  const purchaseWeight = calculateAdjustedLineTotals(sourceLine, form.lines).deductionWeight
	                                  const deductionTypeLabel = sourceLine.deductionMode === 'percent'
	                                    ? `หัก ${formatWeight(Number(sourceLine.deductionValue || 0))}%`
	                                    : `หัก ${formatWeight(Number(sourceLine.deductionValue || 0))} กก.`
	                                  const sourceProductLabel = sourceProduct?.name ?? sourceProduct?.label ?? sourceParentLine?.productId ?? ''
	                                  const sourceLabel = sourceProductLabel ? `ปนมาจาก ${sourceProductLabel}` : `จาก ${impurityName}`
	                                  const noteLabel = purchaseLine?.note.trim() || sourceLine.note.trim() || 'ไม่มีหมายเหตุ'
	                                  return (
	                                    <div key={sourceLine.id} className="grid grid-cols-1 gap-1 px-3 py-2 text-sm text-slate-700 md:grid-cols-[minmax(160px,1fr)_120px_120px_minmax(150px,0.9fr)_minmax(180px,1fr)] md:gap-3">
	                                      <div>
	                                        <div className="font-semibold text-slate-900">{product?.name ?? product?.label ?? sourceLine.impurityProductId}</div>
	                                        <div className="md:hidden text-xs font-semibold text-slate-500">น้ำหนักซื้อเพิ่ม {formatWeight(purchaseWeight)} กก.</div>
	                                        <div className="md:hidden text-xs font-semibold text-slate-500">{deductionTypeLabel}</div>
	                                      </div>
	                                      <div className="hidden font-semibold tabular-nums text-slate-900 md:block">{formatWeight(purchaseWeight)} กก.</div>
	                                      <div className="hidden text-slate-600 md:block">{deductionTypeLabel}</div>
	                                      <div className="text-slate-500">{sourceLabel}</div>
	                                      <div className="text-slate-500">{noteLabel}</div>
	                                    </div>
	                                  )
	                                })}
	                              </div>
	                            </div>
	                          </div>
	                        )
	                      })()}

                      {/* ส่วนที่ 2: สิ่งเจือปน (เฉพาะสำหรับสินค้านี้) */}
                      <div className="mt-4 border-t border-slate-200/60 pt-4">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="text-sm font-bold text-slate-700 uppercase tracking-wider">สิ่งเจือปน</div>
                          <Button
                            type="button"
                            variant="default"
                            disabled={!canAddImpurityLine}
                            onClick={() => addImpurityLine(line)}
                            className="flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-semibold px-3 outline-none text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <Plus className="h-4 w-4" />
                            เพิ่มรายการหักสิ่งเจือปน
                          </Button>
                        </div>
                        {!canAddImpurityLine ? (
                          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                            ต้องมีเต๋าสินค้าก่อน จึงจะเพิ่มรายการหักสิ่งเจือปนได้
                          </div>
                        ) : null}

                        {(() => {
                          const childLines = form.lines.filter((l) => l.parentId === line.id && l.deductionMode !== 'none')
                          if (childLines.length === 0) {
                            return (
                              <div className="text-center py-4 text-sm font-medium text-slate-400 bg-white rounded-lg border border-dashed border-slate-200 mt-2">
                                ไม่มีการหักสิ่งเจือปนสำหรับรายการนี้
                              </div>
                            )
                          }
                          const hasOtherProductImpurity = childLines.some((child) => isOtherProductImpurityOption(getLineImpurityId(child)))
                          const hasPercentDeduction = childLines.some((child) => child.deductionMode === 'percent')
                          const impurityHeaderGridColumns = hasOtherProductImpurity
                            ? hasPercentDeduction
                              ? "grid-cols-[minmax(140px,1.1fr)_minmax(140px,1.1fr)_104px_76px_120px_124px]"
                              : "grid-cols-[minmax(150px,1.1fr)_minmax(150px,1.1fr)_104px_76px_124px]"
                            : hasPercentDeduction
                              ? "grid-cols-[minmax(170px,1fr)_104px_76px_120px_40px]"
                              : "grid-cols-[minmax(180px,1fr)_104px_76px_40px]"
                          const impurityRowGridColumns = hasOtherProductImpurity
                            ? hasPercentDeduction
                              ? "md:grid-cols-[minmax(140px,1.1fr)_minmax(140px,1.1fr)_104px_76px_120px_124px]"
                              : "md:grid-cols-[minmax(150px,1.1fr)_minmax(150px,1.1fr)_104px_76px_124px]"
                            : hasPercentDeduction
                              ? "md:grid-cols-[minmax(170px,1fr)_104px_76px_120px_40px]"
                              : "md:grid-cols-[minmax(180px,1fr)_104px_76px_40px]"
                          return (
                            <div className="space-y-2 mt-2">
                              {/* แถวหัวตาราง (Table Column Headers) บน Desktop */}
                              <div className={cn(
                                "hidden md:grid gap-3 px-2 mb-1 text-xs font-bold text-slate-500 uppercase tracking-wider",
                                impurityHeaderGridColumns,
                              )}>
                                <div>สิ่งเจือปน <span className="text-red-600">*</span></div>
                                {hasOtherProductImpurity ? <div>สินค้าที่ปนมา <span className="text-red-600">*</span></div> : null}
                                <div>ประเภทการหัก <span className="text-red-600">*</span></div>
                                <div>ค่าหัก <span className="text-red-600">*</span></div>
                                {hasPercentDeduction ? <div>น้ำหนักที่หัก</div> : null}
                                <div>{hasOtherProductImpurity ? 'ซื้อ/ไม่ซื้อ' : ''}</div>
                              </div>
                              {childLines.map((child) => {
                                const selectedImpurityId = getLineImpurityId(child)
                                const hasSelectedImpurity = Boolean(selectedImpurityId)
                                const isOtherProductImpurity = isOtherProductImpurityOption(selectedImpurityId)
                                const impurityPurchaseProducts = normalProducts.filter((product) => product.id !== line.productId)
                                const mustSelectImpurityProductFirst = isOtherProductImpurity && child.impurityPurchaseAction === 'buy' && !child.impurityProductId
                                const canEditImpurityDeduction = hasSelectedProduct && hasSelectedImpurity
                                const calculatedDeductionWeight = calculateAdjustedLineTotals(child, form.lines).deductionWeight
                                return (
                                  <div key={child.id} className="bg-white p-2 rounded-lg border border-slate-200/60">
                                    <div className={cn(
                                      "grid grid-cols-1 gap-2 md:gap-3 items-start",
                                      impurityRowGridColumns,
                                    )}>
                                      <FieldBlock label="สิ่งเจือปน*" labelClassName="md:hidden">
                                        <SearchCombobox
                                          disabled={!hasSelectedProduct}
                                          error={showError(`line-${child.id}-impurity`)}
                                          inputId={`weight-impurity-${child.id}`}
                                          hideLabel
                                          label="สิ่งเจือปน*"
                                          options={impurityOptions}
                                          placeholder={impurityOptions.length > 0 ? 'เลือกสิ่งเจือปน' : 'ยังไม่มีสิ่งเจือปนที่ใช้งาน'}
                                          value={selectedImpurityId}
                                          onChange={(value) => {
                                            markTouched(`line-${child.id}-impurity`)
                                            updateLine(child.id, (current) => ({
                                              ...current,
                                              impurityId: value,
                                              impurityPurchaseAction: 'none',
                                              impurityProductId: isOtherProductImpurityOption(value) ? current.impurityProductId ?? '' : '',
                                            }))
                                          }}
                                        />
                                      </FieldBlock>
                                      {isOtherProductImpurity ? (
                                        <FieldBlock error={showError(`line-${child.id}-impurity-product`)} label="สินค้าที่ปนมา" labelClassName="md:hidden">
                                          <SearchCombobox
                                            disabled={!hasSelectedProduct}
                                            error={showError(`line-${child.id}-impurity-product`)}
                                            hideLabel
                                            inputId={`weight-impurity-product-${child.id}`}
                                            label="สินค้าที่ปนมา"
                                            options={impurityPurchaseProducts}
                                            placeholder="เลือกเมื่อต้องซื้อเพิ่ม"
                                            value={child.impurityProductId ?? ''}
                                            onChange={(value) => {
                                              markTouched(`line-${child.id}-impurity-product`)
                                              updateLine(child.id, (current) => ({ ...current, impurityPurchaseAction: 'none', impurityProductId: value }))
                                            }}
                                          />
                                        </FieldBlock>
                                      ) : hasOtherProductImpurity ? (
                                        <div className="hidden md:block" />
                                      ) : null}
                                      <FieldBlock label="ประเภทการหัก*" labelClassName="md:hidden">
                                        <SimpleDropdown
                                          disabled={!canEditImpurityDeduction}
                                          options={[
                                            { label: 'หัก (กก.)', value: 'kg' },
                                            { label: 'หัก %', value: 'percent' },
                                          ]}
                                          value={child.deductionMode}
                                          onChange={(value) => {
                                            const deductionMode = value as DeductionMode
                                            updateLine(child.id, (current) => ({
                                              ...current,
                                              deductionMode,
                                              impurityPurchaseAction: 'none',
                                              deductionValue: '',
                                            }))
                                          }}
                                        />
                                      </FieldBlock>
                                      <FieldBlock error={showError(`line-${child.id}-deduction`)} label={child.deductionMode === 'percent' ? 'ค่าหัก % *' : 'น้ำหนักหักสิ่งเจือปน(กก.) *'} labelClassName="md:hidden">
                                        <Input
                                          id={`weight-deduction-${child.id}`}
                                          className="md:w-[76px]"
                                          disabled={!canEditImpurityDeduction}
                                          inputMode="decimal"
                                          maxLength={5}
                                          placeholder="0.00"
                                          value={child.deductionValue}
                                          onBlur={() => markTouched(`line-${child.id}-deduction`)}
                                          onChange={(event) => updateLine(child.id, (current) => ({ ...current, deductionValue: normalizeDecimalInput(event.target.value), impurityPurchaseAction: 'none' }))}
                                        />
                                      </FieldBlock>
                                      {child.deductionMode === 'percent' ? (
                                        <FieldBlock label="น้ำหนักที่หัก" labelClassName="md:hidden">
                                          <Input
                                            disabled
                                            value={`${formatWeight(calculatedDeductionWeight)} กก.`}
                                          />
                                        </FieldBlock>
                                      ) : hasPercentDeduction ? (
                                        <div className="hidden md:block" />
                                      ) : null}
                                      <div className="flex justify-end pb-1 gap-2 md:mt-0">
                                        {isOtherProductImpurity ? (
                                          <div className="w-[76px]">
                                            <SimpleDropdown
                                              disabled={!canEditImpurityDeduction}
                                              options={[
                                                { label: 'ไม่ซื้อ', value: 'none' },
                                                { label: 'ซื้อ', value: 'buy' },
                                              ]}
                                              value={child.impurityPurchaseAction ?? 'none'}
                                              onChange={(value) => {
                                                const action = value as 'none' | 'buy'
                                                updateLine(child.id, (current) => ({ ...current, impurityPurchaseAction: action }))
                                                if (action === 'buy' && child.impurityProductId && Number(child.deductionValue || 0) > 0) {
                                                  buyImpurityDirect(child, child.impurityProductId)
                                                }
                                              }}
                                            />
                                          </div>
                                        ) : null}
                                        <Button
                                          size="sm"
                                          type="button"
                                          variant="ghost"
                                          aria-label="ลบรายการหักสิ่งเจือปน"
                                          title="ลบ"
                                          className="text-rose-600 hover:bg-rose-50 h-10 w-9 px-0 outline-none flex items-center justify-center font-semibold"
                                          onClick={() => removeImpurityLine(child)}
                                        >
                                          <Trash2 className="size-4" />
                                        </Button>
                                      </div>
                                    </div>
                                    {mustSelectImpurityProductFirst ? (
                                      <div className="mt-1 px-1 text-xs font-semibold text-amber-700">
                                        เลือกสินค้าที่ปนมาก่อน จึงจะกรอกน้ำหนักหักและเลือกซื้อ/ไม่ซื้อได้
                                      </div>
                                    ) : null}
                                    {isOtherProductImpurity ? (
                                      <div className="mt-2 border-t border-slate-100 pt-2">
                                        <FieldBlock label="รูปสินค้าที่ปนมา">
                                          <AttachmentProfileGrid
                                            id={`weight-images-${child.id}`}
                                            addLabel="เพิ่มรูป"
                                            emptyLabel="เพิ่มรูป"
                                            files={getLineImages(child)}
                                            disabled={!hasSelectedProduct}
                                            onAppend={(files) => void appendLineImages(child.id, files)}
                                            onPreview={setPreviewImage}
                                            onRemove={(fileId) => updateLine(child.id, (current) => ({
                                              ...current,
                                              imageFiles: getLineImages(current).filter((entry) => entry.id !== fileId),
                                            }))}
                                            noWrapper
                                          />
                                        </FieldBlock>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 lg:grid-cols-4">
                        <MiniMetric label="GROSS" value={`${formatWeight(lineTotals.grossWeight)} กก.`} />
                        <MiniMetric label="ภาชนะ" value={`${formatWeight(lineTotals.containerDeductionWeight)} กก.`} />
                        <MiniMetric label="สิ่งเจือปน" value={`${formatWeight(lineTotals.deductionWeight)} กก.`} />
                        <MiniMetric label="NET" value={`${formatWeight(lineTotals.netWeight)} กก.`} />
                      </div>

                      <div className="mt-4">
	                        <FieldBlock label="หมายเหตุรายการ">
	                          <textarea
	                            className={cn(
	                              "min-h-[88px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100",
	                              purchaseOnlyNote ? "bg-slate-50 text-slate-600" : "",
	                            )}
	                            disabled={Boolean(purchaseOnlyNote)}
	                            placeholder="เช่น ของเปียก มีเศษปน หรือรายละเอียดหน้างาน"
	                            rows={3}
	                            value={purchaseOnlyNote || line.note}
	                            onChange={(event) => updateLine(line.id, (current) => ({ ...current, note: event.target.value.slice(0, 160) }))}
	                          />
                        </FieldBlock>
                      </div>
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
      )}
      </div>

      <div className={cn(
        onClose
          ? "border-t border-slate-100 bg-slate-50 px-4 py-3 shrink-0 z-20"
          : "fixed inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm lg:left-64"
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
                <MetricInline label="รายการ" value={`${getMainParentLines(form.lines).length} รายการ`} />
                <MetricInline label="น้ำหนักรวม" value={`${formatWeight(totals.grossWeight)} กก.`} />
                <MetricInline label="หักภาชนะ" value={`${formatWeight(totals.containerDeductionWeight)} กก.`} />
                <MetricInline label="หักสิ่งเจือปน" value={`${formatWeight(totals.deductionWeight)} กก.`} />
                <MetricInline emphasis label="สุทธิ" value={`${formatWeight(totals.netWeight)} กก.`} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end sm:justify-end ml-auto">
            <Button disabled={isLoadingTicket || isSaving} type="button" variant="outline" onClick={backToList}>
              {!onClose && <ArrowLeft className="mr-1 h-4 w-4" />}
              {onClose ? 'ปิด' : 'กลับไปหน้ารายการ'}
            </Button>
            <Button className="bg-blue-600 font-normal hover:bg-blue-700 text-white" disabled={isLoadingTicket || isSaving} type="button" onClick={saveTicket}>
              {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => setPreviewImage(open ? previewImage : null)}>
        <DialogContent className="max-w-4xl rounded-md !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
          {previewImage ? (
            <>
              <DialogHeader className="rounded-t-md">
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
  disabled = false,
  options,
  value,
  onChange,
}: {
  disabled?: boolean
  options: Array<{ label: string; value: string }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <Combobox
        disabled={disabled}
        items={options.map((option) => ({ label: option.label, value: option.value }))}
        value={value}
        onValueChange={onChange}
      >
        <ComboboxInput
          className="h-10 rounded-md py-2 pl-4 text-sm text-slate-900"
          inputGroupClassName={cn("h-10 rounded-md border-slate-300 bg-white", disabled ? "opacity-60" : "")}
          placeholder=""
          readOnly
          withDropdownButton
        />
        <ComboboxContent>
          <ComboboxEmpty>ไม่พบข้อมูลที่ตรงกับคำค้นหา</ComboboxEmpty>
          <ComboboxList>
            {(item) => {
              const option = typeof item === 'string' ? { label: item, value: item } : item
              return (
                <ComboboxItem
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </ComboboxItem>
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
  labelClassName,
}: {
  children: ReactNode
  error?: string
  label: string
  labelClassName?: string
}) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label

  return (
    <div>
      <label className={cn("mb-1 block text-xs font-medium text-slate-600", labelClassName)}>
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
  hideSelectedCard = false,
}: {
  disabled: boolean
  products: OptionItem[]
  value: string
  onChange: (value: string) => void
  buttonClassName?: string
  hideSelectedCard?: boolean
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
    <div className={cn(!hideSelectedCard && "mt-2")}>
      <Button
        type="button"
        onClick={() => {
          setTempSelectedId(value)
          setIsOpen(true)
        }}
        className={cn(
          "w-full text-white flex items-center justify-center gap-1.5 h-10 rounded-md text-xs font-semibold",
          buttonClassName || "bg-blue-600 hover:bg-blue-700"
        )}
      >
        <Plus className="h-4 w-4" />
        {value ? 'เปลี่ยนสินค้า' : 'เลือกจากรูป'}
      </Button>

      {!hideSelectedCard && selectedProduct ? (
        <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-100 bg-white p-2 shadow-sm">
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
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{selectedProduct.category || 'ทั่วไป'}</div>
            <div className="truncate text-sm font-semibold text-slate-800">{selectedProduct.name ?? selectedProduct.label}</div>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-sm text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 transition"
          >
            ล้าง
          </button>
        </div>
      ) : null}

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel() }}>
        <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-md shadow-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="px-5 pt-4 pb-4 rounded-t-md flex flex-row items-center justify-between bg-slate-900 border-none">
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
                  category === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100',
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
                    category === item ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100',
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
                          : 'border-slate-100 hover:border-slate-300 hover:shadow-md',
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
                tempSelectedId ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-300 cursor-not-allowed"
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
  id,
  addLabel,
  disabled = false,
  emptyLabel,
  files,
  onAppend,
  onPreview,
  onRemove,
  noWrapper = false,
}: {
  id?: string
  addLabel: string
  disabled?: boolean
  emptyLabel: string
  files: AttachmentPreview[]
  onAppend: (files: FileList | null) => void
  onPreview: (file: AttachmentPreview) => void
  onRemove: (fileId: string) => void
  noWrapper?: boolean
}) {
  const content = (
    <div className="flex flex-wrap gap-3" id={id}>
      {files.map((file) => (
        <div className="w-28 min-w-0" key={file.id}>
          <button
            className="group relative block h-28 w-28 overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 hover:border-slate-400"
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
          <button className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline" disabled={disabled} type="button" onClick={() => onRemove(file.id)}>
            <Trash2 className="h-3 w-3" />
            ลบ
          </button>
        </div>
      ))}
      <label className={cn(
        "flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white p-3 text-center text-xs font-medium text-slate-500 shadow-sm hover:border-slate-400 hover:bg-slate-50",
        disabled ? "cursor-not-allowed opacity-60 hover:border-slate-300 hover:bg-white" : "cursor-pointer",
      )}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          <ImagePlus className="h-5 w-5" />
        </span>
        {files.length === 0 ? emptyLabel : addLabel}
        <input
          accept="image/*"
          className="hidden"
          disabled={disabled}
          multiple
          type="file"
          onChange={(event) => {
            onAppend(event.target.files)
            event.target.value = ''
          }}
        />
      </label>
    </div>
  )

  if (noWrapper) {
    return content
  }

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
      {content}
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-950 px-3.5 py-3.5 text-white shadow-sm">
      <div className="text-sm uppercase text-slate-400 tracking-wider font-semibold">{label}</div>
      <div className="mt-1.5 text-xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function MetricInline({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className={cn('tabular-nums font-bold', emphasis ? 'text-emerald-700 text-base font-extrabold' : 'text-slate-900 text-sm')}>{value}</div>
    </div>
  )
}

function SummaryMetricCard({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: any
  label: string
  value: string
  colorClass: { iconBg: string; iconText: string }
}) {
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-4">
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", colorClass.iconBg, colorClass.iconText)}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-500">{label}</div>
        <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums truncate">{value}</div>
      </div>
    </div>
  )
}
