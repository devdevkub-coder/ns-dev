import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { fxRateFormSchema } from '@/lib/finance-foreign'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type FxRateRow = Awaited<ReturnType<typeof prisma.fx_rates.findMany>>[number]

function rateId(values: { fromCurrency: string; rateDate: string; rateType: string; toCurrency: string }) {
  const suffix = values.rateType.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'RATE'
  return `FX-${values.rateDate.replaceAll('-', '')}-${values.fromCurrency}-${values.toCurrency}-${suffix}`
}

function mapRate(row: FxRateRow) {
  return {
    active: row.active,
    createdAt: row.created_at.toISOString(),
    fromCurrency: row.from_currency,
    id: row.id,
    note: row.note,
    rate: toNumber(row.rate),
    rateDate: toDateOnly(row.rate_date),
    rateType: row.rate_type,
    source: row.source,
    toCurrency: row.to_currency,
    updatedAt: row.updated_at.toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const fromCurrency = url.searchParams.get('fromCurrency')?.trim().toUpperCase()
    const toCurrency = url.searchParams.get('toCurrency')?.trim().toUpperCase()
    const rateType = url.searchParams.get('rateType')?.trim()
    const active = url.searchParams.get('active')
    const dateWhere = {
      ...(from ? { gte: normalizeDate(from) } : {}),
      ...(to ? { lte: normalizeDate(to) } : {}),
    }

    const [rates, currencies] = await Promise.all([
      prisma.fx_rates.findMany({
        orderBy: [{ rate_date: 'desc' }, { from_currency: 'asc' }, { to_currency: 'asc' }, { rate_type: 'asc' }],
        take: 5000,
        where: {
          ...(from || to ? { rate_date: dateWhere } : {}),
          ...(fromCurrency && fromCurrency !== 'ALL' ? { from_currency: fromCurrency } : {}),
          ...(toCurrency && toCurrency !== 'ALL' ? { to_currency: toCurrency } : {}),
          ...(rateType && rateType !== 'all' ? { rate_type: rateType } : {}),
          ...(active === 'true' ? { active: true } : active === 'false' ? { active: false } : {}),
        },
      }),
      prisma.currencies.findMany({ orderBy: [{ symbol: 'asc' }, { name: 'asc' }] }),
    ])

    const rows = rates.map(mapRate)
    const latestByPair = new Map<string, (typeof rows)[number]>()
    rows.filter((row) => row.active).forEach((row) => {
      const key = `${row.fromCurrency}-${row.toCurrency}-${row.rateType}`
      if (!latestByPair.has(key)) latestByPair.set(key, row)
    })

    return NextResponse.json({
      filters: {
        currencies: currencies.map((currency) => ({
          code: (currency.symbol || currency.id).toUpperCase(),
          displayCode: (currency.symbol || currency.id).toUpperCase(),
          name: currency.name,
          rateToThb: toNumber(currency.rate_to_thb),
          symbol: currency.symbol,
        })),
        fromCurrencies: Array.from(new Set(rows.map((row) => row.fromCurrency))).sort(),
        rateTypes: Array.from(new Set(rows.map((row) => row.rateType))).sort(),
        toCurrencies: Array.from(new Set(rows.map((row) => row.toCurrency))).sort(),
      },
      latestRates: Array.from(latestByPair.values()),
      rows,
      summary: {
        activeRows: rows.filter((row) => row.active).length,
        latestPairs: latestByPair.size,
        rows: rows.length,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด FX Rate ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = fxRateFormSchema.parse(await request.json())
    const id = values.id || rateId(values)
    const row = await prisma.fx_rates.upsert({
      where: { rate_date_from_currency_to_currency_rate_type: {
        from_currency: values.fromCurrency,
        rate_date: normalizeDate(values.rateDate),
        rate_type: values.rateType,
        to_currency: values.toCurrency,
      } },
      create: {
        active: values.active,
        created_by: currentActor(context),
        from_currency: values.fromCurrency,
        id,
        note: values.note,
        rate: values.rate,
        rate_date: normalizeDate(values.rateDate),
        rate_type: values.rateType,
        source: values.source,
        to_currency: values.toCurrency,
        updated_by: currentActor(context),
      },
      update: {
        active: values.active,
        note: values.note,
        rate: values.rate,
        source: values.source,
        updated_by: currentActor(context),
      },
    })

    return NextResponse.json({ row: mapRate(row) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึก FX Rate ไม่ได้')
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = fxRateFormSchema.parse(await request.json())
    if (!values.id) return NextResponse.json({ error: 'ระบุรหัส FX Rate' }, { status: 400 })
    const row = await prisma.fx_rates.update({
      where: { id: values.id },
      data: {
        active: values.active,
        from_currency: values.fromCurrency,
        note: values.note,
        rate: values.rate,
        rate_date: normalizeDate(values.rateDate),
        rate_type: values.rateType,
        source: values.source,
        to_currency: values.toCurrency,
        updated_by: currentActor(context),
      },
    })

    return NextResponse.json({ row: mapRate(row) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไข FX Rate ไม่ได้')
  }
}
