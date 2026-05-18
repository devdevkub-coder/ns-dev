import type { Metadata } from 'next'
import { BankStatementPageClient } from '@/components/finance/BankStatementPageClient'

export const metadata: Metadata = {
  title: 'Cash / Bank Statement | NS Scrap ERP',
}

export default function BankStatementPage() {
  return <BankStatementPageClient />
}
