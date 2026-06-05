import { MasterDataPageClient } from '@/components/master-data/shared/MasterDataPageClient'
import { expenseTypesPageConfig } from '@/lib/master-data-page-configs'

export default function ExpenseTypesPage() {
  return <MasterDataPageClient config={expenseTypesPageConfig} />
}
