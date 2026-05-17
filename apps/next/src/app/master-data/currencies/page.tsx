import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { currenciesPageConfig } from '@/lib/master-data-page-configs'

export default function CurrenciesPage() {
  return <MasterDataPageClient config={currenciesPageConfig} />
}
