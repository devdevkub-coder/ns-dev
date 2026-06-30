'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ClipboardList, Package2, Printer, RotateCcw, Scale, Share2, SquarePen, XCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { WeightTicketProductBreakdownTable } from '@/components/daily/WeightTicketProductBreakdownTable'
import { WeightTicketStockReturnDialog, type StockReturnPayload } from '@/components/daily/WeightTicketStockReturnDialog'
import { openWeightTicketPrintWindow, openWeightTicketReceiptPrint } from '@/lib/weight-ticket-print'
import { cn } from '@/lib/utils'
import { cancelWeightTicket, decodeStoredImageAsset, displayWeightTicketStatus, formatWeight, getWeightTicket, notifyWeightTicketLine, type WeightTicketRecord, type WeightTicketStatus, type WeightTicketType, weightTicketStatusBadgeClass } from '@/lib/weight-tickets'
import { getErrorMessage } from '@/lib/api-client'
import { openWeightTicketLineShare } from '@/lib/weight-ticket-share'

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

function timelineLabel(eventKey: string, action: string) {
  if (action === 'created') return 'สร้างเอกสาร'
  if (action === 'edited') return 'แก้ไขเอกสาร'
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
  return eventKey
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

export function WeightTicketDetailModal({
  ticketId,
  onClose,
  onEdit,
}: {
  ticketId: string
  onClose: () => void
  onEdit?: (id: string, type: WeightTicketType) => void
}) {
  const [ticket, setTicket] = useState<WeightTicketRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ fileName: string; url: string } | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const [lineGallery, setLineGallery] = useState<{
    activeIndex: number
    images: Array<{ fileName: string; url: string }>
    title: string
  } | null>(null)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [shareNote, setShareNote] = useState('')
  const [shareError, setShareError] = useState('')
  const [isSendingLine, setIsSendingLine] = useState(false)
  const [showStockReturnDialog, setShowStockReturnDialog] = useState(false)
  const [canReturnStock, setCanReturnStock] = useState(false)
  const [successModalMessage, setSuccessModalMessage] = useState('')

  async function loadStockReturnAvailability(documentNo: string) {
    const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(documentNo)}/stock-returns`, { cache: 'no-store' })
    if (!response.ok) throw new Error(await response.text())
    const payload = await response.json() as StockReturnPayload
    setCanReturnStock(payload.options.length > 0)
  }

  useEffect(() => {
    let cancelled = false

    async function loadTicket() {
      setIsLoading(true)
      setLoadError('')
      try {
        const nextTicket = await getWeightTicket(ticketId)
        if (cancelled) return
        setTicket(nextTicket)
        setCancelNote(nextTicket.cancelNote ?? '')
      } catch (caught) {
        if (!cancelled) setLoadError(getErrorMessage(caught, 'โหลดใบรับ-ส่งของไม่ได้'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadTicket()
    return () => {
      cancelled = true
    }
  }, [ticketId])

  useEffect(() => {
    if (ticket?.type !== 'WTO') {
      setCanReturnStock(false)
      return
    }

    const documentNo = ticket.documentNo
    let cancelled = false
    async function loadAvailability() {
      try {
        const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(documentNo)}/stock-returns`, { cache: 'no-store' })
        if (!response.ok) throw new Error(await response.text())
        const payload = await response.json() as StockReturnPayload
        if (!cancelled) setCanReturnStock(payload.options.length > 0)
      } catch {
        if (!cancelled) setCanReturnStock(false)
      }
    }

    void loadAvailability()
    return () => {
      cancelled = true
    }
  }, [ticket?.documentNo, ticket?.type])

  const vehicleImages = useMemo(
    () => (ticket?.vehicleImageNames ?? []).map(decodeStoredImageAsset),
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
      setCancelError(getErrorMessage(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้'))
    } finally {
      setIsCanceling(false)
    }
  }

  async function handlePrintReceipt() {
    if (!ticket) return
    setIsPrinting(true)
    let printWindow: Window | null = null
    try {
      printWindow = openWeightTicketPrintWindow(ticket)
      await openWeightTicketReceiptPrint(ticket, printWindow)
    } catch (caught) {
      printWindow?.close()
      window.alert(getErrorMessage(caught, 'เปิดใบพิมพ์ใบรับ-ส่งสินค้าไม่สำเร็จ'))
    } finally {
      setIsPrinting(false)
    }
  }

  async function reloadTicket() {
    const nextTicket = await getWeightTicket(ticketId)
    setTicket(nextTicket)
    setCancelNote(nextTicket.cancelNote ?? '')
    if (nextTicket.type === 'WTO') {
      await loadStockReturnAvailability(nextTicket.documentNo)
    } else {
      setCanReturnStock(false)
    }
  }

  async function handleSendLineNotification() {
    if (!ticket) return
    setIsSendingLine(true)
    setShareError('')
    try {
      await notifyWeightTicketLine(ticket.id, { customMessage: shareNote.trim() || undefined })
      setShowShareDialog(false)
      setShareNote('')
      setSuccessModalMessage('ส่ง LINE พร้อม PDF เรียบร้อยแล้ว')
    } catch (caught) {
      setShareError(getErrorMessage(caught, 'ส่ง LINE ใบรับ-ส่งของไม่สำเร็จ'))
    } finally {
      setIsSendingLine(false)
    }
  }

  function handleManualLineShare() {
    if (!ticket) return
    openWeightTicketLineShare(ticket)
    setShowShareDialog(false)
    setShareNote('')
    setShareError('')
  }

  const activeGalleryImage = lineGallery?.images[lineGallery.activeIndex] ?? null

  return (
    <>
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="weight-ticket-detail-title" className="max-h-[90vh] max-w-6xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0">
        <DialogHeader className="p-4 bg-slate-900 text-white shrink-0 rounded-t-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle id="weight-ticket-detail-title" className="text-white">
                {ticket?.type === 'WTI' ? 'ใบรับของ' : ticket?.type === 'WTO' ? 'ใบส่งของ' : 'รายละเอียดเอกสาร'} {ticket?.documentNo ?? ticketId}
              </DialogTitle>
              <DialogDescription className="text-slate-300">{ticket?.partyName ?? (isLoading ? 'กำลังโหลดข้อมูล' : '-')}</DialogDescription>
            </div>
            {ticket ? (
              <div className="flex gap-2">
                {canReturnStock ? (
                  <Button type="button" variant="outline" className="font-normal border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white" onClick={() => setShowStockReturnDialog(true)}>
                    <RotateCcw className="mr-2 size-4" />
                    รับของคืน
                  </Button>
                ) : null}
                {ticket.canEdit ? (
                  onEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="font-normal border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white"
                      onClick={() => onEdit(ticket.id, ticket.type)}
                    >
                      <SquarePen className="mr-2 size-4" />
                      แก้ไข
                    </Button>
                  ) : (
                    <Button asChild type="button" variant="outline" className="font-normal border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white">
                      <Link href={`/daily/weight-tickets?id=${encodeURIComponent(ticket.id)}`}>
                        <SquarePen className="mr-2 size-4" />
                        แก้ไข
                      </Link>
                    </Button>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50">

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
        ) : loadError || !ticket ? (
          <div className="p-4">
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError || 'ไม่พบใบรับ-ส่งของ'}</div>
          </div>
        ) : (
          <div className="space-y-5 p-4">
            <div className="space-y-4">
              <Card className="p-5">
                <SectionTitle subtitle="ข้อมูลเอกสารและผู้ใช้งาน" title="ข้อมูลเอกสาร" />
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-4">
                  <DetailItem
                    label={ticket.type === 'WTI' ? 'ใบรับของ' : 'ใบส่งของ'}
                    value={ticket.documentNo}
                  />
                  <DetailItem label="วันที่/เวลาสร้าง" value={formatDateTime(ticket.createdAt)} />
                  <DetailItem label="ผู้กรอก" value={ticket.enteredBy} />
                  <DetailItem label="อัปเดตล่าสุด" value={formatDateTime(ticket.updatedAt || ticket.createdAt)} />
                  <DetailItem label="ผู้แก้ไขล่าสุด" value={ticket.updatedBy} />
                  {ticket.type === 'WTI' ? (
                    <DetailItem label="อ้างอิงบิลซื้อ" value={`${ticket.usedInPurchaseBillCount} รายการ`} />
                  ) : (
                    <DetailItem label="อ้างอิงบิลขาย" value={`${ticket.usedInSalesBillCount} รายการ`} />
                  )}
                </div>
                {ticket.type === 'WTI' && ticket.usedInPurchaseBillDocNos.length > 0 ? (
                  <div className="mt-4 rounded-md bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-500">เลขที่บิลซื้อที่อ้างอิง</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ticket.usedInPurchaseBillDocNos.map((docNo) => (
                        <span className="rounded-md bg-white px-2.5 py-1 text-sm font-medium text-slate-700 shadow-sm" key={docNo}>
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

              <Card className="p-5">
                <SectionTitle subtitle="ข้อมูลคู่ค้าและรถที่ใช้ส่งสินค้า" title={ticket.type === 'WTI' ? 'ข้อมูลผู้ขาย' : 'ข้อมูลลูกค้า'} />
                <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label={ticket.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} value={ticket.partyName} />
                    <DetailItem label="ทะเบียนรถ" value={ticket.vehicleNo} />
                    <DetailItem label="โกดัง" value={ticket.warehouseName || '-'} />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-500">รูปภาพรถส่งของ</div>
                    <ImageGrid images={vehicleImages} onOpen={(image) => setPreviewImage(image)} />
                  </div>
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="space-y-4">
                  <Card className="overflow-hidden p-0">
                    <div className="border-b border-slate-200 px-5 py-4">
                      <SectionTitle subtitle="เรียงตามสินค้า รวมเต๋าจริง สิ่งเจือปน และรายการซื้อเพิ่มไว้ในกลุ่มเดียว" title="รายละเอียดสินค้าและที่มา" />
                    </div>
                    <WeightTicketProductBreakdownTable
                      ticket={ticket}
                      onOpenLineGallery={({ images, title }) => setLineGallery({ activeIndex: 0, images, title })}
                    />
                  </Card>
                </div>

                <Card className="p-5">
                  <SectionTitle subtitle="สถานะปัจจุบันของเอกสาร" title="สถานะ" />
                  <div className="mt-4 space-y-3">
                    <div className="rounded-md bg-slate-50 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-500">สถานะเอกสาร</div>
                      <div className="mt-1">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded',
                          weightTicketStatusBadgeClass(ticket.type, ticket.status),
                        )}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {displayWeightTicketStatus(ticket.type, ticket.status)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-md bg-slate-50 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-500">การอ้างอิงเอกสาร</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {ticket.type === 'WTI'
                          ? `บิลซื้อ ${ticket.usedInPurchaseBillCount} รายการ`
                          : `บิลขาย ${ticket.usedInSalesBillCount} รายการ`}
                      </div>
                      {ticket.type === 'WTI' && ticket.usedInPurchaseBillDocNos.length > 0 ? (
                        <div className="mt-2 space-y-1 text-sm text-slate-600">
                          {ticket.usedInPurchaseBillDocNos.map((docNo) => (
                            <div key={docNo}>{docNo}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {ticket.cancelledAt ? (
                      <div className="rounded-md bg-slate-50 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-500">ยกเลิกเมื่อ</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(ticket.cancelledAt)}</div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

            {ticket.type === 'WTI' ? (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-200 px-5 py-4">
                  <SectionTitle subtitle="บันทึกการนำใบรับของไปออกบิลและการคืนยอด" title="ประวัติการใช้งานใบรับของ" />
                </div>
                <div className="overflow-x-auto">
                  <table className="hidden lg:table min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="px-3 py-3 text-left">เวลา</th>
                        <th className="px-3 py-3 text-left">เหตุการณ์</th>
                        <th className="px-3 py-3 text-left">สินค้า</th>
                        <th className="px-3 py-3 text-left">เอกสารปลายทาง</th>
                        <th className="px-3 py-3 text-right">น้ำหนักสุทธิ</th>
                        <th className="px-3 py-3 text-right">คงเหลือหลังรายการ</th>
                        <th className="px-3 py-3 text-left">ผู้ทำรายการ/หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ticket.usageTimeline.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={7}>
                            ยังไม่มีประวัติการใช้งาน
                          </td>
                        </tr>
                      ) : ticket.usageTimeline.map((event) => (
                        <tr key={event.id}>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDateTime(event.createdAt)}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">{usageActionLabel(event.action)}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900">{event.productName}</div>
                            {event.productCode ? <div className="mt-0.5 text-xs text-slate-500">{event.productCode}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                            {event.targetDocNo ? (
                              <Link className="font-medium text-blue-700 hover:underline" href={`/purchase/bills/${encodeURIComponent(event.targetDocNo)}`}>
                                {event.targetDocNo}
                              </Link>
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
                            <div className="text-sm text-slate-500 font-medium">{formatDateTime(event.createdAt)}</div>
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
                              <Link className="font-medium text-blue-700 hover:underline" href={`/purchase/bills/${encodeURIComponent(event.targetDocNo)}`}>
                                {event.targetDocNo}
                              </Link>
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
                  const note = metadataString(event.metadata, 'cancelNote') || metadataString(event.metadata, 'note')
                  const allocatedNetWeight = metadataNumber(event.metadata, 'allocatedNetWeight')
                  const toRemainingWeight = metadataNumber(event.metadata, 'toRemainingWeight')
                  const isLatest = index === 0

                  return (
                    <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
                      <div className="pt-1 text-right text-sm text-slate-500 font-medium">
                        <div>{formatDateTime(event.occurredAt)}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-600">{event.actorName}</div>
                      </div>
                      <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
                        <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${timelineDotClass(event.action, isLatest)}`} />
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-bold text-slate-800">{timelineLabel(event.eventKey, event.action)}</div>
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
                        <div className="mt-2 grid gap-1.5 rounded-md bg-white px-3 py-2.5 text-sm text-slate-600 shadow-sm border border-slate-100">
                          {targetDocNo || productName || allocatedNetWeight != null ? (
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {targetDocNo ? (
                                <Link className="font-medium text-blue-700 hover:underline" href={`/purchase/bills/${encodeURIComponent(targetDocNo)}`}>
                                  {targetDocNo}
                                </Link>
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
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {ticket.canCancel ? (
              <Card className="p-5">
                <SectionTitle subtitle="ยกเลิกได้จนกว่าจะถูกนำไปใช้ออกบิล" title="ยกเลิกเอกสาร" />
                <div className="mt-4 space-y-3 px-1">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      เหตุผลการยกเลิก<span className="ml-1 text-red-600">*</span>
                    </label>
                    <textarea
                      className="block min-h-[88px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                      placeholder="ระบุเหตุผลการยกเลิก"
                      value={cancelNote}
                      onChange={(event) => setCancelNote(event.target.value)}
                    />
                    {cancelError ? <div className="mt-1 text-xs text-red-600">{cancelError}</div> : null}
                  </div>
                  <Button disabled={isCanceling} type="button" variant="outline" onClick={handleCancelTicket}>
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

        <DialogFooter className="flex flex-wrap gap-2 justify-end p-4 border-t bg-slate-50 shrink-0">
          {ticket ? (
            <>
              <Button className="gap-2 font-normal" disabled={isPrinting} type="button" variant="outline" onClick={() => void handlePrintReceipt()}>
                <Printer className="size-4" />
                {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
              </Button>
              <Button className="gap-2 font-normal" type="button" variant="outline" onClick={() => setShowShareDialog(true)}>
                <Share2 className="size-4" />
                แชร์
              </Button>
            </>
          ) : null}
          <Button className="font-normal" type="button" variant="outline" onClick={onClose}>ปิด</Button>
        </DialogFooter>

        {previewImage && (
          <Dialog open onOpenChange={(open) => {
            if (!open) setPreviewImage(null)
          }}>
            <DialogContent className="max-w-4xl rounded-md !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
              <DialogHeader className="rounded-t-md">
                <DialogTitle>รูปภาพแนบ</DialogTitle>
                <DialogDescription>{previewImage.fileName}</DialogDescription>
              </DialogHeader>
              <div className="overflow-hidden bg-slate-950 p-4">
                <Image
                  alt={previewImage.fileName}
                  className="max-h-[70vh] w-full object-contain"
                  height={1200}
                  src={previewImage.url}
                  unoptimized
                  width={1600}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {lineGallery && activeGalleryImage && (
          <Dialog open onOpenChange={(open) => {
            if (!open) setLineGallery(null)
          }}>
            <DialogContent className="max-w-5xl rounded-md !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
              <DialogHeader className="rounded-t-md">
                <DialogTitle>{lineGallery.title}</DialogTitle>
                <DialogDescription>
                  {activeGalleryImage.fileName} · รูป {lineGallery.activeIndex + 1} / {lineGallery.images.length}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 p-4 bg-slate-950">
                <div className="relative overflow-hidden rounded-md bg-slate-950">
                  <Image
                    alt={activeGalleryImage.fileName}
                    className="max-h-[70vh] w-full object-contain"
                    height={1200}
                    src={activeGalleryImage.url}
                    unoptimized
                    width={1600}
                  />
                  {lineGallery.images.length > 1 ? (
                    <>
                      <button
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
                  <div className="grid grid-cols-4 gap-3 md:grid-cols-6">
                    {lineGallery.images.map((image, index) => (
                      <button
                        className={cn(
                          'overflow-hidden rounded-md border bg-slate-50 text-left transition',
                          index === lineGallery.activeIndex ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300',
                        )}
                        key={`${image.fileName}-${index}`}
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
            setShareNote('')
            setShareError('')
          }
        }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>แชร์ใบรับ-ส่งของ</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 px-4 pb-4">
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{ticket?.documentNo}</div>
                <div className="mt-1 text-xs text-slate-500">{ticket?.partyName} · {ticket ? `${formatWeight(ticket.totals.netWeight)} กก.` : ''}</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  ข้อความเสริมใน LINE
                </label>
                <textarea
                  className="block min-h-[88px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 sm:text-sm"
                  maxLength={500}
                  placeholder="เช่น ส่งเข้ากลุ่มคลัง / แจ้งบัญชีตรวจเอกสาร"
                  value={shareNote}
                  onChange={(event) => setShareNote(event.target.value)}
                />
                {shareError ? <div className="mt-1 text-xs text-red-600">{shareError}</div> : null}
              </div>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowShareDialog(false)}>ปิด</Button>
              <Button disabled={isSendingLine} type="button" variant="outline" onClick={handleManualLineShare}>
                <Share2 className="mr-2 size-4" />
                แชร์เองผ่าน LINE
              </Button>
              <Button disabled={isSendingLine} type="button" onClick={handleSendLineNotification}>
                <Share2 className="mr-2 size-4" />
                {isSendingLine ? 'กำลังส่ง...' : 'ส่งเข้ากลุ่มหลัก'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!successModalMessage} onOpenChange={(open) => !open && setSuccessModalMessage('')}>
          <DialogContent hideClose className="max-w-sm">
            <div className="flex flex-col items-center justify-center p-6 space-y-4">
              <div className="rounded-full bg-emerald-100 p-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-800">สำเร็จ</h3>
                <p className="text-sm text-slate-500 mt-1">{successModalMessage}</p>
              </div>
            </div>
            <DialogFooter className="bg-transparent border-t-0 justify-center">
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

function SectionTitle({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}

function MetricCard({ className, icon, label, value }: { className?: string; icon: ReactNode; label: string; value: string }) {
  return (
    <div className={cn("rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold uppercase text-slate-500">{icon}{label}</div>
      <div className="mt-2 text-lg font-bold tabular-nums text-slate-950">{value}</div>
    </div>
  )
}

function DetailItem({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={cn('mt-1 text-base font-semibold text-slate-900', valueClassName)}>{value}</div>
    </div>
  )
}

function ImageGrid({
  images,
  onOpen,
}: {
  images: Array<{ fileName: string; rawValue: string; url: string | null }>
  onOpen: (image: { fileName: string; url: string }) => void
}) {
  if (images.length === 0) {
    return <div className="text-sm text-slate-400">ยังไม่มีรูปภาพ</div>
  }

  const previewable = images.filter((image) => image.url)
  const filenameOnly = images.filter((image) => !image.url)

  return (
    <div className="space-y-3">
      {previewable.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {previewable.map((image, index) => (
            <button
              className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left transition hover:border-slate-300 hover:bg-slate-100"
              key={`${image.rawValue}-${index}`}
              type="button"
              onClick={() => onOpen({ fileName: image.fileName, url: image.url ?? '' })}
            >
              <div className="relative aspect-[4/3] bg-slate-200">
                <Image alt={image.fileName} className="object-cover" fill sizes="(max-width: 768px) 50vw, 20vw" src={image.url ?? ''} unoptimized />
              </div>
              <div className="truncate px-3 py-2 text-xs text-slate-600">{image.fileName}</div>
            </button>
          ))}
        </div>
      ) : null}
      {filenameOnly.length > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          มีรูปเดิม {filenameOnly.length} รูปที่ยังไม่มี preview ในระบบปัจจุบัน
        </div>
      ) : null}
    </div>
  )
}
