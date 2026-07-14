import { DualCostingManagementPageClient } from '@/components/dual-costing/DualCostingManagementPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export default function DualCostingReportPage() {
  return (
    <>
      <PageTitleOverride title="รายงานต้นทุนคู่" />
      <DualCostingManagementPageClient mode="report" />
    </>
  )
}
