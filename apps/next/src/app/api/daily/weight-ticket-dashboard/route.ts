import { NextResponse } from 'next/server'
import { displayWeightTicketStatus, type WeightTicketStatus, type WeightTicketType } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { bangkokDateInput, branchScopeIds, weightTicketWhere, type WeightTicketQuery } from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const knownStatuses = new Set<WeightTicketStatus>(['draft', 'received', 'delivered', 'partially_billed', 'billed', 'cancelled'])

function defaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  return {
    dateFrom: bangkokDateInput(start),
    dateTo: bangkokDateInput(end),
  }
}

function validDateParam(value: string | null) {
  const trimmed = value?.trim() ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function validTypeParam(value: string | null): WeightTicketType | undefined {
  return value === 'WTI' || value === 'WTO' ? value : undefined
}

function statusLabel(type: string, status: string | null) {
  if ((type === 'WTI' || type === 'WTO') && status && knownStatuses.has(status as WeightTicketStatus)) {
    return displayWeightTicketStatus(type, status as WeightTicketStatus)
  }
  return status || '-'
}

function roundWeight(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const url = new URL(request.url)
    const fallback = defaultRange()
    let dateFrom = validDateParam(url.searchParams.get('dateFrom')) ?? fallback.dateFrom
    let dateTo = validDateParam(url.searchParams.get('dateTo')) ?? fallback.dateTo
    if (dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom]

    const branchIdParam = url.searchParams.get('branchId')?.trim()
    const branchId = branchIdParam && branchIdParam !== 'all' ? branchIdParam : undefined
    const type = validTypeParam(url.searchParams.get('type'))

    const query: WeightTicketQuery = {
      branchId,
      dateFrom,
      dateTo,
      page: 1,
      pageSize: 100,
      sortBy: 'documentNo',
      sortDir: 'asc',
      statuses: [],
      type,
    }

    const rows = await prisma.weight_tickets.findMany({
      orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
      select: {
        branches: {
          select: { code: true, name: true },
        },
        doc_no: true,
        doc_type: true,
        document_date: true,
        id: true,
        net_weight: true,
        party_name: true,
        status: true,
        stock_holds: {
          select: {
            product_id: true,
            products: {
              select: { code: true, name: true },
            },
            qty: true,
          },
          where: { status: 'active' },
        },
        weight_ticket_product_summaries: {
          select: {
            billed_weight: true,
            net_weight: true,
            product_id: true,
            product_name: true,
            products: {
              select: { code: true, name: true },
            },
            remaining_weight: true,
          },
        },
      },
      where: weightTicketWhere(query, branchScopeIds(context)),
    })

    const activeRows = rows.filter((row) => row.status !== 'cancelled')
    const cancelledDocuments = rows.length - activeRows.length

    const summary = {
      cancelledDocuments,
      totalDocuments: activeRows.length,
      wtiDocuments: 0,
      wtiNetWeight: 0,
      wtiWaitingBillCount: 0,
      wtiWaitingBillWeight: 0,
      wtoDocuments: 0,
      wtoNetWeight: 0,
      wtoPendingOutCount: 0,
      wtoPendingOutWeight: 0,
    }

    const statusMap = new Map<string, {
      count: number
      netWeight: number
      status: string
      statusLabel: string
      type: string
    }>()
    const branchMap = new Map<string, {
      branchId: string
      branchName: string
      pendingOutWeight: number
      wtiCount: number
      wtiNetWeight: number
      wtiWaitingBillWeight: number
      wtoCount: number
      wtoNetWeight: number
    }>()
    const productMap = new Map<string, {
      documentIds: Set<string>
      pendingOutWeight: number
      productCode: string
      productId: string
      productName: string
      wtiNetWeight: number
      wtiRemainingWeight: number
      wtoNetWeight: number
    }>()

    const attentionRows = []

    for (const row of rows) {
      const typeValue = row.doc_type
      const statusValue = row.status ?? ''
      const netWeight = toNumber(row.net_weight)
      const statusKey = `${typeValue}:${statusValue}`
      const statusBucket = statusMap.get(statusKey) ?? {
        count: 0,
        netWeight: 0,
        status: statusValue,
        statusLabel: statusLabel(typeValue, statusValue),
        type: typeValue,
      }
      statusBucket.count += 1
      statusBucket.netWeight += netWeight
      statusMap.set(statusKey, statusBucket)

      if (row.status === 'cancelled') continue

      const branchKey = row.branches.code ?? 'unknown'
      const branchBucket = branchMap.get(branchKey) ?? {
        branchId: branchKey,
        branchName: row.branches.name ?? branchKey,
        pendingOutWeight: 0,
        wtiCount: 0,
        wtiNetWeight: 0,
        wtiWaitingBillWeight: 0,
        wtoCount: 0,
        wtoNetWeight: 0,
      }

      if (row.doc_type === 'WTI') {
        summary.wtiDocuments += 1
        summary.wtiNetWeight += netWeight
        branchBucket.wtiCount += 1
        branchBucket.wtiNetWeight += netWeight
      }

      if (row.doc_type === 'WTO') {
        summary.wtoDocuments += 1
        summary.wtoNetWeight += netWeight
        branchBucket.wtoCount += 1
        branchBucket.wtoNetWeight += netWeight
      }

      let wtiRemainingWeight = 0
      for (const productSummary of row.weight_ticket_product_summaries) {
        const productKey = productSummary.product_id.toString()
        const productBucket = productMap.get(productKey) ?? {
          documentIds: new Set<string>(),
          pendingOutWeight: 0,
          productCode: productSummary.products.code ?? '',
          productId: productKey,
          productName: productSummary.product_name || productSummary.products.name || '-',
          wtiNetWeight: 0,
          wtiRemainingWeight: 0,
          wtoNetWeight: 0,
        }
        productBucket.documentIds.add(row.doc_no)
        if (row.doc_type === 'WTI') {
          productBucket.wtiNetWeight += toNumber(productSummary.net_weight)
          productBucket.wtiRemainingWeight += toNumber(productSummary.remaining_weight)
          wtiRemainingWeight += toNumber(productSummary.remaining_weight)
        } else if (row.doc_type === 'WTO') {
          productBucket.wtoNetWeight += toNumber(productSummary.net_weight)
        }
        productMap.set(productKey, productBucket)
      }

      if (row.doc_type === 'WTI' && wtiRemainingWeight > 0.0001 && row.status !== 'billed') {
        summary.wtiWaitingBillCount += 1
        summary.wtiWaitingBillWeight += wtiRemainingWeight
        branchBucket.wtiWaitingBillWeight += wtiRemainingWeight
        attentionRows.push({
          branchName: branchBucket.branchName,
          date: toDateOnly(row.document_date),
          docNo: row.doc_no,
          href: `/daily/weight-ticket-list/${encodeURIComponent(row.doc_no)}`,
          netWeight,
          partyName: row.party_name,
          remainingWeight: wtiRemainingWeight,
          status: row.status ?? '',
          statusLabel: statusLabel(row.doc_type, row.status),
          type: row.doc_type,
          warning: 'รอเปิด PB',
        })
      }

      let wtoPendingOutWeight = 0
      for (const hold of row.stock_holds) {
        const qty = toNumber(hold.qty)
        wtoPendingOutWeight += qty
        const productKey = hold.product_id.toString()
        const productBucket = productMap.get(productKey) ?? {
          documentIds: new Set<string>(),
          pendingOutWeight: 0,
          productCode: hold.products.code ?? '',
          productId: productKey,
          productName: hold.products.name ?? '-',
          wtiNetWeight: 0,
          wtiRemainingWeight: 0,
          wtoNetWeight: 0,
        }
        productBucket.documentIds.add(row.doc_no)
        productBucket.pendingOutWeight += qty
        productMap.set(productKey, productBucket)
      }

      if (row.doc_type === 'WTO' && wtoPendingOutWeight > 0.0001) {
        summary.wtoPendingOutCount += 1
        summary.wtoPendingOutWeight += wtoPendingOutWeight
        branchBucket.pendingOutWeight += wtoPendingOutWeight
        attentionRows.push({
          branchName: branchBucket.branchName,
          date: toDateOnly(row.document_date),
          docNo: row.doc_no,
          href: `/daily/weight-ticket-list/${encodeURIComponent(row.doc_no)}`,
          netWeight,
          partyName: row.party_name,
          remainingWeight: wtoPendingOutWeight,
          status: row.status ?? '',
          statusLabel: statusLabel(row.doc_type, row.status),
          type: row.doc_type,
          warning: 'รอออก SB',
        })
      }

      branchMap.set(branchKey, branchBucket)
    }

    const byStatus = [...statusMap.values()]
      .map((row) => ({ ...row, netWeight: roundWeight(row.netWeight) }))
      .sort((left, right) => left.type.localeCompare(right.type) || left.status.localeCompare(right.status))
    const byBranch = [...branchMap.values()]
      .map((row) => ({
        ...row,
        pendingOutWeight: roundWeight(row.pendingOutWeight),
        wtiNetWeight: roundWeight(row.wtiNetWeight),
        wtiWaitingBillWeight: roundWeight(row.wtiWaitingBillWeight),
        wtoNetWeight: roundWeight(row.wtoNetWeight),
      }))
      .sort((left, right) => left.branchName.localeCompare(right.branchName, 'th'))
    const topProducts = [...productMap.values()]
      .map((row) => ({
        documentCount: row.documentIds.size,
        pendingOutWeight: roundWeight(row.pendingOutWeight),
        productCode: row.productCode,
        productId: row.productId,
        productName: row.productName,
        wtiNetWeight: roundWeight(row.wtiNetWeight),
        wtiRemainingWeight: roundWeight(row.wtiRemainingWeight),
        wtoNetWeight: roundWeight(row.wtoNetWeight),
      }))
      .sort((left, right) => (
        (right.wtiRemainingWeight + right.pendingOutWeight + right.wtiNetWeight + right.wtoNetWeight)
        - (left.wtiRemainingWeight + left.pendingOutWeight + left.wtiNetWeight + left.wtoNetWeight)
      ))
      .slice(0, 10)

    return NextResponse.json({
      attentionRows: attentionRows
        .sort((left, right) => left.date.localeCompare(right.date) || right.remainingWeight - left.remainingWeight)
        .slice(0, 12)
        .map((row) => ({ ...row, netWeight: roundWeight(row.netWeight), remainingWeight: roundWeight(row.remainingWeight) })),
      byBranch,
      byStatus,
      filters: {
        branchId: branchId ?? 'all',
        dateFrom,
        dateTo,
        type: type ?? 'all',
      },
      summary: {
        ...summary,
        wtiNetWeight: roundWeight(summary.wtiNetWeight),
        wtiWaitingBillWeight: roundWeight(summary.wtiWaitingBillWeight),
        wtoNetWeight: roundWeight(summary.wtoNetWeight),
        wtoPendingOutWeight: roundWeight(summary.wtoPendingOutWeight),
      },
      topProducts,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Dashboard ใบรับ-ส่งของไม่ได้', 500)
  }
}
