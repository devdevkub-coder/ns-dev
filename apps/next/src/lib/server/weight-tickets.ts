import type { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { calculateLineTotals, type WeightTicketFormValues, type WeightTicketStatus, type WeightTicketType } from '@/lib/weight-tickets'
import type { AppAuthContext } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'

export type WeightTicketQuery = {
  branchId?: string
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  search?: string
  sortBy: 'createdAt' | 'documentNo' | 'netWeight' | 'partyName'
  sortDir: 'asc' | 'desc'
  statuses: string[]
  type?: string
}

type WeightTicketUsage = {
  purchaseCount: number
  purchaseDocNos: string[]
  salesCount: number
  salesDocNos: string[]
}

type WeightTicketDownstreamAllocationRow = {
  allocated_deduct_weight: Prisma.Decimal | number
  allocated_gross_weight: Prisma.Decimal | number
  allocated_qty: Prisma.Decimal | number
  created_at: Date | null
  created_by: string | null
  product_code: string | null
  product_name: string | null
  status: string | null
  summary_code: string | null
  summary_line_count: number | null
  summary_product_name: string | null
  target_doc_no: string | null
  target_line_no: number | null
  target_type: 'PURCHASE_BILL' | 'SALES_BILL'
  weight_ticket_doc_no: string
}

export type WeightTicketRow = Prisma.weight_ticketsGetPayload<{
  include: {
    branches: true
    customers: true
    suppliers: true
    weight_ticket_product_summaries: {
      include: {
        products: {
          select: {
            code: true
            id: true
          }
        }
      }
      orderBy: {
        product_name: 'asc'
      }
    }
    weight_ticket_lines: {
      include: {
        products: {
          select: {
            code: true
            id: true
          }
        }
        warehouses: {
          select: {
            code: true
            id: true
            name: true
            type: true
          }
        }
      }
      orderBy: {
        line_no: 'asc'
      }
    }
  }
}>

type WeightTicketStatusTimelineRow = {
  action: string
  created_at: Date
  created_by: string | null
  event_key: string
  from_status: string | null
  id: string
  meta: Prisma.JsonValue | null
  net_weight_snapshot: Prisma.Decimal
  note: string | null
  to_status: string
}

type WeightTicketUsageDocumentTimelineRow = {
  action: string
  allocated_net_weight: Prisma.Decimal
  created_at: Date
  created_by: string | null
  event_key: string
  from_remaining_weight: Prisma.Decimal | null
  id: string
  meta: Prisma.JsonValue | null
  note: string | null
  product_code_snapshot: string | null
  product_name_snapshot: string | null
  target_doc_no: string | null
  target_line_no: number | null
  target_type: string
  to_remaining_weight: Prisma.Decimal | null
}

type WeightTicketUsageTimelineRow = {
  action: string
  allocated_deduct_weight: Prisma.Decimal
  allocated_gross_weight: Prisma.Decimal
  allocated_net_weight: Prisma.Decimal
  allocated_qty: Prisma.Decimal
  created_at: Date
  created_by: string | null
  event_key: string
  from_remaining_weight: Prisma.Decimal | null
  id: string
  meta: Prisma.JsonValue | null
  note: string | null
  product_code_snapshot: string | null
  product_name_snapshot: string | null
  target_doc_no: string | null
  target_line_no: number | null
  target_type: string
  to_remaining_weight: Prisma.Decimal | null
}

export function parseWeightTicketQuery(url: URL): WeightTicketQuery {
  const sortBy = url.searchParams.get('sortBy')
  const sortDir = url.searchParams.get('sortDir')
  return {
    branchId: url.searchParams.get('branchId') || undefined,
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
    pageSize: Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)),
    search: url.searchParams.get('search')?.trim() || undefined,
    sortBy: sortBy === 'documentNo' || sortBy === 'partyName' || sortBy === 'netWeight' ? sortBy : 'createdAt',
    sortDir: sortDir === 'asc' ? 'asc' : 'desc',
    statuses: (url.searchParams.get('status') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    type: url.searchParams.get('type') || undefined,
  }
}

export function weightTicketOrderBy(query: WeightTicketQuery): Prisma.weight_ticketsOrderByWithRelationInput[] {
  const direction = query.sortDir

  if (query.sortBy === 'documentNo') {
    return [{ doc_no: direction }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'partyName') {
    return [{ party_name: direction }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'netWeight') {
    return [{ net_weight: direction }, { created_at: 'desc' }]
  }

  return [{ created_at: direction }, { doc_no: 'desc' }]
}

export function bangkokDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(value)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function documentPeriod(date: string) {
  return date.slice(2, 4) + date.slice(5, 7)
}

export function branchScopeIds(context: AppAuthContext) {
  return context.isAdmin ? [] : context.appUser?.branchIds ?? []
}

export function enteredByLabel(context: AppAuthContext) {
  return context.appUser?.displayName
    ?? context.appUser?.username
    ?? context.appUser?.email
    ?? context.authUser.email
    ?? context.authUser.id
}

export function defaultTicketStatus(type: WeightTicketType): WeightTicketStatus {
  return type === 'WTI' ? 'received' : 'delivered'
}

export async function nextWeightTicketDocNo(
  tx: Prisma.TransactionClient,
  type: WeightTicketType,
  branchCode: string,
  documentDate: string,
) {
  const period = documentPeriod(documentDate)
  const startsWith = `${type}${branchCode}${period}-`
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.weight_tickets
    where doc_no like ${`${startsWith}%`}
  `
  const lastNumber = rows.reduce((max: number, row: { doc_no: string }) => {
    const running = Number(row.doc_no.split('-').at(-1))
    return Number.isFinite(running) && running > max ? running : max
  }, 0)
  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
}

export function weightTicketWhere(query: WeightTicketQuery, scopedBranchIds: string[]): Prisma.weight_ticketsWhereInput {
  const andWhere: Prisma.weight_ticketsWhereInput[] = []
  if (scopedBranchIds.length) andWhere.push({ branches: { code: { in: scopedBranchIds } } })
  if (query.branchId) andWhere.push({ branches: { code: query.branchId } })

  const where: Prisma.weight_ticketsWhereInput = andWhere.length ? { AND: andWhere } : {}
  if (query.type) where.doc_type = query.type
  if (query.statuses.length > 0) where.status = { in: query.statuses }
  if (query.dateFrom || query.dateTo) {
    where.document_date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: normalizeDate(query.dateTo) } : {}),
    }
  }
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { party_name: { contains: query.search, mode: 'insensitive' } },
      { vehicle_no: { contains: query.search, mode: 'insensitive' } },
      { weight_ticket_lines: { some: { product_name: { contains: query.search, mode: 'insensitive' } } } },
      { weight_ticket_lines: { some: { impurity_name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

export function buildWeightTicketLineRows(
  ticketId: bigint,
  values: WeightTicketFormValues,
  productByCode: Map<string, { code: string; id: bigint; name: string }>,
  impurityById: Map<bigint, { id: bigint; name: string }>,
  warehouseByCode: Map<string, { id: bigint }> = new Map(),
) {
  return values.lines.map((line, index) => {
    const lineTotals = calculateLineTotals({
      deductionMode: line.deductionMode,
      deductionValue: String(line.deductionValue),
      grossWeight: String(line.grossWeight),
      containerDeductionWeight: String(line.containerDeductionWeight),
    })
    const productCode = line.productId.trim().toUpperCase()
    const product = productByCode.get(productCode)
    const warehouseCode = line.warehouseId.trim().toUpperCase()
    const warehouse = warehouseCode ? warehouseByCode.get(warehouseCode) : null
    const impurityId = parseInternalBigIntId(line.impurityId)
    if (!product) {
      throw new Error(`สินค้า ${line.productId} ไม่มี business code ที่ใช้งานได้`)
    }
    const impurity = impurityId == null ? null : impurityById.get(impurityId)

    return {
      container_deduction_weight: lineTotals.containerDeductionWeight,
      deduct_weight: lineTotals.deductionWeight,
      deduction_mode: line.deductionMode,
      deduction_value: line.deductionMode === 'none' ? 0 : Number(line.deductionValue),
      gross_weight: lineTotals.grossWeight,
      image_count: line.imageNames.length,
      image_names: line.imageNames,
      impurity_id: impurityId ?? null,
      impurity_name: impurity?.name ?? null,
      line_no: index + 1,
      net_weight: lineTotals.netWeight,
      note: line.note || null,
      product_id: product.id,
      product_name: product.name,
      warehouse_id: warehouse?.id ?? null,
      weight_ticket_id: ticketId,
    }
  })
}

export function buildWeightTicketProductSummaryRows(
  ticketId: bigint,
  lineRows: Array<{
    deduct_weight: number | Prisma.Decimal
    container_deduction_weight?: number | Prisma.Decimal
    deduction_mode: string
    deduction_value: number | Prisma.Decimal | null
    gross_weight: number | Prisma.Decimal
    id: bigint
    impurity_id: bigint | null
    net_weight: number | Prisma.Decimal
    product_id: bigint
    product_name: string
    weight_ticket_id: bigint
  }>,
) {
  const grouped = new Map<bigint, {
    billedWeight: number
    containerDeductionWeight: number
    deductWeight: number
    grossWeight: number
    lineCount: number
    lineIds: bigint[]
    mixedProfiles: Set<string>
    netWeight: number
    productId: bigint
    productName: string
  }>()

  lineRows.forEach((line) => {
    const existing = grouped.get(line.product_id)
    const profileKey = `${line.container_deduction_weight ?? 0}|${line.deduction_mode}|${line.impurity_id ?? ''}|${line.deduction_value ?? 0}`
    if (existing) {
      existing.deductWeight += toNumber(line.deduct_weight)
      existing.containerDeductionWeight += toNumber(line.container_deduction_weight ?? 0)
      existing.grossWeight += toNumber(line.gross_weight)
      existing.lineCount += 1
      existing.lineIds.push(line.id)
      existing.mixedProfiles.add(profileKey)
      existing.netWeight += toNumber(line.net_weight)
      return
    }

    grouped.set(line.product_id, {
      billedWeight: 0,
      containerDeductionWeight: toNumber(line.container_deduction_weight ?? 0),
      deductWeight: toNumber(line.deduct_weight),
      grossWeight: toNumber(line.gross_weight),
      lineCount: 1,
      lineIds: [line.id],
      mixedProfiles: new Set([profileKey]),
      netWeight: toNumber(line.net_weight),
      productId: line.product_id,
      productName: line.product_name,
    })
  })

  const summaryRows = [...grouped.values()].map((summary) => ({
    billed_weight: summary.billedWeight,
    container_deduction_weight: summary.containerDeductionWeight,
    created_at: new Date(),
    deduct_weight: summary.deductWeight,
    gross_weight: summary.grossWeight,
    has_mixed_deduction_profiles: summary.mixedProfiles.size > 1,
    line_count: summary.lineCount,
    lineIds: summary.lineIds,
    net_weight: summary.netWeight,
    product_id: summary.productId,
    product_name: summary.productName,
    remaining_weight: summary.netWeight,
    updated_at: new Date(),
    weight_ticket_id: ticketId,
  }))
  return { summaryRows }
}

export async function getWeightTicketUsageCounts(tx: Prisma.TransactionClient | PrismaClientLike, ticketId: bigint) {
  const [purchaseRows, salesRows] = await Promise.all([
    tx.$queryRaw<Array<{ bill_count: number; doc_nos: string[] | null }>>`
      select count(distinct pb.id)::int as bill_count
           , array_remove(array_agg(distinct pb.doc_no), null) as doc_nos
      from public.purchase_bill_receipt_allocations pbra
      join public.purchase_bills pb on pb.id = pbra.purchase_bill_id
      where lower(coalesce(pb.status, '')) not in ('cancelled', 'cancelled_supplier_swap')
        and pbra.allocation_status = 'active'
        and pbra.weight_ticket_id = ${ticketId}
    `,
    tx.$queryRaw<Array<{ bill_count: number; doc_nos: string[] | null }>>`
      select count(distinct sb.id)::int as bill_count
           , array_remove(array_agg(distinct sb.doc_no), null) as doc_nos
      from public.sales_bills sb
      join public.weight_tickets wt on wt.id = ${ticketId}
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(coalesce(sb.items::jsonb, '[]'::jsonb)) = 'array' then coalesce(sb.items::jsonb, '[]'::jsonb)
          else '[]'::jsonb
        end
      ) as item
      where lower(coalesce(sb.status, '')) not in ('cancelled', 'void', 'voided')
        and coalesce(item ->> 'deliveryTicketId', '') = wt.doc_no
    `,
  ])

  return {
    purchaseCount: purchaseRows[0]?.bill_count ?? 0,
    purchaseDocNos: [...(purchaseRows[0]?.doc_nos ?? [])].sort((left, right) => left.localeCompare(right, 'th')),
    salesCount: salesRows[0]?.bill_count ?? 0,
    salesDocNos: [...(salesRows[0]?.doc_nos ?? [])].sort((left, right) => left.localeCompare(right, 'th')),
  }
}

export async function getWeightTicketDownstreamAllocations(tx: Prisma.TransactionClient | PrismaClientLike, ticketId: bigint) {
  const [purchaseRows, salesRows] = await Promise.all([
    tx.$queryRaw<WeightTicketDownstreamAllocationRow[]>`
      select
        'PURCHASE_BILL'::text as target_type,
        pb.doc_no as target_doc_no,
        pbi.line_no as target_line_no,
        pb.status,
        pbra.allocated_qty,
        pbra.allocated_gross_weight,
        pbra.allocated_deduct_weight,
        pbra.created_at,
        pbra.created_by,
        products.code as product_code,
        pbi.product_name,
        summary_products.code as summary_code,
        wts.line_count as summary_line_count,
        wts.product_name as summary_product_name
        , wt.doc_no as weight_ticket_doc_no
      from public.purchase_bill_receipt_allocations pbra
      join public.purchase_bills pb on pb.id = pbra.purchase_bill_id
      join public.purchase_bill_items pbi on pbi.id = pbra.purchase_bill_item_id
      join public.weight_ticket_product_summaries wts on wts.id = pbra.weight_ticket_product_summary_id
      join public.weight_tickets wt on wt.id = pbra.weight_ticket_id
      left join public.products products on products.id = pbi.product_id
      left join public.products summary_products on summary_products.id = wts.product_id
      where lower(coalesce(pb.status, '')) not in ('cancelled', 'cancelled_supplier_swap')
        and pbra.allocation_status = 'active'
        and pbi.item_status = 'active'
        and pbra.weight_ticket_id = ${ticketId}
      order by pbra.created_at desc, pb.doc_no desc, pbi.line_no asc
    `,
    tx.$queryRaw<WeightTicketDownstreamAllocationRow[]>`
      select
        'SALES_BILL'::text as target_type,
        sb.doc_no as target_doc_no,
        item_ordinality::int as target_line_no,
        sb.status,
        coalesce(nullif(item ->> 'qty', ''), '0')::numeric as allocated_qty,
        coalesce(nullif(item ->> 'grossWeight', ''), '0')::numeric as allocated_gross_weight,
        coalesce(nullif(item ->> 'deductWeight', ''), '0')::numeric as allocated_deduct_weight,
        sb.created_at,
        sb.created_by,
        item ->> 'productId' as product_code,
        item ->> 'productName' as product_name,
        split_part(coalesce(item ->> 'deliverySummaryId', ''), ':', 2) as summary_code,
        nullif(split_part(coalesce(item ->> 'deliverySummaryId', ''), ':', 3), '')::int as summary_line_count,
        item ->> 'productName' as summary_product_name,
        wt.doc_no as weight_ticket_doc_no
      from public.sales_bills sb
      join public.weight_tickets wt on wt.id = ${ticketId}
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(coalesce(sb.items::jsonb, '[]'::jsonb)) = 'array' then coalesce(sb.items::jsonb, '[]'::jsonb)
          else '[]'::jsonb
        end
      ) with ordinality as item(item, item_ordinality)
      where lower(coalesce(sb.status, '')) not in ('cancelled', 'void', 'voided')
        and coalesce(item ->> 'deliveryTicketId', '') = wt.doc_no
      order by sb.created_at desc, sb.doc_no desc, item_ordinality asc
    `,
  ])

  return [...purchaseRows, ...salesRows].map((row) => {
    const summaryCode = requireBusinessCode(row.summary_code, `สรุปสินค้าเอกสาร ${row.summary_product_name ?? row.product_name ?? ''}`)
    return {
      allocatedDeductWeight: toNumber(row.allocated_deduct_weight),
      allocatedGrossWeight: toNumber(row.allocated_gross_weight),
      allocatedNetWeight: toNumber(row.allocated_qty),
      allocatedQty: toNumber(row.allocated_qty),
      createdAt: row.created_at?.toISOString() ?? null,
      createdBy: row.created_by ?? '-',
      id: `${row.target_type}:${row.target_doc_no ?? ''}:${row.target_line_no ?? 0}:${summaryCode}`,
      productCode: row.product_code ?? '',
      productName: row.product_name ?? row.summary_product_name ?? '-',
      status: row.status ?? '',
      summaryId: `${row.weight_ticket_doc_no}:${summaryCode}:${row.summary_line_count ?? 0}`,
      targetDocNo: row.target_doc_no ?? '',
      targetLineNo: row.target_line_no,
      targetType: row.target_type,
    }
  })
}

export async function getWeightTicketTimeline(tx: Prisma.TransactionClient | PrismaClientLike, ticketId: bigint) {
  const [statusRows, usageRows] = await Promise.all([
    tx.$queryRaw<WeightTicketStatusTimelineRow[]>`
    select
      l.id::text as id,
      l.event_key,
      l.action,
      l.from_status,
      l.to_status,
      l.net_weight_snapshot,
      l.note,
      l.meta,
      l.created_at,
      l.created_by
    from public.weight_ticket_status_logs l
    where l.weight_ticket_id = ${ticketId}
    order by l.created_at desc, l.id desc
  `,
    tx.$queryRaw<WeightTicketUsageDocumentTimelineRow[]>`
    select
      l.id::text as id,
      l.event_key,
      l.action,
      l.target_type,
      l.target_doc_no,
      l.target_line_no,
      l.product_code_snapshot,
      l.product_name_snapshot,
      l.allocated_net_weight,
      l.from_remaining_weight,
      l.to_remaining_weight,
      l.note,
      l.meta,
      l.created_at,
      l.created_by
    from public.weight_ticket_usage_logs l
    where l.weight_ticket_id = ${ticketId}
    order by l.created_at desc, l.id desc
  `,
  ])

  const statusEvents = statusRows.map((row) => ({
    action: row.action,
    actorName: row.created_by ?? '-',
    eventKey: row.event_key,
    id: row.event_key,
    metadata: {
      ...(row.meta && typeof row.meta === 'object' ? row.meta as Record<string, unknown> : {}),
      cancelNote: row.action === 'cancelled' ? row.note ?? '' : undefined,
      fromStatus: row.from_status,
      netWeight: toNumber(row.net_weight_snapshot),
      note: row.note ?? '',
      toStatus: row.to_status,
    },
    occurredAt: row.created_at.toISOString(),
    outcome: 'success' as const,
  }))
  const usageEvents = usageRows.map((row) => ({
    action: row.action,
    actorName: row.created_by ?? '-',
    eventKey: row.event_key,
    id: row.event_key,
    metadata: {
      ...(row.meta && typeof row.meta === 'object' ? row.meta as Record<string, unknown> : {}),
      allocatedNetWeight: toNumber(row.allocated_net_weight),
      fromRemainingWeight: row.from_remaining_weight == null ? null : toNumber(row.from_remaining_weight),
      note: row.note ?? '',
      productCode: row.product_code_snapshot ?? '',
      productName: row.product_name_snapshot ?? '-',
      targetDocNo: row.target_doc_no ?? '',
      targetLineNo: row.target_line_no,
      targetType: row.target_type,
      toRemainingWeight: row.to_remaining_weight == null ? null : toNumber(row.to_remaining_weight),
    },
    occurredAt: row.created_at.toISOString(),
    outcome: 'success' as const,
  }))

  return [...statusEvents, ...usageEvents].sort((left, right) => {
    const diff = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
    return diff || right.eventKey.localeCompare(left.eventKey)
  })
}

export async function getWeightTicketUsageTimeline(tx: Prisma.TransactionClient | PrismaClientLike, ticketId: bigint) {
  const rows = await tx.$queryRaw<WeightTicketUsageTimelineRow[]>`
    select
      l.id::text as id,
      l.event_key,
      l.action,
      l.target_type,
      l.target_doc_no,
      l.target_line_no,
      l.product_code_snapshot,
      l.product_name_snapshot,
      l.allocated_qty,
      l.allocated_gross_weight,
      l.allocated_deduct_weight,
      l.allocated_net_weight,
      l.from_remaining_weight,
      l.to_remaining_weight,
      l.note,
      l.meta,
      l.created_at,
      l.created_by
    from public.weight_ticket_usage_logs l
    where l.weight_ticket_id = ${ticketId}
    order by l.created_at desc, l.id desc
  `

  return rows.map((row) => ({
    action: row.action,
    allocatedDeductWeight: toNumber(row.allocated_deduct_weight),
    allocatedGrossWeight: toNumber(row.allocated_gross_weight),
    allocatedNetWeight: toNumber(row.allocated_net_weight),
    allocatedQty: toNumber(row.allocated_qty),
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by ?? '-',
    eventKey: row.event_key,
    fromRemainingWeight: row.from_remaining_weight == null ? null : toNumber(row.from_remaining_weight),
    id: row.event_key,
    meta: row.meta && typeof row.meta === 'object' ? row.meta as Record<string, unknown> : {},
    note: row.note ?? '',
    productCode: row.product_code_snapshot ?? '',
    productName: row.product_name_snapshot ?? '-',
    targetDocNo: row.target_doc_no ?? '',
    targetLineNo: row.target_line_no,
    targetType: row.target_type,
    toRemainingWeight: row.to_remaining_weight == null ? null : toNumber(row.to_remaining_weight),
  }))
}

type PrismaClientLike = {
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>
}

export function canMutateWeightTicket(row: { status: string | null }, usage: WeightTicketUsage) {
  return row.status !== 'cancelled' && usage.purchaseCount === 0 && usage.salesCount === 0
}

export function mapWeightTicketRow(row: WeightTicketRow, usage: WeightTicketUsage) {
  const canMutate = canMutateWeightTicket(row, usage)
  const lineRows = row.weight_ticket_lines.map((line: WeightTicketRow['weight_ticket_lines'][number]) => ({
    containerDeductionWeight: toNumber(line.container_deduction_weight).toString(),
    containerDeductionWeightValue: toNumber(line.container_deduction_weight),
    deductionMode: (line.deduction_mode ?? 'none') as 'none' | 'kg' | 'percent',
    deductionValue: toNumber(line.deduction_value).toString(),
    deductionWeight: toNumber(line.deduct_weight),
    grossWeight: toNumber(line.gross_weight).toString(),
    grossWeightValue: toNumber(line.gross_weight),
    id: `${row.doc_no}:${line.line_no}`,
    imageCount: line.image_count ?? 0,
    imageNames: line.image_names ?? [],
    impurityId: line.impurity_id == null ? '' : String(line.impurity_id),
    impurityName: line.impurity_name ?? '',
    netWeight: toNumber(line.net_weight),
    note: line.note ?? '',
    productId: requireBusinessCode(line.products.code, `สินค้า ${line.products.id}`),
    productName: line.product_name,
    warehouseId: line.warehouses?.code ?? '',
    warehouseName: line.warehouses?.name ?? '',
    warehouseType: line.warehouses?.type ?? '',
  }))
  const lineImageNames = lineRows.flatMap((line: { imageNames: string[] }) => line.imageNames)
  const productSummaries = row.weight_ticket_product_summaries.map((summary) => ({
    billedWeight: toNumber(summary.billed_weight),
    containerDeductionWeight: toNumber(summary.container_deduction_weight),
    deductWeight: toNumber(summary.deduct_weight),
    grossWeight: toNumber(summary.gross_weight),
    hasMixedDeductionProfiles: summary.has_mixed_deduction_profiles ?? false,
    id: `${row.doc_no}:${requireBusinessCode(summary.products.code, `สินค้า ${summary.products.id}`)}:${summary.line_count ?? 0}`,
    lineCount: summary.line_count ?? 0,
    netWeight: toNumber(summary.net_weight),
    productId: requireBusinessCode(summary.products.code, `สินค้า ${summary.products.id}`),
    productName: summary.product_name,
    remainingWeight: toNumber(summary.remaining_weight),
  }))

  return {
    branchId: row.branches?.code ?? '',
    branchName: row.branches?.name ?? '-',
    canCancel: canMutate,
    canEdit: canMutate,
    cancelNote: row.cancel_note ?? '',
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    documentDate: toDateOnly(row.document_date),
    documentNo: row.doc_no,
    downstreamAllocations: [],
    enteredBy: row.entered_by ?? row.created_by ?? '-',
    id: row.doc_no,
    imageCount: row.image_count ?? 0,
    imageNames: [...(row.vehicle_image_names ?? []), ...lineImageNames],
    lines: lineRows,
    partyId: row.doc_type === 'WTI' ? row.suppliers?.code ?? '' : row.customers?.code ?? '',
    partyName: row.party_name,
    productSummaries,
    remark: row.remark ?? '',
    status: (row.status ?? defaultTicketStatus(row.doc_type as WeightTicketType)) as WeightTicketStatus,
    totals: {
      containerDeductionWeight: toNumber(row.container_deduction_weight),
      deductionWeight: toNumber(row.deduct_weight),
      grossWeight: toNumber(row.gross_weight),
      netWeight: toNumber(row.net_weight),
    },
    timeline: [],
    type: row.doc_type as WeightTicketType,
    updatedAt: row.updated_at?.toISOString() ?? null,
    updatedBy: row.updated_by ?? row.created_by ?? row.entered_by ?? '-',
    usageTimeline: [],
    usedInPurchaseBillCount: usage.purchaseCount,
    usedInPurchaseBillDocNos: usage.purchaseDocNos,
    usedInSalesBillCount: usage.salesCount,
    usedInSalesBillDocNos: usage.salesDocNos,
    vehicleImageCount: row.vehicle_image_count ?? 0,
    vehicleImageNames: row.vehicle_image_names ?? [],
    vehicleNo: row.vehicle_no,
  }
}

export function weightTicketAuditSnapshot(row: ReturnType<typeof mapWeightTicketRow>) {
  return {
    branchId: row.branchId,
    branchName: row.branchName,
    cancelNote: row.cancelNote,
    documentNo: row.documentNo,
    lineCount: row.lines.length,
    partyId: row.partyId,
    partyName: row.partyName,
    status: row.status,
    totals: row.totals,
    type: row.type,
    vehicleNo: row.vehicleNo,
  }
}

export function mutableTicketErrorMessage(action: 'cancel' | 'edit') {
  return action === 'cancel'
    ? 'ยกเลิกไม่ได้ เพราะเอกสารถูกนำไปใช้กับบิลรับซื้อหรือบิลขายแล้ว'
    : 'แก้ไขไม่ได้ เพราะเอกสารถูกนำไปใช้กับบิลรับซื้อหรือบิลขายแล้ว'
}
