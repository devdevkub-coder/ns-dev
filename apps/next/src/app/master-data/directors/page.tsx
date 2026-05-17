import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { directorsPageConfig } from '@/lib/master-data-page-configs'

export default function DirectorsPage() {
  return <MasterDataPageClient config={directorsPageConfig} />
}
