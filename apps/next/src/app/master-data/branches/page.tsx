import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { branchesPageConfig } from '@/lib/master-data-page-configs'

export default function BranchesPage() {
  return <MasterDataPageClient config={branchesPageConfig} />
}
