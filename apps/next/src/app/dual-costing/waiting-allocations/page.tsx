import { DualCostingManagementPageClient } from '@/components/dual-costing/DualCostingManagementPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export default function WaitingAllocationsPage() {
  return (
    <>
      <PageTitleOverride subtitle="ติดตามรายการขายที่ยังรอ allocate ต้นทุนจาก Cost Pool" title="Waiting Allocations" />
      <DualCostingManagementPageClient mode="waiting" />
    </>
  )
}
