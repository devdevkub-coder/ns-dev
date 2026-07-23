import { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import {
  appendImpurityProductMeta,
  calculateWeightTicketLineTotals,
  isOtherProductImpurityId,
  isOtherProductImpurityLabel,
  OTHER_PRODUCT_IMPURITY_ID,
  OTHER_PRODUCT_IMPURITY_LABEL,
  parseImpurityProductMeta,
  roundWeight,
  type WeightTicketFormValues,
  type WeightTicketStatus,
  type WeightTicketType,
} from '@/lib/weight-tickets'
import type { AppAuthContext } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export type WeightTicketQuery = {
  branchId?: string
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  search?: string
  sortBy: 'createdAt' | 'documentNo' | 'netWeight' | 'partyName' | 'branchName' | 'vehicleNo' | 'godownName' | 'deductionWeight' | 'impurityDeduction' | 'status' | 'updatedAt'
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

type WeightTicketUsageCountRow = {
  bill_count: number
  doc_nos: string[] | null
  weight_ticket_id: bigint
}

type WeightTicketDownstreamAllocationRow = {
  allocated_deduct_weight: Prisma.Decimal | number
  allocated_gross_weight: Prisma.Decimal | number
  allocated_qty: Prisma.Decimal | number
  created_at: Date | null
  created_by: string | null
  meta?: Prisma.JsonValue | null
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

export const weightTicketRowSelect = {
  branch_id: true,
  branches: true,
  cancel_note: true,
  cancelled_at: true,
  container_deduction_weight: true,
  created_at: true,
  created_by: true,
  customers: true,
  deduct_weight: true,
  doc_no: true,
  doc_type: true,
  document_date: true,
  entered_by: true,
  gross_weight: true,
  id: true,
  image_count: true,
  net_weight: true,
  party_name: true,
  remark: true,
  status: true,
  stock_holds: {
    select: {
      cost_snapshot_at: true,
      cost_snapshot_note: true,
      cost_snapshot_source: true,
      consumed_at: true,
      consumed_by_ref_no: true,
      hold_key: true,
      held_at: true,
      product_id: true,
      qty: true,
      released_at: true,
      source_doc_no: true,
      source_line_no: true,
      status: true,
      unit_cost_snapshot: true,
      value_snapshot: true,
      warehouse_id: true,
      warehouses: {
        select: {
          code: true,
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: {
      source_line_no: 'asc',
    },
  },
  suppliers: true,
  updated_at: true,
  updated_by: true,
  vehicle_image_count: true,
  vehicle_image_names: true,
  vehicle_no: true,
  weight_ticket_lines: {
    include: {
      products: {
        select: {
          code: true,
          id: true,
          metal_group: true,
        },
      },
      warehouses: {
        select: {
          code: true,
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: {
      line_no: 'asc',
    },
  },
  weight_ticket_product_summaries: {
    include: {
      products: {
        select: {
          code: true,
          id: true,
          metal_group: true,
        },
      },
    },
    orderBy: {
      product_name: 'asc',
    },
  },
} as const

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
            metal_group: true
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
            metal_group: true
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
    stock_holds: {
      select: {
        cost_snapshot_at: true
        cost_snapshot_note: true
        cost_snapshot_source: true
        consumed_at: true
        consumed_by_ref_no: true
        hold_key: true
        held_at: true
        product_id: true
        qty: true
        released_at: true
        source_doc_no: true
        source_line_no: true
        status: true
        unit_cost_snapshot: true
        value_snapshot: true
        warehouse_id: true
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
        source_line_no: 'asc'
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
  const validSortBys = [
    'createdAt',
    'documentNo',
    'netWeight',
    'partyName',
    'branchName',
    'vehicleNo',
    'godownName',
    'deductionWeight',
    'impurityDeduction',
    'status',
    'updatedAt',
  ]
  return {
    branchId: url.searchParams.get('branchId') || undefined,
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
    pageSize: Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)),
    search: url.searchParams.get('search')?.trim() || undefined,
    sortBy: validSortBys.includes(sortBy ?? '') ? (sortBy as WeightTicketQuery['sortBy']) : 'documentNo',
    sortDir: sortDir === 'desc' ? 'desc' : 'asc',
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
  if (query.sortBy === 'branchName') {
    return [{ branches: { name: direction } }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'vehicleNo') {
    return [{ vehicle_no: direction }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'godownName') {
    return [{ godown_name: direction }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'deductionWeight') {
    return [{ container_deduction_weight: direction }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'impurityDeduction') {
    return [{ deduct_weight: direction }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'status') {
    return [{ status: direction }, { created_at: 'desc' }]
  }
  if (query.sortBy === 'updatedAt') {
    return [{ updated_at: direction }, { created_at: 'desc' }]
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
  return context.appUser?.branchIds ?? []
}

export function enteredByLabel(context: AppAuthContext) {
  const displayName = context.appUser?.displayName?.trim()
  if (!displayName) {
    throw new Error('ไม่พบชื่อผู้ใช้สำหรับบันทึกใบรับ-ส่งของ กรุณากำหนดชื่อพนักงานก่อนสร้างเอกสาร')
  }
  return displayName
}

export function requireWeightTicketBranchDocumentCode(code: string | null | undefined) {
  const value = code?.trim()
  if (!value || !/^\d{2}$/.test(value)) {
    throw new Error('รหัสสาขาสำหรับออกเลขที่ใบรับ-ส่งของต้องเป็นตัวเลข 2 หลัก')
  }
  return value
}

export function defaultTicketStatus(_type: WeightTicketType): WeightTicketStatus {
  return 'draft'
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
  const totalsById = calculateWeightTicketLineTotals(values.lines).lineTotalsById
  const lineNoById = new Map(values.lines.map((line, index) => [line.id, index + 1] as const))

  return values.lines.map((line, index) => {
    const lineTotals = totalsById.get(line.id)!
    const productCode = line.productId.trim().toUpperCase()
    const product = productByCode.get(productCode)
    const impurityProductCode = line.impurityProductId?.trim().toUpperCase() ?? ''
    const impurityProduct = impurityProductCode ? productByCode.get(impurityProductCode) : null
    const warehouseCode = line.warehouseId.trim().toUpperCase()
    const warehouse = warehouseCode ? warehouseByCode.get(warehouseCode) : null
    const isOtherProductImpurity = isOtherProductImpurityId(line.impurityId)
    const impurityId = isOtherProductImpurity ? null : parseInternalBigIntId(line.impurityId)
    if (!product) {
      throw new Error(`สินค้า ${line.productId} ไม่มี business code ที่ใช้งานได้`)
    }
    const impurity = impurityId == null ? null : impurityById.get(impurityId)

    return {
      container_deduction_weight: roundWeight(lineTotals.containerDeductionWeight),
      deduct_weight: roundWeight(lineTotals.deductionWeight),
      deduction_mode: line.deductionMode,
      deduction_value: line.deductionMode === 'none' ? 0 : roundWeight(Number(line.deductionValue)),
      gross_weight: roundWeight(lineTotals.grossWeight),
      image_count: line.imageNames.length,
      image_names: line.imageNames,
      impurity_id: impurityId ?? null,
      impurity_name: isOtherProductImpurity ? OTHER_PRODUCT_IMPURITY_LABEL : impurity?.name ?? null,
      impurity_source_line_no: line.impuritySourceLineId ? lineNoById.get(line.impuritySourceLineId) ?? null : null,
      line_no: index + 1,
      net_weight: roundWeight(lineTotals.netWeight),
      note: appendImpurityProductMeta(line.note, {
        id: isOtherProductImpurity ? (line.impurityProductId ?? '') : '',
        name: isOtherProductImpurity ? (impurityProduct?.name ?? '') : '',
      }) || null,
      parent_line_no: line.parentId ? lineNoById.get(line.parentId) ?? null : null,
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
      productId: line.product_id,
      productName: line.product_name,
    })
  })

  const summaryRows = [...grouped.values()].map((summary) => {
    const netWeight = roundWeight(Math.max(
      0,
      summary.grossWeight - summary.containerDeductionWeight - summary.deductWeight,
    ))
    return {
      billed_weight: roundWeight(summary.billedWeight),
      container_deduction_weight: roundWeight(summary.containerDeductionWeight),
      created_at: new Date(),
      deduct_weight: roundWeight(summary.deductWeight),
      gross_weight: roundWeight(summary.grossWeight),
      has_mixed_deduction_profiles: summary.mixedProfiles.size > 1,
      line_count: summary.lineCount,
      lineIds: summary.lineIds,
      net_weight: netWeight,
      product_id: summary.productId,
      product_name: summary.productName,
      remaining_weight: netWeight,
      updated_at: new Date(),
      weight_ticket_id: ticketId,
    }
  })
  return { summaryRows }
}

function emptyWeightTicketUsage(): WeightTicketUsage {
  return {
    purchaseCount: 0,
    purchaseDocNos: [],
    salesCount: 0,
    salesDocNos: [],
  }
}

function normalizeUsageCountRows(rows: WeightTicketUsageCountRow[], field: 'purchase' | 'sales') {
  const usageMap = new Map<string, WeightTicketUsage>()
  rows.forEach((row) => {
    const key = row.weight_ticket_id.toString()
    const current = usageMap.get(key) ?? emptyWeightTicketUsage()
    const docNos = [...(row.doc_nos ?? [])].sort((left, right) => left.localeCompare(right, 'th'))
    if (field === 'purchase') {
      current.purchaseCount = row.bill_count ?? 0
      current.purchaseDocNos = docNos
    } else {
      current.salesCount = row.bill_count ?? 0
      current.salesDocNos = docNos
    }
    usageMap.set(key, current)
  })
  return usageMap
}

export async function getWeightTicketUsageCountsByTicketIds(
  tx: Prisma.TransactionClient | PrismaClientLike,
  ticketIds: bigint[],
) {
  const uniqueTicketIds = [...new Set(ticketIds.map((ticketId) => ticketId.toString()))]
    .map((ticketId) => BigInt(ticketId))
  const usageMap = new Map<string, WeightTicketUsage>()
  if (uniqueTicketIds.length === 0) return usageMap

  const [purchaseRows, salesRows] = await Promise.all([
    tx.$queryRaw<WeightTicketUsageCountRow[]>`
      select count(distinct pb.id)::int as bill_count
           , array_remove(array_agg(distinct pb.doc_no), null) as doc_nos
           , pbra.weight_ticket_id
      from public.purchase_bill_receipt_allocations pbra
      join public.purchase_bills pb on pb.id = pbra.purchase_bill_id
      where lower(coalesce(pb.status, '')) not in ('cancelled', 'cancelled_supplier_swap')
        and pbra.allocation_status = 'active'
        and pbra.weight_ticket_id in (${Prisma.join(uniqueTicketIds)})
      group by pbra.weight_ticket_id
    `,
    tx.$queryRaw<WeightTicketUsageCountRow[]>`
      select count(distinct sb.id)::int as bill_count
           , array_remove(array_agg(distinct sb.doc_no), null) as doc_nos
           , sba.weight_ticket_id
      from public.sales_bill_source_allocations sba
      join public.sales_bills sb on sb.id = sba.sales_bill_id
      where lower(coalesce(sb.status, '')) not in ('cancelled', 'void', 'voided')
        and sba.status = 'active'
        and sba.source_type = 'WTO'
        and sba.weight_ticket_id in (${Prisma.join(uniqueTicketIds)})
      group by sba.weight_ticket_id
    `,
  ])

  const purchaseMap = normalizeUsageCountRows(purchaseRows, 'purchase')
  const salesMap = normalizeUsageCountRows(salesRows, 'sales')
  uniqueTicketIds.forEach((ticketId) => {
    const key = ticketId.toString()
    usageMap.set(key, {
      ...emptyWeightTicketUsage(),
      ...(purchaseMap.get(key) ?? {}),
      ...(salesMap.get(key) ?? {}),
    })
  })
  return usageMap
}

export async function getWeightTicketUsageCounts(tx: Prisma.TransactionClient | PrismaClientLike, ticketId: bigint) {
  const usageMap = await getWeightTicketUsageCountsByTicketIds(tx, [ticketId])
  return usageMap.get(ticketId.toString()) ?? emptyWeightTicketUsage()
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
        sba.sales_line_no as target_line_no,
        sb.status,
        sba.allocated_qty,
        sba.allocated_gross_weight,
        sba.allocated_deduct_weight,
        sba.created_at,
        sba.created_by,
        sba.product_code_snapshot as product_code,
        sba.product_name_snapshot as product_name,
        split_part(coalesce(sba.meta ->> 'deliverySummaryId', ''), ':', 2) as summary_code,
        nullif(split_part(coalesce(sba.meta ->> 'deliverySummaryId', ''), ':', 3), '')::int as summary_line_count,
        sba.product_name_snapshot as summary_product_name,
        sba.meta,
        wt.doc_no as weight_ticket_doc_no
      from public.sales_bill_source_allocations sba
      join public.sales_bills sb on sb.id = sba.sales_bill_id
      join public.weight_tickets wt on wt.id = sba.weight_ticket_id
      where lower(coalesce(sb.status, '')) not in ('cancelled', 'void', 'voided')
        and sba.status = 'active'
        and sba.source_type = 'WTO'
        and sba.weight_ticket_id = ${ticketId}
      order by sba.created_at desc, sb.doc_no desc, sba.sales_line_no asc
    `,
  ])

  return [...purchaseRows, ...salesRows].map((row) => {
    const meta = row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? row.meta as Record<string, unknown>
      : null
    const deliverySummaryId = typeof meta?.deliverySummaryId === 'string' ? meta.deliverySummaryId : ''
    const summaryCode = deliverySummaryId
      ? ''
      : requireBusinessCode(row.summary_code, `สรุปสินค้าเอกสาร ${row.summary_product_name ?? row.product_name ?? ''}`)
    return {
      allocatedDeductWeight: toNumber(row.allocated_deduct_weight),
      allocatedGrossWeight: toNumber(row.allocated_gross_weight),
      allocatedNetWeight: toNumber(row.allocated_qty),
      allocatedQty: toNumber(row.allocated_qty),
      createdAt: row.created_at?.toISOString() ?? null,
      createdBy: row.created_by ?? '-',
      id: `${row.target_type}:${row.target_doc_no ?? ''}:${row.target_line_no ?? 0}:${deliverySummaryId || summaryCode}`,
      productCode: row.product_code ?? '',
      productName: row.product_name ?? row.summary_product_name ?? '-',
      status: row.status ?? '',
      summaryId: deliverySummaryId || `${row.weight_ticket_doc_no}:${summaryCode}:${row.summary_line_count ?? 0}`,
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
  const holdWarehouseByLineNo = new Map<number, { code: string | null; name: string; type: string | null }>()
  ;(row.stock_holds ?? []).forEach((hold) => {
    if (hold.source_line_no == null || holdWarehouseByLineNo.has(hold.source_line_no)) return
    holdWarehouseByLineNo.set(hold.source_line_no, {
      code: hold.warehouses.code,
      name: hold.warehouses.name,
      type: hold.warehouses.type,
    })
  })
  const lineRows = row.weight_ticket_lines.map((line: WeightTicketRow['weight_ticket_lines'][number]) => ({
    ...parseImpurityProductMeta(line.note),
    ...(() => {
      const holdWarehouse = holdWarehouseByLineNo.get(line.line_no)
      return {
        warehouseId: line.warehouses?.code ?? holdWarehouse?.code ?? '',
        warehouseName: line.warehouses?.name ?? holdWarehouse?.name ?? '',
        warehouseType: line.warehouses?.type ?? holdWarehouse?.type ?? '',
      }
    })(),
    containerDeductionWeight: toNumber(line.container_deduction_weight).toString(),
    containerDeductionWeightValue: toNumber(line.container_deduction_weight),
    deductionMode: line.deduction_mode as 'none' | 'kg' | 'percent',
    deductionValue: toNumber(line.deduction_value).toString(),
    deductionWeight: toNumber(line.deduct_weight),
    draftVersion: line.draft_version ?? 0,
    grossWeight: toNumber(line.gross_weight).toString(),
    grossWeightValue: toNumber(line.gross_weight),
    id: `${row.doc_no}:${line.line_no}`,
    imageCount: line.image_count ?? 0,
    imageNames: line.image_names ?? [],
    impurityId: line.impurity_id == null
      ? isOtherProductImpurityLabel(line.impurity_name) ? OTHER_PRODUCT_IMPURITY_ID : ''
      : String(line.impurity_id),
    impuritySourceLineNo: line.impurity_source_line_no ?? null,
    impurityName: line.impurity_name ?? '',
    lineNo: line.line_no,
    netWeight: toNumber(line.net_weight),
    parentLineNo: line.parent_line_no ?? null,
    productId: requireBusinessCode(line.products.code, `สินค้า ${line.products.id}`),
    productName: line.product_name,
  }))
  const lineImageNames = lineRows.flatMap((line: { imageNames: string[] }) => line.imageNames)
  const activeHoldsByProductId = new Map<string, { missingCost: boolean; qty: number; value: number }>()
  const costSnapshotHoldsByProductId = new Map<string, { missingCost: boolean; qty: number; value: number }>()
  ;(row.stock_holds ?? []).forEach((hold) => {
    const key = String(hold.product_id)
    const qty = toNumber(hold.qty)
    const unitCost = hold.unit_cost_snapshot == null ? null : toNumber(hold.unit_cost_snapshot)
    if (hold.status === 'active') {
      const current = activeHoldsByProductId.get(key) ?? { missingCost: false, qty: 0, value: 0 }
      current.qty += qty
      if (unitCost == null) {
        current.missingCost = true
      } else {
        current.value += hold.value_snapshot == null ? qty * unitCost : toNumber(hold.value_snapshot)
      }
      activeHoldsByProductId.set(key, current)
    }
    if (hold.status === 'active' || hold.status === 'consumed') {
      const current = costSnapshotHoldsByProductId.get(key) ?? { missingCost: false, qty: 0, value: 0 }
      current.qty += qty
      if (unitCost == null) {
        current.missingCost = true
      } else {
        current.value += hold.value_snapshot == null ? qty * unitCost : toNumber(hold.value_snapshot)
      }
      costSnapshotHoldsByProductId.set(key, current)
    }
  })

  const productSummaries = row.weight_ticket_product_summaries.map((summary) => {
    const activeHold = activeHoldsByProductId.get(String(summary.product_id))
    const costSnapshotHold = activeHold ?? costSnapshotHoldsByProductId.get(String(summary.product_id))
    const pendingOutQty = activeHold?.qty ?? 0
    const pendingOutValue = activeHold?.value ?? 0
    const unitCostSnapshot = costSnapshotHold && costSnapshotHold.qty > 0 && !costSnapshotHold.missingCost
      ? costSnapshotHold.value / costSnapshotHold.qty
      : null
    return {
      billedWeight: toNumber(summary.billed_weight),
      containerDeductionWeight: toNumber(summary.container_deduction_weight),
      costSnapshotStatus: costSnapshotHold?.missingCost ? 'pending' as const : unitCostSnapshot == null ? 'none' as const : 'locked' as const,
      deductWeight: toNumber(summary.deduct_weight),
      grossWeight: toNumber(summary.gross_weight),
      hasMixedDeductionProfiles: summary.has_mixed_deduction_profiles ?? false,
      id: `${row.doc_no}:${requireBusinessCode(summary.products.code, `สินค้า ${summary.products.id}`)}:${summary.line_count ?? 0}`,
      lineCount: summary.line_count ?? 0,
      netWeight: toNumber(summary.net_weight),
      pendingOutQty,
      pendingOutValue,
      productId: requireBusinessCode(summary.products.code, `สินค้า ${summary.products.id}`),
      productName: summary.product_name,
      categoryName: summary.products.metal_group || '-',
      remainingWeight: toNumber(summary.remaining_weight),
      unitCostSnapshot,
    }
  })

  const productOrder = new Map<string, number>()
  lineRows.forEach((line, index) => {
    if (line.productId && !productOrder.has(line.productId)) {
      productOrder.set(line.productId, index)
    }
  })

  productSummaries.sort((a, b) => {
    const orderA = productOrder.has(a.productId) ? productOrder.get(a.productId)! : Infinity
    const orderB = productOrder.has(b.productId) ? productOrder.get(b.productId)! : Infinity
    return orderA - orderB
  })

  const lineByLineNo = new Map(lineRows.map((line) => [line.lineNo, line] as const))
  const firstLineByProductId = new Map<string, typeof lineRows[number]>()
  lineRows.forEach((line) => {
    if (!firstLineByProductId.has(line.productId)) firstLineByProductId.set(line.productId, line)
  })
  const pendingOutHistory = (row.stock_holds ?? []).filter((hold) => hold.status === 'active').map((hold) => {
    const sourceLine = hold.source_line_no == null ? undefined : lineByLineNo.get(hold.source_line_no)
    const productLine = sourceLine ?? firstLineByProductId.get(String(hold.product_id))
    const unitCostSnapshot = hold.unit_cost_snapshot == null ? null : toNumber(hold.unit_cost_snapshot)
    const pendingOutValue = hold.value_snapshot == null
      ? unitCostSnapshot == null ? null : toNumber(hold.qty) * unitCostSnapshot
      : toNumber(hold.value_snapshot)
    const qty = toNumber(hold.qty)
    return {
      costSnapshotAt: hold.cost_snapshot_at?.toISOString() ?? null,
      costSnapshotNote: hold.cost_snapshot_note ?? '',
      costSnapshotSource: hold.cost_snapshot_source ?? '',
      heldAt: hold.held_at?.toISOString() ?? null,
      holdKey: hold.hold_key,
      pendingOutValue,
      productId: productLine?.productId ?? String(hold.product_id),
      productName: productLine?.productName ?? '-',
      qty,
      qtyAfter: qty,
      qtyBefore: null,
      referenceDocNo: hold.consumed_by_ref_no ?? hold.source_doc_no ?? row.doc_no,
      releasedAt: hold.consumed_at?.toISOString() ?? hold.released_at?.toISOString() ?? null,
      sourceLineNo: hold.source_line_no ?? null,
      status: hold.status,
      unitCostSnapshot,
      warehouseId: productLine?.warehouseId || hold.warehouses.code || String(hold.warehouse_id ?? ''),
      warehouseName: productLine?.warehouseName || hold.warehouses.name || '',
    }
  })

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
    draftVersion: row.draft_version ?? 0,
    downstreamAllocations: [],
    enteredBy: row.entered_by ?? row.created_by ?? '-',
    id: row.doc_no,
    imageCount: row.image_count ?? 0,
    imageNames: [...(row.vehicle_image_names ?? []), ...lineImageNames],
    lines: lineRows,
    partyId: row.doc_type === 'WTI' ? row.suppliers?.code ?? '' : row.customers?.code ?? '',
    partyName: row.party_name,
    pendingOutEvents: [],
    pendingOutHistory,
    productSummaries,
    remark: row.remark ?? '',
    status: row.status as WeightTicketStatus,
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
    godownName: row.godown_name,
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

export function mutableTicketErrorMessage(action: 'cancel' | 'edit', usage?: WeightTicketUsage) {
  const usageText = usage
    ? usage.purchaseCount > 0 && usage.salesCount > 0
      ? 'บิลรับซื้อและบิลขาย'
      : usage.salesCount > 0
        ? 'บิลขาย'
        : usage.purchaseCount > 0
          ? 'บิลรับซื้อ'
          : 'เอกสารปลายทาง'
    : 'บิลรับซื้อหรือบิลขาย'
  return action === 'cancel'
    ? `ยกเลิกไม่ได้ เพราะเอกสารถูกนำไปใช้กับ${usageText}แล้ว`
    : `แก้ไขไม่ได้ เพราะเอกสารถูกนำไปใช้กับ${usageText}แล้ว`
}

export const weightTicketInclude = {
  branches: true,
  customers: true,
  suppliers: true,
  weight_ticket_product_summaries: {
    include: {
      products: {
        select: {
          code: true,
          id: true,
          metal_group: true,
        },
      },
    },
    orderBy: {
      product_name: 'asc',
    },
  },
  weight_ticket_lines: {
    include: {
      products: {
        select: {
          code: true,
          id: true,
          metal_group: true,
        },
      },
      warehouses: {
        select: {
          code: true,
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: {
      line_no: 'asc',
    },
  },
  stock_holds: {
    select: {
      cost_snapshot_at: true,
      cost_snapshot_note: true,
      cost_snapshot_source: true,
      consumed_at: true,
      consumed_by_ref_no: true,
      hold_key: true,
      held_at: true,
      product_id: true,
      qty: true,
      released_at: true,
      source_doc_no: true,
      source_line_no: true,
      status: true,
      unit_cost_snapshot: true,
      value_snapshot: true,
      warehouse_id: true,
      warehouses: {
        select: {
          code: true,
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: { source_line_no: 'asc' },
  },
} as const

export async function findScopedWeightTicket(documentNo: string, scopedBranchIds: string[]) {
  return prisma.weight_tickets.findFirst({
    include: weightTicketInclude,
    where: {
      doc_no: documentNo,
      ...(scopedBranchIds.length ? { branches: { code: { in: scopedBranchIds } } } : {}),
    },
  })
}
