import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { beneficiariesPageConfig } from '@/lib/master-data-page-configs'

export default function BeneficiariesPage() {
  return <MasterDataPageClient config={beneficiariesPageConfig} />
}
