import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { machinesPageConfig } from '@/lib/master-data-page-configs'

export default function MachinesPage() {
  return <MasterDataPageClient config={machinesPageConfig} />
}
