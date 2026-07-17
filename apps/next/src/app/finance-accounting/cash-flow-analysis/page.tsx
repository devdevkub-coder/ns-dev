import { CashFlowAnalysisPageClient } from '@/components/finance-accounting/CashFlowPlanningPageClients'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams
  const branch = first(params.branchId)?.trim().toUpperCase()
  return <CashFlowAnalysisPageClient initialFilters={{
    branchId: branch && branch !== 'ALL' ? branch : undefined,
    from: first(params.from),
    to: first(params.to),
  }} />
}
