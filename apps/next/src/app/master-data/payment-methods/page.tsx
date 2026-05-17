import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { paymentMethodsPageConfig } from '@/lib/master-data-page-configs'

export default function PaymentMethodsPage() {
  return <MasterDataPageClient config={paymentMethodsPageConfig} />
}
