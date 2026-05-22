import { warehousesPageConfig } from '@/lib/master-data-page-configs'
import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'

export default function WarehousesPage() {
  return <MasterDataPageClient config={warehousesPageConfig} />
}
