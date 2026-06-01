import { DualCostingManagementPageClient } from '@/components/dual-costing/DualCostingManagementPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export default function DualCostingReportPage() {
  return (
    <>
      <PageTitleOverride subtitle="ภาพรวม dual costing สำหรับผู้บริหาร แยกจาก P/L จริง" title="Dual Costing Report" />
      <DualCostingManagementPageClient mode="report" />
    </>
  )
}
