'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Box, CheckCircle2, ChevronDown, Clock, ImagePlus, Pencil, Plus, Scale, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Card } from '@/components/ui/Card'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useActionConfirmation, useUnsavedChangesGuard } from '@/components/ui/FormSafetyProvider'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { WeightTicketAttachmentGrid as AttachmentProfileGrid, type WeightTicketAttachmentPreview as AttachmentPreview } from '@/components/daily/WeightTicketAttachmentGrid'
import { WeightTicketSaveProgress, useWeightTicketSaveProgress } from '@/components/daily/WeightTicketSaveProgress'
import { useWeightTicketRealtime } from '@/components/daily/useWeightTicketRealtime'
import { WeightTicketWtiFormSection, WeightTicketWtoFormSection } from '@/components/daily/WeightTicketTypeFormSections'
import { ApiError, getErrorMessage } from '@/lib/api-client'
import { recordImageDelivery } from '@/lib/client-image-delivery-telemetry'
import { cn } from '@/lib/utils'
import { cachedWeightTicketReferences, fetchFreshWeightTicketReferences } from '@/lib/weight-ticket-reference-cache'
import { invalidatePurchaseBillOptionsCache } from '@/lib/purchase-bill-options-cache'
import { mergeWeightTicketCollaborationBaseline } from '@/lib/weight-ticket-collaboration'
import { getWeightTicketSectionLineIds } from '@/lib/weight-ticket-sections'
import {
  calculateWeightTicketLineTotals,
  createWeightTicketLine,
  decodeStoredImageAsset,
  encodeStoredImageReference,
  formatWeight,
  getWeightTicket,
  isOtherProductImpurityId,
  isOtherProductImpurityLabel,
  normalizeDecimalInput,
  normalizeVehicleNo,
  OTHER_PRODUCT_IMPURITY_ID,
  OTHER_PRODUCT_IMPURITY_LABEL,
  saveWeightTicket,
  saveWeightTicketSection,
  WEIGHT_TICKET_STATUS,
  WEIGHT_TICKET_TYPE,
  type DeductionMode,
  type OptionItem,
  type WeightTicketRecord,
  type WeightTicketLine,
  type WeightTicketType,
} from '@/lib/weight-tickets'

type FormWeightTicketLine = WeightTicketLine & {
  imageFiles: AttachmentPreview[]
  impurityName?: string
  impurityPurchaseAction?: 'none' | 'buy'
  impurityProductId?: string
  impurityProductName?: string
  impuritySourceLineId?: string
  productName?: string
  warehouseName?: string
  warehouseType?: string
}

type FormState = {
  branchId: string
  branchName: string
  lines: FormWeightTicketLine[]
  partyId: string
  partyName: string
  remark: string
  type: WeightTicketType
  vehicleImageFiles: AttachmentPreview[]
  vehicleNo: string
  godownName: string
}

type CollaborationHeaderField = 'branchId' | 'partyId' | 'remark' | 'vehicleImageNames' | 'vehicleNo' | 'godownName'

function collaborationLineSnapshot(line: Pick<WeightTicketLine, 'containerDeductionWeight' | 'deductionMode' | 'deductionValue' | 'grossWeight' | 'id' | 'impurityId' | 'impurityProductId' | 'note' | 'productId' | 'warehouseId'>, imageNames: string[]) {
  return JSON.stringify({
    containerDeductionWeight: line.containerDeductionWeight,
    deductionMode: line.deductionMode,
    deductionValue: line.deductionValue,
    grossWeight: line.grossWeight,
    id: line.id,
    imageNames,
    impurityId: line.impurityId,
    impurityProductId: line.impurityProductId ?? '',
    note: line.note,
    productId: line.productId,
    warehouseId: line.warehouseId,
  })
}

type WeightTicketOptionsPayload = {
  branches?: Array<{ code?: string | null; id: string; name: string }>
}

type WeightTicketPartyOptionsPayload = {
  options?: Array<{ branchIds?: string[]; code?: string | null; id: string; name: string }>
}

type WeightTicketImpurityOptionsPayload = {
  options?: Array<{ id: string; label: string }>
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

const ADDED_IMPURITY_NOTE = 'หักสิ่งเจือปนเพิ่มเติม'
const MAX_WEIGHT_TICKET_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_WEIGHT_TICKET_FILE_BYTES = 10 * 1024 * 1024
const MAX_WEIGHT_TICKET_IMAGE_DIMENSION = 2400

export type WeightTicketDeletionLine = Pick<
  WeightTicketLine,
  | 'containerDeductionWeight'
  | 'deductionMode'
  | 'deductionValue'
  | 'grossWeight'
  | 'id'
  | 'imageNames'
  | 'impurityId'
  | 'impurityProductId'
  | 'note'
  | 'parentId'
  | 'productId'
  | 'warehouseId'
> & {
  imageFiles: AttachmentPreview[]
  impurityProductName?: string
  impurityPurchaseAction?: 'none' | 'buy'
  impuritySourceLineId?: string
}

function createFormWeightTicketLine(id?: string): FormWeightTicketLine {
  return {
    ...createWeightTicketLine(id),
    imageFiles: [],
  }
}

export function resolvePersistedWeightTicketLotSource(
  sourceLine: Pick<FormWeightTicketLine, 'productId' | 'warehouseId'>,
  persistedLines: Array<Pick<FormWeightTicketLine, 'id' | 'productId' | 'warehouseId'>>,
  sourceLineIndex: number,
) {
  const persistedSourceLine = persistedLines[sourceLineIndex]
  if (!persistedSourceLine) return null
  if (persistedSourceLine.productId !== sourceLine.productId) return null
  if (persistedSourceLine.warehouseId !== sourceLine.warehouseId) return null
  return persistedSourceLine
}

const lineErrorFields = 'product|warehouse|gross|container|images|impurity|impurity-product|deduction'

export function remapWeightTicketLineIds<T extends Pick<FormWeightTicketLine, 'id' | 'parentId' | 'impuritySourceLineId'>>(
  lines: T[],
  idMap: Record<string, string>,
) {
  return lines.map((line) => ({
    ...line,
    id: idMap[line.id] ?? line.id,
    parentId: line.parentId ? (idMap[line.parentId] ?? line.parentId) : line.parentId,
    impuritySourceLineId: line.impuritySourceLineId
      ? (idMap[line.impuritySourceLineId] ?? line.impuritySourceLineId)
      : line.impuritySourceLineId,
  }) as T)
}

export function remapWeightTicketLineKey(key: string, idMap: Record<string, string>) {
  const match = key.match(new RegExp(`^line-(.+?)-(${lineErrorFields})$`))
  if (!match) return key
  return `line-${idMap[match[1]] ?? match[1]}-${match[2]}`
}

function remapWeightTicketLineState(
  state: Record<string, boolean>,
  idMap: Record<string, string>,
) {
  return Object.entries(state).reduce<Record<string, boolean>>((next, [key, value]) => {
    const remappedKey = remapWeightTicketLineKey(key, idMap)
    next[remappedKey] = Boolean(next[remappedKey] || value)
    return next
  }, {})
}

export function shouldPersistWeightTicketBeforeAdding(type: WeightTicketType, lineCount: number) {
  return lineCount > 0 || type === 'WTI' || type === 'WTO'
}

const ADD_INTERACTION_DEBOUNCE_MS = 350

function initialForm(type: WeightTicketType = 'WTI'): FormState {
  return {
    branchId: '',
    branchName: '',
    lines: [],
    partyId: '',
    partyName: '',
    remark: '',
    type,
    vehicleImageFiles: [],
    vehicleNo: '',
    godownName: '',
  }
}

function formSafetySnapshot(form: FormState) {
  return JSON.stringify({
    branchId: form.branchId,
    godownName: form.godownName,
    lines: form.lines.map((line) => ({
      containerDeductionWeight: line.containerDeductionWeight,
      deductionMode: line.deductionMode,
      deductionValue: line.deductionValue,
      grossWeight: line.grossWeight,
      imageFiles: line.imageFiles.map((file) => file.rawValue),
      impurityId: line.impurityId,
      impurityProductId: line.impurityProductId,
      impurityPurchaseAction: line.impurityPurchaseAction,
      impuritySourceLineId: line.impuritySourceLineId,
      note: line.note,
      parentId: line.parentId,
      productId: line.productId,
      warehouseId: line.warehouseId,
    })),
    partyId: form.partyId,
    remark: form.remark,
    type: form.type,
    vehicleImageFiles: form.vehicleImageFiles.map((file) => file.rawValue),
    vehicleNo: form.vehicleNo,
  })
}

function makeFileId() {
  return `file-${Math.random().toString(36).slice(2, 10)}`
}

function getLineImages(line: FormWeightTicketLine) {
  return line.imageFiles ?? []
}

export function getProductCardImages(line: FormWeightTicketLine, allLines: FormWeightTicketLine[]) {
  const realLots = [
    ...(isImpurityPurchaseLine(line) ? [] : [line]),
    ...allLines.filter((entry) => (
      entry.parentId === line.id
      && entry.deductionMode === 'none'
      && !isImpurityPurchaseLine(entry)
    )),
  ]
  return realLots.flatMap(getLineImages).filter((file) => Boolean(file.url))
}

function WeightTicketLineCardThumbnail({ files }: { files: AttachmentPreview[] }) {
  const file = files[0]
  const startedAt = useRef(0)

  useEffect(() => {
    startedAt.current = performance.now()
  }, [file?.url])

  return (
    <div aria-hidden="true" className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-slate-400">
      {file ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            src={file.url}
            onError={() => recordImageDelivery({ outcome: 'error', startedAt: startedAt.current, url: file.url })}
            onLoad={() => recordImageDelivery({ outcome: 'loaded', startedAt: startedAt.current, url: file.url })}
          />
          {files.length > 1 ? (
            <span className="absolute bottom-0 right-0 min-w-5 rounded-tl-md bg-slate-950/80 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white">
              +{files.length - 1}
            </span>
          ) : null}
        </>
      ) : <ImagePlus className="size-4" />}
    </div>
  )
}

function getLineImpurityId(line: FormWeightTicketLine) {
  return line.impurityId ?? ''
}

function hasEnteredText(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function hasMeaningfulProductLineData(line: WeightTicketDeletionLine) {
  return Boolean(
    hasEnteredText(line.productId)
    || hasEnteredText(line.warehouseId)
    || hasEnteredText(line.grossWeight)
    || hasEnteredText(line.containerDeductionWeight)
    || line.deductionMode !== 'none'
    || hasEnteredText(line.deductionValue)
    || hasEnteredText(line.impurityId)
    || hasEnteredText(line.impurityProductId)
    || hasEnteredText(line.impurityProductName)
    || line.impurityPurchaseAction === 'buy'
    || hasEnteredText(line.impuritySourceLineId)
    || hasEnteredText(line.note)
    || line.imageFiles.length > 0
    || line.imageNames.length > 0,
  )
}

function hasMeaningfulLotData(line: WeightTicketDeletionLine) {
  return Boolean(
    hasEnteredText(line.grossWeight)
    || hasEnteredText(line.containerDeductionWeight)
    || line.deductionMode !== 'none'
    || hasEnteredText(line.deductionValue)
    || hasEnteredText(line.impurityId)
    || hasEnteredText(line.impurityProductId)
    || hasEnteredText(line.impurityProductName)
    || line.impurityPurchaseAction === 'buy'
    || hasEnteredText(line.impuritySourceLineId)
    || hasEnteredText(line.note)
    || line.imageFiles.length > 0
    || line.imageNames.length > 0,
  )
}

function isFreshImpurityLine(
  line: WeightTicketDeletionLine,
  sourceLine: WeightTicketDeletionLine,
  defaultImpurityId: string,
) {
  return (
    line.parentId === sourceLine.id
    && line.productId === sourceLine.productId
    && line.warehouseId === sourceLine.warehouseId
    && line.grossWeight === '0'
    && line.containerDeductionWeight === '0'
    && line.deductionMode === 'kg'
    && !hasEnteredText(line.deductionValue)
    && line.impurityId === defaultImpurityId
    && !hasEnteredText(line.impurityProductId)
    && !hasEnteredText(line.impurityProductName)
    && (line.impurityPurchaseAction ?? 'none') === 'none'
    && !hasEnteredText(line.impuritySourceLineId)
    && line.note === ADDED_IMPURITY_NOTE
    && line.imageFiles.length === 0
    && line.imageNames.length === 0
  )
}

function linesRemovedByLineRemoval(lines: WeightTicketDeletionLine[], lineId: string) {
  const childIds = new Set(lines.filter((line) => line.parentId === lineId).map((line) => line.id))
  return lines.filter((line) => (
    line.id === lineId
    || line.parentId === lineId
    || childIds.has(line.impuritySourceLineId ?? '')
  ))
}

export function shouldConfirmWeightTicketProductRemoval(lines: WeightTicketDeletionLine[], lineId: string) {
  return linesRemovedByLineRemoval(lines, lineId).some(hasMeaningfulProductLineData)
}

export function shouldConfirmWeightTicketLotRemoval(line: WeightTicketDeletionLine) {
  return hasMeaningfulLotData(line)
}

export function shouldConfirmWeightTicketImpurityRemoval(
  lines: WeightTicketDeletionLine[],
  sourceLineId: string,
  defaultImpurityId: string,
) {
  const sourceLine = lines.find((line) => line.id === sourceLineId)
  if (!sourceLine) return false

  const parentLine = sourceLine.parentId
    ? lines.find((line) => line.id === sourceLine.parentId)
    : undefined
  const isFresh = parentLine && isFreshImpurityLine(sourceLine, parentLine, defaultImpurityId)
  const removedPurchaseLines = lines.filter((line) => line.impuritySourceLineId === sourceLineId)

  return !isFresh || removedPurchaseLines.some(hasMeaningfulProductLineData)
}

type ActionConfirmationRequest = {
  cancelLabel: string
  confirmLabel: string
  description: string
  destructive: boolean
  onConfirm: () => void
  title: string
}

export function requestWeightTicketSelectionChange(
  shouldConfirm: boolean,
  requestConfirmation: (request: ActionConfirmationRequest) => void,
  confirmation: Omit<ActionConfirmationRequest, 'onConfirm'>,
  onConfirm: () => void,
) {
  if (!shouldConfirm) {
    onConfirm()
    return
  }
  requestConfirmation({ ...confirmation, onConfirm })
}

export function shouldConfirmWeightTicketBranchChange(
  lines: Array<Pick<WeightTicketDeletionLine, 'warehouseId'>>,
  partyWillBeCleared: boolean,
) {
  return partyWillBeCleared || lines.some((line) => hasEnteredText(line.warehouseId))
}

export function shouldConfirmWeightTicketProductChange(lines: WeightTicketDeletionLine[], lineId: string) {
  const targetLine = lines.find((line) => line.id === lineId)
  if (!targetLine) return false
  const targetDataWillBeCleared = Boolean(
    hasEnteredText(targetLine.warehouseId)
    || hasEnteredText(targetLine.grossWeight)
    || hasEnteredText(targetLine.containerDeductionWeight)
    || targetLine.deductionMode !== 'none'
    || hasEnteredText(targetLine.deductionValue)
    || hasEnteredText(targetLine.impurityId)
    || hasEnteredText(targetLine.impurityProductId)
    || hasEnteredText(targetLine.impurityProductName)
    || targetLine.impurityPurchaseAction === 'buy'
    || hasEnteredText(targetLine.impuritySourceLineId)
    || hasEnteredText(targetLine.note)
    || targetLine.imageFiles.length > 0
    || targetLine.imageNames.length > 0,
  )
  return targetDataWillBeCleared || linesRemovedByLineRemoval(lines, lineId)
    .filter((line) => line.id !== lineId)
    .some((line) => line.parentId === lineId && !line.impuritySourceLineId
      ? hasMeaningfulLotData(line)
      : hasMeaningfulProductLineData(line))
}

export function shouldConfirmWeightTicketImpurityChange(
  lines: WeightTicketDeletionLine[],
  sourceLineId: string,
  clearsDeductionValue = false,
  clearsImpurityProduct = false,
) {
  const sourceLine = lines.find((line) => line.id === sourceLineId)
  return Boolean(
    (clearsDeductionValue && hasEnteredText(sourceLine?.deductionValue))
    || (clearsImpurityProduct && (
      hasEnteredText(sourceLine?.impurityProductId)
      || hasEnteredText(sourceLine?.impurityProductName)
    ))
    || sourceLine?.impurityPurchaseAction === 'buy'
    || lines.filter((line) => line.impuritySourceLineId === sourceLineId).some(hasMeaningfulProductLineData),
  )
}

function isOtherProductImpurityOption(impurityId: string) {
  return isOtherProductImpurityId(impurityId)
}

function isImpurityPurchaseLine(line: FormWeightTicketLine) {
  return Boolean(line.impuritySourceLineId)
}

export function changeWeightTicketProduct(
  lines: FormWeightTicketLine[],
  lineId: string,
  productId: string,
  productName: string,
) {
  return lines.map((line) => (
    line.id === lineId
    || (line.parentId === lineId && !isImpurityPurchaseLine(line))
      ? { ...line, productId, productName }
      : line
  ))
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

function formatAttachmentFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateSelectedWeightTicketImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
    return `ไฟล์ ${file.name} ไม่รองรับ รองรับเฉพาะ JPG, PNG และ WebP`
  }
  if (file.size > MAX_WEIGHT_TICKET_FILE_BYTES) {
    return `ไฟล์ ${file.name} มีขนาด ${formatAttachmentFileSize(file.size)} เกิน 10 MB กรุณาเลือกรูปใหม่`
  }
  return null
}

async function createAttachmentPreviewFromFile(file: File): Promise<AttachmentPreview> {
  const validationError = validateSelectedWeightTicketImage(file)
  if (validationError) throw new Error(validationError)
  const uploadFile = await prepareWeightTicketImageFile(file)
  const body = new FormData()
  body.set('file', uploadFile)
  const response = await fetch('/api/daily/weight-tickets/attachments', { body, method: 'POST' })
  const payload = await response.json().catch(() => ({})) as {
    error?: string
    fileName?: string
    bucket?: string
    storageKey?: string
    url?: string
  }
  if (!response.ok || !payload.bucket || !payload.fileName || !payload.storageKey || !payload.url) {
    const statusHint = response.status === 413
      ? 'ไฟล์มีขนาดใหญ่เกินกว่าที่ระบบรับได้'
      : `เซิร์ฟเวอร์ตอบกลับ ${response.status || 'ไม่ทราบสถานะ'}`
    throw new Error(payload.error || `อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ (${statusHint})`)
  }
  return {
    fileName: payload.fileName,
    id: makeFileId(),
    // Keep only the durable private-bucket reference in the form payload.
    // The signed URL is preview-only and must never be persisted to the ticket.
    rawValue: encodeStoredImageReference(payload.fileName, undefined, payload.storageKey, payload.bucket),
    url: payload.url,
  }
}

async function prepareWeightTicketImageFile(file: File): Promise<File> {
  const imageType = file.type.toLowerCase()
  const imageConfig = imageType === 'image/jpeg'
    ? { extension: 'jpg', mimeType: 'image/jpeg', quality: 0.82 }
    : imageType === 'image/png'
      ? { extension: 'png', mimeType: 'image/png', quality: undefined }
      : imageType === 'image/webp'
        ? { extension: 'webp', mimeType: 'image/webp', quality: 0.82 }
        : null
  if (!imageConfig) {
    throw new Error(`ไฟล์ ${file.name} ไม่ใช่รูปภาพที่รองรับ (JPG, PNG หรือ WebP)`)
  }
  if (file.size <= MAX_WEIGHT_TICKET_UPLOAD_BYTES) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`ไม่สามารถอ่านรูป ${file.name} ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP ใหม่`)
  }

  try {
    const scale = Math.min(1, MAX_WEIGHT_TICKET_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error(`ไม่สามารถเตรียมรูป ${file.name} สำหรับอัปโหลดได้`)
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, imageConfig.mimeType, imageConfig.quality))
    if (!blob) throw new Error(`ไม่สามารถบีบอัดรูป ${file.name} สำหรับอัปโหลดได้`)
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${imageConfig.extension}`, {
      lastModified: file.lastModified,
      type: imageConfig.mimeType,
    })
  } finally {
    bitmap.close()
  }
}

function calculateAdjustedLineTotals(
  line: FormWeightTicketLine,
  calculation: ReturnType<typeof calculateWeightTicketLineTotals>,
) {
  return line.parentId
    ? calculation.lineTotalsById.get(line.id)!
    : calculation.sourceTotalsByLineId.get(line.id)!
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

function ticketToFormState(ticket: WeightTicketRecord): FormState {
  const lineIdByLineNo = new Map(ticket.lines.map((line) => [line.lineNo, line.id] as const))
  const lines: FormWeightTicketLine[] = ticket.lines.map((line) => {
    const relationSourceLineId = line.impuritySourceLineNo ? lineIdByLineNo.get(line.impuritySourceLineNo) : undefined
    const relationParentId = line.parentLineNo ? lineIdByLineNo.get(line.parentLineNo) : undefined
    return {
      containerDeductionWeight: line.containerDeductionWeight,
      deductionMode: line.deductionMode,
      deductionValue: line.deductionValue,
      grossWeight: line.grossWeight,
      id: line.id,
      imageNames: line.imageNames,
      imageFiles: line.imageNames.map(createAttachmentPreview),
      impurityId: line.impurityId,
      impurityName: line.impurityName,
      impurityProductId: line.impurityProductId || '',
      impurityProductName: line.impurityProductName || '',
      impuritySourceLineId: relationSourceLineId,
      impurityPurchaseAction: 'none',
      note: line.note,
      productId: line.productId,
      productName: line.productName,
      warehouseId: line.warehouseId,
      warehouseName: line.warehouseName,
      warehouseType: line.warehouseType,
      version: line.version,
      parentId: relationParentId,
    }
  })

  const assignedSourceIds = new Set<string>()
  const purchaseLineIds = new Set(
    ticket.lines
      .filter((line) => Boolean(line.impuritySourceLineNo))
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

  })

  return {
    branchId: ticket.branchId,
    branchName: ticket.branchName,
    lines,
    partyId: ticket.partyId,
    partyName: ticket.partyName,
    remark: ticket.remark,
    type: ticket.type,
    vehicleImageFiles: ticket.vehicleImageNames.map(createAttachmentPreview),
    vehicleNo: ticket.vehicleNo,
    godownName: ticket.godownName,
  }
}

function warehouseOptionsForLine(stock: WtoStockOptionsState[string] | undefined, line: FormWeightTicketLine) {
  const options = stock?.options ?? []
  if (!line.warehouseId) return options
  if (options.some((option) => option.id === line.warehouseId)) return options

  const labelParts = [line.warehouseName || line.warehouseId, line.warehouseType].filter(Boolean)
  return [
    {
      id: line.warehouseId,
      label: labelParts.join(' · '),
    },
    ...options.filter((option) => option.id !== line.warehouseId),
  ]
}

function selectedWarehouseForLine(stock: WtoStockOptionsState[string] | undefined, line: FormWeightTicketLine) {
  if (!line.warehouseId) return null
  return stock?.warehousesById[line.warehouseId] ?? null
}

function productOptionsForLine(options: OptionItem[], line: FormWeightTicketLine) {
  if (!line.productId) return options
  if (options.some((option) => option.id === line.productId)) return options
  return [
    {
      id: line.productId,
      label: line.productName || line.productId,
    },
    ...options,
  ]
}

function partyOptionsForForm(options: OptionItem[], form: FormState) {
  if (!form.partyId) return options
  if (options.some((option) => option.id === form.partyId)) return options
  return [
    {
      id: form.partyId,
      label: form.partyName || form.partyId,
    },
    ...options,
  ]
}

function branchOptionsForForm(options: OptionItem[], form: FormState) {
  if (!form.branchId) return options
  if (options.some((option) => option.id === form.branchId)) return options
  return [
    {
      id: form.branchId,
      label: form.branchName || form.branchId,
    },
    ...options,
  ]
}

function optionsWithCurrentValue(options: OptionItem[], id: string | null | undefined, label: string | null | undefined) {
  if (!id) return options
  if (options.some((option) => option.id === id)) return options
  return [
    {
      id,
      label: label || id,
    },
    ...options,
  ]
}

function parseTime(value: string | null | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatElapsedTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const time = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
  return days > 0 ? `${days} วัน ${time}` : time
}

function formatTimerDateTime(value: string | null | undefined) {
  const timestamp = parseTime(value)
  if (timestamp === null) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function weightTicketReceivedAt(ticket: WeightTicketRecord | null) {
  if (!ticket || ticket.type !== WEIGHT_TICKET_TYPE.WTI) return null
  const receivedEvents = ticket.timeline
    .filter((event) => event.metadata.toStatus === WEIGHT_TICKET_STATUS.RECEIVED)
    .sort((left, right) => (parseTime(left.occurredAt) ?? 0) - (parseTime(right.occurredAt) ?? 0))
  return receivedEvents[0]?.occurredAt ?? null
}

export type WeightTicketFormCoreProps = {
  initialType?: WeightTicketType
  hideTypeHeader?: boolean
  ticketId?: string
  embeddedModal?: boolean
  onClose?: () => void
  onRequestClose?: (requestClose: () => void) => void
  onDirtyChange?: (dirty: boolean) => void
  onSaveSuccess?: (ticket: WeightTicketRecord) => void
}

export function WeightTicketFormCore({
  initialType = 'WTI',
  hideTypeHeader = false,
  ticketId = '',
  embeddedModal = false,
  onClose,
  onRequestClose,
  onDirtyChange,
  onSaveSuccess,
}: WeightTicketFormCoreProps) {
  const router = useRouter()
  const editingTicketId = ticketId.trim()
  const [form, setForm] = useState<FormState>(() => initialForm(initialType))
  const formRef = useRef(form)
  const [formBaseline, setFormBaseline] = useState(() => formSafetySnapshot(initialForm(initialType)))
  const [branches, setBranches] = useState<OptionItem[]>([])
  const [suppliers, setSuppliers] = useState<OptionItem[]>([])
  const [customers, setCustomers] = useState<OptionItem[]>([])
  const [products, setProducts] = useState<OptionItem[]>([])
  const [stockOptions, setStockOptions] = useState<WtoStockOptionsState>({})
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [impurities, setImpurities] = useState<OptionItem[]>([])
  const [loadedTicket, setLoadedTicket] = useState<WeightTicketRecord | null>(null)
  const [savedTicket, setSavedTicket] = useState<WeightTicketRecord | null>(null)
  const { begin: beginSaveStage, end: endSaveStage, isSaving, stage: saveStage } = useWeightTicketSaveProgress()
  const [isLoadingTicket, setIsLoadingTicket] = useState(Boolean(editingTicketId))
  const [loadError, setLoadError] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [mergeNotice, setMergeNotice] = useState('')
  const [remoteChangedLineIds, setRemoteChangedLineIds] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<AttachmentPreview | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [activeLineId, setActiveLineId] = useState('')
  const [mobileProductView, setMobileProductView] = useState<'list' | 'editor'>('list')
  const [isMobileProductEditorVisible, setMobileProductEditorVisible] = useState(false)
  const mobileProductEditorCloseTimeoutRef = useRef<number | null>(null)
  const mobileProductEditorOpenAnimationFrameRef = useRef<number | null>(null)
  const saveInFlightRef = useRef<'auto_save' | 'save' | null>(null)
  const changedLineIdsRef = useRef<Set<string>>(new Set())
  const deletedLineIdsRef = useRef<Set<string>>(new Set())
  const dirtyHeaderFieldsRef = useRef<Set<CollaborationHeaderField>>(new Set())
  const remoteSyncInFlightRef = useRef(false)
  const pendingAttachmentUploadsRef = useRef<Set<Promise<unknown>>>(new Set())
  const lastAddInteractionRef = useRef<{ actionKey: string; occurredAt: number } | null>(null)
  const [collapsedLotIds, setCollapsedLotIds] = useState<Record<string, boolean>>({})
  const [collapsedImpurityIds, setCollapsedImpurityIds] = useState<Record<string, boolean>>({})
  const [pendingFocusField, setPendingFocusField] = useState<string | null>(null)
  const [draftStartedAt] = useState(() => new Date().toISOString())
  const [timerNow, setTimerNow] = useState(() => Date.now())
  const [isWeightTicketSummaryCollapsed, setIsWeightTicketSummaryCollapsed] = useState(true)

  useEffect(() => {
    formRef.current = form
  }, [form])

  function trackAttachmentUpload<T>(promise: Promise<T>) {
    let trackedPromise!: Promise<T>
    trackedPromise = promise.finally(() => {
      pendingAttachmentUploadsRef.current.delete(trackedPromise)
    })
    pendingAttachmentUploadsRef.current.add(trackedPromise)
    return trackedPromise
  }

  async function waitForPendingAttachmentUploads() {
    const pending = Array.from(pendingAttachmentUploadsRef.current)
    if (pending.length > 0) await Promise.allSettled(pending)
  }

  const cancelMobileProductEditorOpenAnimation = useCallback(() => {
    if (mobileProductEditorOpenAnimationFrameRef.current === null) return
    window.cancelAnimationFrame(mobileProductEditorOpenAnimationFrameRef.current)
    mobileProductEditorOpenAnimationFrameRef.current = null
  }, [])

  useLayoutEffect(() => {
    cancelMobileProductEditorOpenAnimation()

    if (mobileProductView !== 'editor') {
      if (mobileProductEditorCloseTimeoutRef.current !== null) {
        window.clearTimeout(mobileProductEditorCloseTimeoutRef.current)
        mobileProductEditorCloseTimeoutRef.current = null
      }
      setMobileProductEditorVisible(false)
      return
    }

    setMobileProductEditorVisible(false)
    mobileProductEditorOpenAnimationFrameRef.current = window.requestAnimationFrame(() => {
      mobileProductEditorOpenAnimationFrameRef.current = window.requestAnimationFrame(() => {
        mobileProductEditorOpenAnimationFrameRef.current = null
        setMobileProductEditorVisible(true)
      })
    })
    return cancelMobileProductEditorOpenAnimation
  }, [cancelMobileProductEditorOpenAnimation, mobileProductView])

  useEffect(() => () => {
    if (mobileProductEditorCloseTimeoutRef.current !== null) {
      window.clearTimeout(mobileProductEditorCloseTimeoutRef.current)
    }
  }, [])

  const isFormDirty = formSafetySnapshot(form) !== formBaseline
  const { requestDiscard } = useUnsavedChangesGuard(isFormDirty)
  const { requestConfirmation } = useActionConfirmation()
  useEffect(() => {
    onDirtyChange?.(isFormDirty)
  }, [isFormDirty, onDirtyChange])

  const realtimeBranchIds = useMemo(() => {
    const branchId = (savedTicket ?? loadedTicket)?.branchId
    return branchId ? [branchId] : []
  }, [loadedTicket, savedTicket])

  useWeightTicketRealtime((event) => {
    if (!editingTicketId || event.documentNo !== editingTicketId) return
    if (saveInFlightRef.current) return
    if (event.updatedAt && event.updatedAt === (savedTicket ?? loadedTicket)?.updatedAt) return
    const changedLines = event.lineIds?.length ? ` (${event.lineIds.length} เต๋า)` : ''
    setRemoteChangedLineIds(new Set(event.lineIds ?? []))
    setMergeNotice(`มีผู้ใช้อื่นบันทึก${changedLines} ระบบคงข้อมูลที่กำลังกรอกไว้ กรุณาตรวจสอบก่อนบันทึก`)

    if (remoteSyncInFlightRef.current) return
    remoteSyncInFlightRef.current = true
    void getWeightTicket(editingTicketId, { includeImagePreviews: false })
      .then((latestTicket) => {
        const latestForm = ticketToFormState(latestTicket)
        const latestById = new Map(latestForm.lines.map((line) => [line.id, line] as const))
        const baselineTicket = savedTicket ?? loadedTicket
        const currentForm = formRef.current
        const dirtyHeaderFields = new Set(dirtyHeaderFieldsRef.current)
        if (baselineTicket) {
          if (currentForm.branchId !== baselineTicket.branchId) dirtyHeaderFields.add('branchId')
          if (currentForm.partyId !== baselineTicket.partyId) dirtyHeaderFields.add('partyId')
          if (currentForm.remark !== baselineTicket.remark) dirtyHeaderFields.add('remark')
          if (currentForm.vehicleNo !== baselineTicket.vehicleNo) dirtyHeaderFields.add('vehicleNo')
          if (currentForm.godownName !== baselineTicket.godownName) dirtyHeaderFields.add('godownName')
          if (JSON.stringify(currentForm.vehicleImageFiles.map((file) => file.rawValue)) !== JSON.stringify(baselineTicket.vehicleImageNames)) dirtyHeaderFields.add('vehicleImageNames')
        }
        const dirtyLineIds = new Set(changedLineIdsRef.current)
        currentForm.lines
          .filter((line) => line.version == null)
          .forEach((line) => dirtyLineIds.add(line.id))
        const mergedBaseline = mergeWeightTicketCollaborationBaseline({
          baselineTicket,
          dirtyHeaderFields,
          dirtyLineIds,
          latestTicket,
        })
        setLoadedTicket(latestTicket)
        setSavedTicket(mergedBaseline)
        setFormBaseline(formSafetySnapshot(latestForm))
        setForm((current) => {
          const localById = new Map(current.lines.map((line) => [line.id, line] as const))
          const mergedLines = latestForm.lines.map((latestLine) => {
            if (deletedLineIdsRef.current.has(latestLine.id)) return null
            const localLine = localById.get(latestLine.id)
            return localLine && (changedLineIdsRef.current.has(latestLine.id) || localLine.version == null)
              ? localLine
              : latestLine
          }).filter((line): line is FormWeightTicketLine => line !== null)
          const localOnlyDraftLines = current.lines.filter((line) => !latestById.has(line.id) && !deletedLineIdsRef.current.has(line.id) && (changedLineIdsRef.current.has(line.id) || line.version == null))
          return {
            ...current,
            branchId: dirtyHeaderFields.has('branchId') ? current.branchId : latestForm.branchId,
            branchName: dirtyHeaderFields.has('branchId') ? current.branchName : latestForm.branchName,
            partyId: dirtyHeaderFields.has('partyId') ? current.partyId : latestForm.partyId,
            partyName: dirtyHeaderFields.has('partyId') ? current.partyName : latestForm.partyName,
            remark: dirtyHeaderFields.has('remark') ? current.remark : latestForm.remark,
            vehicleImageFiles: dirtyHeaderFields.has('vehicleImageNames') ? current.vehicleImageFiles : latestForm.vehicleImageFiles,
            vehicleNo: dirtyHeaderFields.has('vehicleNo') ? current.vehicleNo : latestForm.vehicleNo,
            godownName: dirtyHeaderFields.has('godownName') ? current.godownName : latestForm.godownName,
            lines: [...mergedLines, ...localOnlyDraftLines],
          }
        })
      })
      .catch(() => {
        // Realtime remains an accelerator; the next explicit save/load is authoritative.
      })
      .finally(() => {
        remoteSyncInFlightRef.current = false
      })
  }, Boolean(editingTicketId), realtimeBranchIds)

  const partyOptions = useMemo(() => {
    const options = form.type === 'WTI' ? suppliers : customers
    if (!form.branchId) return []
    return options.filter((option) => option.branchIds?.includes(form.branchId))
  }, [customers, form.branchId, form.type, suppliers])
  const lineCalculation = useMemo(() => calculateWeightTicketLineTotals(form.lines), [form.lines])
  const totals = lineCalculation.totals

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
  const isEmbeddedModal = embeddedModal || Boolean(onClose)
  const embeddedModalTitle = editingTicketId
    ? 'แก้ไขใบรับ-ส่งของ'
    : form.type === 'WTI'
      ? 'สร้างใบรับของ WTI'
      : 'สร้างใบส่งของ WTO'
  const isWeightTicketIn = form.type === WEIGHT_TICKET_TYPE.WTI
  const canShowWeightTicketTimer = isWeightTicketIn && (!editingTicketId || Boolean(loadedTicket))
  const timerStartAt = editingTicketId ? loadedTicket?.createdAt ?? null : draftStartedAt
  const timerStopAt = weightTicketReceivedAt(loadedTicket)
  const timerStartMs = parseTime(timerStartAt)
  const timerStopMs = parseTime(timerStopAt)
  const timerElapsedMs = timerStartMs === null ? 0 : (timerStopMs ?? timerNow) - timerStartMs
  const weightTicketItemCount = getMainParentLines(form.lines).length
  const activeLine = useMemo(
    () => {
      const parentLines = getMainParentLines(form.lines)
      const found = parentLines.find((line) => line.id === activeLineId)
      return found ?? parentLines[0] ?? null
    },
    [activeLineId, form.lines],
  )

  useEffect(() => {
    if (!isEmbeddedModal || !isWeightTicketIn || !canShowWeightTicketTimer || timerStopMs !== null) return
    const intervalId = window.setInterval(() => setTimerNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [canShowWeightTicketTimer, isEmbeddedModal, isWeightTicketIn, timerStopMs])

  useEffect(() => {
    setIsWeightTicketSummaryCollapsed(true)
  }, [editingTicketId, isEmbeddedModal])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function loadOptionData() {
      setIsLoadingProducts(true)
      try {
        const [data, productData] = await Promise.all([
          cachedWeightTicketReferences<WeightTicketOptionsPayload>('/api/daily/weight-tickets/options'),
          fetchFreshWeightTicketReferences<WeightTicketProductsPayload>('/api/daily/weight-tickets/products'),
        ])

        if (!cancelled && !controller.signal.aborted) {
          setBranches((data.branches ?? []).map((branch) => ({
            code: branch.code ?? undefined,
            description: branch.code ? `รหัสสาขา ${branch.code}` : undefined,
            id: branch.id,
            label: branch.name,
          })))
          setProducts((productData.rows ?? []).map((product) => ({
            category: product.type ?? undefined,
            code: product.code ?? undefined,
            description: product.type || undefined,
            id: product.id,
            imageUrl: product.thumbnailUrl ?? undefined,
            label: `${product.code ? `${product.code} - ` : ''}${product.name}${product.unit ? ` - ${product.unit}` : ''}`,
            name: product.name,
          })))
        }
      } catch (caught) {
        if (!cancelled && !controller.signal.aborted) setLoadError(getErrorMessage(caught, 'โหลดข้อมูลอ้างอิงสำหรับใบรับ-ส่งของไม่ได้'))
      } finally {
        if (!cancelled && !controller.signal.aborted) setIsLoadingProducts(false)
      }
    }

    void loadOptionData()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

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
    if (!form.branchId) {
      setSuppliers([])
      setCustomers([])
      return
    }

    const controller = new AbortController()
    let cancelled = false
    const params = new URLSearchParams({ branchId: form.branchId, type: form.type })

    async function loadPartyOptions() {
      try {
        const data = await fetchFreshWeightTicketReferences<WeightTicketPartyOptionsPayload>(
          `/api/daily/weight-tickets/party-options?${params.toString()}`,
        )
        if (cancelled || controller.signal.aborted) return
        const options = (data.options ?? []).map((party) => {
          const code = party.code?.trim() ?? ''
          return {
            code: code || undefined,
            description: code ? `${form.type === 'WTI' ? 'Supplier' : 'Customer'} · ${code}` : form.type === 'WTI' ? 'Supplier' : 'Customer',
            branchIds: party.branchIds ?? [],
            id: party.id,
            label: party.name,
            searchText: [code, party.name].filter(Boolean).join(' '),
          }
        })
        if (form.type === 'WTI') setSuppliers(options)
        else setCustomers(options)
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          if (form.type === 'WTI') setSuppliers([])
          else setCustomers([])
        }
      }
    }

    void loadPartyOptions()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [form.branchId, form.type])

  useEffect(() => {
    let cancelled = false
    async function loadImpurityOptions() {
      try {
        const data = await fetchFreshWeightTicketReferences<WeightTicketImpurityOptionsPayload>('/api/daily/weight-tickets/impurity-options')
        if (!cancelled) setImpurities((data.options ?? []).filter((impurity) => !isOtherProductImpurityLabel(impurity.label)))
      } catch {
        if (!cancelled) setImpurities([])
      }
    }
    void loadImpurityOptions()
    return () => { cancelled = true }
  }, [])

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
        const nextForm = ticketToFormState(ticket)
        setLoadedTicket(ticket)
        setForm(nextForm)
        setFormBaseline(formSafetySnapshot(nextForm))
        setSavedTicket(ticket)
        changedLineIdsRef.current.clear()
        deletedLineIdsRef.current.clear()
        dirtyHeaderFieldsRef.current.clear()
        setActiveLineId('')
        setMobileProductView('list')
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
    if (errorKey === 'lines') return 'weight-ticket-add-product'

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
        if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA' || element.tagName === 'BUTTON') {
          element.focus()
        }
        setPendingFocusField(null)
      } else {
        timeoutId = window.setTimeout(() => {
          const secondTry = document.getElementById(elementId)
          if (secondTry) {
            secondTry.scrollIntoView({ behavior: 'smooth', block: 'center' })
            if (secondTry.tagName === 'INPUT' || secondTry.tagName === 'SELECT' || secondTry.tagName === 'TEXTAREA' || secondTry.tagName === 'BUTTON') {
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
    if (form.type === 'WTO' && !form.godownName.trim()) next.godownName = 'กรอกโกดัง'

    const parentLines = getMainParentLines(form.lines)
    if (form.type === 'WTO' && parentLines.length === 0) next.lines = 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'

    form.lines.forEach((line) => {
      if (isImpurityPurchaseLine(line)) return
      const isImpurity = !!line.parentId && line.deductionMode !== 'none';
      const isSecondaryLot = !!line.parentId && line.deductionMode === 'none';
      const isParent = !line.parentId;

      if (lineCalculation.invalidChildProductLineIds.has(line.id)) {
        next[`line-${line.parentId ?? line.id}-product`] = 'สินค้าของรายการย่อยต้องตรงกับสินค้าของรายการหลัก'
      }
      if (lineCalculation.overflowingChildImpurityLineIds.has(line.id)) {
        next[`line-${line.id}-deduction`] = 'ยอดหักรวมต้องไม่เกินน้ำหนักรวม'
      }

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
  }, [form, impurityOptions, lineCalculation])

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

  function toggleImpurityCollapsed(impurityId: string) {
    setCollapsedImpurityIds((current) => ({ ...current, [impurityId]: !current[impurityId] }))
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (key === 'branchId' || key === 'partyId' || key === 'remark' || key === 'vehicleNo' || key === 'godownName') {
      dirtyHeaderFieldsRef.current.add(key)
    }
    setForm((current) => ({ ...current, [key]: value }))
  }

  function markLinesDirty(lineIds: Iterable<string>) {
    for (const lineId of lineIds) changedLineIdsRef.current.add(lineId)
  }

  function markLinesDeleted(lineIds: Iterable<string>) {
    const ids = Array.from(lineIds)
    for (const lineId of ids) deletedLineIdsRef.current.add(lineId)
    markLinesDirty(ids)
  }

  function changeBranch(value: string | null) {
    const branchId = value ?? ''
    const currentParty = (form.type === 'WTI' ? suppliers : customers)
      .find((option) => option.id === form.partyId && option.branchIds?.includes(branchId))
    if (branchId === form.branchId) return
    requestWeightTicketSelectionChange(
      shouldConfirmWeightTicketBranchChange(form.lines, Boolean(form.partyId && !currentParty)),
      requestConfirmation,
      {
        cancelLabel: 'ไม่เปลี่ยน',
        confirmLabel: 'เปลี่ยนสาขา',
        description: 'คลังสินค้าและคู่ค้าที่ใช้กับสาขาเดิมจะถูกล้างจากใบรับ-ส่งของนี้',
        destructive: true,
        title: 'เปลี่ยนสาขา?',
      },
      () => {
        setForm((current) => {
          dirtyHeaderFieldsRef.current.add('branchId')
          if (current.partyId && !currentParty) dirtyHeaderFieldsRef.current.add('partyId')
          markLinesDirty(current.lines.map((line) => line.id))
          const selectedBranch = branches.find((branch) => branch.id === branchId)
          const party = (current.type === 'WTI' ? suppliers : customers)
            .find((option) => option.id === current.partyId && option.branchIds?.includes(branchId))
          return {
            ...current,
            branchId,
            branchName: selectedBranch?.label ?? '',
            lines: current.lines.map((line) => ({ ...line, warehouseId: '', warehouseName: '', warehouseType: '' })),
            partyId: party ? current.partyId : '',
            partyName: party?.label ?? '',
          }
        })
      },
    )
  }

  function updateLine(lineId: string, updater: (line: FormWeightTicketLine) => FormWeightTicketLine) {
    changedLineIdsRef.current.add(lineId)
    setForm((current) => {
      const updatedLines = current.lines.map((line) => line.id === lineId ? updater(line) : line)
      const target = updatedLines.find((line) => line.id === lineId)
      const cleanedLines = target?.impurityPurchaseAction === 'buy'
        ? updatedLines
        : removeImpurityPurchaseLinesForSource(updatedLines, lineId)
      markLinesDirty(cleanedLines.filter((line) => line.id === lineId || line.parentId === lineId).map((line) => line.id))
      markLinesDeleted(current.lines.filter((line) => !cleanedLines.some((nextLine) => nextLine.id === line.id)).map((line) => line.id))
      if (target && !target.parentId) {
        return {
          ...current,
          lines: cleanedLines.map((line) => {
            if (line.parentId === target.id) {
              return {
                ...line,
                productId: target.productId,
                productName: target.productName,
                warehouseId: target.warehouseId,
                warehouseName: target.warehouseName,
                warehouseType: target.warehouseType,
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

  function getLineEvidenceImagesForState(sourceForm: FormState, line: FormWeightTicketLine) {
    if (!isImpurityPurchaseLine(line)) return getLineImages(line)
    const sourceLine = sourceForm.lines.find((entry) => entry.id === line.impuritySourceLineId)
    const sourceParentLine = sourceLine?.parentId
      ? sourceForm.lines.find((entry) => entry.id === sourceLine.parentId)
      : null
    return getLineImages(sourceParentLine ?? sourceLine ?? line)
  }

  function shouldIgnoreRapidAdd(actionKey: string) {
    // This function only runs from user interaction handlers, not during render.
    // eslint-disable-next-line react-hooks/purity
    const occurredAt = Date.now()
    const previous = lastAddInteractionRef.current
    if (
      previous?.actionKey === actionKey
      && occurredAt - previous.occurredAt < ADD_INTERACTION_DEBOUNCE_MS
    ) return true

    lastAddInteractionRef.current = { actionKey, occurredAt }
    return false
  }

  async function saveDraftBeforeAdding(snapshot: FormState = form): Promise<FormState | null> {
    // Save the current document before opening another product entry so the
    // draft has a stable ticket identity and existing data is not lost.
    if (isSaving || isLoadingTicket || saveInFlightRef.current) return null
    const headerErrorKeys = ['branchId', 'partyId', 'vehicleNo', 'godownName']
    const firstHeaderError = headerErrorKeys.find((key) => errors[key])
    if (firstHeaderError) {
      setTouched((current) => ({ ...current, [firstHeaderError]: true }))
      setPendingFocusField(firstHeaderError)
      return null
    }
    const firstLineError = Object.keys(errors).find((key) => key === 'lines' || key.startsWith('line-'))
    if (snapshot.lines.length > 0 && firstLineError) {
      setTouched((current) => ({ ...current, [firstLineError]: true }))
      setPendingFocusField(firstLineError)
      // Keep the product workspace usable while a blank entry is being filled.
      // A line with a selected product still must pass validation before the
      // existing draft is persisted and another product is opened.
      return snapshot.lines.some((line) => !line.productId) ? snapshot : null
    }

    // Both WTI and WTO persist an empty header draft before the first product
    // editor opens. The API marks this as a header-only save and skips line
    // validation until the user has selected a product.
    if (!shouldPersistWeightTicketBeforeAdding(snapshot.type, snapshot.lines.length)) return snapshot

    saveInFlightRef.current = 'auto_save'
    beginSaveStage('auto_save')
    try {
      await waitForPendingAttachmentUploads()
      const latestForm = formRef.current
      const baselineLines = new Map((savedTicket ?? loadedTicket)?.lines.map((line) => [line.id, line] as const) ?? [])
      const baselineTicket = savedTicket ?? loadedTicket
      const latestLinesById = new Map(latestForm.lines.map((line) => [line.id, line]))
      const snapshotToSave: FormState = {
        ...snapshot,
        // A background save establishes the document identity and persists
        // only lines that already have a stable server identity. The live
        // form may contain a new temporary line that is still being edited;
        // the explicit save will persist it later without ID reconciliation
        // deleting the server line created by this background save.
        lines: snapshot.lines.filter((line) => line.version != null || baselineLines.has(line.id)).map((line) => ({
          ...line,
          imageFiles: latestLinesById.get(line.id)?.imageFiles ?? line.imageFiles,
        })),
        vehicleImageFiles: latestForm.vehicleImageFiles,
      }
      const baselineLineIds = Array.from(baselineLines.keys())
      const deletedLineIds = new Set(deletedLineIdsRef.current)
      baselineLineIds.filter((lineId) => !snapshotToSave.lines.some((line) => line.id === lineId)).forEach((lineId) => deletedLineIds.add(lineId))
      const changedLineIds = new Set(changedLineIdsRef.current)
      deletedLineIds.forEach((lineId) => changedLineIds.add(lineId))
      snapshotToSave.lines.forEach((line) => {
        const baseline = baselineLines.get(line.id)
        const currentFingerprint = collaborationLineSnapshot(line, getLineEvidenceImagesForState(snapshotToSave, line).map((file) => file.rawValue))
        const baselineFingerprint = baseline ? collaborationLineSnapshot(baseline, baseline.imageNames) : null
        if (!baseline || currentFingerprint !== baselineFingerprint) changedLineIds.add(line.id)
      })
      const ticket = await saveWeightTicket({
        branchId: snapshotToSave.branchId,
        collaborationBaseDocumentNo: (savedTicket ?? loadedTicket)?.documentNo,
        collaborationBaseLineIds: baselineLineIds,
        collaborationBaseLineVersions: Object.fromEntries(Array.from(baselineLines.entries()).map(([lineId, line]) => [lineId, line.version ?? 1])),
        collaborationChangedLineIds: Array.from(changedLineIds),
        collaborationDeletedLineIds: Array.from(deletedLineIds),
        collaborationBaseHeader: baselineTicket ? {
          branchId: baselineTicket.branchId,
          partyId: baselineTicket.partyId,
          remark: baselineTicket.remark,
          vehicleImageNames: baselineTicket.vehicleImageNames,
          vehicleNo: baselineTicket.vehicleNo,
          godownName: baselineTicket.godownName,
        } : undefined,
        collaborationChangedHeaderFields: baselineTicket ? (['branchId', 'partyId', 'remark', 'vehicleImageNames', 'vehicleNo', 'godownName'] as const).filter((field) => JSON.stringify(field === 'vehicleImageNames' ? snapshotToSave.vehicleImageFiles.map((file) => file.rawValue) : snapshotToSave[field]) !== JSON.stringify(baselineTicket[field])) : [],
        collaborationBaseUpdatedAt: (savedTicket ?? loadedTicket)?.updatedAt ?? null,
        id: savedTicket?.id ?? editingTicketId,
        lines: snapshotToSave.lines.map((line) => ({
          containerDeductionWeight: Number(line.containerDeductionWeight || 0),
          deductionMode: line.deductionMode,
          deductionValue: Number(line.deductionValue || 0),
          grossWeight: Number(line.grossWeight || 0),
          id: line.id,
          version: line.version,
          imageNames: getLineEvidenceImagesForState(snapshotToSave, line).map((file) => file.rawValue),
          impurityId: getLineImpurityId(line),
          impurityProductId: line.impurityProductId ?? '',
          impuritySourceLineId: line.impuritySourceLineId,
          note: line.note,
          productId: line.productId,
          warehouseId: line.warehouseId,
          parentId: line.parentId,
        })),
        partyId: snapshotToSave.partyId,
        remark: snapshotToSave.remark.trim(),
        saveScope: snapshotToSave.lines.length === 0 ? 'header' : undefined,
        type: snapshotToSave.type,
        vehicleImageNames: snapshotToSave.vehicleImageFiles.map((file) => file.rawValue),
        vehicleNo: snapshotToSave.vehicleNo.trim(),
        godownName: snapshotToSave.godownName.trim(),
      })
      invalidatePurchaseBillOptionsCache()
      const nextForm = ticketToFormState(ticket)
      setLoadedTicket(ticket)
      // Keep the returned ticket as the collaboration baseline even when
      // the live form contains a temporary line excluded from this save.
      // This preserves the draft document ID for the next explicit save.
      setSavedTicket(ticket)
      // This is a background save started by "เพิ่มสินค้า". Keep the live
      // form untouched because the user may already be editing the newly
      // opened line while this response is in flight.
      setFormBaseline(formSafetySnapshot(nextForm))
      setLoadError('')
      return nextForm
    } catch (caught) {
      setLoadError(getErrorMessage(caught, 'บันทึกแบบร่างก่อนเพิ่มรายการไม่ได้'))
      return null
    } finally {
      endSaveStage()
      saveInFlightRef.current = null
    }
  }

  function changeLineProduct(lineId: string, productId: string) {
    markLinesDirty(form.lines.filter((line) => line.id === lineId || line.parentId === lineId).map((line) => line.id))
    setMergeNotice('')
    setForm((current) => {
      const targetLine = current.lines.find((line) => line.id === lineId)
      if (!targetLine || targetLine.productId === productId) return current

      return {
        ...current,
        lines: changeWeightTicketProduct(
          current.lines,
          lineId,
          productId,
          products.find((product) => product.id === productId)?.label ?? '',
        ),
      }
    })
  }

  async function addLine() {
    setMergeNotice('')
    const headerErrorKeys = ['branchId', 'partyId', 'vehicleNo', 'godownName']
    const firstHeaderError = headerErrorKeys.find((key) => errors[key])
    const firstLineError = Object.keys(errors).find((key) => key === 'lines' || key.startsWith('line-'))
    const hasBlockingLineError = form.lines.length > 0
      && Boolean(firstLineError)
      && !form.lines.some((line) => !line.productId)

    if (firstHeaderError || hasBlockingLineError) {
      void saveDraftBeforeAdding()
      return
    }

    // Keep the add-product interaction independent from background draft
    // persistence. Only the explicit final save may replace the live form.
    if (isLoadingTicket || saveInFlightRef.current === 'save') return
    if (shouldIgnoreRapidAdd('product')) return

    const nextLine = createFormWeightTicketLine()
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }))
    setActiveLineId(nextLine.id)
    setMobileProductView('editor')
    void saveDraftBeforeAdding(form)
  }

  const closeMobileProductEditor = useCallback((focusTargetId = activeLineId, onClosed?: () => void) => {
    if (mobileProductEditorCloseTimeoutRef.current !== null) return

    cancelMobileProductEditorOpenAnimation()
    const finishClose = () => {
      mobileProductEditorCloseTimeoutRef.current = null
      setMobileProductView('list')
      onClosed?.()
      window.requestAnimationFrame(() => {
        document.getElementById(`weight-ticket-line-card-${focusTargetId}`)?.focus()
      })
    }

    setMobileProductEditorVisible(false)
    mobileProductEditorCloseTimeoutRef.current = window.setTimeout(finishClose, 400)
  }, [activeLineId, cancelMobileProductEditorOpenAnimation])

  useEffect(() => {
    if (mobileProductView !== 'editor') return

    const handleMobileProductEditorKeyDown = (event: KeyboardEvent) => {
      if (window.matchMedia('(min-width: 1280px)').matches || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeMobileProductEditor()
    }

    document.addEventListener('keydown', handleMobileProductEditorKeyDown)
    return () => document.removeEventListener('keydown', handleMobileProductEditorKeyDown)
  }, [closeMobileProductEditor, mobileProductView])

  function addSameProductLot(sourceLine: FormWeightTicketLine) {
    setMergeNotice('')
    const sourceLineIndex = form.lines.findIndex((line) => line.id === sourceLine.id)
    const firstHeaderError = ['branchId', 'partyId', 'vehicleNo', 'godownName'].find((key) => errors[key])
    const firstLineError = Object.keys(errors).find((key) => key === 'lines' || key.startsWith('line-'))
    const hasBlockingLineError = form.lines.length > 0
      && Boolean(firstLineError)
      && !form.lines.some((line) => !line.productId)
    // Auto-save must not block the local lot editor. Only the explicit final
    // save may prevent a new lot from being added because it replaces the form
    // with the persisted response when it completes.
    const isFinalSaveInFlight = saveInFlightRef.current === 'save'
    if (firstHeaderError || hasBlockingLineError || isFinalSaveInFlight || isLoadingTicket) {
      if (firstHeaderError || hasBlockingLineError) void saveDraftBeforeAdding()
      return
    }
    if (shouldIgnoreRapidAdd(`lot:${sourceLine.id}`)) return

    const draftSnapshot = form
    const nextLine = createFormWeightTicketLine()
    nextLine.productId = sourceLine.productId
    nextLine.warehouseId = sourceLine.warehouseId
    nextLine.parentId = sourceLine.id
    const existingLotIds = form.lines
      .filter((line) => (
        line.id === sourceLine.id
        || (line.parentId === sourceLine.id && !isImpurityPurchaseLine(line) && line.deductionMode === 'none')
      ))
      .map((line) => line.id)
    setCollapsedLotIds((current) => ({
      ...current,
      ...Object.fromEntries(existingLotIds.map((lotId) => [lotId, true])),
      [nextLine.id]: false,
    }))
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }))
    setPendingFocusField(`line-${nextLine.id}-gross`)

    const draftSave = saveDraftBeforeAdding(draftSnapshot)
    void draftSave.then((savedForm) => {
      if (!savedForm) return
      const persistedSourceLine = resolvePersistedWeightTicketLotSource(sourceLine, savedForm.lines, sourceLineIndex)
      if (!persistedSourceLine || persistedSourceLine.id === sourceLine.id) return
      const lineIdMap = { [sourceLine.id]: persistedSourceLine.id }

      setForm((current) => ({
        ...current,
        lines: remapWeightTicketLineIds(current.lines, lineIdMap),
      }))
      setCollapsedLotIds((current) => {
        return remapWeightTicketLineState(current, lineIdMap)
      })
      setCollapsedImpurityIds((current) => {
        return remapWeightTicketLineState(current, lineIdMap)
      })
      setTouched((current) => {
        return remapWeightTicketLineState(current, lineIdMap)
      })
      setPendingFocusField((current) => current ? remapWeightTicketLineKey(current, lineIdMap) : current)
      setActiveLineId((current) => current === sourceLine.id ? persistedSourceLine.id : current)
    })
  }

  function changeLineWarehouse(lineId: string, warehouseId: string, warehouse: WtoStockWarehouseOption | null | undefined) {
    markLinesDirty(form.lines.filter((line) => line.id === lineId || line.parentId === lineId).map((line) => line.id))
    setMergeNotice('')
    setForm((current) => {
      const targetLine = current.lines.find((line) => line.id === lineId)
      if (!targetLine) return current

      const nextTargetLine = {
        ...targetLine,
        warehouseId,
        warehouseName: warehouse?.name ?? '',
        warehouseType: warehouse?.type ?? '',
      }
      let nextLines = current.lines.map((line) => {
        if (line.id === lineId) return nextTargetLine
        if (line.parentId === lineId) {
          return {
            ...line,
            productId: nextTargetLine.productId,
            productName: nextTargetLine.productName,
            warehouseId: nextTargetLine.warehouseId,
            warehouseName: nextTargetLine.warehouseName,
            warehouseType: nextTargetLine.warehouseType,
          }
        }
        return line
      })

      if (current.type === 'WTO' && !targetLine.parentId && nextTargetLine.productId && nextTargetLine.warehouseId) {
        const duplicateParent = nextLines.find((line) =>
          !line.parentId
          && line.id !== lineId
          && line.productId === nextTargetLine.productId
          && line.warehouseId === nextTargetLine.warehouseId
        )
        if (duplicateParent) {
          markLinesDirty([duplicateParent.id])
          nextLines = nextLines.map((line) => line.id === lineId ? { ...line, parentId: duplicateParent.id } : line)
          setActiveLineId(duplicateParent.id)
          setMergeNotice('สินค้านี้อยู่ในคลังนี้แล้ว ระบบรวมเป็นเต๋าใหม่ในรายการเดิม')
        }
      }

      return { ...current, lines: nextLines }
    })
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
        const nextLines = current.lines
          .filter((line) => line.id !== lineId && line.parentId !== lineId && !childIds.includes(line.impuritySourceLineId ?? ''))
          .map((line) => purchaseSourceIds.includes(line.id)
            ? { ...line, impurityPurchaseAction: 'none' as const }
            : line)
        markLinesDeleted(current.lines.filter((line) => !nextLines.some((nextLine) => nextLine.id === line.id)).map((line) => line.id))
        return {
          ...current,
          lines: nextLines,
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
      markLinesDeleted(current.lines.filter((line) => !nextLines.some((nextLine) => nextLine.id === line.id)).map((line) => line.id))
      return {
        ...current,
        lines: nextLines,
      }
    })
  }

  function requestLineProductChange(lineId: string, productId: string) {
    if (form.lines.find((line) => line.id === lineId)?.productId === productId) return
    requestWeightTicketSelectionChange(
      shouldConfirmWeightTicketProductChange(form.lines, lineId),
      requestConfirmation,
      {
        cancelLabel: 'ไม่เปลี่ยน',
        confirmLabel: 'เปลี่ยนสินค้า',
        description: form.type === 'WTO'
          ? 'ข้อมูลเดิมจะคงไว้ ระบบจะตรวจ stock ของรายการทั้งหมดใหม่ก่อนบันทึก'
          : 'เปลี่ยนเฉพาะสินค้า น้ำหนัก และสิ่งเจือปน ข้อมูลและรูปถ่ายอื่นจะคงเดิม',
        destructive: false,
        title: 'เปลี่ยนสินค้า?',
      },
      () => changeLineProduct(lineId, productId),
    )
  }

  function requestImpurityChange(
    lineId: string,
    mutation: (line: FormWeightTicketLine) => FormWeightTicketLine,
    clearsDeductionValue = false,
    clearsImpurityProduct = false,
  ) {
    requestWeightTicketSelectionChange(
      shouldConfirmWeightTicketImpurityChange(form.lines, lineId, clearsDeductionValue, clearsImpurityProduct),
      requestConfirmation,
      {
        cancelLabel: 'ไม่เปลี่ยน',
        confirmLabel: 'เปลี่ยนข้อมูล',
        description: 'ข้อมูลซื้อเพิ่มของสิ่งเจือปนที่เกี่ยวข้องจะถูกนำออกจากรายการนี้',
        destructive: true,
        title: 'เปลี่ยนข้อมูลสิ่งเจือปน?',
      },
      () => updateLine(lineId, mutation),
    )
  }

  function requestProductRemoval(lineId: string) {
    if (!shouldConfirmWeightTicketProductRemoval(form.lines, lineId)) {
      removeLine(lineId)
      return
    }

    requestConfirmation({
      cancelLabel: 'ไม่ลบ',
      confirmLabel: 'ลบสินค้า',
      description: 'รายการสินค้า เต๋า และสิ่งเจือปนที่เกี่ยวข้องจะถูกนำออกจากใบรับ-ส่งของที่กำลังแก้ไข',
      destructive: true,
      onConfirm: () => removeLine(lineId),
      title: 'ยืนยันการลบสินค้า',
    })
  }

  function removeLot(lotId: string) {
    markLinesDeleted([lotId])
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== lotId),
    }))
  }

  function requestLotRemoval(lot: FormWeightTicketLine) {
    if (!shouldConfirmWeightTicketLotRemoval(lot)) {
      removeLot(lot.id)
      return
    }

    requestConfirmation({
      cancelLabel: 'ไม่ลบ',
      confirmLabel: 'ลบเต๋า',
      description: 'ข้อมูลน้ำหนัก รูปภาพ และรายละเอียดของเต๋านี้จะถูกนำออกจากรายการที่กำลังแก้ไข',
      destructive: true,
      onConfirm: () => removeLot(lot.id),
      title: 'ยืนยันการลบเต๋า',
    })
  }

  function addImpurityLine(sourceLine: FormWeightTicketLine) {
    if (isLoadingTicket || saveInFlightRef.current === 'save') return
    if (calculateRealLotSummary(sourceLine, form.lines).lotCount === 0) return
    if (shouldIgnoreRapidAdd(`impurity:${sourceLine.id}`)) return
    const nextLine = createFormWeightTicketLine()
    nextLine.productId = sourceLine.productId
    nextLine.warehouseId = sourceLine.warehouseId
    nextLine.grossWeight = '0'
    nextLine.containerDeductionWeight = '0'
    nextLine.deductionMode = 'kg'
    nextLine.deductionValue = ''
    nextLine.impurityId = impurityOptions[0]?.id || ''
    nextLine.impurityPurchaseAction = 'none'
    nextLine.note = ADDED_IMPURITY_NOTE
    nextLine.parentId = sourceLine.id
    if (!isOtherProductImpurityOption(nextLine.impurityId)) {
      const existingNormalImpurityIds = form.lines
        .filter((line) => (
          line.parentId === sourceLine.id
          && line.deductionMode !== 'none'
          && !isOtherProductImpurityOption(getLineImpurityId(line))
        ))
        .map((line) => line.id)
      setCollapsedImpurityIds((current) => ({
        ...current,
        ...Object.fromEntries(existingNormalImpurityIds.map((impurityId) => [impurityId, true])),
        [nextLine.id]: false,
      }))
    }
    setForm((current) => ({ ...current, lines: [...current.lines, nextLine] }))
    setPendingFocusField(`line-${nextLine.id}-impurity`)
  }

  function removeImpurityLine(sourceLineId: string) {
    setForm((current) => {
      const nextLines = removeImpurityPurchaseLinesForSource(current.lines, sourceLineId)
        .filter((line) => line.id !== sourceLineId)
      markLinesDeleted(current.lines.filter((line) => !nextLines.some((nextLine) => nextLine.id === line.id)).map((line) => line.id))
      return {
        ...current,
        lines: nextLines,
      }
    })
  }

  function requestImpurityRemoval(sourceLineId: string) {
    if (!shouldConfirmWeightTicketImpurityRemoval(form.lines, sourceLineId, impurityOptions[0]?.id ?? '')) {
      removeImpurityLine(sourceLineId)
      return
    }

    requestConfirmation({
      cancelLabel: 'ไม่ลบ',
      confirmLabel: 'ลบสิ่งเจือปน',
      description: 'รายการหักสิ่งเจือปนและข้อมูลซื้อเพิ่มที่เกี่ยวข้องจะถูกนำออกจากรายการที่กำลังแก้ไข',
      destructive: true,
      onConfirm: () => removeImpurityLine(sourceLineId),
      title: 'ยืนยันการลบสิ่งเจือปน',
    })
  }

  function buyImpurityDirect(sourceLine: FormWeightTicketLine, targetProductId: string) {
    setForm((current) => ({
      ...current,
      lines: (() => {
        const currentSourceLine = current.lines.find((line) => line.id === sourceLine.id)
        if (!currentSourceLine || !targetProductId) return current.lines
        const removedPurchaseLineIds = current.lines
          .filter((line) => line.impuritySourceLineId === currentSourceLine.id)
          .map((line) => line.id)
        markLinesDeleted(removedPurchaseLineIds)
        const baseLines = current.lines.filter((line) => line.impuritySourceLineId !== currentSourceLine.id)
        const lineTotals = calculateAdjustedLineTotals(
          currentSourceLine,
          calculateWeightTicketLineTotals(current.lines),
        )
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
    setAttachmentError('')
    const results = await Promise.allSettled(Array.from(files).map((file) => trackAttachmentUpload(createAttachmentPreviewFromFile(file))))
    const nextFiles = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    const failures = results.flatMap((result) => result.status === 'rejected' ? [getErrorMessage(result.reason, 'อัปโหลดรูปสินค้าไม่สำเร็จ')] : [])
    if (nextFiles.length > 0) {
      const currentForm = formRef.current
      formRef.current = {
        ...currentForm,
        lines: currentForm.lines.map((line) => line.id === lineId
          ? { ...line, imageFiles: [...getLineImages(line), ...nextFiles] }
          : line),
      }
      updateLine(lineId, (line) => ({ ...line, imageFiles: [...getLineImages(line), ...nextFiles] }))
      markTouched(`line-${lineId}-images`)
    }
    if (failures.length > 0) {
      setAttachmentError(
        nextFiles.length > 0
          ? `อัปโหลดรูปสินค้าได้ ${nextFiles.length} รูป แต่ไม่สำเร็จ ${failures.length} รูป: ${failures[0]}`
          : failures[0],
      )
    }
  }

  async function appendVehicleImages(files: FileList | null) {
    if (!files?.length) return
    setAttachmentError('')
    const results = await Promise.allSettled(Array.from(files).map((file) => trackAttachmentUpload(createAttachmentPreviewFromFile(file))))
    const nextFiles = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    const failures = results.flatMap((result) => result.status === 'rejected' ? [getErrorMessage(result.reason, 'อัปโหลดรูปรถไม่สำเร็จ')] : [])
    if (nextFiles.length > 0) {
      const currentForm = formRef.current
      formRef.current = {
        ...currentForm,
        vehicleImageFiles: [...currentForm.vehicleImageFiles, ...nextFiles],
      }
      setForm((current) => ({ ...current, vehicleImageFiles: [...current.vehicleImageFiles, ...nextFiles] }))
    }
    if (failures.length > 0) {
      setAttachmentError(
        nextFiles.length > 0
          ? `อัปโหลดรูปรถได้ ${nextFiles.length} รูป แต่ไม่สำเร็จ ${failures.length} รูป: ${failures[0]}`
          : failures[0],
      )
    }
  }

  function removeVehicleImage(fileId: string) {
    dirtyHeaderFieldsRef.current.add('vehicleImageNames')
    setForm((current) => ({
      ...current,
      vehicleImageFiles: current.vehicleImageFiles.filter((file) => file.id !== fileId),
    }))
  }

  const backToList = useCallback(() => {
    requestDiscard(() => {
      if (onClose) {
        onClose()
      } else {
        router.push(`/daily/weight-ticket-list?type=${form.type}`)
      }
    })
  }, [form.type, onClose, requestDiscard, router])

  useEffect(() => {
    onRequestClose?.(backToList)
  }, [backToList, onRequestClose])

  async function saveTicket() {
    if (isSaving || saveInFlightRef.current) return
    const nextTouched: Record<string, boolean> = {
      branchId: true,
      partyId: true,
      vehicleNo: true,
      warehouseName: true,
    }
    if (getMainParentLines(form.lines).length === 0) nextTouched.lines = true
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
      const firstErrorKey = errors.lines ? 'lines' : errorKeys[0]
      const match = firstErrorKey.match(/^line-(.+?)-(product|warehouse|gross|container|images|impurity|impurity-product|deduction)$/)
      if (firstErrorKey === 'lines') setMobileProductView('list')
      if (match) {
        setMobileProductView('editor')
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

    saveInFlightRef.current = 'save'
    beginSaveStage(form.type === 'WTO' ? 'stock_check' : 'save')
    try {
      await waitForPendingAttachmentUploads()
      const formToSave = formRef.current
      const saveSnapshot = formSafetySnapshot(formToSave)
      const baselineLines = new Map((savedTicket ?? loadedTicket)?.lines.map((line) => [line.id, line] as const) ?? [])
      const baselineTicket = savedTicket ?? loadedTicket
      const baselineLineIds = Array.from(baselineLines.keys())
      const deletedLineIds = new Set(deletedLineIdsRef.current)
      baselineLineIds.filter((lineId) => !formToSave.lines.some((line) => line.id === lineId)).forEach((lineId) => deletedLineIds.add(lineId))
      const changedLineIds = new Set(changedLineIdsRef.current)
      deletedLineIds.forEach((lineId) => changedLineIds.add(lineId))
      formToSave.lines.forEach((line) => {
        const baseline = baselineLines.get(line.id)
        const currentFingerprint = collaborationLineSnapshot(line, getLineEvidenceImages(line).map((file) => file.rawValue))
        const baselineFingerprint = baseline ? collaborationLineSnapshot(baseline, baseline.imageNames) : null
        if (!baseline || currentFingerprint !== baselineFingerprint) changedLineIds.add(line.id)
      })
      const ticket = await saveWeightTicket({
        branchId: formToSave.branchId,
        collaborationBaseDocumentNo: (savedTicket ?? loadedTicket)?.documentNo,
        collaborationBaseLineIds: baselineLineIds,
        collaborationBaseLineVersions: Object.fromEntries(Array.from(baselineLines.entries()).map(([lineId, line]) => [lineId, line.version ?? 1])),
        collaborationChangedLineIds: Array.from(changedLineIds),
        collaborationDeletedLineIds: Array.from(deletedLineIds),
        collaborationBaseHeader: baselineTicket ? {
          branchId: baselineTicket.branchId,
          partyId: baselineTicket.partyId,
          remark: baselineTicket.remark,
          vehicleImageNames: baselineTicket.vehicleImageNames,
          vehicleNo: baselineTicket.vehicleNo,
          godownName: baselineTicket.godownName,
        } : undefined,
        collaborationChangedHeaderFields: baselineTicket ? (['branchId', 'partyId', 'remark', 'vehicleImageNames', 'vehicleNo', 'godownName'] as const).filter((field) => JSON.stringify(field === 'vehicleImageNames' ? formToSave.vehicleImageFiles.map((file) => file.rawValue) : formToSave[field]) !== JSON.stringify(baselineTicket[field])) : [],
        collaborationBaseUpdatedAt: (savedTicket ?? loadedTicket)?.updatedAt ?? null,
        id: savedTicket?.id ?? editingTicketId,
        lines: formToSave.lines.map((line) => ({
          containerDeductionWeight: Number(line.containerDeductionWeight || 0),
          deductionMode: line.deductionMode,
          deductionValue: Number(line.deductionValue || 0),
          grossWeight: Number(line.grossWeight || 0),
          id: line.id,
          version: line.version,
          imageNames: getLineEvidenceImages(line).map((file) => file.rawValue),
          impurityId: getLineImpurityId(line),
          impurityProductId: line.impurityProductId ?? '',
          impuritySourceLineId: line.impuritySourceLineId,
          note: line.note,
          productId: line.productId,
          warehouseId: line.warehouseId,
          parentId: line.parentId,
        })),
        partyId: formToSave.partyId,
        remark: formToSave.remark.trim(),
        type: formToSave.type,
        vehicleImageNames: formToSave.vehicleImageFiles.map((file) => file.rawValue),
        vehicleNo: formToSave.vehicleNo.trim(),
        godownName: formToSave.godownName.trim(),
      })
      invalidatePurchaseBillOptionsCache()
      setLoadError('')
      const nextForm = ticketToFormState(ticket)
      setLoadedTicket(ticket)
      setSavedTicket(ticket)
      changedLineIdsRef.current.clear()
      deletedLineIdsRef.current.clear()
      dirtyHeaderFieldsRef.current.clear()
      setRemoteChangedLineIds(new Set())
      if (formSafetySnapshot(formRef.current) === saveSnapshot) {
        setForm(nextForm)
        setFormBaseline(formSafetySnapshot(nextForm))
      } else {
        setMergeNotice('บันทึกข้อมูลเดิมแล้ว แต่มีการแก้ไขข้อมูลใหม่ระหว่างบันทึก จึงคงข้อมูลล่าสุดไว้ให้ตรวจสอบและบันทึกอีกครั้ง')
        return
      }
      if (onSaveSuccess) {
        onSaveSuccess(ticket)
      } else {
        router.push(`/daily/weight-ticket-list?type=${ticket.type}`)
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setMergeNotice('ข้อมูลชนกันในเต๋าที่กำลังแก้ ระบบไม่เขียนทับข้อมูลของผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุดแล้วตรวจสอบก่อนบันทึกอีกครั้ง')
      }
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setTouched((current) => ({ ...current, ...nextTouched }))
      }
      setLoadError(getErrorMessage(caught, editingTicketId ? 'แก้ไขใบรับ-ส่งของไม่ได้' : 'บันทึกใบรับ-ส่งของไม่ได้'))
    } finally {
      endSaveStage()
      saveInFlightRef.current = null
    }
  }

  async function saveSection(sectionId: string) {
    if (isSaving || saveInFlightRef.current) return
    const baselineTicket = savedTicket ?? loadedTicket
    if (!baselineTicket || !editingTicketId) {
      setMergeNotice('บันทึกหัวเอกสารก่อน จึงจะแยกบันทึก section ได้')
      return
    }
    const currentForm = formRef.current
    const sectionLines = currentForm.lines.filter((line) => getWeightTicketSectionLineIds(currentForm.lines, sectionId).includes(line.id))
    const sectionLineIdSet = new Set(getWeightTicketSectionLineIds(currentForm.lines, sectionId))
    const baselineSectionLines = baselineTicket.lines.filter((line) => getWeightTicketSectionLineIds(baselineTicket.lines, sectionId).includes(line.id))
    if (!sectionLines.length && !baselineSectionLines.length) return

    const sectionError = Object.keys(errors).find((key) => {
      if (key === 'lines') return true
      const match = key.match(/^line-(.+?)-/)
      return Boolean(match && sectionLineIdSet.has(match[1]))
    })
    if (sectionError) {
      setTouched((current) => ({
        ...current,
        ...Object.fromEntries([
          'product', 'warehouse', 'gross', 'container', 'deduction', 'images', 'impurity', 'impurity-product',
        ].flatMap((field) => sectionLines.map((line) => [`line-${line.id}-${field}`, true] as const))),
      }))
      setMergeNotice('กรุณาแก้ข้อมูลใน section นี้ให้ครบก่อนบันทึก')
      return
    }

    saveInFlightRef.current = 'save'
    beginSaveStage(currentForm.type === 'WTO' ? 'stock_check' : 'save')
    try {
      await waitForPendingAttachmentUploads()
      const snapshot = formRef.current
      const baselineById = new Map(baselineSectionLines.map((line) => [line.id, line] as const))
      const baselineIds = baselineSectionLines.map((line) => line.id)
      const deletedIds = new Set(
        baselineIds.filter((lineId) => !sectionLines.some((line) => line.id === lineId)),
      )
      deletedLineIdsRef.current.forEach((lineId) => {
        if (baselineById.has(lineId)) deletedIds.add(lineId)
      })
      const changedIds = new Set(
        sectionLines.filter((line) => changedLineIdsRef.current.has(line.id)).map((line) => line.id),
      )
      deletedIds.forEach((lineId) => changedIds.add(lineId))
      sectionLines.forEach((line) => {
        const baseline = baselineById.get(line.id)
        if (!baseline || collaborationLineSnapshot(line, getLineImages(line).map((file) => file.rawValue)) !== collaborationLineSnapshot(baseline, baseline.imageNames)) {
          changedIds.add(line.id)
        }
      })
      const ticket = await saveWeightTicketSection({
        branchId: snapshot.branchId,
        collaborationBaseDocumentNo: baselineTicket.documentNo,
        collaborationBaseLineIds: baselineIds,
        collaborationBaseLineVersions: Object.fromEntries(baselineSectionLines.map((line) => [line.id, line.version ?? 1])),
        collaborationChangedLineIds: Array.from(changedIds),
        collaborationDeletedLineIds: Array.from(deletedIds),
        collaborationBaseHeader: {
          branchId: baselineTicket.branchId,
          partyId: baselineTicket.partyId,
          remark: baselineTicket.remark,
          vehicleImageNames: baselineTicket.vehicleImageNames,
          vehicleNo: baselineTicket.vehicleNo,
          godownName: baselineTicket.godownName,
        },
        collaborationChangedHeaderFields: [],
        collaborationBaseUpdatedAt: baselineTicket.updatedAt,
        id: baselineTicket.id,
        lines: sectionLines.map((line) => ({
          containerDeductionWeight: Number(line.containerDeductionWeight || 0),
          deductionMode: line.deductionMode,
          deductionValue: Number(line.deductionValue || 0),
          grossWeight: Number(line.grossWeight || 0),
          id: line.id,
          version: line.version,
          imageNames: getLineImages(line).map((file) => file.rawValue),
          impurityId: getLineImpurityId(line),
          impurityProductId: line.impurityProductId ?? '',
          impuritySourceLineId: line.impuritySourceLineId,
          note: line.note,
          productId: line.productId,
          warehouseId: line.warehouseId,
          parentId: line.parentId,
        })),
        partyId: snapshot.partyId,
        remark: snapshot.remark.trim(),
        sectionLineIds: Array.from(new Set([...sectionLineIdSet, ...deletedIds])),
        type: snapshot.type,
        vehicleImageNames: snapshot.vehicleImageFiles.map((file) => file.rawValue),
        vehicleNo: snapshot.vehicleNo.trim(),
        godownName: snapshot.godownName.trim(),
      })
      const returnedForm = ticketToFormState(ticket)
      const persistedRootId = baselineSectionLines.find((line) => line.id === sectionId)?.id ?? sectionId
      const returnedSectionIds = new Set(getWeightTicketSectionLineIds(returnedForm.lines, persistedRootId))
      const latestForm = formRef.current
      const latestSectionIds = new Set(getWeightTicketSectionLineIds(latestForm.lines, sectionId))
      const sectionWasChangedDuringSave = JSON.stringify(Array.from(latestSectionIds).map((id) => {
        const line = latestForm.lines.find((entry) => entry.id === id)
        return line ? [id, collaborationLineSnapshot(line, getLineImages(line).map((file) => file.rawValue))] : [id, null]
      })) !== JSON.stringify(Array.from(sectionLineIdSet).map((id) => {
        const line = snapshot.lines.find((entry) => entry.id === id)
        return line ? [id, collaborationLineSnapshot(line, getLineImages(line).map((file) => file.rawValue))] : [id, null]
      }))
      setLoadedTicket(ticket)
      setSavedTicket(ticket)
      if (!sectionWasChangedDuringSave) {
        setForm((current) => ({
          ...current,
          lines: [
            ...current.lines.filter((line) => !sectionLineIdSet.has(line.id)),
            ...returnedForm.lines.filter((line) => returnedSectionIds.has(line.id)),
          ],
        }))
        sectionLineIdSet.forEach((lineId) => changedLineIdsRef.current.delete(lineId))
        deletedIds.forEach((lineId) => deletedLineIdsRef.current.delete(lineId))
        setMergeNotice('บันทึก section นี้แล้ว รายการ section อื่นยังคงแก้ไขต่อได้')
      } else {
        setMergeNotice('บันทึก section เดิมแล้ว แต่มีการแก้ไขเพิ่มระหว่างบันทึก จึงคงข้อมูลใหม่ไว้ให้ตรวจสอบ')
      }
      setRemoteChangedLineIds(new Set())
      invalidatePurchaseBillOptionsCache()
      setLoadError('')
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setMergeNotice('ข้อมูลชนกันใน section นี้ ระบบไม่เขียนทับข้อมูลของผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุดแล้วตรวจสอบอีกครั้ง')
      }
      setLoadError(getErrorMessage(caught, 'บันทึก section ไม่สำเร็จ'))
    } finally {
      endSaveStage()
      saveInFlightRef.current = null
    }
  }

  return (
    <div className={cn("min-w-0", isEmbeddedModal ? "flex h-full min-h-0 flex-col overflow-hidden bg-slate-50" : "overflow-x-hidden")} data-ns-field-scope="entry">
      {isEmbeddedModal ? (
        <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-5 py-4 text-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <DialogTitle id="weight-ticket-form-title" className="truncate text-base font-bold text-white">
                {embeddedModalTitle}
              </DialogTitle>
            </div>
            <div className="flex max-w-[min(58vw,13rem)] shrink-0 justify-end gap-2 overflow-x-auto pb-0.5 sm:max-w-none sm:flex-wrap sm:overflow-visible sm:pb-0">
              <Button className="h-10 shrink-0 border-emerald-600 bg-emerald-600 px-4 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white disabled:opacity-60 sm:h-9" disabled={isLoadingTicket || isSaving} type="button" variant="outline" onClick={saveTicket}>
                {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </Button>
              <Button className="h-10 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white sm:h-9" disabled={isLoadingTicket || isSaving} type="button" variant="outline" onClick={backToList}>
                {editingTicketId ? 'ปิด' : 'ยกเลิก'}
              </Button>
            </div>
          </div>
        </DialogHeader>
      ) : null}
      {isEmbeddedModal && canShowWeightTicketTimer ? (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {isWeightTicketSummaryCollapsed ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <Clock className={cn(
                    'size-4 shrink-0',
                    timerStopMs === null ? 'text-rose-700' : 'text-emerald-700',
                  )} />
                  <span className="truncate text-xs font-semibold text-slate-500">เวลาตั้งแต่เริ่มสร้าง</span>
                  <span className={cn(
                    'shrink-0 font-mono text-lg font-bold leading-tight',
                    timerStopMs === null ? 'text-rose-700' : 'text-slate-900',
                  )}>
                    {formatElapsedTime(timerElapsedMs)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-slate-500">รายการ</div>
                    <div className="text-sm font-bold text-slate-900">{weightTicketItemCount} รายการ</div>
                  </div>
                  <button
                    className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    type="button"
                    onClick={() => setIsWeightTicketSummaryCollapsed(false)}
                  >
                    <ChevronDown className="size-4" />
                    รายละเอียด
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={cn(
                      'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border',
                      timerStopMs === null ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    )}>
                      <Clock className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500">เวลาตั้งแต่เริ่มสร้างรายการ</div>
                      <div className={cn(
                        'mt-0.5 font-mono text-xl font-bold leading-tight sm:text-2xl',
                        timerStopMs === null ? 'text-rose-700' : 'text-slate-900',
                      )}>
                        {formatElapsedTime(timerElapsedMs)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-[18rem]">
                    <div className="rounded-md bg-white px-3 py-2">
                      <div className="font-semibold text-slate-500">เริ่มสร้าง</div>
                      <div className="mt-0.5 truncate font-medium text-slate-800">{formatTimerDateTime(timerStartAt)}</div>
                    </div>
                    <div className="rounded-md bg-white px-3 py-2">
                      <div className="font-semibold text-slate-500">สถานะเวลา</div>
                      <div className={cn('mt-0.5 truncate font-semibold', timerStopMs === null ? 'text-rose-700' : 'text-emerald-700')}>
                        {timerStopMs === null ? 'รอยืนยันรับของ' : 'รับของแล้ว'}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-3 sm:px-4">
                  <div className="text-sm">
                    <div className="text-xs font-semibold text-slate-500">รายการ</div>
                    <div className="font-bold text-slate-900">{weightTicketItemCount} รายการ</div>
                  </div>
                  <button
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    type="button"
                    onClick={() => setIsWeightTicketSummaryCollapsed(true)}
                  >
                    <ChevronDown className="size-4 rotate-180" />
                    ซ่อนรายละเอียด
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      <div className={cn("min-w-0", isEmbeddedModal ? "flex-1 overflow-y-auto p-4 sm:p-5 space-y-5" : "space-y-5 pb-44 sm:pb-32")}>
        {!isEmbeddedModal && (
        <div>
          <Button type="button" variant="outline" onClick={backToList}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            กลับไปหน้ารายการ
          </Button>
        </div>
      )}
      {isEmbeddedModal || hideTypeHeader ? null : (
          <div>
          <div className={cn('inline-flex rounded-md px-3 py-1.5 text-sm font-semibold', ticketTheme.badge)}>
            {form.type === 'WTI' ? 'ใบรับของ WTI' : 'ใบส่งของ WTO'}
          </div>
          </div>
      )}

      {loadError ? (
        <div role="alert" aria-live="assertive" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}
      <WeightTicketSaveProgress stage={saveStage} type={form.type} />
      {attachmentError ? (
        <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>{attachmentError}</span>
        </div>
      ) : null}
      {mergeNotice ? (
        <div role="status" aria-live="polite" className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          {mergeNotice}
        </div>
      ) : null}
      {isEmbeddedModal && !canShowWeightTicketTimer ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          {savedTicket ? (
            <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="size-4" />
              บันทึก {savedTicket.documentNo} แล้ว
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
              <MetricInline label="รายการ" value={`${getMainParentLines(form.lines).length} รายการ`} />
              <MetricInline label="น้ำหนักรวม" value={`${formatWeight(totals.grossWeight)} กก.`} />
              <MetricInline label="หักภาชนะ" value={`${formatWeight(totals.containerDeductionWeight)} กก.`} />
              <MetricInline label="หักสิ่งเจือปน" value={`${formatWeight(totals.deductionWeight)} กก.`} />
              <MetricInline emphasis label="สุทธิ" value={`${formatWeight(totals.netWeight)} กก.`} />
            </div>
          )}
        </div>
      ) : null}
      {isLoadingTicket ? (
        <Card className={cn(isEmbeddedModal ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
          <div className="p-16 text-center text-sm font-medium text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse">
            กำลังโหลดข้อมูล...
          </div>
        </Card>
      ) : (
        <div>
          <div className="space-y-5">
            <Card className={cn(isEmbeddedModal ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
            <SectionHeader title="ข้อมูลหัวเอกสาร" />
            <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
              <BranchSelectCombobox
                branches={branchOptionsForForm(branches, form).map((branch) => ({
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
	                  changeBranch(value)
	                }}
              />
              {(() => {
                const displayPartyOptions = partyOptionsForForm(partyOptions, form)
                const selectedPartyLabel = displayPartyOptions.find((option) => option.id === form.partyId)?.label ?? ''
                return (
                  <SearchCombobox
                    key={`${form.type}:${form.branchId}:${form.partyId}:${selectedPartyLabel}`}
                    disabled={!form.branchId}
                    error={showError('partyId')}
                    inputId="weight-ticket-party"
                    label={form.type === 'WTI' ? 'ผู้ขาย*' : 'ลูกค้า*'}
                    options={displayPartyOptions}
                    placeholder={!form.branchId ? 'เลือกสาขาก่อน' : form.type === 'WTI' ? 'ค้นหาชื่อหรือรหัสผู้ขาย' : 'ค้นหารหัสหรือชื่อลูกค้า'}
                    value={form.partyId}
                    onChange={(value) => {
                      const party = displayPartyOptions.find((option) => option.id === value)
                      markTouched('partyId')
                      dirtyHeaderFieldsRef.current.add('partyId')
                      setForm((current) => ({
                        ...current,
                        partyId: value,
                        partyName: party?.label ?? '',
                      }))
                    }}
                  />
                )
              })()}
              <FieldBlock error={showError('vehicleNo')} label="ทะเบียนรถ*">
                <Input
                  id="weight-ticket-vehicleNo"
                  placeholder="เช่น 83-5476"
                  value={form.vehicleNo}
                  onBlur={() => markTouched('vehicleNo')}
                  onChange={(event) => updateForm('vehicleNo', normalizeVehicleNo(event.target.value))}
                />
              </FieldBlock>
	              <FieldBlock error={showError('godownName')} label={form.type === 'WTO' ? 'โกดัง*' : 'โกดัง'}>
	                <Input
	                  placeholder="เช่น โกดัง A"
	                  value={form.godownName}
	                  onBlur={() => markTouched('godownName')}
	                  onChange={(event) => updateForm('godownName', event.target.value)}
	                />
              </FieldBlock>
              </div>
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

          <Card className={cn(isEmbeddedModal ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
            <SectionHeader title="สินค้าและน้ำหนัก" />



            {/* รายการเต๋า (Lines List) แบบ Split-panel ซ้ายขวา */}
            <div className={cn(
              "mt-4 grid min-w-0 items-start gap-4 border-b border-slate-100 pb-6",
              activeLine ? "xl:grid-cols-[18rem_minmax(0,1fr)]" : "grid-cols-1"
            )}>
              <div className="min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-700">รายการทั้งหมด {getMainParentLines(form.lines).length} รายการ</div>
                  <Button
                    aria-describedby={showError('lines') ? 'weight-ticket-lines-error' : undefined}
                    className="h-9 border-emerald-600 bg-emerald-600 px-3 font-semibold text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white"
                    id="weight-ticket-add-product"
                    size="xs"
                    type="button"
                    onClick={addLine}
                  >
                    <Plus className="mr-1 size-3" />
                    เพิ่มสินค้า
                  </Button>
                </div>
                <div className="space-y-2">
                  {(() => {
                    const parentLines = getMainParentLines(form.lines)
                    if (parentLines.length === 0) {
                      return (
                        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                          <p className="text-sm font-medium text-slate-600">ยังไม่มีสินค้า — กด &quot;+ เพิ่มสินค้า&quot;</p>
                          <p className="mt-1 text-xs text-slate-500">เพิ่มรายการสินค้าแล้วจึงเลือกสินค้าและกรอกน้ำหนัก</p>
                          {showError('lines') ? (
                            <p id="weight-ticket-lines-error" role="alert" className="mt-2 text-xs font-medium text-rose-700">
                              {showError('lines')}
                            </p>
                          ) : null}
                        </div>
                      )
                    }
                    return parentLines.map((line, index) => {
                      const lineTotals = calculateAdjustedLineTotals(line, lineCalculation)
                      const cardImages = getProductCardImages(line, form.lines)
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
                      const hasRemoteUpdate = allRelatedIds.some((id) => remoteChangedLineIds.has(id))
                      const active = activeLine?.id === line.id

                      return (
                        <button
                          aria-label={`แก้ไขรายการ ${index + 1}`}
                          className={cn(
                            'block w-full rounded-md border px-3 py-3 text-left transition outline-none',
                            active ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50',
                          )}
                          id={`weight-ticket-line-card-${line.id}`}
                          key={line.id}
                          type="button"
                          onClick={() => {
                            setActiveLineId(line.id)
                            setMobileProductView('editor')
                          }}
                        >
                          <div className="flex min-w-0 items-stretch gap-3">
                            <WeightTicketLineCardThumbnail files={cardImages} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm text-slate-500 font-semibold">รายการ {index + 1}</div>
                                  <div className="mt-1 line-clamp-1 text-sm font-medium text-slate-900">
                                    {products.find((option) => option.id === line.productId)?.name || 'ยังไม่ได้เลือกสินค้า'}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {hasError ? <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">ไม่ครบ</span> : null}
                                  {hasRemoteUpdate ? <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">มีข้อมูลใหม่</span> : null}
                                  <span className="text-xs font-semibold text-blue-700">แก้ไข</span>
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-500 font-medium">
                                <div>สุทธิ {formatWeight(lineTotals.netWeight)} กก.</div>
                                <div className="text-right">{calculateRealLotSummary(line, form.lines).lotCount} เต๋า</div>
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>

              {activeLine ? (
                <div className={cn(
                  'min-w-0',
                  mobileProductView === 'editor'
                    ? 'fixed inset-0 z-40 flex flex-col bg-slate-950/40 xl:static xl:block xl:bg-transparent xl:opacity-100'
                    : 'hidden xl:block',
                )}
                  onClick={(event) => {
                    if (event.currentTarget === event.target) closeMobileProductEditor()
                  }}
                  onKeyDownCapture={(event) => {
                    if (window.matchMedia('(min-width: 1280px)').matches || event.key !== 'Escape') return
                    event.preventDefault()
                    event.stopPropagation()
                    closeMobileProductEditor()
                  }}
                >
                  <div className={cn(
                    mobileProductView === 'editor'
                      ? cn(
                        'mt-auto flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl transition-transform duration-[400ms] ease-[cubic-bezier(.32,.72,0,1)] xl:contents xl:translate-y-0 xl:transition-none',
                        isMobileProductEditorVisible ? 'translate-y-0' : 'translate-y-full',
                      )
                      : 'xl:contents',
                  )}>
                    <div className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-2 xl:hidden">
                      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-300" />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                            <Pencil className="size-4 shrink-0 text-blue-600" />
                            <h3>{activeLine.productId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</h3>
                          </div>
                          <p className="mt-1 text-xs font-medium text-slate-500">รายการ {getMainParentLines(form.lines).findIndex((entry) => entry.id === activeLine.id) + 1}</p>
                        </div>
                        <Button
                          aria-label="ปิดหน้ากรอกสินค้า"
                          className="size-9 shrink-0 p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => closeMobileProductEditor()}
                        >
                          <X className="size-5" />
                        </Button>
                      </div>
                      <div className="mt-3 min-w-0 truncate text-sm font-semibold text-slate-700">
                        {products.find((product) => product.id === activeLine.productId)?.name || 'เลือกสินค้าเพื่อเริ่มกรอกข้อมูล'}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-3 xl:contents">
                      {(() => {
                const line = activeLine
                const parentLines = getMainParentLines(form.lines)
                const index = parentLines.findIndex((entry) => entry.id === line.id)
                const lineTotals = calculateAdjustedLineTotals(line, lineCalculation)
                const hasSelectedProduct = Boolean(line.productId)
                const isPurchaseOnlyLine = isImpurityPurchaseLine(line)
                const realLotSummary = calculateRealLotSummary(line, form.lines)
                const canAddImpurityLine = hasSelectedProduct && realLotSummary.lotCount > 0
                const boughtImpurityLinesForLine = getBoughtImpurityEntriesForLine(line, form.lines)
                const boughtImpurityTotal = boughtImpurityLinesForLine.reduce((sum, entry) => sum + calculateAdjustedLineTotals(entry.sourceLine, lineCalculation).deductionWeight, 0)
                const purchaseOnlyNote = isPurchaseOnlyLine && boughtImpurityLinesForLine.length > 0
                  ? `ซื้อเพิ่มจากสิ่งเจือปน ${boughtImpurityLinesForLine.length} รายการ รวม ${formatWeight(boughtImpurityTotal)} กก.`
                  : ''
                const isLineProductImpurity = (() => {
                  if (!line.productId) return false
                  const p = products.find((prod) => prod.id === line.productId)
                  return p ? isImpurityProduct(p) : false
                })()
                const productOptions = productOptionsForLine(isLineProductImpurity ? impurityProducts : normalProducts, line)
                const selectedProduct = products.find((product) => product.id === line.productId)
                const stockKey = `${form.branchId}:${line.productId}`
                const stock = stockOptions[stockKey]
                const warehouseOptions = warehouseOptionsForLine(stock, line)
                const selectedWarehouse = selectedWarehouseForLine(stock, line)
                const selectedWarehouseLabel = warehouseOptions.find((option) => option.id === line.warehouseId)?.label ?? ''
                const productSectionProps = {
                  disabled: isLoadingProducts || isPurchaseOnlyLine,
                  error: showError(`line-${line.id}-product`),
                  inputId: `weight-product-${line.id}`,
                  lineId: line.id,
                  options: productOptions,
                  picker: (
                    <ProductImagePicker
                      key={`${form.branchId}:${form.partyId}:${form.type}`}
                      buttonClassName="h-10 bg-blue-600 px-3 font-semibold text-white outline-none hover:bg-blue-700"
                      disabled={isLoadingProducts || isPurchaseOnlyLine}
                      hideSelectedCard
                      products={productOptions}
                      value={line.productId}
	                      onChange={(value) => {
	                        markTouched(`line-${line.id}-product`)
	                        requestLineProductChange(line.id, value)
                      }}
                    />
                  ),
                  placeholder: isLoadingProducts ? 'กำลังโหลดสินค้า...' : 'เลือกสินค้า',
                  selectedProduct,
                  value: line.productId,
	                  onChange: (value: string) => {
	                    markTouched(`line-${line.id}-product`)
	                    requestLineProductChange(line.id, value)
                  },
                }
                const warehouseSectionProps = {
                  disabled: !form.branchId || !line.productId,
                  error: showError(`line-${line.id}-warehouse`),
                  inputId: `weight-warehouse-${line.id}`,
                  options: warehouseOptions,
                  placeholder: !form.branchId ? 'เลือกสาขาก่อน' : !line.productId ? 'เลือกสินค้าก่อน' : 'เลือกคลัง RM/FG',
                  selectedWarehouse: selectedWarehouse ? {
                    availableQty: formatWeight(selectedWarehouse.availableQty),
                    onHandQty: formatWeight(selectedWarehouse.onHandQty),
                    onHoldQty: formatWeight(selectedWarehouse.onHoldQty),
                  } : undefined,
                  selectedWarehouseLabel,
                  value: line.warehouseId,
                  onChange: (value: string) => {
                    markTouched(`line-${line.id}-warehouse`)
                    const warehouse = value ? stock?.warehousesById[value] : null
                    changeLineWarehouse(line.id, value, warehouse)
                  },
                }

                return (
                    <div className="min-w-0 rounded-md border border-slate-100 bg-slate-50 p-3 sm:p-4">
                      <div className="mb-3 hidden items-center justify-between gap-3 sm:mb-4 xl:flex">
                      <div className="inline-flex rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">รายการ {index + 1}</div>
                      <div className="flex items-center gap-2">
                        {parentLines.length > 1 ? (
                          <Button
                            size="xs"
                            type="button"
                            variant="outline"
                            onClick={() => requestProductRemoval(line.id)}
                            className="hidden outline-none xl:flex items-center gap-1"
                          >
                            <Trash2 className="size-3" />
                            ลบ
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {/* ส่วนที่ 1: ข้อมูลสินค้าและคลังสินค้า */}
                    <div className="space-y-4">
                      {form.type === 'WTI' ? (
                        <WeightTicketWtiFormSection product={productSectionProps} />
                      ) : (
                        <WeightTicketWtoFormSection product={productSectionProps} warehouse={warehouseSectionProps} />
                      )}

                      {/* รายการเต๋าสินค้า */}
                      <div className="mt-4 border-t border-slate-200/60 pt-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">เต๋าสินค้า</div>
                        </div>
                        {!hasSelectedProduct ? (
                          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            เลือกสินค้าก่อน จึงจะกรอกน้ำหนัก เพิ่มเต๋า และแนบรูปได้
                          </div>
                        ) : null}
                        <div className="space-y-4">
                          {(() => {
                            const secondaryLots = form.lines.filter((l) => l.parentId === line.id && !isImpurityPurchaseLine(l) && l.deductionMode === 'none')
                            const lots = isPurchaseOnlyLine ? secondaryLots : [line, ...secondaryLots]
                            if (lots.length === 0) {
                              return (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
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
                              const showLotSummary = isCollapsed
                              return (
                                <section
                                  aria-labelledby={`weight-ticket-lot-title-${lot.id}`}
                                  className="space-y-3 rounded-xl border border-slate-300 bg-white p-3 shadow-sm ring-1 ring-slate-200/60 sm:p-4"
                                  data-testid={`weight-ticket-lot-${lot.id}`}
                                  key={lot.id}
                                >
                                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                                      aria-expanded={!isCollapsed}
                                      onClick={() => toggleLotCollapsed(lot.id)}
                                    >
                                      <ChevronDown className={cn("size-4 shrink-0 text-slate-500 transition-transform", isCollapsed ? "-rotate-90" : "rotate-0")} />
                                      <div className="min-w-0">
                                        <span className="block truncate text-sm font-bold text-slate-800" id={`weight-ticket-lot-title-${lot.id}`}>รายละเอียดเต๋าที่ {lotIndex + 1}</span>
                                        {remoteChangedLineIds.has(lot.id) ? <span className="mt-0.5 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">มีข้อมูลใหม่จากผู้ใช้อื่น</span> : null}
                                        {showLotSummary ? (
                                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold text-slate-500">
                                            <span>รวม {formatWeight(lotGrossWeight)} กก.</span>
                                            <span>ภาชนะ {formatWeight(lotContainerWeight)} กก.</span>
                                            <span className="text-emerald-700 font-bold">หลังหัก {formatWeight(lotNetBeforeImpurityWeight)} กก.</span>
                                            <span>{getLineImages(lot).length} รูป</span>
                                          </div>
                                        ) : null}
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
                                        onClick={() => requestLotRemoval(lot)}
                                      >
                                        <Trash2 className="size-3.5 mr-1" />
                                        ลบเต๋า
                                      </Button>
                                      )}
                                    </div>
                                  </div>
                                  {!isCollapsed ? (
                                    <>
                                      <div className="grid grid-cols-3 items-start gap-2 sm:gap-4">
                                        <FieldBlock error={showError(`line-${lot.id}-gross`)} label="น้ำหนักรวม (กก. / ลัง) *" labelClassName="min-h-10 leading-5 sm:min-h-0">
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
                                        <FieldBlock error={showError(`line-${lot.id}-container`)} label="หักภาชนะ (กก.)" labelClassName="min-h-10 leading-5 sm:min-h-0">
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
                                        <FieldBlock label="น้ำหนักหลังหักภาชนะ" labelClassName="min-h-10 leading-5 sm:min-h-0">
                                          <Input
                                            disabled
                                            value={formatWeight(lotNetBeforeImpurityWeight)}
                                          />
                                        </FieldBlock>
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
                                </section>
                              )
                            })
                          })()}
                        </div>

                        <div className="mt-3 flex justify-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              disabled={!hasSelectedProduct}
                              onClick={() => addSameProductLot(line)}
                              className="hidden h-9 bg-blue-600 px-3 text-sm font-semibold text-white outline-none hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 xl:inline-flex"
                            >
                              <Plus className="size-4" />
                              เพิ่มเต๋า
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isLoadingTicket || isSaving || !hasSelectedProduct || !line.version}
                              onClick={() => void saveSection(line.id)}
                              className="h-9 border-emerald-300 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              บันทึก section นี้
                            </Button>
                          </div>
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
	                            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
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
	                                  const purchaseWeight = calculateAdjustedLineTotals(sourceLine, lineCalculation).deductionWeight
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
                            className="hidden items-center justify-center gap-1.5 h-9 rounded-md text-sm font-semibold px-3 outline-none text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400 xl:flex"
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
                              <div className="text-center py-4 text-sm font-medium text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 mt-2">
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
                              {childLines.map((child, childIndex) => {
                                const selectedImpurityId = getLineImpurityId(child)
                                const hasSelectedImpurity = Boolean(selectedImpurityId)
                                const isOtherProductImpurity = isOtherProductImpurityOption(selectedImpurityId)
                                const showImpurityImageField = form.type === 'WTI' || isOtherProductImpurity
                                const impurityOptionsForChild = optionsWithCurrentValue(impurityOptions, selectedImpurityId, child.impurityName)
                                const impurityPurchaseProducts = optionsWithCurrentValue(
                                  normalProducts.filter((product) => product.id !== line.productId),
                                  child.impurityProductId,
                                  child.impurityProductName || child.impurityProductId,
                                )
                                const selectedImpurityLabel = impurityOptionsForChild.find((option) => option.id === selectedImpurityId)?.label ?? ''
                                const selectedImpurityProductLabel = impurityPurchaseProducts.find((option) => option.id === child.impurityProductId)?.label ?? ''
                                const mustSelectImpurityProductFirst = isOtherProductImpurity && child.impurityPurchaseAction === 'buy' && !child.impurityProductId
                                const canEditImpurityDeduction = hasSelectedProduct && hasSelectedImpurity
                                const calculatedDeductionWeight = calculateAdjustedLineTotals(child, lineCalculation).deductionWeight
                                const isCollapsed = !isOtherProductImpurity && Boolean(collapsedImpurityIds[child.id])
                                const deductionValue = Number(child.deductionValue || 0)
                                const isImpurityComplete = hasSelectedImpurity
                                  && deductionValue > 0
                                  && (child.deductionMode !== 'percent' || deductionValue <= 100)
                                const deductionSummary = child.deductionMode === 'percent'
                                  ? `หัก ${formatWeight(deductionValue)}%`
                                  : `หัก ${formatWeight(deductionValue)} กก.`
                                const usesPercentDeduction = child.deductionMode === 'percent'
                                const mobileImpurityRowGridColumns = isOtherProductImpurity
                                  ? 'grid-cols-1'
                                  : usesPercentDeduction
                                    ? 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)]'
                                    : 'grid-cols-2'
                                const mobileImpuritySelectorColumns = usesPercentDeduction ? 'col-span-3 md:col-span-1' : 'col-span-2 md:col-span-1'
                                return (
                                  <div key={child.id} className="bg-white p-2 rounded-xl border border-slate-200/60">
                                    {!isOtherProductImpurity ? (
                                      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 md:hidden">
                                        <button
                                          aria-expanded={!isCollapsed}
                                          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                                          type="button"
                                          onClick={() => toggleImpurityCollapsed(child.id)}
                                        >
                                          <ChevronDown className={cn('size-4 shrink-0 text-slate-500 transition-transform', isCollapsed ? '-rotate-90' : 'rotate-0')} />
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                              <span>สิ่งเจือปนที่ {childIndex + 1}</span>
                                              <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', isImpurityComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                                                {isImpurityComplete ? 'ครบ' : 'ไม่ครบ'}
                                              </span>
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-semibold text-slate-500">
                                              <span className="truncate">{selectedImpurityLabel || 'ยังไม่ได้เลือกสิ่งเจือปน'}</span>
                                              <span>{deductionSummary}</span>
                                            </div>
                                          </div>
                                        </button>
                                        <Button
                                          className="h-8 shrink-0 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                          size="xs"
                                          type="button"
                                          variant="ghost"
                                          onClick={() => toggleImpurityCollapsed(child.id)}
                                        >
                                          {isCollapsed ? 'ขยาย' : 'ยุบ'}
                                        </Button>
                                      </div>
                                    ) : null}
                                    <div className={cn(isCollapsed && 'hidden md:block')}>
                                      <div className={cn(
                                      "grid gap-2 md:gap-3 items-start",
                                      mobileImpurityRowGridColumns,
                                      impurityRowGridColumns,
                                      )}>
                                      <div className={cn(!isOtherProductImpurity && mobileImpuritySelectorColumns)}>
                                        <FieldBlock label="สิ่งเจือปน*" labelClassName="md:hidden">
                                        <SearchCombobox
                                          disabled={!hasSelectedProduct}
                                          error={showError(`line-${child.id}-impurity`)}
                                          inputId={`weight-impurity-${child.id}`}
                                          hideLabel
                                          label="สิ่งเจือปน*"
                                          options={impurityOptionsForChild}
                                          placeholder={impurityOptions.length > 0 ? 'เลือกสิ่งเจือปน' : 'ยังไม่มีสิ่งเจือปนที่ใช้งาน'}
                                          readOnly
                                          value={selectedImpurityId}
                                          onChange={(value) => {
                                            const impurity = impurityOptionsForChild.find((option) => option.id === value)
                                            const clearsImpurityProduct = !isOtherProductImpurityOption(value)
                                            markTouched(`line-${child.id}-impurity`)
                                            requestImpurityChange(child.id, (current) => ({
                                              ...current,
                                              impurityId: value,
                                              impurityName: impurity?.label ?? '',
                                              impurityPurchaseAction: 'none',
                                              impurityProductId: isOtherProductImpurityOption(value) ? current.impurityProductId ?? '' : '',
                                              impurityProductName: isOtherProductImpurityOption(value) ? current.impurityProductName ?? '' : '',
                                            }), false, clearsImpurityProduct)
                                          }}
                                        />
                                        </FieldBlock>
                                      </div>
                                      {isOtherProductImpurity ? (
                                        <FieldBlock error={showError(`line-${child.id}-impurity-product`)} label="สินค้าที่ปนมา" labelClassName="md:hidden">
                                          <SearchCombobox
                                            key={`${child.id}:${child.impurityProductId ?? ''}:${selectedImpurityProductLabel}`}
                                            disabled={!hasSelectedProduct}
                                            error={showError(`line-${child.id}-impurity-product`)}
                                            hideLabel
                                            inputId={`weight-impurity-product-${child.id}`}
                                            label="สินค้าที่ปนมา"
                                            options={impurityPurchaseProducts}
                                            placeholder="เลือกเมื่อต้องซื้อเพิ่ม"
                                            value={child.impurityProductId ?? ''}
                                            onChange={(value) => {
                                              const product = impurityPurchaseProducts.find((option) => option.id === value)
                                              markTouched(`line-${child.id}-impurity-product`)
	                                              requestImpurityChange(child.id, (current) => ({
                                                ...current,
                                                impurityProductId: value,
                                                impurityProductName: product?.label ?? '',
                                                impurityPurchaseAction: 'none',
	                                              }))
                                            }}
                                          />
                                        </FieldBlock>
                                      ) : hasOtherProductImpurity ? (
                                        <div className="hidden md:block" />
                                      ) : null}
                                      <div className="min-w-0">
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
	                                            requestImpurityChange(child.id, (current) => ({
                                              ...current,
                                              deductionMode,
                                              impurityPurchaseAction: 'none',
	                                              deductionValue: '',
	                                            }), true)
                                          }}
                                        />
                                        </FieldBlock>
                                      </div>
                                      <div className="min-w-0">
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
                                      </div>
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
                                      <div
                                        className={cn(
                                          'items-center justify-end gap-2 pb-1 md:mt-0',
                                          isOtherProductImpurity ? 'flex' : 'hidden md:flex',
                                          !isOtherProductImpurity && 'self-end md:self-auto',
                                        )}
                                      >
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
                                          onClick={() => requestImpurityRemoval(child.id)}
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
                                    {showImpurityImageField ? (
                                      <div className="mt-2 border-t border-slate-100 pt-2">
                                        <FieldBlock label={isOtherProductImpurity ? 'รูปสินค้าที่ปนมา' : 'รูปสิ่งเจือปน (ไม่บังคับ)'}>
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
                                    {!isOtherProductImpurity ? (
                                      <Button
                                        className="mt-3 h-9 w-full border-rose-200 bg-white text-sm font-semibold text-rose-700 hover:bg-rose-50 md:hidden"
                                        type="button"
                                        variant="outline"
                                        onClick={() => requestImpurityRemoval(child.id)}
                                      >
                                        <Trash2 className="mr-1.5 size-4" />
                                        ลบสิ่งเจือปน
                                      </Button>
                                    ) : null}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 lg:grid-cols-4">
                        <MiniMetric label="น้ำหนักรวม" value={`${formatWeight(lineTotals.grossWeight)} กก.`} />
                        <MiniMetric label="ภาชนะ" value={`${formatWeight(lineTotals.containerDeductionWeight)} กก.`} />
                        <MiniMetric label="สิ่งเจือปน" value={`${formatWeight(lineTotals.deductionWeight)} กก.`} />
                        <MiniMetric label="น้ำหนักสุทธิ" value={`${formatWeight(lineTotals.netWeight)} กก.`} />
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
                      })()}
                    </div>
                    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 xl:hidden">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          className="h-10 bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={!activeLine.productId || isImpurityPurchaseLine(activeLine)}
                          type="button"
                          onClick={() => addSameProductLot(activeLine)}
                        >
                          <Plus className="mr-1.5 size-4" />
                          เพิ่มเต๋า
                        </Button>
                        <Button
                          className="h-10 border-red-600 bg-red-600 text-sm font-semibold text-white hover:border-red-700 hover:bg-red-700 hover:text-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={!activeLine.productId || calculateRealLotSummary(activeLine, form.lines).lotCount === 0}
                          type="button"
                          variant="outline"
                          onClick={() => addImpurityLine(activeLine)}
                        >
                          <Plus className="mr-1.5 size-4" />
                          เพิ่มสิ่งเจือปน
                        </Button>
                        {getMainParentLines(form.lines).length > 1 ? (
                          <Button
                            className="col-span-2 h-9 border-rose-200 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const nextLineId = getMainParentLines(form.lines).find((line) => line.id !== activeLine.id)?.id
                              if (!nextLineId) return
                              closeMobileProductEditor(nextLineId, () => {
                                setActiveLineId(nextLineId)
                                requestProductRemoval(activeLine.id)
                              })
                            }}
                          >
                            <Trash2 className="mr-1.5 size-3.5" />
                            ลบสินค้า
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className={cn(isEmbeddedModal ? "border-0 bg-transparent shadow-none p-0" : "p-5")}>
            <SectionHeader title="หมายเหตุท้ายเอกสาร" />
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

      {!isEmbeddedModal ? (
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-100 bg-white/95 px-3 py-2 backdrop-blur-sm lg:bottom-0 lg:left-64 lg:px-4 lg:py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 w-full justify-center sm:w-auto sm:block">
            {savedTicket ? (
              <div className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="size-4" />
                บันทึก {savedTicket.documentNo} แล้ว
              </div>
            ) : (
              <>
                <div className="grid w-full grid-cols-3 gap-3 text-xs sm:hidden">
                  <MetricInline label="รายการ" value={`${getMainParentLines(form.lines).length} รายการ`} />
                  <MetricInline label="น้ำหนักรวม" value={`${formatWeight(totals.grossWeight)} กก.`} />
                  <MetricInline emphasis label="สุทธิ" value={`${formatWeight(totals.netWeight)} กก.`} />
                </div>
                <div className="hidden flex-wrap items-center gap-x-8 gap-y-2 text-sm sm:flex">
                  <MetricInline label="รายการ" value={`${getMainParentLines(form.lines).length} รายการ`} />
                  <MetricInline label="น้ำหนักรวม" value={`${formatWeight(totals.grossWeight)} กก.`} />
                  <MetricInline label="หักภาชนะ" value={`${formatWeight(totals.containerDeductionWeight)} กก.`} />
                  <MetricInline label="หักสิ่งเจือปน" value={`${formatWeight(totals.deductionWeight)} กก.`} />
                  <MetricInline emphasis label="สุทธิ" value={`${formatWeight(totals.netWeight)} กก.`} />
                </div>
              </>
            )}
          </div>
          <div className="ml-auto grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:justify-end">
            <Button className="h-9" disabled={isLoadingTicket || isSaving} type="button" variant="outline" onClick={backToList}>
              {!onClose && <ArrowLeft className="mr-1 h-4 w-4" />}
              <span className="sm:hidden">กลับรายการ</span>
              <span className="hidden sm:inline">{onClose ? 'ปิด' : 'กลับไปหน้ารายการ'}</span>
            </Button>
            <Button className="h-9 bg-blue-600 font-normal text-white hover:bg-blue-700" disabled={isLoadingTicket || isSaving} type="button" onClick={saveTicket}>
              {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
        </div>
      </div>
      ) : null}

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => setPreviewImage(open ? previewImage : null)}>
        <DialogContent hideClose className="max-w-4xl rounded-md !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
          {previewImage ? (
            <>
              <DialogHeader className="rounded-t-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle>รูปภาพแนบ</DialogTitle>
                    <DialogDescription className="truncate">{previewImage.fileName}</DialogDescription>
                  </div>
                  <Button className="h-9 shrink-0 border-rose-600 bg-rose-600 px-4 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => setPreviewImage(null)}>ปิด</Button>
                </div>
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

function SectionHeader({ title }: { title: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
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
          data-manual-entry-readonly="true"
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
    <div data-field-invalid={error ? 'true' : undefined} data-manual-required={hasInlineRequired ? 'true' : undefined}>
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
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2 shadow-sm">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-100 border border-slate-100">
            {selectedProduct.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedProduct.imageUrl}
                alt={selectedProduct.name ?? selectedProduct.label}
                className="h-full w-full object-cover"
                decoding="async"
                loading="eager"
              />
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
        <DialogContent hideClose className="max-h-[90vh] max-w-2xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none">
          <DialogHeader className="px-5 pt-4 pb-4 rounded-t-md flex flex-row items-center justify-between bg-slate-900 border-none">
            <div className="flex items-center gap-2">
              <span className="text-lg">📦</span>
              <DialogTitle className="text-base font-bold text-white">เพิ่มสินค้า</DialogTitle>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 sm:p-5">
            {/* Search input */}
            <div className="relative" data-ns-field-scope="filter">
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
                  'shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition',
                  category === 'all' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
                type="button"
                onClick={() => setCategory('all')}
              >
                ทั้งหมด
              </button>
              {categories.map((item) => (
                <button
                  className={cn(
                    'shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition',
                    category === item ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
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
            <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4">
                {filteredProducts.map((product) => {
                  const selected = product.id === tempSelectedId
                  return (
                    <button
                      className={cn(
                        'overflow-hidden rounded-md border bg-white text-left transition duration-150 flex flex-col group relative',
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
                          <img
                            alt={product.name ?? product.label}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            decoding="async"
                            loading="lazy"
                            src={product.imageUrl}
                          />
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
                  <div className="col-span-full rounded-md bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">ไม่พบสินค้า</div>
                ) : null}
            </div>
          </div>

          <DialogFooter className="px-5 py-4 border-t border-slate-100 bg-white flex flex-row justify-end gap-2.5">
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
