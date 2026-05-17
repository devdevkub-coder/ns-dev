import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { warehousesPageConfig } from '@/lib/master-data-page-configs'

export default function WarehousesPage() {
  return <MasterDataPageClient config={warehousesPageConfig} />
}
