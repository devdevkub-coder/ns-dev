import { CashFlowForecastCalendarPageClient } from '@/components/finance-accounting/CashFlowPlanningPageClients'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams
  const branch = first(params.branchId)?.trim().toUpperCase()
  const horizon = Number(first(params.horizon))
  return <CashFlowForecastCalendarPageClient initialFilters={{
    branchId: branch && branch !== 'ALL' ? branch : undefined,
    horizon: [7, 30, 90].includes(horizon) ? horizon : undefined,
    startDate: first(params.startDate),
  }} />
}
