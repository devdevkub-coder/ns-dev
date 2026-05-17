import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { remittancePurposesPageConfig } from '@/lib/master-data-page-configs'

export default function RemittancePurposesPage() {
  return <MasterDataPageClient config={remittancePurposesPageConfig} />
}
