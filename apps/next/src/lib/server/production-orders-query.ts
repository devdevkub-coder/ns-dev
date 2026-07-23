const allowedSorts = new Set(['date', 'docNo', 'status', 'qtyPlanned', 'inputCost', 'outputValue', 'variance'])
const allowedStatuses = new Set(['Open', 'In Production', 'Partially Completed', 'Completed', 'Cancelled'])

function dateOnly(value: string | null) {
  const trimmed = value?.trim() ?? ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return ''

  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day)
    ? trimmed
    : ''
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parseProductionOrdersQuery(searchParams: URLSearchParams) {
  const requestedSort = searchParams.get('sort') ?? ''
  const statuses = Array.from(new Set(
    searchParams
      .getAll('status')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter((value) => allowedStatuses.has(value)),
  ))

  return {
    branchCode: searchParams.get('branchCode')?.trim() ?? '',
    dateFrom: dateOnly(searchParams.get('dateFrom')),
    dateTo: dateOnly(searchParams.get('dateTo')),
    direction: searchParams.get('direction') === 'asc' ? 'asc' as const : 'desc' as const,
    page: positiveInteger(searchParams.get('page'), 1),
    pageSize: Math.min(100, Math.max(10, positiveInteger(searchParams.get('pageSize'), 10))),
    search: searchParams.get('search')?.trim() ?? '',
    docNo: searchParams.get('docNo')?.trim() ?? '',
    includeDetail: searchParams.get('include') === 'detail',
    sort: allowedSorts.has(requestedSort) ? requestedSort : 'docNo',
    statuses,
  }
}
