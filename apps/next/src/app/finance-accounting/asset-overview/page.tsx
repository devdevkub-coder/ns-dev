import { AssetOverviewPageClient } from '@/components/finance-accounting/AssetOverviewPageClient'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AssetOverviewPage({ searchParams }: PageProps) {
  const params = await searchParams
  const branch = first(params.branchId)?.trim().toUpperCase()

  return <AssetOverviewPageClient initialFilters={{
    asOf: first(params.asOf),
    branchId: branch && branch !== 'ALL' ? branch : undefined,
  }} />
}
