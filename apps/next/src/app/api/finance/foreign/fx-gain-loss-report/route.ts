import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type FxGainLossRow = Awaited<ReturnType<typeof prisma.fx_gain_loss.findMany>>[number]
type StatementReference = { docNo: string; referenceNo: string }

function mapRow(row: FxGainLossRow, referenceBySource: Map<string, StatementReference>) {
  const foreignAmount = toNumber(row.amount_fc)
  const originalFxRate = toNumber(row.rate_book)
  const settlementFxRate = toNumber(row.rate_settlement)
  const gainLossAmount = toNumber(row.gain_loss)
  const sourceKey = row.ref_type && row.ref_id ? `${row.ref_type}:${row.ref_id}` : ''
  const statementReference = sourceKey ? referenceBySource.get(sourceKey) : null
  const referenceNo = statementReference?.referenceNo ?? null
  const outwardReference = referenceNo ?? '-'
  return {
    currency: (row.currency || '').toUpperCase(),
    date: toDateOnly(row.date),
    foreignAmount,
    fxGainLossAmount: gainLossAmount,
    gainLossType: gainLossAmount > 0 ? 'gain' : gainLossAmount < 0 ? 'loss' : 'neutral',
    id: `${toDateOnly(row.date)}:${(row.currency || '').toUpperCase()}:${outwardReference}:${gainLossAmount.toFixed(4)}`,
    notes: row.notes ?? '',
    originalFxRate,
    originalThbValue: foreignAmount * originalFxRate,
    reference: outwardReference,
    referenceNo,
    sourceDocumentHref: statementReference ? `/finance/bank?${new URLSearchParams({ q: statementReference.docNo })}` : null,
    sourceLedgerHref: null,
    sourceRefId: outwardReference,
    settlementFxRate,
    settlementThbValue: foreignAmount * settlementFxRate,
    transactionType: row.ref_type || 'FX Gain/Loss',
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const currency = url.searchParams.get('currency')?.trim().toUpperCase()
    const refType = url.searchParams.get('refType')?.trim()

    const rows = await prisma.fx_gain_loss.findMany({
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      take: 5000,
      where: {
        ...(currency && currency !== 'ALL' ? { currency } : {}),
        ...(refType && refType !== 'all' ? { ref_type: refType } : {}),
        ...(from || to ? {
          date: {
            ...(from ? { gte: normalizeDate(from) } : {}),
            ...(to ? { lte: normalizeDate(to) } : {}),
          },
        } : {}),
      },
    })

    const sourcePairs = rows
      .filter((row) => row.ref_type && row.ref_id)
      .map((row) => ({ refId: row.ref_id as string, refType: row.ref_type as string }))
    const statements = sourcePairs.length > 0 ? await prisma.bank_statement.findMany({
      select: { doc_no: true, ref_id: true, ref_no: true, ref_type: true },
      where: {
        OR: sourcePairs.map((pair) => ({ ref_id: pair.refId, ref_type: pair.refType })),
      },
    }) : []
    const referenceBySource = new Map(statements
      .filter((row) => row.ref_id && row.ref_no && row.ref_type)
      .map((row) => [`${row.ref_type}:${row.ref_id}`, { docNo: row.doc_no, referenceNo: row.ref_no as string }]))

    const [conversionRows, revaluationRows] = await Promise.all([
      prisma.fcd_conversions.findMany({
        orderBy: [{ conversion_date: 'desc' }, { id: 'desc' }],
        take: 5000,
        where: {
          status: 'active',
          reversal_of_id: null,
          ...(from || to ? { conversion_date: { ...(from ? { gte: normalizeDate(from) } : {}), ...(to ? { lte: normalizeDate(to) } : {}) } } : {}),
          ...(currency && currency !== 'ALL' ? { source_currency_code: currency } : {}),
        },
      }),
      prisma.fcd_revaluation_batches.findMany({
        orderBy: [{ period_end: 'desc' }, { id: 'desc' }],
        take: 5000,
        where: { status: 'posted', ...(from || to ? { period_end: { ...(from ? { gte: normalizeDate(from) } : {}), ...(to ? { lte: normalizeDate(to) } : {}) } } : {}) },
      }),
    ])
    const conversionLines = conversionRows.length ? await prisma.fcd_conversion_lines.findMany({ where: { conversion_id: { in: conversionRows.map((row) => row.id) } } }) : []
    const revaluationLines = revaluationRows.length ? await prisma.fcd_revaluation_lines.findMany({ where: { batch_id: { in: revaluationRows.map((row) => row.id) }, posted: true } }) : []
    const accountIds = Array.from(new Set([
      ...conversionRows.map((row) => row.source_account_id),
      ...revaluationLines.map((line) => line.account_id),
    ]))
    const accounts = accountIds.length > 0 ? await prisma.accounts.findMany({
      select: { code: true, id: true },
      where: { id: { in: accountIds } },
    }) : []
    const conversionById = new Map(conversionRows.map((row) => [row.id.toString(), row]))
    const revaluationById = new Map(revaluationRows.map((row) => [row.id.toString(), row]))
    const accountCodeById = new Map(accounts.map((account) => [account.id.toString(), account.code]))
    const conversionFxRows = conversionLines.flatMap((line) => {
      const conversion = conversionById.get(line.conversion_id.toString())
      if (!conversion || (refType && refType !== 'all' && refType !== 'FCD Conversion')) return []
      const nativeAmount = toNumber(line.native_amount)
      const carryingThb = toNumber(line.carrying_thb_out)
      const receivedThb = toNumber(line.actual_thb_received)
      const sourceAccountCode = accountCodeById.get(conversion.source_account_id.toString())
      if (!sourceAccountCode || !line.source_fcd_ledger_entry_id) throw new Error('รายการแลกเงิน FCD อ้างอิงบัญชีหรือ FCD ledger ไม่ครบ')
      return [{
        currency: conversion.source_currency_code,
        date: toDateOnly(conversion.conversion_date),
        foreignAmount: nativeAmount,
        fxGainLossAmount: toNumber(line.realized_fx_difference),
        gainLossType: toNumber(line.realized_fx_difference) > 0 ? 'gain' : toNumber(line.realized_fx_difference) < 0 ? 'loss' : 'neutral',
        id: `fcd-conversion:${conversion.doc_no}:${line.line_no}`,
        notes: conversion.bank_reference ?? '',
        originalFxRate: nativeAmount > 0 ? carryingThb / nativeAmount : 0,
        originalThbValue: carryingThb,
        reference: conversion.doc_no,
        referenceNo: conversion.doc_no,
        sourceDocumentHref: `/finance/foreign/fcd-conversions?${new URLSearchParams({ docNo: conversion.doc_no })}`,
        sourceLedgerHref: `/finance/foreign/fcd-ledger?${new URLSearchParams({ accountId: sourceAccountCode, currencyCode: conversion.source_currency_code })}#entry-${line.source_fcd_ledger_entry_id}`,
        settlementFxRate: nativeAmount > 0 ? receivedThb / nativeAmount : 0,
        settlementThbValue: receivedThb,
        transactionType: 'FCD Conversion',
      }]
    })
    const revaluationFxRows = revaluationLines.flatMap((line) => {
      const batch = revaluationById.get(line.batch_id.toString())
      if (!batch || (currency && currency !== 'ALL' && line.currency_code !== currency) || (refType && refType !== 'all' && refType !== 'FCD Revaluation')) return []
      const nativeBalance = toNumber(line.native_balance)
      const carryingThb = toNumber(line.carrying_thb_before)
      const accountCode = accountCodeById.get(line.account_id.toString())
      if (!accountCode || !line.fcd_ledger_entry_id) throw new Error('รายการตีมูลค่า FCD อ้างอิงบัญชีหรือ FCD ledger ไม่ครบ')
      return [{
        currency: line.currency_code,
        date: toDateOnly(line.period_end),
        foreignAmount: nativeBalance,
        fxGainLossAmount: toNumber(line.unrealized_fx_difference),
        gainLossType: toNumber(line.unrealized_fx_difference) > 0 ? 'gain' : toNumber(line.unrealized_fx_difference) < 0 ? 'loss' : 'neutral',
        id: `fcd-revaluation:${batch.doc_no}:${line.id}`,
        notes: batch.rate_reference ?? '',
        originalFxRate: nativeBalance > 0 ? carryingThb / nativeBalance : 0,
        originalThbValue: carryingThb,
        reference: batch.doc_no,
        referenceNo: batch.doc_no,
        sourceDocumentHref: `/finance/foreign/fcd-revaluations?${new URLSearchParams({ docNo: batch.doc_no })}`,
        sourceLedgerHref: `/finance/foreign/fcd-ledger?${new URLSearchParams({ accountId: accountCode, currencyCode: line.currency_code })}#entry-${line.fcd_ledger_entry_id}`,
        settlementFxRate: toNumber(line.closing_fx_rate),
        settlementThbValue: toNumber(line.revalued_thb_amount),
        transactionType: 'FCD Revaluation',
      }]
    })
    const mappedRows = [...rows.map((row) => mapRow(row, referenceBySource)), ...conversionFxRows, ...revaluationFxRows]
    const totalGain = mappedRows.filter((row) => row.fxGainLossAmount >= 0).reduce((sum, row) => sum + row.fxGainLossAmount, 0)
    const totalLoss = mappedRows.filter((row) => row.fxGainLossAmount < 0).reduce((sum, row) => sum + Math.abs(row.fxGainLossAmount), 0)

    return NextResponse.json({
      filters: {
        currencies: Array.from(new Set(mappedRows.map((row) => row.currency).filter(Boolean))).sort(),
        refTypes: Array.from(new Set(mappedRows.map((row) => row.transactionType).filter(Boolean))).sort(),
      },
      rows: mappedRows,
      schemaState: {
        referenceResolution: 'bank_statement.ref_no when matched, otherwise "-"',
        realizedOnly: true,
        sourceTable: 'fx_gain_loss',
        unrealizedSource: 'not_available',
        writeBehavior: 'read_only_no_auto_post',
      },
      summary: {
        net: totalGain - totalLoss,
        rows: mappedRows.length,
        totalGain,
        totalLoss,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด FX Gain/Loss ไม่ได้', 500)
  }
}
