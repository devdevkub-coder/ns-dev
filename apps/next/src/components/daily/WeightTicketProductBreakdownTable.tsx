'use client'

import { Fragment } from 'react'
import { decodeStoredImageAsset, formatWeight, type WeightTicketRecord, weightTicketImpurityDisplayName } from '@/lib/weight-tickets'

type PreviewImage = { fileName: string; url: string }

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

function LineImagesButton({
  line,
  onOpenLineGallery,
}: {
  line: WeightTicketRecord['lines'][number]
  onOpenLineGallery: (payload: { images: PreviewImage[]; title: string }) => void
}) {
  if (line.imageCount <= 0) return <span className="text-slate-400">-</span>

  const previewableImages = line.imageNames
    .map(decodeStoredImageAsset)
    .filter((image): image is { fileName: string; rawValue: string; url: string } => Boolean(image.url))
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
          onClick={() => onOpenLineGallery({ images: previewableImages, title: line.productName })}
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

export function WeightTicketProductBreakdownTable({
  onOpenLineGallery,
  showBillingColumns = false,
  summaryTargetDocNos,
  ticket,
}: {
  onOpenLineGallery: (payload: { images: PreviewImage[]; title: string }) => void
  showBillingColumns?: boolean
  summaryTargetDocNos?: Map<string, string[]>
  ticket: WeightTicketRecord
}) {
  const groups = groupByProduct(ticket)

  return (
    <div className="overflow-x-auto">
      <table className="hidden lg:table min-w-full divide-y divide-slate-100 text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-3 py-3 text-left">สินค้า / ที่มา</th>
            <th className="px-3 py-3 text-left">รายละเอียด</th>
            {ticket.type === 'WTO' ? <th className="px-3 py-3 text-left">คลัง</th> : null}
            <th className="px-3 py-3 text-right">Gross</th>
            <th className="px-3 py-3 text-right">หักภาชนะ</th>
            <th className="px-3 py-3 text-right">หักสิ่งเจือปน</th>
            <th className="px-3 py-3 text-right">Net</th>
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
                    <WeightCells container={lotTotals.container} deduction={0} gross={lotTotals.gross} net={lotTotals.net} />
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
                      net={line.netWeight}
                    />
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-3" /> : null}
                    <td className="px-3 py-3 text-right">
                      <LineImagesButton line={line} onOpenLineGallery={onOpenLineGallery} />
                    </td>
                  </tr>
                ))}

                {group.impurityLines.length > 0 ? (
                  <tr className="bg-amber-50/70">
                    <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">หักสิ่งเจือปนของสินค้านี้</td>
                    <td className="px-3 py-2 text-xs text-amber-800">{group.impurityLines.length} รายการ</td>
                    {ticket.type === 'WTO' ? <td className="px-3 py-2 text-xs text-amber-800">-</td> : null}
                    <WeightCells container={0} deduction={impurityTotals.deduction} gross={0} net={0} />
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
                    {showBillingColumns ? <td colSpan={3} className="px-3 py-3" /> : null}
                    <td className="px-3 py-3 text-right">
                      <LineImagesButton line={line} onOpenLineGallery={onOpenLineGallery} />
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
              <div className="flex justify-between items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200/60">
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
              <div className="space-y-2 text-sm bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/50">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Gross (น้ำหนักรวม):</span>
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
                  <span className="text-slate-700">Net (น้ำหนักสุทธิ):</span>
                  <span className="text-emerald-700 text-base tabular-nums">{formatWeight(group.summary.netWeight)} กก.</span>
                </div>
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
                      <div key={line.id} className="text-sm bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">เตาที่ {idx + 1}</span>
                          <div className="text-right">
                            <span className="font-bold text-slate-900 tabular-nums">{formatWeight(line.netWeight)} กก.</span>
                          </div>
                        </div>
                        {line.note && <div className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded mt-1">หมายเหตุ: {line.note}</div>}
                        <div className="flex justify-between items-center text-sm font-medium text-slate-500 pt-2 border-t border-slate-100/60 mt-1.5">
                          <span>Gross: {formatWeight(line.grossWeightValue)} | หัก: {formatWeight(line.containerDeductionWeightValue)}</span>
                          <LineImagesButton line={line} onOpenLineGallery={onOpenLineGallery} />
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
                      <div key={line.id} className="text-sm bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-sm space-y-2">
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
                      <div key={line.id} className="text-sm bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">สิ่งเจือปนที่ซื้อ</span>
                          <span className="font-bold text-slate-900 tabular-nums">{formatWeight(line.netWeight)} กก.</span>
                        </div>
                        {line.note && <div className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded mt-1">หมายเหตุ: {line.note}</div>}
                        <div className="flex justify-between items-center text-sm font-medium text-slate-500 pt-2 border-t border-slate-100/60 mt-1.5">
                          <span>Gross: {formatWeight(line.grossWeightValue)} | หัก: {formatWeight(line.containerDeductionWeightValue)}</span>
                          <LineImagesButton line={line} onOpenLineGallery={onOpenLineGallery} />
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
