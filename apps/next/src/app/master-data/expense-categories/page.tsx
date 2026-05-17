import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { expenseCategoriesPageConfig } from '@/lib/master-data-page-configs'

export default function ExpenseCategoriesPage() {
  return <MasterDataPageClient config={expenseCategoriesPageConfig} />
}
