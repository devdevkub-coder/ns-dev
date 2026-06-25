import type { Prisma } from '../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireBusinessCode } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type ApQuery = {
  branchId: string | null
  bucket: string | null
  from: string | null
  page: number
  pageSize: number
  q: string | null
  sortDirection: 'asc' | 'desc'
  sortKey: 'date' | 'docNo' | 'dueDate' | 'payableBalance' | 'supplierName' | 'aging'
  status: string | null
  supplierId: string | null
  to: string | null
}

function ageBucket(days: number) {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '>90'
}

function parseQuery(url: URL): ApQuery {
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '50')
  const sortKey = url.searchParams.get('sortKey')
  const sortDirection = url.searchParams.get('sortDirection')

  return {
    branchId: url.searchParams.get('branchId') || null,
    bucket: url.searchParams.get('bucket') || null,
    from: url.searchParams.get('from') || null,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 500) : 50,
    q: url.searchParams.get('q') || null,
    sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
    sortKey: ['date', 'docNo', 'dueDate', 'payableBalance', 'supplierName', 'aging'].includes(sortKey ?? '') ? sortKey as ApQuery['sortKey'] : 'dueDate',
    status: url.searchParams.get('status') || null,
    supplierId: url.searchParams.get('supplierId') || null,
    to: url.searchParams.get('to') || null,
  }
}

function billWhere(query: ApQuery, branchId: bigint | null, supplierId: bigint | null): Prisma.purchase_billsWhereInput {
  return {
    ...(branchId !== null ? { branch_id: branchId } : {}),
    ...(supplierId !== null ? { supplier_id: supplierId } : {}),
    ...(query.status ? { status: query.status } : { status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] } }),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: normalizeDate(query.from) } : {}),
            ...(query.to ? { lte: normalizeDate(query.to) } : {}),
          },
        }
      : {}),
  }
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'AP Aging')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

function xlsxResponse(body: Buffer, filename: string) {
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
    const query = parseQuery(url)
    const branch = query.branchId ? await findActiveBranchReferenceByCodeOrId(query.branchId) : null
    const supplier = query.supplierId ? await findActiveSupplierReferenceByCodeOrId(query.supplierId) : null

    const [bills, suppliers, branches] = await Promise.all([
      prisma.purchase_bills.findMany({
        include: {
          branches: { select: { code: true, id: true, name: true } },
          suppliers: { select: { code: true, id: true, name: true } },
        },
        orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
        take: 10000,
        where: billWhere(query, branch?.id ?? null, supplier?.id ?? null),
      }),
      prisma.suppliers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          active: true,
          code: true,
          id: true,
          name: true,
          supplier_branches: {
            select: {
              branches: { select: { code: true } },
            },
            where: { active: true },
          },
        },
        where: { active: true },
      }),
      prisma.branches.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      }),
    ])

    const today = new Date()
    const search = query.q?.trim().toLowerCase()
    const allRows = bills
      .map((bill) => {
        const totalAmount = toNumber(bill.total_amount)
        const paidAmount = toNumber(bill.paid_amount)
        const payableBalance = toNumber(bill.payable_balance)
        const creditTerm = 0
        // Current AP policy has no supplier credit term: aging starts from the PB date.
        const due = new Date(bill.date)
        const aging = Math.floor((today.getTime() - due.getTime()) / 86400000)

        return {
          aging,
          branchId: bill.branches?.code ?? '',
          branchName: bill.branches?.name ?? '-',
          bucket: ageBucket(aging),
          creditTerm,
          date: toDateOnly(bill.date),
          docNo: bill.doc_no,
          dueDate: toDateOnly(due),
          id: bill.doc_no,
          paidAmount,
          payableBalance,
          purchaseBillId: bill.id.toString(),
          sourceOfTruth: 'purchase_bills',
          status: bill.status ?? 'open',
          supplierCode: bill.suppliers?.code ?? '',
          supplierId: bill.suppliers?.code ?? '',
          supplierName: bill.suppliers?.name ?? '-',
          totalAmount,
          transactionMode: bill.transaction_mode ?? 'STOCK',
        }
      })
      .filter((row) => row.payableBalance > 0.01)
      .filter((row) => !query.bucket || row.bucket === query.bucket)
      .filter((row) => !search || `${row.docNo} ${row.supplierCode} ${row.supplierName} ${row.branchName}`.toLowerCase().includes(search))

    allRows.sort((left, right) => {
      const direction = query.sortDirection === 'asc' ? 1 : -1
      const leftValue = left[query.sortKey]
      const rightValue = right[query.sortKey]
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction
      return String(leftValue).localeCompare(String(rightValue)) * direction
    })

    const supplierMap = new Map<string, {
      b30: number
      b60: number
      b90: number
      bills: number
      current: number
      gt90: number
      oldest: number
      supplierId: string
      supplierName: string
      total: number
    }>()

    allRows.forEach((row) => {
      const current = supplierMap.get(row.supplierId) ?? {
        b30: 0,
        b60: 0,
        b90: 0,
        bills: 0,
        current: 0,
        gt90: 0,
        oldest: 0,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        total: 0,
      }
      current.bills += 1
      current.total += row.payableBalance
      current.oldest = Math.max(current.oldest, row.aging)
      if (row.bucket === 'Current') current.current += row.payableBalance
      else if (row.bucket === '1-30') current.b30 += row.payableBalance
      else if (row.bucket === '31-60') current.b60 += row.payableBalance
      else if (row.bucket === '61-90') current.b90 += row.payableBalance
      else current.gt90 += row.payableBalance
      supplierMap.set(row.supplierId, current)
    })

    const bySupplier = Array.from(supplierMap.values()).sort((left, right) => right.total - left.total)
    const byBucket = ['Current', '1-30', '31-60', '61-90', '>90'].map((bucket) => ({
      bills: allRows.filter((row) => row.bucket === bucket).length,
      bucket,
      total: allRows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.payableBalance, 0),
    }))

    if (url.searchParams.get('format') === 'xlsx') {
      const workbookRows = allRows.map((row) => ({
        Aging: row.aging,
        Branch: row.branchName,
        Bucket: row.bucket,
        Date: row.date,
        DocNo: row.docNo,
        AgingBaseDate: row.dueDate,
        Paid: row.paidAmount,
        Payable: row.payableBalance,
        Status: row.status,
        Supplier: row.supplierName,
        Total: row.totalAmount,
      }))
      return xlsxResponse(buildWorkbook(workbookRows), `finance_ap_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const totalRows = allRows.length
    const start = (query.page - 1) * query.pageSize
    const pageRows = allRows.slice(start, start + query.pageSize)
    const pageBillIds = pageRows.map((row) => BigInt(row.purchaseBillId))
    const pageBillIdStrings = pageRows.map((row) => row.purchaseBillId)
    const [paymentApprovals, supplierAdvanceAllocations] = pageRows.length > 0
      ? await Promise.all([
          prisma.payment_approvals.findMany({
            include: {
              payment_allocations: {
                include: {
                  payments: { select: { amount: true, date: true, doc_no: true, net_amount: true, status: true, voucher_id: true } },
                },
                orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                where: { status: 'active' },
              },
              payments: {
                select: { amount: true, date: true, doc_no: true, net_amount: true, status: true, voucher_id: true },
                where: { status: { not: 'cancelled' } },
              },
            },
            orderBy: [{ approved_at: 'desc' }, { id: 'desc' }],
            where: {
              source_id: { in: pageBillIdStrings },
              source_type: 'purchase_bill',
              status: { in: ['approved', 'paid'] },
            },
          }),
          prisma.supplier_advance_allocations.findMany({
            include: {
              supplier_advance_payments: { select: { advance_date: true, doc_no: true, status: true } },
            },
            orderBy: [{ allocated_at: 'desc' }, { id: 'desc' }],
            where: { purchase_bill_id: { in: pageBillIds }, status: 'active' },
          }),
        ])
      : [[], []]
    const paymentApprovalsByBillId = new Map<string, typeof paymentApprovals>()
    paymentApprovals.forEach((approval) => {
      paymentApprovalsByBillId.set(approval.source_id, [...(paymentApprovalsByBillId.get(approval.source_id) ?? []), approval])
    })
    const supplierAdvanceAllocationsByBillId = new Map<string, typeof supplierAdvanceAllocations>()
    supplierAdvanceAllocations.forEach((allocation) => {
      const key = allocation.purchase_bill_id.toString()
      supplierAdvanceAllocationsByBillId.set(key, [...(supplierAdvanceAllocationsByBillId.get(key) ?? []), allocation])
    })
    const rows = pageRows.map((row) => {
      const approvalsForBill = paymentApprovalsByBillId.get(row.purchaseBillId) ?? []
      const advancesForBill = supplierAdvanceAllocationsByBillId.get(row.purchaseBillId) ?? []
      return {
        ...row,
        drilldown: {
          payments: approvalsForBill.flatMap((approval) => {
            const facts = approval.payment_allocations.length > 0
              ? approval.payment_allocations.map((allocation) => ({
                  allocatedAmount: toNumber(allocation.allocated_amount),
                  date: allocation.payments?.date ? toDateOnly(allocation.payments.date) : '',
                  docNo: allocation.payment_doc_no,
                  href: `/purchase/payments?q=${encodeURIComponent(allocation.payment_doc_no)}`,
                  netAmount: toNumber(allocation.payments?.net_amount),
                  paymentApprovalDocNo: allocation.payment_approval_doc_no,
                  status: allocation.payments?.status ?? allocation.status,
                  voucherId: allocation.payment_voucher_id ?? allocation.payments?.voucher_id ?? '',
                }))
              : approval.payments.map((payment) => ({
                  allocatedAmount: toNumber(payment.net_amount ?? payment.amount),
                  date: toDateOnly(payment.date),
                  docNo: payment.doc_no,
                  href: `/purchase/payments?q=${encodeURIComponent(payment.doc_no)}`,
                  netAmount: toNumber(payment.net_amount),
                  paymentApprovalDocNo: approval.doc_no ?? '',
                  status: payment.status ?? '',
                  voucherId: payment.voucher_id ?? '',
                }))
            return facts
          }),
          paymentApprovals: approvalsForBill.map((approval) => ({
            approvedAmount: toNumber(approval.approved_amount),
            docNo: approval.doc_no ?? '',
            href: `/purchase/payments?approval=${encodeURIComponent(approval.doc_no ?? '')}`,
            status: approval.status,
          })),
          purchaseBill: {
            docNo: row.docNo,
            href: `/purchase/bills?docNo=${encodeURIComponent(row.docNo)}`,
            sourceOfTruth: 'purchase_bills',
          },
          supplierAdvances: advancesForBill.map((allocation) => ({
            allocatedAmount: toNumber(allocation.allocated_amount),
            docNo: allocation.supplier_advance_payments.doc_no,
            href: `/purchase/advance-payments?q=${encodeURIComponent(allocation.supplier_advance_payments.doc_no)}`,
            status: allocation.supplier_advance_payments.status,
          })),
        },
      }
    })
    const statuses = Array.from(new Set(bills.map((bill) => bill.status ?? 'open'))).sort()

    return NextResponse.json({
      byBucket,
      bySupplier,
      filters: {
        branches: branches.map((row) => ({ active: row.active, code: row.code, id: row.code, name: row.name })),
        statuses,
        suppliers: suppliers.map((row) => {
          const code = requireBusinessCode(row.code, `ผู้ขาย ${row.id}`)
          return {
            active: row.active,
            branchIds: row.supplier_branches
              .map((mapping) => mapping.branches?.code)
              .filter((branchCode): branchCode is string => Boolean(branchCode)),
            code,
            id: code,
            name: row.name,
          }
        }),
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)),
        totalRows,
      },
      rows,
      summary: {
        bills: allRows.length,
        dueIn7: allRows.filter((row) => row.aging >= 0 && row.aging <= 7).reduce((sum, row) => sum + row.payableBalance, 0),
        overdue: allRows.filter((row) => row.aging > 0).reduce((sum, row) => sum + row.payableBalance, 0),
        suppliers: bySupplier.length,
        total: allRows.reduce((sum, row) => sum + row.payableBalance, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดเจ้าหนี้ AP ไม่ได้', 500)
  }
}
