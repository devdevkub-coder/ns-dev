import { DualCostingManagementPageClient } from '@/components/dual-costing/DualCostingManagementPageClient'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'

export default function CostAllocationLedgerPage() {
  return (
    <>
      <PageTitleOverride subtitle="audit trail ของการ allocate ต้นทุนต่อดีล" title="Cost Allocation Ledger" />
      <DualCostingManagementPageClient mode="ledger" />
    </>
  )
}
