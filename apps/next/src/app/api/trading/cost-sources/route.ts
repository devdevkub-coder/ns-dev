import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const costSourceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ไม่ถูกต้อง'),
  notes: z.string().trim().max(500, 'หมายเหตุยาวเกินไป').optional().nullable(),
  productId: z.string().trim().min(1, 'เลือกสินค้า'),
  qty: z.coerce.number().positive('จำนวนต้องมากกว่า 0'),
  sourceType: z.string().trim().max(40).optional().default('SPOT_MANUAL'),
  supplierId: z.string().trim().optional().nullable(),
  totalAmount: z.coerce.number().nonnegative('มูลค่าต้องไม่ติดลบ').optional(),
  unitCost: z.coerce.number().nonnegative('ต้นทุนต่อหน่วยต้องไม่ติดลบ').optional(),
})

function compactDate(date: string) {
  return date.slice(2, 4) + date.slice(5, 7)
}

async function nextTradingCostSourceNo(date: string) {
  const startsWith = `TCS${compactDate(date)}-`
  const last = await prisma.trading_cost_sources.findFirst({
    orderBy: { source_no: 'desc' },
    select: { source_no: true },
    where: { source_no: { startsWith } },
  })
  const running = Number(String(last?.source_no ?? '').slice(startsWith.length))
  return `${startsWith}${String((Number.isFinite(running) ? running : 0) + 1).padStart(4, '0')}`
}

async function resolveProduct(productId: string) {
  const parsedId = parseInternalBigIntId(productId)
  return prisma.products.findFirst({
    select: { code: true, id: true, name: true },
    where: {
      active: { not: false },
      OR: [
        { code: productId },
        ...(parsedId != null ? [{ id: parsedId }] : []),
      ],
    },
  })
}

async function resolveSupplier(supplierId: string | null | undefined) {
  const normalized = supplierId?.trim()
  if (!normalized) return null
  const parsedId = parseInternalBigIntId(normalized)
  return prisma.suppliers.findFirst({
    select: { id: true, name: true },
    where: {
      active: { not: false },
      OR: [
        { code: normalized },
        ...(parsedId != null ? [{ id: parsedId }] : []),
      ],
    },
  })
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [sources, facts] = await Promise.all([
      prisma.trading_cost_sources.findMany({
        include: {
          products: { select: { code: true, name: true } },
          suppliers: { select: { name: true } },
        },
        orderBy: [{ date: 'desc' }, { source_no: 'desc' }],
        take: 500,
        where: { status: 'active' },
      }),
      prisma.trading_allocation_facts.findMany({
        select: { matched_cogs: true, qty: true, trading_cost_source_id: true },
        where: { status: 'active', trading_cost_source_id: { not: null } },
      }),
    ])

    const matchedBySourceId = new Map<string, { amount: number; qty: number }>()
    facts.forEach((fact) => {
      if (fact.trading_cost_source_id == null) return
      const key = fact.trading_cost_source_id.toString()
      const current = matchedBySourceId.get(key) ?? { amount: 0, qty: 0 }
      current.amount += toNumber(fact.matched_cogs)
      current.qty += toNumber(fact.qty)
      matchedBySourceId.set(key, current)
    })

    return NextResponse.json({
      rows: sources.map((source) => {
        const matched = matchedBySourceId.get(source.id.toString()) ?? { amount: 0, qty: 0 }
        const qty = toNumber(source.qty)
        const amount = toNumber(source.total_amount)
        return {
          date: toDateOnly(source.date),
          id: source.id.toString(),
          productCode: source.product_code_snapshot ?? source.products?.code ?? '',
          productName: source.product_name_snapshot ?? source.products?.name ?? '-',
          qty,
          remainingAmount: Math.max(0, amount - matched.amount),
          remainingQty: Math.max(0, qty - matched.qty),
          sourceNo: source.source_no,
          sourceType: source.source_type,
          status: source.status,
          supplierName: source.supplier_name_snapshot ?? source.suppliers?.name ?? '-',
          totalAmount: amount,
          unitCost: toNumber(source.unit_cost),
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Trading Cost Source ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const actor = currentActor(context)
    const values = costSourceSchema.parse(await request.json())
    const product = await resolveProduct(values.productId)
    if (!product) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบสินค้า Trading Cost Source' }, { status: 400 })
    const supplier = await resolveSupplier(values.supplierId)
    const unitCost = values.unitCost ?? (values.totalAmount != null ? values.totalAmount / values.qty : 0)
    const totalAmount = values.totalAmount ?? values.qty * unitCost
    if (unitCost <= 0 || totalAmount <= 0) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ต้นทุน Trading Cost Source ต้องมากกว่า 0' }, { status: 400 })
    const sourceNo = await nextTradingCostSourceNo(values.date)
    const createdAt = new Date()
    const created = await prisma.trading_cost_sources.create({
      data: {
        created_at: createdAt,
        created_by: actor,
        date: normalizeDate(values.date),
        notes: values.notes ?? null,
        product_code_snapshot: requireBusinessCode(product.code, `สินค้า ${product.id}`),
        product_id: product.id,
        product_name_snapshot: product.name,
        qty: values.qty,
        source_no: sourceNo,
        source_type: values.sourceType,
        status: 'active',
        supplier_id: supplier?.id ?? null,
        supplier_name_snapshot: supplier?.name ?? null,
        total_amount: totalAmount,
        unit_cost: unitCost,
        updated_at: createdAt,
        updated_by: actor,
      },
      select: { source_no: true },
    })
    return NextResponse.json({ sourceNo: created.source_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof z.ZodError) return NextResponse.json({ code: 'BAD_REQUEST', error: caught.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
    return apiErrorResponse(caught, 'สร้าง Trading Cost Source ไม่ได้', 500)
  }
}
