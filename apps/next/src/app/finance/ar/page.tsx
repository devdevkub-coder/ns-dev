import type { Metadata } from 'next'
import { AccountsReceivablePageClient } from '@/components/finance/AccountsReceivablePageClient'

export const metadata: Metadata = {
  title: 'ลูกหนี้ AR | NS Scrap ERP',
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AccountsReceivablePage({ searchParams }: PageProps) {
  const params = await searchParams
  const branch = first(params.branchId)?.trim().toUpperCase()
  return <AccountsReceivablePageClient initialFilters={{
    branchId: branch && branch !== 'ALL' ? branch : undefined,
    from: first(params.from),
    to: first(params.to),
  }} />
}
