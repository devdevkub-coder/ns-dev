import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { salespersonsPageConfig } from '@/lib/master-data-page-configs'

export default function SalespersonsPage() {
  return <MasterDataPageClient config={salespersonsPageConfig} />
}
