import type { Metadata } from 'next'
import { BankStatementPageClient } from '@/components/finance/BankStatementPageClient'

export const metadata: Metadata = {
  title: 'Cash / Bank Statement | NS Scrap ERP',
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function BankStatementPage({ searchParams }: PageProps) {
  const params = await searchParams
  return <BankStatementPageClient initialFilters={{
    from: first(params.from),
    to: first(params.to),
  }} />
}
