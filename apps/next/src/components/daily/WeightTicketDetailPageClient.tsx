'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Package2, Printer, Scale, SquarePen, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { openWeightTicketPrintWindow, openWeightTicketReceiptPrint } from '@/lib/weight-ticket-print'
import { cn } from '@/lib/utils'
import { cancelWeightTicket, decodeStoredImageAsset, displayWeightTicketStatus, formatWeight, getWeightTicket, type WeightTicketRecord, type WeightTicketStatus, typeLabels, weightTicketStatusBadgeClass } from '@/lib/weight-tickets'
import { getErrorMessage } from '@/lib/api-client'

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

function timelineDotClass(action: string) {
  if (action === 'cancelled' || action === 'released_from_purchase_bill') return 'border-rose-500'
  if (action === 'edited' || action === 'usage_status_changed' || action === 'status_synced') return 'border-amber-500'
  if (action === 'allocated_to_purchase_bill') return 'border-blue-500'
  return 'border-emerald-500'
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
  if (action === 'allocated_to_sales_bill') return 'นำไปออกบิลขาย'
  if (action === 'released_from_sales_bill') return 'คืนยอดจากบิลขาย'
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

function downstreamDocHref(targetType: 'PURCHASE_BILL' | 'SALES_BILL', targetDocNo: string) {
  return targetType === 'PURCHASE_BILL'
    ? `/purchase/bills/${encodeURIComponent(targetDocNo)}`
    : `/sales/bills/${encodeURIComponent(targetDocNo)}`
}

function downstreamDocLabel(targetType: 'PURCHASE_BILL' | 'SALES_BILL') {
  return targetType === 'PURCHASE_BILL' ? 'บิลรับซื้อ' : 'บิลขาย'
}

export function WeightTicketDetailPageClient({ ticketId }: { ticketId: string }) {
  const router = useRouter()
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
        if (nextTicket.documentNo !== ticketId) {
          router.replace(`/daily/weight-ticket-list/${encodeURIComponent(nextTicket.documentNo)}`)
        }
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
  }, [router, ticketId])

  const vehicleImages = useMemo(
    () => (ticket?.vehicleImageNames ?? []).map(decodeStoredImageAsset),
    [ticket],
  )
  const summaryTargetDocNos = useMemo(() => {
    const grouped = new Map<string, string[]>()
    ticket?.productSummaries.forEach((summary) => {
      grouped.set(summary.id, [])
    })
    ticket?.downstreamAllocations.forEach((allocation) => {
      const rows = grouped.get(allocation.summaryId)
      if (!rows || !allocation.targetDocNo) return
      if (!rows.includes(allocation.targetDocNo)) rows.push(allocation.targetDocNo)
    })
    return grouped
  }, [ticket])

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

  const activeGalleryImage = lineGallery?.images[lineGallery.activeIndex] ?? null

  if (isLoading) {
    return <div className="rounded-md border border-slate-100 bg-white px-4 py-10 text-center text-sm text-slate-500">กำลังโหลดข้อมูล</div>
  }

  if (loadError || !ticket) {
    return <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">{loadError || 'ไม่พบใบรับ-ส่งของ'}</div>
  }

  return (
    <div className="space-y-5 pb-24">
      <PageTitleOverride
        breadcrumbLabel={`${ticket.type === 'WTI' ? 'ใบรับของ' : 'ใบส่งของ'} ${ticket.documentNo}`}
        title={`${ticket.type === 'WTI' ? 'ใบรับของ' : 'ใบส่งของ'} - ${ticket.documentNo}`}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Button asChild size="xs" type="button" variant="outline">
            <Link href="/daily/weight-ticket-list">
              <ArrowLeft className="mr-1 size-3" />
              กลับไปรายการ
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPrinting} type="button" variant="outline" onClick={() => void handlePrintReceipt()}>
            <Printer className="mr-2 size-4" />
            {isPrinting ? 'กำลังเตรียมใบพิมพ์...' : ticket.type === 'WTI' ? 'พิมพ์ใบรับสินค้า' : 'พิมพ์ใบส่งของ'}
          </Button>
          {ticket.canEdit ? (
            <Button asChild type="button" variant="outline">
              <Link href={`/daily/weight-tickets?id=${encodeURIComponent(ticket.id)}`}>
                <SquarePen className="mr-2 size-4" />
                แก้ไข
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle subtitle="ข้อมูลเอกสารและผู้ใช้งาน" title="ข้อมูลเอกสาร" />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <div className="text-xs font-medium text-slate-500">เลขที่บิลซื้อที่อ้างอิง</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ticket.usedInPurchaseBillDocNos.map((docNo) => (
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm" key={docNo}>
                      {docNo}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {ticket.type === 'WTO' && ticket.usedInSalesBillDocNos.length > 0 ? (
              <div className="mt-4 rounded-md bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">เลขที่บิลขายที่อ้างอิง</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ticket.usedInSalesBillDocNos.map((docNo) => (
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm" key={docNo}>
                      {docNo}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {ticket.remark ? (
              <div className="mt-4 rounded-md bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={<ClipboardList className="size-4" />} label="สาขา" value={ticket.branchName} />
            <MetricCard icon={<Scale className="size-4" />} label="น้ำหนักสุทธิ" value={`${formatWeight(ticket.totals.netWeight)} กก.`} />
            <MetricCard
              icon={<Package2 className="size-4" />}
              label="สินค้าหลังรวม"
              value={`${ticket.productSummaries.length} สินค้า / ${ticket.lines.length} lot`}
            />
          </div>

          <Card className="p-5">
            <SectionTitle subtitle="ข้อมูลคู่ค้าและรถที่ใช้ส่งสินค้า" title={ticket.type === 'WTI' ? 'ข้อมูลผู้ขาย' : 'ข้อมูลลูกค้า'} />
            <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailItem label={ticket.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} value={ticket.partyName} />
                <DetailItem label="ทะเบียนรถ" value={ticket.vehicleNo} />
                <DetailItem label="โกดัง" value={ticket.warehouseName || '-'} />
              </div>
              <div>
                <div className="mb-2 text-xs text-slate-500">รูปภาพรถส่งของ</div>
                <ImageGrid images={vehicleImages} onOpen={(image) => setPreviewImage(image)} />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-4">
              <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-100 px-5 py-4">
                  <SectionTitle subtitle="รองรับเอกสารยาวหลายสิบรายการ" title="รายการสินค้าแยกตาม lot" />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs">
                      <tr>
	                        <th className="px-3 py-3 text-left">ลำดับ</th>
	                        <th className="px-3 py-3 text-left">สินค้า</th>
	                        {ticket.type === 'WTO' ? <th className="px-3 py-3 text-left">คลัง</th> : null}
	                        <th className="px-3 py-3 text-left">หมายเหตุ</th>
                        <th className="px-3 py-3 text-right">Gross</th>
                        <th className="px-3 py-3 text-right">หัก</th>
                        <th className="px-3 py-3 text-right">Net</th>
                        <th className="px-3 py-3 text-left">สิ่งเจือปน</th>
                        <th className="px-3 py-3 text-left">รูป</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ticket.lines.map((line, index) => (
                        <tr key={line.id}>
	                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{index + 1}</td>
	                          <td className="px-3 py-3 font-medium text-slate-900">{line.productName}</td>
	                          {ticket.type === 'WTO' ? (
	                            <td className="px-3 py-3 text-slate-600">
	                              {line.warehouseName ? (
	                                <div>
	                                  <div className="font-medium text-slate-800">{line.warehouseName}</div>
	                                  <div className="mt-0.5 text-xs text-slate-500">{[line.warehouseId, line.warehouseType].filter(Boolean).join(' · ')}</div>
	                                </div>
	                              ) : '-'}
	                            </td>
	                          ) : null}
	                          <td className="px-3 py-3 text-slate-600">{line.note || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(line.grossWeightValue)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(line.deductionWeight)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{formatWeight(line.netWeight)}</td>
                          <td className="px-3 py-3 text-slate-600">{line.impurityName || '-'}</td>
                          <td className="px-3 py-3">
                            {line.imageCount > 0 ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="whitespace-nowrap text-slate-500">{line.imageCount} รูป</span>
                                {line.imageNames.map(decodeStoredImageAsset).filter((image) => image.url).length > 0 ? (
                                  <button
                                    className="text-sm font-medium text-blue-700 hover:underline"
                                    type="button"
                                    onClick={() => {
                                      const previewableImages = line.imageNames
                                        .map(decodeStoredImageAsset)
                                        .filter((image): image is { fileName: string; rawValue: string; url: string } => Boolean(image.url))
                                        .map((image) => ({
                                          fileName: image.fileName,
                                          url: image.url,
                                        }))
                                      if (previewableImages.length > 0) {
                                        setLineGallery({
                                          activeIndex: 0,
                                          images: previewableImages,
                                          title: line.productName,
                                        })
                                      }
                                    }}
                                  >
                                    ดูรูป
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-100 px-5 py-4">
                  <SectionTitle subtitle="รวมสินค้าชนิดเดียวกันในเอกสารเดียวกันก่อนนำไปใช้ออกบิล" title="สรุปต่อสินค้า" />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs">
                      <tr>
                        <th className="px-3 py-3 text-left">ลำดับ</th>
                        <th className="px-3 py-3 text-left">สินค้า</th>
                        <th className="px-3 py-3 text-left">จำนวน lot</th>
                        <th className="px-3 py-3 text-right">Gross รวม</th>
                        <th className="px-3 py-3 text-right">หักรวม</th>
                        <th className="px-3 py-3 text-right">Net รวม</th>
                        <th className="px-3 py-3 text-right">ออกบิลแล้ว</th>
                        <th className="px-3 py-3 text-right">คงเหลือ</th>
                        <th className="px-3 py-3 text-left">เอกสารปลายทาง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ticket.productSummaries.map((summary, index) => (
                        <tr key={summary.id}>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{index + 1}</td>
                          <td className="px-3 py-3 font-medium text-slate-900">{summary.productName}</td>
                          <td className="px-3 py-3 text-slate-600">{summary.lineCount} lot</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(summary.grossWeight)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(summary.deductWeight)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{formatWeight(summary.netWeight)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-blue-700">{formatWeight(summary.billedWeight)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-emerald-700">{formatWeight(summary.remainingWeight)}</td>
                          <td className="px-3 py-3 text-slate-600">
                            {summaryTargetDocNos.get(summary.id)?.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {summaryTargetDocNos.get(summary.id)?.map((docNo) => (
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700" key={`${summary.id}-${docNo}`}>
                                    {docNo}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <SectionTitle subtitle="สถานะปัจจุบันของเอกสาร" title="สถานะ" />
              <div className="mt-4 space-y-3">
                <div className="rounded-md bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">สถานะเอกสาร</div>
                  <div className="mt-1">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-medium',
                      weightTicketStatusBadgeClass(ticket.type, ticket.status),
                    )}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {displayWeightTicketStatus(ticket.type, ticket.status)}
                    </span>
                  </div>
                </div>
                <div className="rounded-md bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">การอ้างอิงเอกสาร</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {ticket.type === 'WTI'
                      ? `บิลซื้อ ${ticket.usedInPurchaseBillCount} รายการ`
                      : `บิลขาย ${ticket.usedInSalesBillCount} รายการ`}
                  </div>
                  {ticket.type === 'WTI' && ticket.usedInPurchaseBillDocNos.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {ticket.usedInPurchaseBillDocNos.map((docNo) => (
                        <div key={docNo}>{docNo}</div>
                      ))}
                    </div>
                  ) : null}
                  {ticket.type === 'WTO' && ticket.usedInSalesBillDocNos.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {ticket.usedInSalesBillDocNos.map((docNo) => (
                        <div key={docNo}>{docNo}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {ticket.cancelledAt ? (
                  <div className="rounded-md bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">ยกเลิกเมื่อ</div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(ticket.cancelledAt)}</div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

        {ticket.type === 'WTI' ? (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <SectionTitle subtitle="บันทึกการนำใบรับของไปออกบิลและการคืนยอด" title="ประวัติการใช้งานใบรับของ" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs">
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
            </div>
          </Card>
        ) : null}

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <SectionTitle
              subtitle={ticket.type === 'WTI' ? 'แสดงว่าใบรับของถูกนำไปใช้กับบิลรับซื้อไหนบ้าง' : 'แสดงว่าใบส่งของถูกนำไปใช้กับบิลขายไหนบ้าง'}
              title={ticket.type === 'WTI' ? 'ปลายทางการใช้งานใบรับของ' : 'ปลายทางการใช้งานใบส่งของ'}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs">
                <tr>
                  <th className="px-3 py-3 text-left">เวลา</th>
                  <th className="px-3 py-3 text-left">ประเภทปลายทาง</th>
                  <th className="px-3 py-3 text-left">เลขที่เอกสาร</th>
                  <th className="px-3 py-3 text-left">สินค้า</th>
                  <th className="px-3 py-3 text-right">Gross</th>
                  <th className="px-3 py-3 text-right">หัก</th>
                  <th className="px-3 py-3 text-right">Net</th>
                  <th className="px-3 py-3 text-left">สถานะ</th>
                  <th className="px-3 py-3 text-left">ผู้ทำรายการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ticket.downstreamAllocations.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={9}>
                      ยังไม่มีปลายทางการใช้งาน
                    </td>
                  </tr>
                ) : ticket.downstreamAllocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDateTime(allocation.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{downstreamDocLabel(allocation.targetType)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      <Link className="font-medium text-blue-700 hover:underline" href={downstreamDocHref(allocation.targetType, allocation.targetDocNo)}>
                        {allocation.targetDocNo}
                      </Link>
                      {allocation.targetLineNo ? <div className="mt-0.5 text-xs text-slate-500">รายการ {allocation.targetLineNo}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{allocation.productName}</div>
                      {allocation.productCode ? <div className="mt-0.5 text-xs text-slate-500">{allocation.productCode}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(allocation.allocatedGrossWeight)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(allocation.allocatedDeductWeight)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{formatWeight(allocation.allocatedNetWeight)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{allocation.status || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{allocation.createdBy || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle subtitle="รวมสถานะเอกสารและประวัติการใช้งาน เรียงจากล่าสุดลงล่าง" title="Timeline เอกสาร" />
          <div className="mt-4 space-y-4">
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
              return (
                <div className="relative pl-6" key={event.id}>
                  {index < ticket.timeline.length - 1 ? <div className="absolute left-[9px] top-5 h-[calc(100%-0.25rem)] w-px bg-slate-200" /> : null}
                  <div className={cn('absolute left-0 top-1.5 size-[18px] rounded-full border-2 bg-white', timelineDotClass(event.action))} />
                  <div className="rounded-md border border-slate-100 bg-white px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-slate-900">{timelineLabel(event.eventKey, event.action)}</div>
                      <div className="text-xs text-slate-400">{formatDateTime(event.occurredAt)}</div>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">{event.actorName}</div>
                    {toStatus ? (
                      <div className="mt-2 text-sm text-slate-700">
                        สถานะ: {fromStatus ? `${timelineStatusLabel(ticket.type, fromStatus)} -> ` : ''}{timelineStatusLabel(ticket.type, toStatus)}
                      </div>
                    ) : null}
                    {targetDocNo || productName || allocatedNetWeight != null ? (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        {targetDocNo ? (
                          <Link
                            className="font-medium text-blue-700 hover:underline"
                            href={downstreamDocHref((metadataString(event.metadata, 'targetType') || 'PURCHASE_BILL') as 'PURCHASE_BILL' | 'SALES_BILL', targetDocNo)}
                          >
                            {targetDocNo}
                          </Link>
                        ) : null}
                        {productName ? <span>{productName}</span> : null}
                        {allocatedNetWeight != null ? <span>{formatWeight(allocatedNetWeight)} กก.</span> : null}
                        {toRemainingWeight != null ? <span>คงเหลือ {formatWeight(toRemainingWeight)} กก.</span> : null}
                      </div>
                    ) : null}
                    {note ? (
                      <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{note}</div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

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

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => setPreviewImage(open ? previewImage : null)}>
        <DialogContent className="max-w-4xl !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
          {previewImage ? (
            <>
              <DialogHeader>
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
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lineGallery)} onOpenChange={(open) => setLineGallery(open ? lineGallery : null)}>
        <DialogContent className="max-w-5xl !p-0 overflow-hidden bg-slate-900 border-0 flex flex-col">
          {lineGallery && activeGalleryImage ? (
            <>
              <DialogHeader>
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
                          index === lineGallery.activeIndex ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-100 hover:border-slate-300',
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
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SectionTitle({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase text-slate-500">{icon}{label}</div>
      <div className="mt-2 text-lg font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  )
}

function DetailItem({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-medium text-slate-900', valueClassName)}>{value}</div>
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
              className="overflow-hidden rounded-md border border-slate-100 bg-slate-50 text-left transition hover:border-slate-300 hover:bg-slate-100"
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

