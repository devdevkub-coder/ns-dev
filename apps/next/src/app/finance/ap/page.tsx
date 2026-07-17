import type { Metadata } from 'next'
import { AccountsPayablePageClient } from '@/components/purchase-flow/AccountsPayablePageClient'

export const metadata: Metadata = {
  title: 'เจ้าหนี้ AP | NS Scrap ERP',
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AccountsPayablePage({ searchParams }: PageProps) {
  const params = await searchParams
  const branch = first(params.branchId)?.trim().toUpperCase()
  return <AccountsPayablePageClient initialFilters={{
    branchId: branch && branch !== 'ALL' ? branch : undefined,
    from: first(params.from),
    to: first(params.to),
  }} />
}
