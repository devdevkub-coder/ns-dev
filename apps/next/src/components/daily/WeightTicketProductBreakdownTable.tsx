'use client'

import { Fragment } from 'react'
import { decodeStoredImageAsset, formatWeight, isPreviewableStoredImageAsset, type WeightTicketRecord, weightTicketImpurityDisplayName } from '@/lib/weight-tickets'

type PreviewImage = { contextTitle?: string; fileName: string; url: string }

type LineGallerySource = {
  id: string
  imageNames: string[]
  title: string
}

type LineGalleryPayload = {
  activeIndex: number
  images: PreviewImage[]
  title: string
}

type ProductBreakdownGroup = {
  impurityLines: WeightTicketRecord['lines']
  purchaseLines: WeightTicketRecord['lines']
  realLotLines: WeightTicketRecord['lines']
  summary: WeightTicketRecord['productSummaries'][number]
}

function isImpurityLine(line: WeightTicketRecord['lines'][number]) {
  return line.grossWeightValue === 0 && Boolean(line.impurityName || line.impurityId)
}

function isPurchaseFromImpurityLine(line: WeightTicketRecord['lines'][number]) {
  return line.grossWeightValue > 0 && line.note.includes('มาจากสิ่งเจือปน')
}

function rawLotNetWeight(line: WeightTicketRecord['lines'][number]) {
  return Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue - line.deductionWeight)
}

function sumLines(lines: WeightTicketRecord['lines']) {
  return lines.reduce(
    (summary, line) => ({
      container: summary.container + line.containerDeductionWeightValue,
      deduction: summary.deduction + line.deductionWeight,
      gross: summary.gross + line.grossWeightValue,
      net: summary.net + line.netWeight,
    }),
    { container: 0, deduction: 0, gross: 0, net: 0 },
  )
}

function formatSignedWeight(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatWeight(value)} กก.`
}

function groupByProduct(ticket: WeightTicketRecord): ProductBreakdownGroup[] {
  return ticket.productSummaries.map((summary) => {
    const productLines = ticket.lines.filter((line) => line.productId === summary.productId)
    return {
      impurityLines: productLines.filter(isImpurityLine),
      purchaseLines: productLines.filter(isPurchaseFromImpurityLine),
      realLotLines: productLines.filter((line) => !isImpurityLine(line) && !isPurchaseFromImpurityLine(line)),
      summary,
    }
  })
}

export function buildWeightTicketLineGallery(
  sources: LineGallerySource[],
  selectedSourceId: string,
): LineGalleryPayload | null {
  const images: PreviewImage[] = []
  let activeIndex = -1

  sources.forEach((source) => {
    const sourceImages = source.imageNames
      .map(decodeStoredImageAsset)
      .filter(isPreviewableStoredImageAsset)
      .map((image) => ({
        contextTitle: source.title,
        fileName: image.fileName,
        url: image.url,
      }))

    if (source.id === selectedSourceId && sourceImages.length > 0) activeIndex = images.length
    images.push(...sourceImages)
  })

  return activeIndex >= 0
    ? { activeIndex, images, title: 'รูปสินค้าและเต๋า' }
    : null
}

function LineImagesButton({
  gallerySources,
  line,
  onOpenLineGallery,
}: {
  gallerySources: LineGallerySource[]
  line: WeightTicketRecord['lines'][number]
  onOpenLineGallery: (payload: LineGalleryPayload) => void
}) {
  if (line.imageCount <= 0) return <span className="text-slate-400">-</span>

  const previewableImages = line.imageNames
    .map(decodeStoredImageAsset)
    .filter(isPreviewableStoredImageAsset)
    .map((image) => ({
      fileName: image.fileName,
      url: image.url,
    }))

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="whitespace-nowrap text-slate-500">{line.imageCount} รูป</span>
      {previewableImages.length > 0 ? (
        <button
          className="text-sm font-medium text-blue-700 hover:underline"
          type="button"
          onClick={() => {
            const gallery = buildWeightTicketLineGallery(gallerySources, line.id)
            if (gallery) onOpenLineGallery(gallery)
          }}
        >
          ดูรูป
        </button>
      ) : null}
    </div>
  )
}

function WeightCells({ container, deduction, gross, net }: { container: number; deduction: number; gross: number; net: number }) {
  return (
    <>
      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(gross)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(container)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(deduction)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{formatWeight(net)}</td>
    </>
  )
}

function formatMoney(value: number) {
  return value.toLocaleString('th-TH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function pendingOutStatusLabel(status: string) {
  if (status === 'active') return 'รอออก'
  if (status === 'consumed') return 'ใช้ในบิลขายแล้ว'
  if (status === 'released') return 'คืนกลับแล้ว'
  if (status === 'cancelled') return 'ยกเลิก'
  if (status === 'lost') return 'ขาด/สูญเสีย'
  return status || '-'
}

function pendingOutStatusClass(status: string) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700'
  if (status === 'consumed') return 'bg-blue-50 text-blue-700'
  if (status === 'released') return 'bg-amber-50 text-amber-700'
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600'
  if (status === 'lost') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

function costSourceLabel(source: string) {
  if (source === 'WTO_CONFIRM') return 'ยืนยันใบส่งของ'
  if (source === 'WTO_EDIT_INCREASE') return 'แก้ไข/เพิ่มเต๋า'
  return source || '-'
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

function timelinePendingOutChangeLabel(
  event: WeightTicketRecord['timeline'][number],
  row: WeightTicketRecord['pendingOutHistory'][number],
) {
  const fieldChangeLabels = timelineFieldChangeLabelsForPendingOutRow(event, row)
  const withFieldChanges = (label: string) => [label, ...fieldChangeLabels].join('\n')

  if (row.eventType === 'confirm_snapshot') return 'ยืนยันใบส่งของ'
  if (row.eventType === 'edit_add_scale') return 'เพิ่มเต๋า'
  if (row.eventType === 'edit_update_scale') {
    const before = row.qtyBefore
    const after = row.qtyAfter ?? row.qty
    if (before != null && Math.abs(before - after) > 0.0001) {
      const delta = after - before
      const direction = delta > 0 ? 'เพิ่มขึ้น' : 'ลดลง'
      return withFieldChanges(`แก้ไขเต๋าเดิม (${direction} ${formatWeight(before)} → ${formatWeight(after)} กก., ${formatSignedWeight(delta)})`)
    }
    return withFieldChanges('แก้ไขเต๋าเดิม')
  }
  if (row.eventType === 'cancel_release') return 'ยกเลิกใบส่งของ'
  if (row.eventType === 'sales_bill_consume') return 'ใช้ในบิลขาย'
  if (row.eventType === 'sales_bill_edit_release') return 'คืนจากแก้ไขบิลขาย'
  if (row.eventType === 'sales_bill_cancel_reopen') return 'คืนจากยกเลิกบิลขาย'
  if (row.eventType === 'sales_bill_return') return 'รับของคืน'
  if (row.eventType === 'sales_bill_return_loss') return 'ของขาดจากรับคืน'
  if (event.action !== 'edited') return costSourceLabel(row.costSnapshotSource)

  const note = metadataText(event.metadata, 'note')
  const hasAddedScale = note.includes('เพิ่มเต๋า')
  const hasRemovedScale = note.includes('ลบเต๋า')
  const hasWeightChange = note.includes('น้ำหนักสุทธิ')

  if (hasAddedScale) return withFieldChanges('เพิ่มเต๋า')
  if (hasRemovedScale || hasWeightChange) return withFieldChanges('แก้ไขเต๋า')
  return withFieldChanges('แก้ไขเต๋า')
}

function CostSnapshotCells({ summary }: { summary: WeightTicketRecord['productSummaries'][number] }) {
  if (summary.costSnapshotStatus === 'pending') {
    return (
      <>
        <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-medium text-amber-700">รอยืนยันราคาต้นทุนเฉลี่ย</td>
        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">-</td>
      </>
    )
  }
  if (summary.unitCostSnapshot == null) {
    return (
      <>
        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">-</td>
        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">-</td>
      </>
    )
  }
  return (
    <>
      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(summary.unitCostSnapshot)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(summary.pendingOutValue)}</td>
    </>
  )
}

type LinePendingOutCost = {
  hasRows: boolean
  missingCost: boolean
  qty: number
  unitCostSnapshot: number | null
  value: number
}

function activePendingOutCostByLine(ticket: WeightTicketRecord) {
  const byLine = new Map<number, { missingCost: boolean; qty: number; value: number }>()
  ticket.pendingOutHistory.forEach((row) => {
    if (row.status !== 'active' || row.sourceLineNo == null) return
    const current = byLine.get(row.sourceLineNo) ?? { missingCost: false, qty: 0, value: 0 }
    current.qty += row.qty
    if (row.unitCostSnapshot == null || row.pendingOutValue == null) {
      current.missingCost = true
    } else {
      current.value += row.pendingOutValue
    }
    byLine.set(row.sourceLineNo, current)
  })

  return new Map(
    [...byLine.entries()].map(([lineNo, row]) => [
      lineNo,
      {
        hasRows: true,
        missingCost: row.missingCost,
        qty: row.qty,
        unitCostSnapshot: row.qty > 0 && !row.missingCost ? row.value / row.qty : null,
        value: row.value,
      } satisfies LinePendingOutCost,
    ]),
  )
}

function LineCostSnapshotCells({ cost }: { cost?: LinePendingOutCost }) {
  if (!cost?.hasRows) {
    return (
      <>
        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">-</td>
        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">-</td>
      </>
    )
  }
  if (cost.missingCost || cost.unitCostSnapshot == null) {
    return (
      <>
        <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-medium text-amber-700">รอยืนยัน</td>
        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">-</td>
      </>
    )
  }
  return (
    <>
      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(cost.unitCostSnapshot)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(cost.value)}</td>
    </>
  )
}

function linePendingOutCost(costByLine: Map<number, LinePendingOutCost>, lineNo: number | undefined) {
  return lineNo == null ? undefined : costByLine.get(lineNo)
}

function dateTimeMs(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function isNearTimelineEvent(row: WeightTicketRecord['pendingOutHistory'][number], event: WeightTicketRecord['timeline'][number]) {
  const eventTime = dateTimeMs(event.occurredAt)
  if (eventTime == null) return true
  const rowTimes = [row.costSnapshotAt, row.heldAt, row.releasedAt]
    .map(dateTimeMs)
    .filter((time): time is number => time != null)
  if (!rowTimes.length) return true
  return rowTimes.some((time) => Math.abs(time - eventTime) <= 5 * 60 * 1000)
}

function pendingOutRowsForTimelineEvent(
  ticket: WeightTicketRecord,
  event: WeightTicketRecord['timeline'][number],
) {
  if (ticket.type !== 'WTO') return []
  const rows = ticket.pendingOutEvents ?? []
  const targetDocNo = typeof event.metadata.targetDocNo === 'string' ? event.metadata.targetDocNo : ''

  const rowsForEvent = rows.filter((row) => row.statusLogEventKey === event.eventKey)
  if (rowsForEvent.length) {
    return rowsForEvent
  }
  if (targetDocNo) {
    return rows.filter((row) => row.referenceDocNo === targetDocNo && row.status !== 'active')
  }
  if (event.action === 'cancelled') {
    return rows.filter((row) => (row.status === 'cancelled' || row.status === 'released') && isNearTimelineEvent(row, event))
  }
  return []
}

function PendingOutRowsTable({
  emptyLabel,
  getChangeLabel,
  rows,
}: {
  emptyLabel: string
  getChangeLabel?: (row: WeightTicketRecord['pendingOutHistory'][number]) => string
  rows: WeightTicketRecord['pendingOutHistory']
}) {
  if (!rows.length) {
    return <div className="p-4 text-sm text-slate-400">{emptyLabel}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="ns-table hidden min-w-full divide-y divide-slate-100 text-sm lg:table">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-3 py-3 text-left">เต๋า / สินค้า</th>
            <th className="px-3 py-3 text-left">คลัง</th>
            <th className="px-3 py-3 text-right">จำนวน</th>
            <th className="px-3 py-3 text-right">ราคาต้นทุนเฉลี่ย</th>
            <th className="px-3 py-3 text-right">มูลค่า</th>
            <th className="px-3 py-3 text-left">สถานะ</th>
            <th className="px-3 py-3 text-left">รายการเปลี่ยนแปลง</th>
            <th className="px-3 py-3 text-left">อ้างอิง</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const changeLabel = getChangeLabel?.(row) || costSourceLabel(row.costSnapshotSource)
            return (
              <tr key={row.holdKey}>
                <td className="px-3 py-3">
                  <div className="font-semibold text-slate-900">{row.sourceLineNo == null ? '-' : `เต๋าที่ ${row.sourceLineNo}`}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{row.productName}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">{row.warehouseName || row.warehouseId || '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{formatWeight(row.qty)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-900">
                  {row.unitCostSnapshot == null ? 'รอยืนยัน' : formatMoney(row.unitCostSnapshot)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-900">
                  {row.pendingOutValue == null ? '-' : formatMoney(row.pendingOutValue)}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${pendingOutStatusClass(row.status)}`}>
                    {pendingOutStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <div className="whitespace-pre-line">{changeLabel}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{formatDateTime(row.costSnapshotAt)}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <div>{row.referenceDocNo || '-'}</div>
                  <div className="mt-0.5 text-xs text-slate-500">กันไว้: {formatDateTime(row.heldAt)}</div>
                  {row.releasedAt ? <div className="mt-0.5 text-xs text-slate-500">ปิดรายการ: {formatDateTime(row.releasedAt)}</div> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="block divide-y divide-slate-100 bg-white lg:hidden">
        {rows.map((row) => {
          const changeLabel = getChangeLabel?.(row) || costSourceLabel(row.costSnapshotSource)
          return (
            <div className="space-y-3 p-4" key={row.holdKey}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">{row.sourceLineNo == null ? '-' : `เต๋าที่ ${row.sourceLineNo}`}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{row.productName}</div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${pendingOutStatusClass(row.status)}`}>
                  {pendingOutStatusLabel(row.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">จำนวน</div>
                  <div className="font-semibold tabular-nums text-slate-900">{formatWeight(row.qty)} กก.</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">ราคาต้นทุนเฉลี่ย</div>
                  <div className="font-semibold tabular-nums text-slate-900">{row.unitCostSnapshot == null ? 'รอยืนยัน' : formatMoney(row.unitCostSnapshot)}</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">มูลค่า</div>
                  <div className="font-semibold tabular-nums text-slate-900">{row.pendingOutValue == null ? '-' : formatMoney(row.pendingOutValue)}</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">คลัง</div>
                  <div className="font-semibold text-slate-900">{row.warehouseName || row.warehouseId || '-'}</div>
                </div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <div className="whitespace-pre-line">รายการเปลี่ยนแปลง: {changeLabel} · {formatDateTime(row.costSnapshotAt)}</div>
                <div className="mt-1">อ้างอิง: {row.referenceDocNo || '-'} · กันไว้ {formatDateTime(row.heldAt)}</div>
                {row.releasedAt ? <div className="mt-1">ปิดรายการ: {formatDateTime(row.releasedAt)}</div> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function timelineFieldChanges(event: WeightTicketRecord['timeline'][number]) {
  const rawChanges = event.metadata.changes
  if (!Array.isArray(rawChanges)) return []
  return rawChanges.flatMap((change) => {
    if (!change || typeof change !== 'object') return []
    const record = change as Record<string, unknown>
    const scope = typeof record.scope === 'string' ? record.scope : ''
    const field = typeof record.field === 'string' ? record.field : ''
    const before = typeof record.before === 'string' ? record.before : ''
    const after = typeof record.after === 'string' ? record.after : ''
    if (!scope || !field) return []
    return [{ after, before, field, scope }]
  })
}

function timelineFieldChangeLabelsForPendingOutRow(
  event: WeightTicketRecord['timeline'][number],
  row: WeightTicketRecord['pendingOutHistory'][number],
) {
  const rowScope = row.sourceLineNo == null ? '' : `เต๋าที่ ${row.sourceLineNo}`
  return timelineFieldChanges(event)
    .filter((change) => change.scope === 'เอกสาร' || change.scope === rowScope)
    .filter((change) => {
      if (change.scope === 'เอกสาร') return change.field === 'ลูกค้า' || change.field === 'ผู้ขาย' || change.field === 'สาขา'
      return true
    })
    .map((change) => `เปลี่ยน${change.field}: ${change.before || '-'} → ${change.after || '-'}`)
}

export function WeightTicketTimelinePendingOutChanges({
  event,
  ticket,
}: {
  event: WeightTicketRecord['timeline'][number]
  ticket: WeightTicketRecord
}) {
  const rows = pendingOutRowsForTimelineEvent(ticket, event)
  return (
    <PendingOutRowsTable
      emptyLabel="ไม่มีรายการ pending_out ที่เปลี่ยนในเหตุการณ์นี้"
      getChangeLabel={(row) => timelinePendingOutChangeLabel(event, row)}
      rows={rows}
    />
  )
}

export function weightTicketTimelinePendingOutChangeCount(ticket: WeightTicketRecord, event: WeightTicketRecord['timeline'][number]) {
  return pendingOutRowsForTimelineEvent(ticket, event).length
}

export function WeightTicketProductBreakdownTable({
  onOpenLineGallery,
  showBillingColumns = false,
  summaryTargetDocNos,
  ticket,
}: {
  onOpenLineGallery: (payload: LineGalleryPayload) => void
  showBillingColumns?: boolean
  summaryTargetDocNos?: Map<string, string[]>
  ticket: WeightTicketRecord
}) {
  const groups = groupByProduct(ticket)
  const costByLine = activePendingOutCostByLine(ticket)
  const lotGallerySources = groups.flatMap((group) =>
    group.realLotLines.map((line, index) => ({
      id: line.id,
      imageNames: line.imageNames,
      title: `${group.summary.productName} · เต๋าที่ ${index + 1}`,
    })),
  )

  return (
    <div className="overflow-x-auto">
      <table className="ns-table hidden lg:table min-w-full divide-y divide-slate-100 text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-3 py-3 text-left">สินค้า / ที่มา</th>
            <th className="px-3 py-3 text-left">รายละเอียด</th>
            {ticket.type === 'WTO' ? <th className="px-3 py-3 text-left">คลัง</th> : null}
            <th className="px-3 py-3 text-right">น้ำหนักรวม</th>
            <th className="px-3 py-3 text-right">หักภาชนะ</th>
            <th className="px-3 py-3 text-right">หักสิ่งเจือปน</th>
            <th className="px-3 py-3 text-right">น้ำหนักสุทธิ</th>
            {ticket.type === 'WTO' ? <th className="px-3 py-3 text-right">ราคาต้นทุนเฉลี่ย</th> : null}
            {ticket.type === 'WTO' ? <th className="px-3 py-3 text-right">มูลค่ารอส่ง</th> : null}
            {showBillingColumns ? <th className="px-3 py-3 text-right">ออกบิลแล้ว</th> : null}
            {showBillingColumns ? <th className="px-3 py-3 text-right">คงเหลือ</th> : null}
            {showBillingColumns ? <th className="px-3 py-3 text-left">เอกสารปลายทาง</th> : null}
            <th className="px-3 py-3 text-right">รูป</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((group, groupIndex) => {
            const lotTotals = sumLines(group.realLotLines)
            const impurityTotals = sumLines(group.impurityLines)
            const purchaseTotals = sumLines(group.purchaseLines)
            const targetDocNos = summaryTargetDocNos?.get(group.summary.id) ?? []
            return (
              <Fragment key={group.summary.id}>
                <tr className="bg-slate-100/80">
                  <td className="px-3 py-3 font-semibold text-slate-900">
                    {groupIndex + 1}. {group.summary.productName}
                    <div className="mt-0.5 text-xs font-medium text-slate-500">{group.summary.lineCount} รายการ</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    รวมทั้งหมดจากเต๋าจริงและซื้อเพิ่มจากสิ่งเจือปน
                  </td>
                  {ticket.type === 'WTO' ? <td className="px-3 py-3 text-slate-500">-</td> : null}
                  <WeightCells
                    container={group.summary.containerDeductionWeight}
                    deduction={group.summary.deductWeight}
                    gross={group.summary.grossWeight}
                    net={group.summary.netWeight}
                  />
                  {ticket.type === 'WTO' ? <CostSnapshotCells summary={group.summary} /> : null}
                  {showBillingColumns ? <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-blue-700">{formatWeight(group.summary.billedWeight)}</td> : null}
                  {showBillingColumns ? <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-emerald-700">{formatWeight(group.summary.remainingWeight)}</td> : null}
                  {showBillingColumns ? (
                    <td className="px-3 py-3 text-slate-600">
                      {targetDocNos.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {targetDocNos.map((docNo) => (
                            <span className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-700" key={`${group.summary.id}-${docNo}`}>
                              {docNo}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                  ) : null}
                  <td className="px-3 py-3 text-right text-slate-400">-</td>
                </tr>

                {group.realLotLines.length > 0 ? (
                  <tr className="bg-emerald-50/50">
                    <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">จากเต๋าจริง</td>
                    <td className="px-3 py-2 text-xs text-emerald-800">{group.realLotLines.length} เต๋า</td>
                    {ticket.type === 'WTO' ? <td className="px-3 py-2 text-xs text-emerald-800">-</td> : null}
                    <WeightCells
                      container={lotTotals.container}
                      deduction={lotTotals.deduction + impurityTotals.deduction}
                      gross={lotTotals.gross}
                      net={lotTotals.net}
                    />
                    {ticket.type === 'WTO' ? <td colSpan={2} className="px-3 py-2" /> : null}
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-2" /> : null}
                    <td className="px-3 py-2" />
                  </tr>
                ) : null}

                {group.realLotLines.map((line, index) => (
                  <tr key={line.id}>
                    <td className="px-3 py-3 text-slate-600">เต๋าที่ {index + 1}</td>
                    <td className="px-3 py-3 text-slate-600">{line.note || '-'}</td>
                    {ticket.type === 'WTO' ? (
                      <td className="px-3 py-3 text-slate-600">{line.warehouseName || '-'}</td>
                    ) : null}
                    <WeightCells
                      container={line.containerDeductionWeightValue}
                      deduction={line.deductionWeight}
                      gross={line.grossWeightValue}
                      net={rawLotNetWeight(line)}
                    />
                    {ticket.type === 'WTO' ? <LineCostSnapshotCells cost={linePendingOutCost(costByLine, line.lineNo)} /> : null}
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-3" /> : null}
                    <td className="px-3 py-3 text-right">
                      <LineImagesButton gallerySources={lotGallerySources} line={line} onOpenLineGallery={onOpenLineGallery} />
                    </td>
                  </tr>
                ))}

                {group.impurityLines.length > 0 ? (
                  <tr className="bg-amber-50/70">
                    <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">หักสิ่งเจือปนของสินค้านี้</td>
                    <td className="px-3 py-2 text-xs text-amber-800">{group.impurityLines.length} รายการ</td>
                    {ticket.type === 'WTO' ? <td className="px-3 py-2 text-xs text-amber-800">-</td> : null}
                    <WeightCells container={0} deduction={impurityTotals.deduction} gross={0} net={0} />
                    {ticket.type === 'WTO' ? <td colSpan={2} className="px-3 py-2" /> : null}
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-2" /> : null}
                    <td className="px-3 py-2" />
                  </tr>
                ) : null}

                {group.impurityLines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-3 text-slate-600">{weightTicketImpurityDisplayName(line)}</td>
                    <td className="px-3 py-3 text-slate-600">{line.note || '-'}</td>
                    {ticket.type === 'WTO' ? <td className="px-3 py-3 text-slate-500">-</td> : null}
                    <WeightCells container={0} deduction={line.deductionWeight} gross={0} net={0} />
                    {ticket.type === 'WTO' ? <td colSpan={2} className="px-3 py-3" /> : null}
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-3" /> : null}
                    <td className="px-3 py-3 text-right text-slate-400">-</td>
                  </tr>
                ))}

                {group.purchaseLines.length > 0 ? (
                  <tr className="bg-blue-50/70">
                    <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-800">ซื้อเพิ่มจากสิ่งเจือปน</td>
                    <td className="px-3 py-2 text-xs text-blue-800">{group.purchaseLines.length} รายการ</td>
                    {ticket.type === 'WTO' ? <td className="px-3 py-2 text-xs text-blue-800">-</td> : null}
                    <WeightCells container={purchaseTotals.container} deduction={0} gross={purchaseTotals.gross} net={purchaseTotals.net} />
                    {ticket.type === 'WTO' ? <td colSpan={2} className="px-3 py-2" /> : null}
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-2" /> : null}
                    <td className="px-3 py-2" />
                  </tr>
                ) : null}

                {group.purchaseLines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-3 text-slate-600">สิ่งเจือปนที่ซื้อ</td>
                    <td className="px-3 py-3 text-slate-600">{line.note || '-'}</td>
                    {ticket.type === 'WTO' ? <td className="px-3 py-3 text-slate-500">-</td> : null}
                    <WeightCells
                      container={line.containerDeductionWeightValue}
                      deduction={line.deductionWeight}
                      gross={line.grossWeightValue}
                      net={line.netWeight}
                    />
                    {ticket.type === 'WTO' ? <td colSpan={2} className="px-3 py-3" /> : null}
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-3" /> : null}
                    <td className="px-3 py-3 text-right">
                      <LineImagesButton
                        gallerySources={[{ id: line.id, imageNames: line.imageNames, title: line.productName }]}
                        line={line}
                        onOpenLineGallery={onOpenLineGallery}
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {/* Mobile Cards (Hidden on Desktop) */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white">
        {groups.map((group, groupIndex) => {
          const lotTotals = sumLines(group.realLotLines)
          const impurityTotals = sumLines(group.impurityLines)
          const purchaseTotals = sumLines(group.purchaseLines)
          const targetDocNos = summaryTargetDocNos?.get(group.summary.id) ?? []

          return (
            <div key={group.summary.id} className="p-4 space-y-4">
              {/* Product Title */}
              <div className="flex justify-between items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <div>
                  <div className="font-bold text-slate-900 text-base">
                    {groupIndex + 1}. {group.summary.productName}
                  </div>
                  <div className="text-sm font-semibold text-slate-500 mt-1">
                    {group.summary.lineCount} รายการ · จากเตาจริงและซื้อเพิ่ม
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-500">น้ำหนักสุทธิรวม</div>
                  <div className="font-bold text-emerald-700 text-lg tabular-nums">{formatWeight(group.summary.netWeight)} กก.</div>
                </div>
              </div>

              {/* Weight Summaries Layout */}
              <div className="space-y-2 text-sm bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/50">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">น้ำหนักรวม:</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{formatWeight(group.summary.grossWeight)} กก.</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">หักภาชนะ:</span>
                  <span className="font-semibold text-slate-700 tabular-nums">-{formatWeight(group.summary.containerDeductionWeight)} กก.</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">หักสิ่งเจือปน:</span>
                  <span className="font-semibold text-slate-700 tabular-nums">-{formatWeight(group.summary.deductWeight)} กก.</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 font-bold text-slate-900">
                  <span className="text-slate-700">น้ำหนักสุทธิ:</span>
                  <span className="text-emerald-700 text-base tabular-nums">{formatWeight(group.summary.netWeight)} กก.</span>
                </div>
                {ticket.type === 'WTO' ? (
                  <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-slate-500">ราคาต้นทุนเฉลี่ย:</span>
                      <span className="text-right font-semibold text-slate-800">
                        {group.summary.costSnapshotStatus === 'pending'
                          ? 'รอยืนยันราคาต้นทุนเฉลี่ย'
                          : group.summary.unitCostSnapshot == null
                            ? '-'
                            : formatMoney(group.summary.unitCostSnapshot)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-slate-500">มูลค่ารอส่ง:</span>
                      <span className="text-right font-semibold tabular-nums text-slate-800">
                        {group.summary.unitCostSnapshot == null ? '-' : formatMoney(group.summary.pendingOutValue)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Sections: Real Lot, Impurities, Purchases */}
              <div className="space-y-4 pl-3 border-l-2 border-slate-200">
                {/* Real lot lines */}
                {group.realLotLines.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md inline-block">
                      จากเตาจริง ({group.realLotLines.length} เตา)
                    </div>
                    {group.realLotLines.map((line, idx) => (
                      <div key={line.id} className="text-sm bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">เตาที่ {idx + 1}</span>
                          <div className="text-right">
                            <span className="font-bold text-slate-900 tabular-nums">{formatWeight(rawLotNetWeight(line))} กก.</span>
                          </div>
                        </div>
                        {line.note && <div className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded mt-1">หมายเหตุ: {line.note}</div>}
                        {ticket.type === 'WTO' ? (
                          <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2.5 text-sm">
                            <div>
                              <div className="text-xs font-medium text-slate-500">ราคาต้นทุนเฉลี่ย</div>
                              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                                {(() => {
                                  const cost = linePendingOutCost(costByLine, line.lineNo)
                                  if (!cost?.hasRows) return '-'
                                  if (cost.missingCost || cost.unitCostSnapshot == null) return 'รอยืนยัน'
                                  return formatMoney(cost.unitCostSnapshot)
                                })()}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-slate-500">มูลค่ารอส่ง</div>
                              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                                {(() => {
                                  const cost = linePendingOutCost(costByLine, line.lineNo)
                                  if (!cost?.hasRows || cost.missingCost || cost.unitCostSnapshot == null) return '-'
                                  return formatMoney(cost.value)
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex justify-between items-center text-sm font-medium text-slate-500 pt-2 border-t border-slate-100/60 mt-1.5">
                          <span>น้ำหนักรวม: {formatWeight(line.grossWeightValue)} | หักภาชนะ: {formatWeight(line.containerDeductionWeightValue)}</span>
                          <LineImagesButton gallerySources={lotGallerySources} line={line} onOpenLineGallery={onOpenLineGallery} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Impurities */}
                {group.impurityLines.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md inline-block">
                      หักสิ่งเจือปนของสินค้านี้ ({group.impurityLines.length} รายการ)
                    </div>
                    {group.impurityLines.map((line) => (
                      <div key={line.id} className="text-sm bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">{weightTicketImpurityDisplayName(line)}</span>
                          <span className="font-semibold text-red-600 tabular-nums">หัก {formatWeight(line.deductionWeight)} กก.</span>
                        </div>
                        {line.note && <div className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded mt-1">หมายเหตุ: {line.note}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Purchase from Impurities */}
                {group.purchaseLines.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md inline-block">
                      ซื้อเพิ่มจากสิ่งเจือปน ({group.purchaseLines.length} รายการ)
                    </div>
                    {group.purchaseLines.map((line) => (
                      <div key={line.id} className="text-sm bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">สิ่งเจือปนที่ซื้อ</span>
                          <span className="font-bold text-slate-900 tabular-nums">{formatWeight(line.netWeight)} กก.</span>
                        </div>
                        {line.note && <div className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded mt-1">หมายเหตุ: {line.note}</div>}
                        <div className="flex justify-between items-center text-sm font-medium text-slate-500 pt-2 border-t border-slate-100/60 mt-1.5">
                          <span>น้ำหนักรวม: {formatWeight(line.grossWeightValue)} | หักภาชนะ: {formatWeight(line.containerDeductionWeightValue)}</span>
                          <LineImagesButton
                            gallerySources={[{ id: line.id, imageNames: line.imageNames, title: line.productName }]}
                            line={line}
                            onOpenLineGallery={onOpenLineGallery}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Billed & Remaining Columns */}
              {showBillingColumns && (
                <div className="grid grid-cols-2 gap-3 text-sm pt-2.5 border-t border-slate-200/60">
                  <div>
                    <span className="text-slate-500 font-medium">ออกบิลแล้ว:</span>{' '}
                    <span className="font-semibold text-blue-700 tabular-nums">{formatWeight(group.summary.billedWeight)} กก.</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">คงเหลือ:</span>{' '}
                    <span className="font-semibold text-emerald-700 tabular-nums">{formatWeight(group.summary.remainingWeight)} กก.</span>
                  </div>
                  {targetDocNos.length > 0 && (
                    <div className="col-span-2 text-sm mt-1.5">
                      <span className="text-slate-500 font-semibold">เอกสารปลายทาง:</span>{' '}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {targetDocNos.map((docNo) => (
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700 shadow-sm" key={docNo}>
                            {docNo}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
