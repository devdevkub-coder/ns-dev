import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { productsPageConfig } from '@/lib/master-data-page-configs'

export default function ProductsPage() {
  return <MasterDataPageClient config={productsPageConfig} />
}
