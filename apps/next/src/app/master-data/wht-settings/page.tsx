import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { whtSettingsPageConfig } from '@/lib/master-data-page-configs'

export default function WhtSettingsPage() {
  return <MasterDataPageClient config={whtSettingsPageConfig} />
}
