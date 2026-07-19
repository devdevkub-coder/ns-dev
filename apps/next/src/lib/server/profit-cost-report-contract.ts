export const PROFIT_COST_PAGE_SIZES = [10, 25, 50, 100] as const

export type ProfitCostPageSize = (typeof PROFIT_COST_PAGE_SIZES)[number]
export type ProfitCostSortDirection = 'asc' | 'desc'

export type ProfitCostAppliedFilter = {
  branchId?: bigint
  customerId?: bigint
  from: string
  productId?: bigint
  purchaseChannelId?: bigint
  salesChannelId?: bigint
  supplierId?: bigint
  to: string
}

export type SerializedProfitCostAppliedFilter = {
  branchId?: string
  customerId?: string
  from: string
  productId?: string
  purchaseChannelId?: string
  salesChannelId?: string
  supplierId?: string
  to: string
}

export type ProfitCostTableQuery<TSortBy extends string> = ProfitCostAppliedFilter & {
  page: number
  pageSize: ProfitCostPageSize
  sortBy: TSortBy
  sortDirection: ProfitCostSortDirection
}

export class ProfitCostQueryValidationError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(`${field}: ${message}`)
    this.name = 'ProfitCostQueryValidationError'
    this.field = field
  }
}

const INTERNAL_ID_FIELDS = [
  'branchId',
  'customerId',
  'productId',
  'purchaseChannelId',
  'salesChannelId',
  'supplierId',
] as const

function parseDateOnly(searchParams: URLSearchParams, field: 'from' | 'to') {
  const value = searchParams.get(field)
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ProfitCostQueryValidationError(field, 'ต้องเป็นวันที่รูปแบบ YYYY-MM-DD')
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ProfitCostQueryValidationError(field, 'วันที่ไม่ถูกต้อง')
  }
  return value
}

function parseOptionalInternalId(searchParams: URLSearchParams, field: (typeof INTERNAL_ID_FIELDS)[number]) {
  const value = searchParams.get(field)
  if (value == null || value === '') return undefined
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ProfitCostQueryValidationError(field, 'ต้องเป็น internal ID จำนวนเต็มบวก')
  }
  return BigInt(value)
}

function parsePositiveInteger(searchParams: URLSearchParams, field: string, defaultValue: number) {
  const value = searchParams.get(field)
  if (value == null || value === '') return defaultValue
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ProfitCostQueryValidationError(field, 'ต้องเป็นจำนวนเต็มบวก')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new ProfitCostQueryValidationError(field, 'มีค่ามากเกินช่วงที่รองรับ')
  }
  return parsed
}

export function parseProfitCostFilter(searchParams: URLSearchParams): ProfitCostAppliedFilter {
  const from = parseDateOnly(searchParams, 'from')
  const to = parseDateOnly(searchParams, 'to')
  if (from > to) {
    throw new ProfitCostQueryValidationError('from', 'ต้องไม่อยู่หลังวันที่ to')
  }

  return {
    branchId: parseOptionalInternalId(searchParams, 'branchId'),
    customerId: parseOptionalInternalId(searchParams, 'customerId'),
    from,
    productId: parseOptionalInternalId(searchParams, 'productId'),
    purchaseChannelId: parseOptionalInternalId(searchParams, 'purchaseChannelId'),
    salesChannelId: parseOptionalInternalId(searchParams, 'salesChannelId'),
    supplierId: parseOptionalInternalId(searchParams, 'supplierId'),
    to,
  }
}

export function parseProfitCostTableQuery<const TSortFields extends readonly [string, ...string[]]>(
  searchParams: URLSearchParams,
  sortFields: TSortFields,
): ProfitCostTableQuery<TSortFields[number]> {
  const filter = parseProfitCostFilter(searchParams)
  const page = parsePositiveInteger(searchParams, 'page', 1)
  const rawPageSize = parsePositiveInteger(searchParams, 'pageSize', 25)
  if (!PROFIT_COST_PAGE_SIZES.includes(rawPageSize as ProfitCostPageSize)) {
    throw new ProfitCostQueryValidationError('pageSize', `ต้องเป็น ${PROFIT_COST_PAGE_SIZES.join(', ')}`)
  }

  const rawSortBy = searchParams.get('sortBy') || sortFields[0]
  if (!sortFields.includes(rawSortBy)) {
    throw new ProfitCostQueryValidationError('sortBy', 'ไม่อยู่ในรายการที่รองรับ')
  }

  const rawSortDirection = searchParams.get('sortDirection') || 'desc'
  if (rawSortDirection !== 'asc' && rawSortDirection !== 'desc') {
    throw new ProfitCostQueryValidationError('sortDirection', 'ต้องเป็น asc หรือ desc')
  }

  return {
    ...filter,
    page,
    pageSize: rawPageSize as ProfitCostPageSize,
    sortBy: rawSortBy as TSortFields[number],
    sortDirection: rawSortDirection,
  }
}

export function decimalString(value: unknown): string {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new TypeError('Report decimal must be a PostgreSQL numeric string')
  }
  return value
}

export function serializeProfitCostAppliedFilter(
  filter: ProfitCostAppliedFilter,
): SerializedProfitCostAppliedFilter {
  return {
    ...(filter.branchId != null ? { branchId: filter.branchId.toString() } : {}),
    ...(filter.customerId != null ? { customerId: filter.customerId.toString() } : {}),
    from: filter.from,
    ...(filter.productId != null ? { productId: filter.productId.toString() } : {}),
    ...(filter.purchaseChannelId != null ? { purchaseChannelId: filter.purchaseChannelId.toString() } : {}),
    ...(filter.salesChannelId != null ? { salesChannelId: filter.salesChannelId.toString() } : {}),
    ...(filter.supplierId != null ? { supplierId: filter.supplierId.toString() } : {}),
    to: filter.to,
  }
}
