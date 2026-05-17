import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { accountsPageConfig } from '@/lib/master-data-page-configs'

export default function AccountsPage() {
  return <MasterDataPageClient config={accountsPageConfig} />
}
