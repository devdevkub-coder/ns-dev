import { NextResponse } from 'next/server'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { getFinanceCurrencyPolicy } from '@/lib/server/finance-currency-policy'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

function normalizedCurrency(value: string | null) {
  return value?.trim().toUpperCase() ?? ''
}

function accountLabel(account: { accountNo: string | null; name: string }) {
  return account.accountNo ? `${account.accountNo} - ${account.name}` : account.name
}

async function xlsxResponse(rows: Array<Record<string, string | number>>, filename: string) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, header.length + 3) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'FCD Ledger')
  const body = await XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const accountCode = url.searchParams.get('accountId')?.trim().toUpperCase() ?? ''
    const currencyCode = normalizedCurrency(url.searchParams.get('currencyCode'))
    const valuationDate = url.searchParams.get('valuationDate')?.trim() ?? ''
    const valuationRateType = url.searchParams.get('valuationRateType')?.trim() ?? ''
    if (valuationDate && !/^\d{4}-\d{2}-\d{2}$/.test(valuationDate)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'วันที่ตีมูลค่าต้องเป็นรูปแบบ YYYY-MM-DD' }, { status: 400 })
    }
    const fcdAccountCurrencies = (await listActiveAccounts())
      .filter((account) => account.accountGroup === 'bank' && account.isFcd)
      .flatMap((account) => account.supportedCurrencies.map((currency) => ({ account, currency })))
    const accounts = fcdAccountCurrencies
      .map(({ account, currency }) => ({
        accountNo: account.accountNo,
        bankName: account.bankName ?? account.bank ?? '',
        branchName: account.branchName ?? '',
        code: account.code,
        currency,
        id: `${account.code}|${currency}`,
        label: accountLabel(account),
        name: account.name,
        type: account.type,
      }))

    const selected = accountCode && currencyCode
      ? accounts.find((account) => account.code === accountCode && account.currency === currencyCode) ?? null
      : null
    if ((accountCode || currencyCode) && !selected) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บัญชี FCD หรือสกุลเงินที่เลือกไม่ถูกต้องหรือไม่ active' }, { status: 400 })
    }
    const selectedAccount = selected
      ? fcdAccountCurrencies.find(({ account, currency }) => account.code === selected.code && currency === selected.currency)?.account ?? null
      : null
    if (selected && !selectedAccount) throw new Error('ไม่พบข้อมูลบัญชี FCD ที่เลือก')

    const [policy, rateTypeRows, entries] = await Promise.all([
      getFinanceCurrencyPolicy(),
      prisma.fx_rates.findMany({ distinct: ['rate_type'], orderBy: { rate_type: 'asc' }, select: { rate_type: true }, where: { active: true } }),
      selected ? prisma.fcd_ledger_entries.findMany({
      orderBy: [{ entry_date: 'asc' }, { id: 'asc' }],
      where: { account_id: selectedAccount!.id, currency_code: selected.currency },
      }) : Promise.resolve([]),
    ])

    let foreignBalance = 0
    let thbBalance = 0
    const rows = entries.map((entry) => {
      const foreignIn = toNumber(entry.native_amount_in)
      const foreignOut = toNumber(entry.native_amount_out)
      const thbIn = toNumber(entry.carrying_thb_in)
      const thbOut = toNumber(entry.carrying_thb_out)
      foreignBalance += foreignIn - foreignOut
      thbBalance += thbIn - thbOut
      return {
        date: toDateOnly(entry.entry_date),
        description: entry.source_event_type,
        foreignBal: foreignBalance,
        foreignIn,
        foreignOut,
        fxRate: entry.fx_rate ? toNumber(entry.fx_rate) : null,
        id: entry.id.toString(),
        refNo: entry.source_event_key,
        thbBal: thbBalance,
        thbIn,
        thbOut,
        type: entry.source_event_type,
      }
    })

    const valuationRate = selected && valuationDate && valuationRateType
      ? await prisma.fx_rates.findFirst({
          orderBy: { id: 'desc' },
          select: { id: true, rate: true, source: true },
          where: {
            active: true,
            from_currency: selected.currency,
            rate_date: new Date(`${valuationDate}T00:00:00.000Z`),
            rate_type: valuationRateType,
            to_currency: policy.functionalCurrencyCode,
          },
        })
      : null
    const nativeBalance = rows.length ? rows[rows.length - 1]!.foreignBal : 0
    const carryingThbBalance = rows.length ? rows[rows.length - 1]!.thbBal : 0
    const weightedCarryingRate = nativeBalance > 0 && carryingThbBalance > 0 ? carryingThbBalance / nativeBalance : null
    const latestValuationRate = valuationRate ? toNumber(valuationRate.rate) : null
    const currentThbValue = latestValuationRate != null ? Number((nativeBalance * latestValuationRate).toFixed(2)) : null
    const unrealizedDifference = currentThbValue != null ? Number((currentThbValue - carryingThbBalance).toFixed(2)) : null

    if (url.searchParams.get('format') === 'xlsx') {
      if (!selected) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ต้องเลือกบัญชี FCD และสกุลเงินก่อน export' }, { status: 400 })
      return await xlsxResponse(rows.map((row) => ({
        CarryingBalanceTHB: row.thbBal,
        CarryingTHBIn: row.thbIn,
        CarryingTHBOut: row.thbOut,
        Currency: selected.currency,
        Date: row.date,
        FXRate: row.fxRate ?? '',
        NativeBalance: row.foreignBal,
        NativeIn: row.foreignIn,
        NativeOut: row.foreignOut,
        SourceEventKey: row.refNo,
        SourceEventType: row.type,
      })), `fcd_ledger_${selected.code}_${selected.currency}_${valuationDate || 'all'}.xlsx`)
    }

    return NextResponse.json({
      account: selected ? {
        accountNo: selected.accountNo,
        bankName: selected.bankName,
        branchName: selected.branchName,
        code: selected.code,
        currency: selected.currency,
        id: selected.id,
        name: selected.name,
        type: selected.type,
      } : null,
      filters: {
        accounts,
        functionalCurrencyCode: policy.functionalCurrencyCode,
        rateTypes: rateTypeRows.map((row) => row.rate_type),
      },
      rows,
      summary: {
        accountCount: accounts.length,
        currency: selected?.currency ?? '',
        foreignBalance,
        rows: rows.length,
        thbBalance: carryingThbBalance,
        valuation: {
          currentThbValue,
          latestValuationRate,
          rateFound: valuationRate != null,
          rateReference: valuationRate?.id.toString() ?? null,
          rateSource: valuationRate?.source ?? null,
          rateType: valuationRateType || null,
          unrealizedDifference,
          valuationDate: valuationDate || null,
          weightedCarryingRate,
        },
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด FCD Ledger ไม่ได้', 500)
  }
}
