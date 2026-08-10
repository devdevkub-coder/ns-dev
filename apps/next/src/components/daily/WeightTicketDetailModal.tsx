'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ClipboardList, Package2, Printer, RotateCcw, RotateCw, Scale, Share2, SquarePen, XCircle, CheckCircle2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { GuardedLink } from '@/components/ui/GuardedLink'
import { useActionConfirmation, useUnsavedChangesGuard } from '@/components/ui/FormSafetyProvider'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import {
  WeightTicketProductBreakdownTable,
  WeightTicketTimelinePendingOutChanges,
  weightTicketTimelinePendingOutChangeCount,
} from '@/components/daily/WeightTicketProductBreakdownTable'
import { WeightTicketImageGallery, WEIGHT_TICKET_IMAGE_PREVIEW_LIMIT } from '@/components/daily/WeightTicketImageGallery'
import { WeightTicketStockReturnDialog, type StockReturnPayload } from '@/components/daily/WeightTicketStockReturnDialog'
import { openWeightTicketPrintWindow, openWeightTicketReceiptPrint } from '@/lib/weight-ticket-print'
import { cn } from '@/lib/utils'
import { cancelWeightTicket, canConfirmWeightTicket, canPrintWeightTicket, canShareWeightTicket, confirmWeightTicket, decodeStoredImageAsset, displayWeightTicketStatus, formatWeight, getWeightTicket, getWeightTicketImageOriginal, getWeightTicketImagePreviews, isPreviewableStoredImageAsset, isThumbnailPreviewableStoredImageAsset, notifyWeightTicketLine, type StoredImageAsset, type WeightTicketImagePreviews, type WeightTicketRecord, type WeightTicketStatus, type WeightTicketType, weightTicketStatusBadgeClass } from '@/lib/weight-tickets'
import { WeightTicketSaveProgress, useWeightTicketSaveProgress } from '@/components/daily/WeightTicketSaveProgress'
import { getErrorMessage } from '@/lib/api-client'
import { useWeightTicketRealtime } from './useWeightTicketRealtime'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function timelineLabel(eventKey: string, action: string, type: WeightTicketType) {
  if (action === 'created') return 'สร้างเอกสาร'
  if (action === 'edited') return 'แก้ไขเอกสาร'
  if (action === 'confirmed') return type === 'WTI' ? 'ยืนยันรับของ' : 'ยืนยันส่งของ'
  if (action === 'cancelled') return 'ยกเลิกเอกสาร'
  if (action === 'status_synced') return 'ปรับสถานะปัจจุบัน'
  if (action === 'usage_status_changed') return 'เปลี่ยนสถานะจากการใช้งาน'
  if (action === 'allocated_to_purchase_bill') return 'นำไปออกบิลรับซื้อ'
  if (action === 'released_from_purchase_bill') return 'คืนยอดจากบิลรับซื้อ'
  if (eventKey.endsWith('.created')) return 'สร้างเอกสาร'
  if (eventKey.endsWith('.updated')) return 'แก้ไขเอกสาร'
  if (eventKey.endsWith('.cancelled')) return 'ยกเลิกเอกสาร'
  if (action === 'create') return 'สร้างเอกสาร'
  if (action === 'update') return 'แก้ไขเอกสาร'
  if (action === 'status') return 'เปลี่ยนสถานะเอกสาร'
  return eventKey.startsWith('WTSTATUS-') || eventKey.startsWith('WTUSE-') ? 'อัปเดตเอกสาร' : eventKey
}

function timelineDotClass(action: string, isLatest: boolean) {
  if (!isLatest) return 'bg-slate-300'
  if (action === 'cancelled' || action === 'released_from_purchase_bill') return 'bg-rose-500'
  if (action === 'edited' || action === 'usage_status_changed' || action === 'status_synced') return 'bg-amber-500'
  if (action === 'allocated_to_purchase_bill') return 'bg-blue-500'
  return 'bg-emerald-500'
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function timelineStatusLabel(type: WeightTicketRecord['type'], status: string) {
  if (!status) return ''
  return displayWeightTicketStatus(type, status as WeightTicketStatus)
}

function usageActionLabel(action: string) {
  if (action === 'allocated_to_purchase_bill') return 'นำไปออกบิลรับซื้อ'
  if (action === 'released_from_purchase_bill') return 'คืนยอดจากบิลรับซื้อ'
  return action || '-'
}

function usageWeightLabel(action: string, weight: number) {
  const sign = action === 'released_from_purchase_bill' ? '+' : '-'
  return `${sign} ${formatWeight(weight)} กก.`
}

function usageWeightClass(action: string) {
  if (action === 'released_from_purchase_bill') return 'text-emerald-700'
  return 'text-rose-700'
}

function mergeWeightTicketImagePreviews(ticket: WeightTicketRecord, previews: WeightTicketImagePreviews): WeightTicketRecord {
  const imageNamesByLineNo = new Map(previews.lines.map((line) => [line.lineNo, line.imageNames]))
  return {
    ...ticket,
    imageNames: previews.imageNames,
    lines: ticket.lines.map((line) => ({
      ...line,
      imageNames: line.lineNo == null ? line.imageNames : imageNamesByLineNo.get(line.lineNo) ?? line.imageNames,
    })),
    vehicleImageNames: previews.vehicleImageNames,
  }
}

export function WeightTicketDetailModal({
  ticketId,
  initialTicket,
  onClose,
  onEdit,
}: {
  initialTicket?: WeightTicketRecord
  ticketId: string
  onClose: () => void
  onEdit?: (id: string, type: WeightTicketType) => void
}) {
  const { requestConfirmation } = useActionConfirmation()
  const [ticket, setTicket] = useState<WeightTicketRecord | null>(() => initialTicket ?? null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isLoadingImagePreview, setIsLoadingImagePreview] = useState(false)
  const [imagePreviewError, setImagePreviewError] = useState('')
  const [imagePreviewRefreshMs, setImagePreviewRefreshMs] = useState<number | null>(null)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)
  const { begin: beginSaveStage, end: endSaveStage, isSaving: isConfirming, stage: saveStage } = useWeightTicketSaveProgress()
  const [isPrinting, setIsPrinting] = useState(false)
  const [lineGallery, setLineGallery] = useState<{
    activeIndex: number
    images: Array<{ bucket: string; contextTitle?: string; fileName: string; originalStorageKey: string; originalUrl?: string; url: string }>
    title: string
  } | null>(null)
  const [galleryZoom, setGalleryZoom] = useState(1)
  const [galleryPan, setGalleryPan] = useState({ x: 0, y: 0 })
  const [originalImageError, setOriginalImageError] = useState('')
  const galleryDragRef = useRef<{
    originX: number
    originY: number
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [shareError, setShareError] = useState('')
  const [imagePreviewPollRevision, setImagePreviewPollRevision] = useState(0)
  const [isSendingLine, setIsSendingLine] = useState(false)
  const realtimeBranchIds = useMemo(() => {
    const branchId = ticket?.branchId ?? initialTicket?.branchId
    return branchId ? [branchId] : []
  }, [initialTicket?.branchId, ticket?.branchId])
  const [showStockReturnDialog, setShowStockReturnDialog] = useState(false)
  const [canReturnStock, setCanReturnStock] = useState(false)
  const { requestDiscard: requestDiscardCancelNote } = useUnsavedChangesGuard(Boolean(ticket?.canCancel && cancelNote.trim()))

  function requestClose() {
    if (isCanceling) return
    requestDiscardCancelNote(onClose)
  }
  const [successModalMessage, setSuccessModalMessage] = useState('')
  const [expandedTimelineIds, setExpandedTimelineIds] = useState<Record<string, boolean>>({})

  async function loadStockReturnAvailability(documentNo: string) {
    const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(documentNo)}/stock-returns`, { cache: 'no-store' })
    if (!response.ok) throw new Error(await response.text())
    const payload = await response.json() as StockReturnPayload
    setCanReturnStock(payload.options.length > 0)
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadTicket() {
      setTicket(initialTicket ?? null)
      setIsLoading(true)
      setLoadError('')
      setImagePreviewError('')
      setImagePreviewRefreshMs(null)
      setIsLoadingImagePreview(false)
      try {
        const nextTicket = await getWeightTicket(ticketId, { includeImagePreviews: false, signal: controller.signal })
        if (controller.signal.aborted) return
        setTicket(nextTicket)
        setCancelNote(nextTicket.cancelNote ?? '')
        setIsLoading(false)
        setIsLoadingImagePreview(true)
        try {
          const previews = await getWeightTicketImagePreviews(ticketId, { signal: controller.signal })
          if (controller.signal.aborted) return
          setTicket((current) => current ? mergeWeightTicketImagePreviews(current, previews) : current)
          setImagePreviewRefreshMs(previews.refreshAfterMs)
        } catch {
          if (!controller.signal.aborted) setImagePreviewError('ยังโหลด preview รูปภาพไม่สำเร็จ แต่ข้อมูลเอกสารยังใช้งานได้')
        } finally {
          if (!controller.signal.aborted) setIsLoadingImagePreview(false)
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setLoadError(getErrorMessage(caught, 'โหลดใบรับ-ส่งของไม่ได้'))
          setIsLoading(false)
        }
      }
    }

    void loadTicket()
    return () => {
      controller.abort()
    }
  }, [initialTicket, ticketId])

  useEffect(() => {
    if (!imagePreviewRefreshMs || isLoadingImagePreview) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void getWeightTicketImagePreviews(ticketId, { signal: controller.signal })
        .then((previews) => {
          if (controller.signal.aborted) return
          setTicket((current) => current ? mergeWeightTicketImagePreviews(current, previews) : current)
          setImagePreviewRefreshMs(previews.refreshAfterMs)
          setImagePreviewError('')
          setImagePreviewPollRevision((current) => current + 1)
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setImagePreviewError('ยังโหลด preview รูปภาพไม่สำเร็จ แต่ข้อมูลเอกสารยังใช้งานได้')
            setImagePreviewPollRevision((current) => current + 1)
          }
        })
    }, imagePreviewRefreshMs)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [imagePreviewPollRevision, imagePreviewRefreshMs, isLoadingImagePreview, ticketId])

  useEffect(() => {
    if (isLoading || ticket?.type !== 'WTO' || ticket.status !== 'partially_billed') {
      setCanReturnStock(false)
      return
    }

    const documentNo = ticket.documentNo
    const controller = new AbortController()
    async function loadAvailability() {
      try {
        const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(documentNo)}/stock-returns`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(await response.text())
        const payload = await response.json() as StockReturnPayload
        if (!controller.signal.aborted) setCanReturnStock(payload.options.length > 0)
      } catch {
        if (!controller.signal.aborted) setCanReturnStock(false)
      }
    }

    void loadAvailability()
    return () => {
      controller.abort()
    }
  }, [isLoading, ticket?.documentNo, ticket?.status, ticket?.type])

  const vehicleImages = useMemo(
    () => (ticket?.vehicleImageNames ?? []).map(decodeStoredImageAsset),
    [ticket],
  )
  const lineImageNames = useMemo(
    () => ticket?.lines.flatMap((line) => line.imageNames) ?? [],
    [ticket],
  )

  async function handleCancelTicket() {
    if (!ticket) return
    setIsCanceling(true)
    setCancelError('')
    try {
      const updated = await cancelWeightTicket(ticket.id, cancelNote)
      setTicket(updated)
    } catch (caught) {
      const message = getErrorMessage(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้')
      setCancelError(message)
      throw new Error(message)
    } finally {
      setIsCanceling(false)
    }
  }

  function requestCancelTicket() {
    if (!ticket) return
    if (!cancelNote.trim()) {
      setCancelError('กรอกหมายเหตุการยกเลิก')
      return
    }

    requestConfirmation({
      confirmLabel: 'ยืนยันยกเลิก',
      description: `เอกสาร ${ticket.documentNo} จะเปลี่ยนสถานะเป็นยกเลิก และเก็บประวัติการทำรายการไว้`,
      destructive: true,
      onConfirm: handleCancelTicket,
      title: 'ยืนยันการยกเลิกเอกสารหรือไม่?',
    })
  }

  async function handleConfirmTicket() {
    if (!ticket) return
    beginSaveStage('confirm')
    try {
      const updated = await confirmWeightTicket(ticket.id)
      setTicket(updated)
      setSuccessModalMessage(ticket.type === 'WTI' ? 'ยืนยันรับของเรียบร้อยแล้ว' : 'ยืนยันส่งของเรียบร้อยแล้ว')
    } catch (caught) {
      window.alert(getErrorMessage(caught, 'ยืนยันใบรับ-ส่งของไม่ได้'))
    } finally {
      endSaveStage()
    }
  }

  async function handlePrintReceipt() {
    if (!ticket || !canPrintWeightTicket(ticket.status)) return
    setIsPrinting(true)
    let printWindow: Window | null = null
    try {
      const printableTicket = ticket.imageNames.some((imageName) => !isPreviewableStoredImageAsset(decodeStoredImageAsset(imageName)))
        ? await getWeightTicket(ticketId)
        : ticket
      printWindow = openWeightTicketPrintWindow(printableTicket)
      await openWeightTicketReceiptPrint(printableTicket, printWindow)
    } catch (caught) {
      printWindow?.close()
      window.alert(getErrorMessage(caught, 'เปิดใบพิมพ์ใบรับ-ส่งสินค้าไม่สำเร็จ'))
    } finally {
      setIsPrinting(false)
    }
  }

  async function reloadTicket() {
    const nextTicket = await getWeightTicket(ticketId, { includeImagePreviews: false })
    setTicket(nextTicket)
    setCancelNote(nextTicket.cancelNote ?? '')
    setImagePreviewError('')
    setImagePreviewRefreshMs(null)
    setIsLoadingImagePreview(true)
    try {
      const previews = await getWeightTicketImagePreviews(ticketId)
      setTicket((current) => current ? mergeWeightTicketImagePreviews(current, previews) : current)
      setImagePreviewRefreshMs(previews.refreshAfterMs)
    } catch {
      setImagePreviewError('ยังโหลด preview รูปภาพไม่สำเร็จ แต่ข้อมูลเอกสารยังใช้งานได้')
    } finally {
      setIsLoadingImagePreview(false)
    }
    if (nextTicket.type === 'WTO') {
      await loadStockReturnAvailability(nextTicket.documentNo)
    } else {
      setCanReturnStock(false)
    }
  }

  useWeightTicketRealtime((event) => {
    if (event.documentNo !== ticketId) return
    void reloadTicket().catch((caught) => {
      setLoadError(getErrorMessage(caught, 'โหลดข้อมูลใบรับ-ส่งของล่าสุดไม่ได้'))
    })
  }, Boolean(ticketId), realtimeBranchIds)

  async function handleSendLineNotification() {
    if (!ticket || !canShareWeightTicket(ticket.status)) return
    setIsSendingLine(true)
    setShareError('')
    try {
      await notifyWeightTicketLine(ticket.id, {})
      setShowShareDialog(false)
      setSuccessModalMessage('ส่ง LINE พร้อม PDF เรียบร้อยแล้ว')
    } catch (caught) {
      setShareError(getErrorMessage(caught, 'ส่ง LINE ใบรับ-ส่งของไม่สำเร็จ'))
    } finally {
      setIsSendingLine(false)
    }
  }

  const activeGalleryImage = lineGallery?.images[lineGallery.activeIndex] ?? null
  const [isLoadingOriginalImage, setIsLoadingOriginalImage] = useState(false)
  const [galleryRotate, setGalleryRotate] = useState(0)
  const galleryViewportRef = useRef<HTMLDivElement | null>(null)

  // แนบ wheel listener แบบ non-passive เพื่อให้ preventDefault ทำงานได้จริงในทุก browser
  // (React onWheel แนบเป็น passive listener ทำให้ browser เตือน/ignore preventDefault)
  useEffect(() => {
    const node = galleryViewportRef.current
    if (!node || !lineGallery) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY < 0 ? 0.25 : -0.25
      setGalleryZoom((current) => {
        const next = Math.min(4, Math.max(1, Number((current + delta).toFixed(2))))
        if (next === 1) setGalleryPan({ x: 0, y: 0 })
        return next
      })
    }

    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [lineGallery])

  useEffect(() => {
    setGalleryZoom(1)
    setGalleryPan({ x: 0, y: 0 })
    setGalleryRotate(0)
    const thumbnail = activeThumbnailRef.current
    if (thumbnail && typeof thumbnail.scrollIntoView === 'function') {
      thumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [lineGallery?.activeIndex])

  useEffect(() => {
    if (!lineGallery || !activeGalleryImage || activeGalleryImage.originalUrl || !ticket) return
    const controller = new AbortController()
    setIsLoadingOriginalImage(true)
    setOriginalImageError('')
    void getWeightTicketImageOriginal(ticket.documentNo, activeGalleryImage.originalStorageKey, { signal: controller.signal })
      .then(({ url }) => {
        setLineGallery((current) => {
          if (!current) return current
          return {
            ...current,
            images: current.images.map((image) => image.originalStorageKey === activeGalleryImage.originalStorageKey ? { ...image, originalUrl: url } : image),
          }
        })
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setOriginalImageError(getErrorMessage(caught, 'โหลดรูปต้นฉบับไม่ได้'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingOriginalImage(false)
      })
    return () => controller.abort()
  }, [activeGalleryImage, lineGallery, ticket])

  function openImageGallery(payload: {
    activeIndex: number
    images: Array<{ bucket: string; contextTitle?: string; fileName: string; originalStorageKey: string; originalUrl?: string; url: string }>
    title: string
  }) {
    setGalleryZoom(1)
    setGalleryPan({ x: 0, y: 0 })
    setGalleryRotate(0)
    setLineGallery(payload)
  }

  return (
    <>
    <Dialog open onOpenChange={(open) => {
      if (!open) requestClose()
    }}>
      <DialogContent hideClose aria-labelledby="weight-ticket-detail-title" className="left-0 top-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-[min(96vw,96rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md">
        <DialogHeader className="sticky top-0 z-20 shrink-0 bg-slate-900 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white sm:rounded-t-md sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <DialogTitle id="weight-ticket-detail-title" className="break-words text-base leading-6 text-white sm:truncate sm:text-lg">
                {ticket?.type === 'WTI' ? 'ใบรับของ' : ticket?.type === 'WTO' ? 'ใบส่งของ' : 'รายละเอียดเอกสาร'} {ticket?.documentNo ?? ticketId}
              </DialogTitle>
              <DialogDescription className="truncate text-slate-300">{ticket?.partyName ?? (isLoading ? 'กำลังโหลดข้อมูล' : '-')}</DialogDescription>
            </div>
            <div className="flex min-w-0 w-full items-center justify-end gap-2 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
              {ticket && !isLoading ? (
                <>
                  {canConfirmWeightTicket(ticket) ? (
                    <div className="flex items-center gap-3">
                      {ticket.type === 'WTO' ? <span className="text-xs text-current">ยังไม่จอง stock</span> : null}
                      <Button
                        aria-label={
                          isConfirming
                            ? 'กำลังยืนยัน'
                            : ticket.type === 'WTI'
                              ? 'ยืนยันรับของ'
                              : 'ยืนยันส่งของ'
                        }
                        disabled={isConfirming}
                        type="button"
                        className="h-10 w-10 shrink-0 gap-0 bg-emerald-600 px-0 text-white hover:bg-emerald-700 sm:h-9 sm:w-auto sm:gap-2 sm:px-4"
                        onClick={() => void handleConfirmTicket()}
                      >
                        <CheckCircle2 className="size-4" />
                        <span className="sr-only sm:not-sr-only">
                          {isConfirming ? 'กำลังยืนยัน...' : ticket.type === 'WTI' ? 'ยืนยันรับของ' : 'ยืนยันส่งของ'}
                        </span>
                      </Button>
                    </div>
                  ) : null}
                {canReturnStock ? (
                  <Button aria-label="รับของคืน" type="button" variant="outline" className="h-10 w-10 shrink-0 gap-0 px-0 font-normal border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white sm:h-9 sm:w-auto sm:gap-2 sm:px-4" onClick={() => setShowStockReturnDialog(true)}>
                    <RotateCcw className="size-4" />
                    <span className="sr-only sm:not-sr-only">รับของคืน</span>
                  </Button>
                ) : null}
                {ticket.canEdit ? (
                  onEdit ? (
                    <Button
                      aria-label="แก้ไข"
                      type="button"
                      variant="outline"
                      className="h-10 w-10 shrink-0 gap-0 px-0 font-normal border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white sm:h-9 sm:w-auto sm:gap-2 sm:px-4"
                      onClick={() => requestDiscardCancelNote(() => onEdit(ticket.id, ticket.type))}
                    >
                      <SquarePen className="size-4" />
                      <span className="sr-only sm:not-sr-only">แก้ไข</span>
                    </Button>
                  ) : (
                    <Button asChild type="button" variant="outline" className="h-10 w-10 shrink-0 gap-0 px-0 font-normal border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white sm:h-9 sm:w-auto sm:gap-2 sm:px-4">
                      <GuardedLink aria-label="แก้ไข" href={`/daily/weight-tickets?id=${encodeURIComponent(ticket.id)}`}>
                        <SquarePen className="size-4" />
                        <span className="sr-only sm:not-sr-only">แก้ไข</span>
                      </GuardedLink>
                    </Button>
                  )
                ) : null}
                {canShareWeightTicket(ticket.status) ? <Button aria-label="แชร์" className="h-10 w-10 shrink-0 gap-0 px-0 font-normal border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white sm:h-9 sm:w-auto sm:gap-2 sm:px-4" type="button" variant="outline" onClick={() => setShowShareDialog(true)}>
                  <Share2 className="size-4" />
                  <span className="sr-only sm:not-sr-only">แชร์</span>
                </Button> : null}
                {canPrintWeightTicket(ticket.status) ? (
                  <Button aria-label={isPrinting ? 'กำลังเตรียมพิมพ์' : 'พิมพ์'} className="h-10 w-10 shrink-0 gap-0 border-emerald-600 bg-emerald-600 px-0 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white sm:h-9 sm:w-auto sm:gap-2 sm:px-4" disabled={isPrinting} type="button" variant="outline" onClick={() => void handlePrintReceipt()}>
                    <Printer className="size-4" />
                    <span className="sr-only sm:not-sr-only">{isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}</span>
                  </Button>
                ) : null}
                </>
              ) : null}
              <Button className="h-10 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white sm:h-9" disabled={isCanceling} type="button" variant="outline" onClick={requestClose}>ปิด</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50">

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
        ) : loadError || !ticket ? (
          <div className="p-4">
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError || 'ไม่พบใบรับ-ส่งของ'}</div>
          </div>
        ) : (
          <div className="space-y-4 p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:space-y-5 sm:p-4">
            <WeightTicketSaveProgress stage={saveStage} type={ticket.type} />
            <div className="space-y-4">
              <Card className="p-4 sm:p-5">
                <SectionTitle title="ข้อมูลเอกสาร" />
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-4">
                  <DetailItem label="วันที่/เวลาสร้าง" value={formatDateTime(ticket.createdAt)} />
                  <DetailItem label="ผู้สร้างเอกสาร" value={ticket.createdBy} />
                  <DetailItem label="ผู้กรอก" value={ticket.enteredBy} />
                  <DetailItem label="อัปเดตล่าสุด" value={formatDateTime(ticket.updatedAt || ticket.createdAt)} />
                  <DetailItem label="ผู้แก้ไขล่าสุด" value={ticket.updatedBy ?? '-'} />
                  {ticket.type === 'WTI' ? (
                    <DetailItem label="อ้างอิงบิลซื้อ" value={`${ticket.usedInPurchaseBillCount} รายการ`} />
                  ) : (
                    <DetailItem label="อ้างอิงบิลขาย" value={`${ticket.usedInSalesBillCount} รายการ`} />
                  )}
                  <div>
                    <div className="text-sm font-medium text-slate-500">สถานะเอกสาร</div>
                    <div className="mt-1">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold',
                        weightTicketStatusBadgeClass(ticket.type, ticket.status),
                      )}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {displayWeightTicketStatus(ticket.type, ticket.status)}
                      </span>
                    </div>
                  </div>
                  {ticket.cancelledAt ? <DetailItem label="ยกเลิกเมื่อ" value={formatDateTime(ticket.cancelledAt)} /> : null}
                </div>
                {ticket.type === 'WTI' && ticket.usedInPurchaseBillDocNos.length > 0 ? (
                  <div className="mt-4 rounded-md bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-500">เลขที่บิลซื้อที่อ้างอิง</div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {ticket.usedInPurchaseBillDocNos.map((docNo) => (
                        <span className="font-mono text-sm font-medium text-blue-700" key={docNo}>
                          {docNo}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {ticket.remark ? (
                  <div className="mt-4 rounded-md bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-500">
                      {ticket.type === 'WTI' ? 'หมายเหตุใบรับของ' : 'หมายเหตุใบส่งของ'}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">{ticket.remark}</div>
                  </div>
                ) : null}
                {ticket.status === 'cancelled' && ticket.cancelNote ? (
                  <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    เหตุผลการยกเลิก: {ticket.cancelNote}
                  </div>
                ) : null}
                {!ticket.canEdit || !ticket.canCancel ? (
                  <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    เอกสารถูกนำไปใช้กับบิลรับซื้อหรือบิลขายแล้ว จึงไม่สามารถแก้ไขหรือยกเลิกได้
                  </div>
                ) : null}
              </Card>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                <MetricCard icon={<ClipboardList className="size-4" />} label="สาขา" value={ticket.branchName} />
                <MetricCard icon={<Scale className="size-4" />} label="หักภาชนะ" value={`${formatWeight(ticket.totals.containerDeductionWeight)} กก.`} />
                <MetricCard icon={<Scale className="size-4" />} label="หักสิ่งเจือปน" value={`${formatWeight(ticket.totals.deductionWeight)} กก.`} />
                <MetricCard icon={<Scale className="size-4" />} label="น้ำหนักสุทธิ" value={`${formatWeight(ticket.totals.netWeight)} กก.`} />
                <MetricCard
                  className="col-span-2 md:col-span-4"
                  icon={<Package2 className="size-4" />}
                  label="สินค้าหลังรวม"
                  value={`${ticket.productSummaries.length} สินค้า / ${ticket.lines.length} เต๋า`}
                />
              </div>

              <Card className="p-4 sm:p-5">
                <SectionTitle title={ticket.type === 'WTI' ? 'ข้อมูลผู้ขาย' : 'ข้อมูลลูกค้า'} />
                <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label={ticket.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} value={ticket.partyName} />
                    <DetailItem label="ทะเบียนรถ" value={ticket.vehicleNo} />
                    <DetailItem label="โกดัง" value={ticket.godownName || '-'} />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-500">รูปภาพรถส่งของ</div>
                    <ImageGrid images={vehicleImages} onOpen={openImageGallery} />
                  </div>
                </div>
              </Card>

              <div className="space-y-4">
                <Card className="w-full overflow-hidden p-0">
                  <div className="border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
                    <SectionTitle title="รายละเอียดสินค้าและที่มา" />
                  </div>
                  <WeightTicketProductBreakdownTable
                    ticket={ticket}
                    onOpenLineGallery={openImageGallery}
                  />
                </Card>
              </div>

              <WeightTicketImageGallery
                downloadUrl={`/api/daily/weight-tickets/${encodeURIComponent(ticket.documentNo)}/images/download`}
                downloadFileName={`${ticket.documentNo}-images.zip`}
                downloadImageNames={ticket.imageNames}
                imageNames={lineImageNames}
                isLoadingPreview={isLoadingImagePreview}
                onOpen={openImageGallery}
                previewError={imagePreviewError}
              />

            {ticket.type === 'WTI' ? (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
                  <SectionTitle title="ประวัติการใช้งานใบรับของ" />
                </div>
                <div className="overflow-x-auto">
                  <table className="ns-table hidden lg:table min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="px-3 py-3 text-center">เวลา</th>
                        <th className="px-3 py-3 text-center">เหตุการณ์</th>
                        <th className="px-3 py-3 text-left">สินค้า</th>
                        <th className="px-3 py-3 text-center">เอกสารปลายทาง</th>
                        <th className="px-3 py-3 text-right">น้ำหนักสุทธิ</th>
                        <th className="px-3 py-3 text-right">คงเหลือหลังรายการ</th>
                        <th className="px-3 py-3 text-left">ผู้ทำรายการ/หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {ticket.usageTimeline.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={7}>
                            ยังไม่มีประวัติการใช้งาน
                          </td>
                        </tr>
                      ) : ticket.usageTimeline.map((event) => (
                        <tr key={event.id}>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-slate-500">{formatDateTime(event.createdAt)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-center font-medium text-slate-900">{usageActionLabel(event.action)}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900">{event.productName}</div>
                            {event.productCode ? <div className="mt-0.5 text-xs text-slate-500">{event.productCode}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-slate-700">
                            {event.targetDocNo ? (
                              <GuardedLink className="font-mono font-medium text-blue-700 hover:underline" href={`/purchase/bills/${encodeURIComponent(event.targetDocNo)}`}>
                                {event.targetDocNo}
                              </GuardedLink>
                            ) : (
                              '-'
                            )}
                            {event.targetLineNo ? <div className="mt-0.5 text-xs text-slate-500">รายการ {event.targetLineNo}</div> : null}
                          </td>
                          <td className={cn('whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums', usageWeightClass(event.action))}>
                            {usageWeightLabel(event.action, event.allocatedNetWeight)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">
                            {event.toRemainingWeight == null ? '-' : `${formatWeight(event.toRemainingWeight)} กก.`}
                          </td>
                          <td className="min-w-48 px-3 py-3 text-slate-600">
                            <div>{event.createdBy || '-'}</div>
                            {event.note ? <div className="mt-1 text-xs text-slate-500">{event.note}</div> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="block lg:hidden divide-y divide-slate-100 bg-white">
                    {ticket.usageTimeline.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-400">ยังไม่มีประวัติการใช้งาน</div>
                    ) : ticket.usageTimeline.map((event) => (
                      <div key={event.id} className="p-4 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="font-bold text-slate-800 text-base">{usageActionLabel(event.action)}</div>
                            <div className="whitespace-nowrap text-sm text-slate-500 font-medium">{formatDateTime(event.createdAt)}</div>
                          </div>
                          <div className="text-right">
                            <span className={cn('text-sm font-bold block', usageWeightClass(event.action))}>
                              {usageWeightLabel(event.action, event.allocatedNetWeight)}
                            </span>
                            {event.toRemainingWeight != null && (
                              <span className="text-sm text-slate-600 font-semibold">คงเหลือ: {formatWeight(event.toRemainingWeight)} กก.</span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-slate-700 space-y-1.5 pt-1.5 border-t border-slate-100/50">
                          <div><span className="font-semibold text-slate-500">สินค้า:</span> {event.productName} {event.productCode ? `(${event.productCode})` : ''}</div>
                          {event.targetDocNo && (
                            <div>
                              <span className="font-semibold text-slate-500">เอกสารปลายทาง:</span>{' '}
                              <GuardedLink className="whitespace-nowrap font-mono font-medium text-blue-700 hover:underline" href={`/purchase/bills/${encodeURIComponent(event.targetDocNo)}`}>
                                {event.targetDocNo}
                              </GuardedLink>
                              {event.targetLineNo ? ` (รายการ ${event.targetLineNo})` : ''}
                            </div>
                          )}
                          <div><span className="font-semibold text-slate-500">ผู้ทำรายการ:</span> {event.createdBy || '-'}</div>
                          {event.note && <div className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded mt-1">หมายเหตุ: {event.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ) : null}

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-700">ประวัติเอกสาร (Timeline)</div>
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', weightTicketStatusBadgeClass(ticket.type, ticket.status))}>
                  <span className="size-1.5 rounded-full bg-current" />
                  ล่าสุด: {displayWeightTicketStatus(ticket.type, ticket.status)}
                </span>
              </div>
              <div className="space-y-3">
                {ticket.timeline.length === 0 ? (
                  <div className="text-sm text-slate-400">ยังไม่มี timeline เอกสาร</div>
                ) : ticket.timeline.map((event, index) => {
                  const fromStatus = metadataString(event.metadata, 'fromStatus')
                  const toStatus = metadataString(event.metadata, 'toStatus')
                  const targetDocNo = metadataString(event.metadata, 'targetDocNo')
                  const productName = metadataString(event.metadata, 'productName')
                  const note = metadataString(event.metadata, 'cancelNote')
                    || metadataString(event.metadata, 'note')
                    || (event.action === 'edited' ? 'มีการแก้ไขรายการสินค้า/เต๋า' : '')
                  const allocatedNetWeight = metadataNumber(event.metadata, 'allocatedNetWeight')
                  const toRemainingWeight = metadataNumber(event.metadata, 'toRemainingWeight')
                  const isLatest = index === 0
                  const pendingOutChangeCount = weightTicketTimelinePendingOutChangeCount(ticket, event)
                  const isExpanded = Boolean(expandedTimelineIds[event.id])

                  return (
                    <div key={event.id} className="grid grid-cols-[72px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
                      <div className="pt-1 text-right text-sm text-slate-500 font-medium">
                        <div>{formatDateTime(event.occurredAt)}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-600">{event.actorName}</div>
                      </div>
                      <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
                        <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${timelineDotClass(event.action, isLatest)}`} />
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-bold text-slate-800">{timelineLabel(event.eventKey, event.action, ticket.type)}</div>
                          {toStatus ? (
                            <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded', weightTicketStatusBadgeClass(ticket.type, toStatus as WeightTicketStatus))}>
                              <span className="size-1.5 rounded-full bg-current" />
                              {timelineStatusLabel(ticket.type, toStatus)}
                            </span>
                          ) : null}
                        </div>
                        {fromStatus && fromStatus !== toStatus ? (
                          <div className="mt-1 text-sm text-slate-500">
                            เปลี่ยนสถานะจาก {timelineStatusLabel(ticket.type, fromStatus)}
                          </div>
                        ) : null}
                        <div className="mt-2 grid gap-1.5 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-600 shadow-sm border border-slate-100">
                          {targetDocNo || productName || allocatedNetWeight != null ? (
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {targetDocNo ? (
                                <GuardedLink className="whitespace-nowrap font-mono font-medium text-blue-700 hover:underline" href={`/purchase/bills/${encodeURIComponent(targetDocNo)}`}>
                                  {targetDocNo}
                                </GuardedLink>
                              ) : null}
                              {productName ? <span>{productName}</span> : null}
                              {allocatedNetWeight != null ? <span>น้ำหนัก: {formatWeight(allocatedNetWeight)} กก.</span> : null}
                              {toRemainingWeight != null ? <span>คงเหลือ: {formatWeight(toRemainingWeight)} กก.</span> : null}
                            </div>
                          ) : null}
                          {note ? (
                            <div className="text-slate-700">{note}</div>
                          ) : null}
                          {!targetDocNo && !productName && allocatedNetWeight == null && !note ? (
                            <div className="text-slate-400">อัปเดตข้อมูล</div>
                          ) : null}
                          {pendingOutChangeCount > 0 ? (
                            <div>
                              <button
                                className="font-semibold text-blue-700 hover:underline"
                                type="button"
                                onClick={() => setExpandedTimelineIds((current) => ({ ...current, [event.id]: !current[event.id] }))}
                              >
                                {isExpanded ? 'ซ่อนรายการเปลี่ยนแปลง' : `ดูรายการเปลี่ยนแปลง ${pendingOutChangeCount.toLocaleString('th-TH')} รายการ`}
                              </button>
                              {isExpanded ? (
                                <div className="mt-2 overflow-hidden rounded-md border border-slate-100">
                                  <WeightTicketTimelinePendingOutChanges event={event} ticket={ticket} />
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {ticket.canCancel ? (
              <Card className="p-4 sm:p-5">
                <SectionTitle title="ยกเลิกเอกสาร" />
                <div className="mt-4 space-y-3 px-1">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      เหตุผลการยกเลิก<span className="ml-1 text-red-600">*</span>
                    </label>
                    <textarea
                      aria-invalid={Boolean(cancelError && !cancelNote.trim())}
                      className="block min-h-[88px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                      placeholder="ระบุเหตุผลการยกเลิก"
                      maxLength={500}
                      required
                      value={cancelNote}
                      onChange={(event) => {
                        setCancelNote(event.target.value)
                        if (cancelError && !cancelNote.trim()) setCancelError('')
                      }}
                    />
                    {cancelError ? <div className="mt-1 text-xs text-red-600">{cancelError}</div> : null}
                  </div>
                  <Button disabled={isCanceling} type="button" variant="outline" onClick={requestCancelTicket}>
                    <XCircle className="mr-2 size-4" />
                    {isCanceling ? 'กำลังยกเลิก...' : 'ยกเลิกเอกสาร'}
                  </Button>
                </div>
              </Card>
            ) : null}
            </div>
          </div>
        )}

        </div>

        {lineGallery && activeGalleryImage && (
          <Dialog open onOpenChange={(open) => {
            if (!open) setLineGallery(null)
          }}>
            <DialogContent hideClose className="max-w-5xl rounded-md !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
              <DialogHeader className="rounded-t-md">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 shrink">
                    <DialogTitle>{activeGalleryImage.contextTitle ?? lineGallery.title}</DialogTitle>
                    <DialogDescription className="truncate">
                      {activeGalleryImage.fileName} · รูป {lineGallery.activeIndex + 1} / {lineGallery.images.length}
                    </DialogDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label="ย่อรูปภาพ"
                      className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={galleryZoom <= 1}
                      type="button"
                      onClick={() => setGalleryZoom((current) => {
                        const next = Math.max(1, Number((current - 0.25).toFixed(2)))
                        if (next === 1) setGalleryPan({ x: 0, y: 0 })
                        return next
                      })}
                    >
                      <ZoomOut className="size-4" />
                    </button>
                    <button
                      aria-label="คืนค่าซูม"
                      className="min-w-[3rem] rounded-md px-1.5 py-1 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                      title="คลิกเพื่อรีเซ็ตซูมและหมุนรูป"
                      type="button"
                      onClick={() => {
                        setGalleryZoom(1)
                        setGalleryPan({ x: 0, y: 0 })
                        setGalleryRotate(0)
                      }}
                    >
                      {Math.round(galleryZoom * 100)}%
                    </button>
                    <button
                      aria-label="ขยายรูปภาพ"
                      className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={galleryZoom >= 4}
                      type="button"
                      onClick={() => setGalleryZoom((current) => Math.min(4, Number((current + 0.25).toFixed(2))))}
                    >
                      <ZoomIn className="size-4" />
                    </button>
                    <div className="h-5 w-px bg-slate-300 mx-0.5" />
                    <button
                      aria-label="หมุนรูปภาพ 90 องศา"
                      className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                      title="หมุนรูปภาพ 90 องศา"
                      type="button"
                      onClick={() => setGalleryRotate((current) => (current + 90) % 360)}
                    >
                      <RotateCw className="size-4" />
                    </button>
                    <div className="h-5 w-px bg-slate-300 mx-0.5" />
                    <Button className="h-8 shrink-0 border-rose-600 bg-rose-600 px-3 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => setLineGallery(null)}>ปิด</Button>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 bg-slate-950 p-4">
                <div
                  ref={galleryViewportRef}
                  className={cn(
                    'relative flex h-[min(65vh,48rem)] w-full items-center justify-center overflow-hidden rounded-md bg-slate-950 select-none touch-none',
                    galleryZoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
                  )}
                  onDoubleClick={(event) => {
                    if ((event.target as HTMLElement).closest('button')) return
                    setGalleryZoom((current) => {
                      if (current > 1) {
                        setGalleryPan({ x: 0, y: 0 })
                        return 1
                      }
                      return 2
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' && lineGallery.images.length > 1) {
                      setLineGallery((current) => current ? ({ ...current, activeIndex: current.activeIndex === 0 ? current.images.length - 1 : current.activeIndex - 1 }) : current)
                    }
                    if (event.key === 'ArrowRight' && lineGallery.images.length > 1) {
                      setLineGallery((current) => current ? ({ ...current, activeIndex: current.activeIndex === current.images.length - 1 ? 0 : current.activeIndex + 1 }) : current)
                    }
                    if (event.key === '+' || event.key === '=') {
                      setGalleryZoom((current) => Math.min(4, Number((current + 0.25).toFixed(2))))
                    }
                    if (event.key === '-') {
                      setGalleryZoom((current) => {
                        const next = Math.max(1, Number((current - 0.25).toFixed(2)))
                        if (next === 1) setGalleryPan({ x: 0, y: 0 })
                        return next
                      })
                    }
                    if (event.key === '0' || event.key.toLowerCase() === 'r') {
                      setGalleryZoom(1)
                      setGalleryPan({ x: 0, y: 0 })
                      setGalleryRotate(0)
                    }
                  }}
                  onPointerCancel={() => {
                    galleryDragRef.current = null
                  }}
                  onPointerDown={(event) => {
                    if (galleryZoom <= 1 || event.button !== 0 || (event.target as HTMLElement).closest('button')) return
                    event.currentTarget.setPointerCapture(event.pointerId)
                    galleryDragRef.current = {
                      originX: galleryPan.x,
                      originY: galleryPan.y,
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                    }
                  }}
                  onPointerMove={(event) => {
                    const drag = galleryDragRef.current
                    if (!drag || drag.pointerId !== event.pointerId) return
                    setGalleryPan({
                      x: drag.originX + event.clientX - drag.startX,
                      y: drag.originY + event.clientY - drag.startY,
                    })
                  }}
                  onPointerUp={(event) => {
                    if (galleryDragRef.current?.pointerId !== event.pointerId) return
                    galleryDragRef.current = null
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }}
                  tabIndex={0}
                >
                  {activeGalleryImage.originalUrl ? (
                    <Image
                      alt={activeGalleryImage.fileName}
                      className="pointer-events-none object-contain transition-transform duration-150 ease-out"
                      fill
                      sizes="(max-width: 768px) 100vw, 80vw"
                      src={activeGalleryImage.originalUrl}
                      style={{ transform: `translate(${galleryPan.x}px, ${galleryPan.y}px) scale(${galleryZoom}) rotate(${galleryRotate}deg)` }}
                      unoptimized
                    />
                  ) : (
                    <div className="px-4 text-center text-sm text-white" role={originalImageError ? 'alert' : 'status'}>
                      {originalImageError || (isLoadingOriginalImage ? 'กำลังโหลดรูปต้นฉบับ...' : 'ไม่พบรูปต้นฉบับ')}
                    </div>
                  )}
                  {lineGallery.images.length > 1 ? (
                    <>
                      <button
                        aria-label="รูปก่อนหน้า"
                        className="absolute left-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                        type="button"
                        onClick={() => setLineGallery((current) => current ? ({
                          ...current,
                          activeIndex: current.activeIndex === 0 ? current.images.length - 1 : current.activeIndex - 1,
                        }) : current)}
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        aria-label="รูปถัดไป"
                        className="absolute right-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                        type="button"
                        onClick={() => setLineGallery((current) => current ? ({
                          ...current,
                          activeIndex: current.activeIndex === current.images.length - 1 ? 0 : current.activeIndex + 1,
                        }) : current)}
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </>
                  ) : null}
                </div>
                {lineGallery.images.length > 1 ? (
                  <div className="flex max-w-full snap-x gap-3 overflow-x-auto pb-2">
                    {lineGallery.images.map((image, index) => (
                      <button
                        className={cn(
                          'w-28 shrink-0 snap-start overflow-hidden rounded-md border bg-slate-50 text-left transition md:w-32',
                          index === lineGallery.activeIndex ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300',
                        )}
                        key={`${image.fileName}-${index}`}
                        ref={index === lineGallery.activeIndex ? activeThumbnailRef : null}
                        type="button"
                        onClick={() => setLineGallery((current) => current ? ({ ...current, activeIndex: index }) : current)}
                      >
                        <div className="relative aspect-[4/3] bg-slate-200">
                          <Image alt={image.fileName} className="object-cover" fill sizes="20vw" src={image.url} unoptimized />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={showShareDialog} onOpenChange={(open) => {
          if (!open) {
            setShowShareDialog(false)
            setShareError('')
          }
        }}
        >
          <DialogContent hideClose mobileAppShell={false} className="max-w-lg rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 outline-none focus:outline-none">
            <DialogHeader>
              <DialogTitle>แชร์ใบรับ-ส่งของ</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 bg-slate-50 p-4">
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{ticket?.documentNo}</div>
                <div className="mt-1 text-xs text-slate-500">{ticket?.partyName} · {ticket ? `${formatWeight(ticket.totals.netWeight)} กก.` : ''}</div>
              </div>
              {shareError ? <div className="text-xs text-red-600">{shareError}</div> : null}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowShareDialog(false)}>ปิด</Button>
              <Button disabled={isSendingLine} type="button" onClick={handleSendLineNotification}>
                <Share2 className="mr-2 size-4" />
                {isSendingLine ? 'กำลังส่ง...' : 'ส่งเข้ากลุ่มหลัก'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!successModalMessage} onOpenChange={(open) => !open && setSuccessModalMessage('')}>
          <DialogContent hideClose mobileAppShell={false} className="max-w-sm rounded-md !p-0 overflow-hidden flex flex-col bg-white border-0 outline-none focus:outline-none">
            <div className="flex flex-col items-center justify-center space-y-4 bg-white p-6">
              <div className="rounded-full bg-emerald-100 p-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-800">สำเร็จ</h3>
                <p className="text-sm text-slate-500 mt-1">{successModalMessage}</p>
              </div>
            </div>
            <DialogFooter className="bg-white border-t-0 justify-center">
              <Button onClick={() => setSuccessModalMessage('')} className="min-w-[120px]">ตกลง</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
    {ticket?.type === 'WTO' ? (
      <WeightTicketStockReturnDialog
        open={showStockReturnDialog}
        ticketDocNo={ticket.documentNo}
        onClose={() => setShowStockReturnDialog(false)}
        onCompleted={reloadTicket}
      />
    ) : null}
    </>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
    </div>
  )
}

function MetricCard({ className, icon, label, value }: { className?: string; icon: ReactNode; label: string; value: string }) {
  return <SharedKpiCard className={className} icon={icon} label={label} tone="slate" value={value} />
}

function DetailItem({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-semibold text-slate-900 sm:text-base', valueClassName)}>{value}</div>
    </div>
  )
}

function ImageGrid({
  images,
  onOpen,
}: {
  images: StoredImageAsset[]
  onOpen: (payload: { activeIndex: number; images: Array<{ bucket: string; fileName: string; originalStorageKey: string; url: string }>; title: string }) => void
}) {
  if (images.length === 0) {
    return <div className="text-sm text-slate-400">ยังไม่มีรูปภาพ</div>
  }

  const previewable = images.filter(isThumbnailPreviewableStoredImageAsset)
  const previewImages = previewable.slice(0, WEIGHT_TICKET_IMAGE_PREVIEW_LIMIT)
  const remainingPreviewCount = previewable.length - previewImages.length
  const processingCount = images.filter((image) => image.thumbnailStatus === 'queued' || image.thumbnailStatus === 'processing').length
  const failedCount = images.filter((image) => image.thumbnailStatus === 'failed').length
  const unavailableCount = images.filter((image) => !isThumbnailPreviewableStoredImageAsset(image) && !image.thumbnailStatus).length
  const galleryImages = previewable.map(({ bucket, fileName, storageKey, thumbnailUrl }) => ({ bucket, fileName, originalStorageKey: storageKey, url: thumbnailUrl }))

  return (
    <div className="space-y-3">
      {previewable.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {previewImages.map((image, index) => (
            <button
              className="w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left transition hover:border-slate-300 hover:bg-slate-100"
              key={`${image.rawValue}-${index}`}
              type="button"
              onClick={() => onOpen({ activeIndex: index, images: galleryImages, title: 'รูปภาพรถส่งของ' })}
            >
              <div className="relative aspect-[4/3] bg-slate-200">
                <Image alt={image.fileName} className="object-cover" fill sizes="(max-width: 768px) 50vw, 20vw" src={image.thumbnailUrl} unoptimized />
              </div>
              <div className="truncate px-3 py-2 text-xs text-slate-600">{image.fileName}</div>
            </button>
          ))}
          {remainingPreviewCount > 0 ? (
            <button
              aria-label={`เปิดรูปภาพรถส่งของอีก ${remainingPreviewCount} รูป`}
              className="flex min-h-24 w-full items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-200"
              type="button"
              onClick={() => onOpen({ activeIndex: WEIGHT_TICKET_IMAGE_PREVIEW_LIMIT, images: galleryImages, title: 'รูปภาพรถส่งของ' })}
            >
              +อีก {remainingPreviewCount} รูป
            </button>
          ) : null}
        </div>
      ) : null}
      {processingCount > 0 ? (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700" role="status">
          กำลังสร้างภาพตัวอย่าง {processingCount} รูป รูปที่เสร็จแล้วจะแสดงอัตโนมัติ
        </div>
      ) : null}
      {failedCount > 0 ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
          สร้างภาพตัวอย่างไม่สำเร็จ {failedCount} รูป โดยรูปต้นฉบับยังถูกเก็บไว้
        </div>
      ) : null}
      {unavailableCount > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          มีรูปเดิม {unavailableCount} รูปที่ยังไม่มี preview ในระบบปัจจุบัน
        </div>
      ) : null}
    </div>
  )
}
