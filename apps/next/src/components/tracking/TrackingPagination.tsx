'use client'

import { Button } from '@/components/ui/Button'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'

export const trackingPageSizeOptions = [10, 25] as const

type TrackingPageSize = (typeof trackingPageSizeOptions)[number]

type TrackingPaginationProps = {
  currentPage: number
  isLoading?: boolean
  pageSize: TrackingPageSize
  totalPages: number
  totalRows: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: TrackingPageSize) => void
}

export function TrackingPagination({
  currentPage,
  isLoading = false,
  pageSize,
  totalPages,
  totalRows,
  onPageChange,
  onPageSizeChange,
}: TrackingPaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>พบทั้งหมด {totalRows.toLocaleString('th-TH')} รายการ</span>
      <div className="flex flex-wrap items-center gap-2">
        <PageSizeDropdown disabled={isLoading} options={trackingPageSizeOptions} value={pageSize} onChange={(size) => {
          onPageSizeChange(size as TrackingPageSize)
          onPageChange(1)
        }} />
        <Button className="h-9" disabled={currentPage <= 1 || isLoading} size="sm" type="button" variant="outline" onClick={() => onPageChange(Math.max(1, currentPage - 1))}>ก่อนหน้า</Button>
        <span className="px-1">หน้า {currentPage} / {totalPages}</span>
        <Button className="h-9" disabled={currentPage >= totalPages || isLoading} size="sm" type="button" variant="outline" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>ถัดไป</Button>
      </div>
    </div>
  )
}
