import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { productionLinesPageConfig } from '@/lib/master-data-page-configs'

export default function ProductionLinesPage() {
  return <MasterDataPageClient config={productionLinesPageConfig} />
}
