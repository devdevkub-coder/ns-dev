import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { vatSettingsPageConfig } from '@/lib/master-data-page-configs'

export default function VatSettingsPage() {
  return <MasterDataPageClient config={vatSettingsPageConfig} />
}
