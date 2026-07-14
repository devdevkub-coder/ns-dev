import { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { currentActor, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { AppAuthContext } from '@/lib/server/auth-context'

type SalesPlanDbRow = {
  channel_code: string | null
  channel_id: bigint | null
  channel_name: string | null
  containers: unknown
  customer_code: string | null
  customer_id: bigint
  customer_name: string | null
  fx_rate: unknown
  id: bigint
  kg_per_container: unknown
  lme_cf: unknown
  locked_at: Date | null
  metal_group: string | null
  plan_month: Date
  plan_no: string
  po_sell_doc_no: string | null
  po_sell_id: bigint | null
  product_code: string | null
  product_id: bigint
  product_name: string | null
  sell_pct_lme: unknown
  sell_price: unknown
  status: string
  total_kg: unknown
}

export type SalesPlanInput = {
  containers: number
  customerCode: string
  kgPerContainer: number
  lmeCf: number
  planMonth: string
  productCode: string
  sellPctLme: number
}

export type ClearPendingSalesPlanFilters = {
  channel?: string
  metalGroup?: string
  month: string
  productCode?: string
}

function normalizeMonth(value: string) {
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error('เดือนของแผนต้องเป็นรูปแบบ YYYY-MM')
  return `${normalized}-01`
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

function planNoPrefix(planMonth: string) {
  return `SP${planMonth.slice(2, 4)}${planMonth.slice(5, 7)}-`
}

function isSalesPlanMetalGroupFilter() {
  return [
    { metal_group: { contains: 'ทองแดง' } },
    { metal_group: { contains: 'ทองเหลือง' } },
    { metal_group: { contains: 'copper', mode: 'insensitive' as const } },
    { metal_group: { contains: 'brass', mode: 'insensitive' as const } },
  ]
}

async function nextSalesPlanNo(planMonth: string, tx: Prisma.TransactionClient) {
  const startsWith = planNoPrefix(planMonth)
  const rows = await tx.$queryRaw<Array<{ plan_no: string | null }>>`
    select plan_no
    from public.sales_plans
    where plan_no like ${`${startsWith}%`}
    order by plan_no desc
    limit 1
  `
  const running = Number(String(rows[0]?.plan_no ?? '').slice(startsWith.length))
  const nextRunning = Number.isFinite(running) ? running + 1 : 1
  return `${startsWith}${String(nextRunning).padStart(4, '0')}`
}

function mapSalesPlanRow(row: SalesPlanDbRow) {
  const status = row.po_sell_id ? 'po_created' : row.status
  const channelCode = row.channel_code ? requireBusinessCode(row.channel_code, `ช่องทางขาย ${row.channel_id ?? ''}`) : ''
  const customerCode = requireBusinessCode(row.customer_code, `ลูกค้า ${row.customer_id}`)
  const productCode = requireBusinessCode(row.product_code, `สินค้า ${row.product_id}`)
  return {
    channel: channelCode.toLowerCase(),
    channelId: channelCode,
    channelName: row.channel_name ?? channelCode,
    containers: toNumber(row.containers as never),
    customerId: customerCode,
    customerName: row.customer_name ?? customerCode,
    fx: toNumber(row.fx_rate as never),
    id: String(row.id),
    kgPerContainer: toNumber(row.kg_per_container as never),
    lme: toNumber(row.lme_cf as never),
    lockedAt: row.locked_at?.toISOString() ?? null,
    metalGroup: row.metal_group ?? '',
    planMonth: toDateOnly(row.plan_month),
    planNo: row.plan_no,
    poSell: row.po_sell_doc_no ?? '',
    poSellId: row.po_sell_id ? String(row.po_sell_id) : '',
    productCode,
    productId: productCode,
    productName: row.product_name ?? productCode,
    sellPctLme: toNumber(row.sell_pct_lme as never),
    sellPrice: toNumber(row.sell_price as never),
    status,
    totalKg: toNumber(row.total_kg as never),
  }
}

export async function listSalesPlans(planMonth?: string) {
  const month = planMonth ? normalizeMonth(planMonth) : null
  const rows = await prisma.$queryRaw<SalesPlanDbRow[]>`
    select
      sp.id,
      sp.plan_no,
      sp.plan_month,
      sp.product_id,
      sp.customer_id,
      sp.channel_id,
      sp.containers,
      sp.kg_per_container,
      sp.total_kg,
      sp.lme_cf,
      sp.fx_rate,
      sp.sell_pct_lme,
      sp.sell_price,
      sp.status,
      sp.po_sell_id,
      sp.locked_at,
      p.code as product_code,
      p.name as product_name,
      p.metal_group,
      c.code as customer_code,
      c.name as customer_name,
      sc.code as channel_code,
      sc.name as channel_name,
      ps.doc_no as po_sell_doc_no
    from public.sales_plans sp
    join public.products p on p.id = sp.product_id
    join public.customers c on c.id = sp.customer_id
    left join public.sales_channels sc on sc.id = sp.channel_id
    left join public.po_sells ps on ps.id = sp.po_sell_id
    where (${month}::date is null or sp.plan_month = ${month}::date)
      and sp.status <> 'cancelled'
      and (
        p.metal_group ilike '%ทองแดง%'
        or p.metal_group ilike '%ทองเหลือง%'
        or p.metal_group ilike '%copper%'
        or p.metal_group ilike '%brass%'
      )
    order by sp.created_at desc, sp.id desc
  `
  return rows.map(mapSalesPlanRow)
}

export async function createSalesPlan(input: SalesPlanInput, context: AppAuthContext, fxRate: number) {
  const actor = currentActor(context)
  const planMonth = normalizeMonth(input.planMonth)
  const productCode = normalizeCode(input.productCode)
  const customerCode = normalizeCode(input.customerCode)
  const containers = input.containers
  const kgPerContainer = input.kgPerContainer
  const totalKg = containers * kgPerContainer
  const sellPrice = (input.lmeCf / 1000) * fxRate * (input.sellPctLme / 100)

  if (containers <= 0 || kgPerContainer <= 0 || totalKg <= 0) throw new Error('จำนวนตู้และ กก./ตู้ ต้องมากกว่า 0')
  if (input.lmeCf <= 0) throw new Error('กรอก LME cf มากกว่า 0')
  if (input.sellPctLme <= 0) throw new Error('กรอก % LME มากกว่า 0')
  if (fxRate <= 0) throw new Error('FX ต้องมากกว่า 0 ก่อนบันทึกแผน')

  return prisma.$transaction(async (tx) => {
    const [product, customer] = await Promise.all([
      tx.products.findFirst({
        select: { code: true, id: true },
        where: { active: { not: false }, code: productCode, OR: isSalesPlanMetalGroupFilter() },
      }),
      tx.customers.findFirst({
        select: { code: true, id: true, market_scope: true },
        where: { active: true, code: customerCode },
      }),
    ])
    if (!product) throw new Error('สินค้าที่เลือกต้องอยู่ในหมวดทองแดงหรือทองเหลือง และต้องเปิดใช้งาน')
    if (!customer) throw new Error('ลูกค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    const channel = await tx.sales_channels.findFirst({
      select: { code: true, id: true },
      where: { active: true, name: customer.market_scope },
    })
    if (!channel) throw new Error('ช่องทางขายไม่ถูกต้องหรือถูกปิดใช้งาน')

    const planNo = await nextSalesPlanNo(planMonth, tx)
    const inserted = await tx.$queryRaw<Array<{ id: bigint }>>`
      insert into public.sales_plans (
        plan_no,
        plan_month,
        product_id,
        customer_id,
        channel_id,
        containers,
        kg_per_container,
        total_kg,
        lme_cf,
        fx_rate,
        sell_pct_lme,
        sell_price,
        status,
        created_by,
        updated_by
      ) values (
        ${planNo},
        ${planMonth}::date,
        ${product.id},
        ${customer.id},
        ${channel.id},
        ${containers},
        ${kgPerContainer},
        ${totalKg},
        ${input.lmeCf},
        ${fxRate},
        ${input.sellPctLme},
        ${sellPrice},
        'draft',
        ${actor},
        ${actor}
      )
      returning id
    `
    return inserted[0]?.id ? getSalesPlanRow(inserted[0].id, tx) : null
  })
}

export async function lockSalesPlan(planId: string, context: AppAuthContext) {
  const id = BigInt(planId)
  const actor = currentActor(context)
  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>`
    update public.sales_plans
    set status = 'locked',
        locked_at = now(),
        locked_by = ${actor},
        updated_at = now(),
        updated_by = ${actor}
    where id = ${id}
      and status = 'draft'
      and po_sell_id is null
    returning id
  `
  if (!rows[0]?.id) throw new Error('ล็อกแผนไม่ได้ แผนอาจถูกล็อกหรือเปิด PO ไปแล้ว')
  return getSalesPlanRow(rows[0].id)
}

export async function clearPendingSalesPlans(context: AppAuthContext, planIds?: string[], filters?: ClearPendingSalesPlanFilters) {
  const normalizedIds = Array.from(new Set((planIds ?? []).map((value) => value.trim()).filter((value) => /^\d+$/.test(value))))
  if (planIds && normalizedIds.length === 0) return { deletedCount: 0 }

  if (normalizedIds.length > 0) {
    const ids = normalizedIds.map((value) => BigInt(value))
    const result = await prisma.$executeRaw(
      Prisma.sql`
        delete from public.sales_plans
        where id in (${Prisma.join(ids)})
          and status = 'draft'
          and po_sell_id is null
      `,
    )
    return { deletedCount: Number(result ?? 0) }
  }

  if (!filters) throw new Error('ต้องระบุขอบเขตการลบ Pending')

  const month = normalizeMonth(filters.month)
  const normalizedMetalGroup = filters.metalGroup?.trim() || ''
  const normalizedChannel = normalizeCode(filters.channel ?? '')
  const normalizedProductCode = normalizeCode(filters.productCode ?? '')

  const result = await prisma.$executeRaw(
    Prisma.sql`
      delete from public.sales_plans
      where id in (
        select sp.id
        from public.sales_plans sp
        join public.products p on p.id = sp.product_id
        left join public.sales_channels sc on sc.id = sp.channel_id
        where sp.status = 'draft'
          and sp.po_sell_id is null
          and sp.plan_month = ${month}::date
          and (${normalizedMetalGroup} = '' or coalesce(p.metal_group, '') ilike ${`%${normalizedMetalGroup}%`})
          and (${normalizedChannel} = '' or upper(coalesce(sc.code, '')) = ${normalizedChannel})
          and (${normalizedProductCode} = '' or upper(coalesce(p.code, '')) = ${normalizedProductCode})
      )
    `,
  )
  return { deletedCount: Number(result ?? 0) }
}

export async function getSalesPlanRow(planId: bigint, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const rows = await tx.$queryRaw<SalesPlanDbRow[]>`
    select
      sp.id,
      sp.plan_no,
      sp.plan_month,
      sp.product_id,
      sp.customer_id,
      sp.channel_id,
      sp.containers,
      sp.kg_per_container,
      sp.total_kg,
      sp.lme_cf,
      sp.fx_rate,
      sp.sell_pct_lme,
      sp.sell_price,
      sp.status,
      sp.po_sell_id,
      sp.locked_at,
      p.code as product_code,
      p.name as product_name,
      p.metal_group,
      c.code as customer_code,
      c.name as customer_name,
      sc.code as channel_code,
      sc.name as channel_name,
      ps.doc_no as po_sell_doc_no
    from public.sales_plans sp
    join public.products p on p.id = sp.product_id
    join public.customers c on c.id = sp.customer_id
    left join public.sales_channels sc on sc.id = sp.channel_id
    left join public.po_sells ps on ps.id = sp.po_sell_id
    where sp.id = ${planId}
      and (
        p.metal_group ilike '%ทองแดง%'
        or p.metal_group ilike '%ทองเหลือง%'
        or p.metal_group ilike '%copper%'
        or p.metal_group ilike '%brass%'
      )
    limit 1
  `
  return rows[0] ? mapSalesPlanRow(rows[0]) : null
}
