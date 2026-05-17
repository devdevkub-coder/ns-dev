import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { suppliersPageConfig } from '@/lib/master-data-page-configs'

export default function SuppliersPage() {
  return <MasterDataPageClient config={suppliersPageConfig} />
}
