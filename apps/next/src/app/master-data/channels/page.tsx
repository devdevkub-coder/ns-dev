import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { channelsPageConfig } from '@/lib/master-data-page-configs'

export default function ChannelsPage() {
  return <MasterDataPageClient config={channelsPageConfig} />
}
