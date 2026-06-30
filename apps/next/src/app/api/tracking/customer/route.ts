import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getAllowedBranchIds } from '@/lib/server/branch-scope'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { addToFinancialAgingBucketTotals, computeFinancialDueAging, emptyFinancialAgingBucketTotals, financialAgingBuckets } from '@/lib/server/document-aging'
import { prisma } from '@/lib/server/prisma'
import { salesBillLineFactsByBillId, salesBillLineFactTotals, type SalesBillLineFactRow } from '@/lib/server/sales-bill-line-facts'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

function inYearMonth(date: Date, year: string | null, month: string | null) {
  const value = toDateOnly(date)
  if (year && value.slice(0, 4) !== year) return false
  if (month && value.slice(5, 7) !== month.padStart(2, '0')) return false
  return true
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Customer Tracking')
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

function branchScopedSalesBillWhere(allowedBranchIds: bigint[] | null): Prisma.sales_billsWhereInput {
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

function branchScopedReceiptWhere(allowedBranchIds: bigint[] | null): Prisma.receiptsWhereInput {
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

function productOptionKey(line: SalesBillLineFactRow) {
  return line.productId?.toString() || line.productCode || line.productName
}

function productFilterMatches(line: SalesBillLineFactRow, productCategory: string | null, productId: string | null) {
  if (productCategory && line.productCategory !== productCategory) return false
  if (productId && productOptionKey(line) !== productId) return false
  return true
}

function buildProductFilters(lines: SalesBillLineFactRow[]) {
  const categorySet = new Set<string>()
  const productMap = new Map<string, { category: string; code: string; id: string; name: string }>()
  for (const line of lines) {
    if (line.productCategory) categorySet.add(line.productCategory)
    const id = productOptionKey(line)
    if (!id) continue
    if (!productMap.has(id)) {
      productMap.set(id, { category: line.productCategory, code: line.productCode, id, name: line.productName })
    }
  }
  return {
    productCategories: Array.from(categorySet).sort((left, right) => left.localeCompare(right, 'th')),
    products: Array.from(productMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'th')),
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')
    const allowedBranchIds = await getAllowedBranchIds(context)

    const url = new URL(request.url)
    const year = url.searchParams.get('year') || String(new Date().getFullYear())
    const month = url.searchParams.get('month')
    const customerId = url.searchParams.get('customerId')
    const detailId = url.searchParams.get('detailId')
    const productCategory = url.searchParams.get('productCategory')?.trim() || null
    const productId = url.searchParams.get('productId')?.trim() || null
    const customer = customerId ? await findActiveCustomerReferenceByCodeOrId(customerId) : null
    const detailCustomer = detailId ? await findActiveCustomerReferenceByCodeOrId(detailId) : null
    const search = url.searchParams.get('q')?.trim().toLowerCase()
    const asOfDate = new Date()

    const [customers, bills, receipts] = await Promise.all([
      prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, credit_limit: true, credit_term: true, id: true, name: true },
        where: { active: { not: false }, ...(customer ? { id: customer.id } : {}) },
      }),
      prisma.sales_bills.findMany({
        include: { sales_channels: { select: { code: true, name: true } } },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: { ...branchScopedSalesBillWhere(allowedBranchIds), NOT: { status: 'cancelled' }, ...(customer ? { customer_id: customer.id } : {}) },
      }),
      prisma.receipts.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { ...branchScopedReceiptWhere(allowedBranchIds), NOT: { status: 'cancelled' }, ...(customer ? { customer_id: customer.id } : {}) },
      }),
    ])
    const linesByBillId = await salesBillLineFactsByBillId(bills.map((bill) => bill.id))
    const allLines = Array.from(linesByBillId.values()).flat()
    const productFilters = buildProductFilters(allLines)
    const hasProductFilter = Boolean(productCategory || productId)
    const filteredLinesByBillId = new Map<bigint, SalesBillLineFactRow[]>()
    linesByBillId.forEach((lines, billId) => {
      const filteredLines = lines.filter((line) => productFilterMatches(line, productCategory, productId))
      if (!hasProductFilter || filteredLines.length > 0) filteredLinesByBillId.set(billId, filteredLines)
    })
    const scopedBills = hasProductFilter ? bills.filter((bill) => (filteredLinesByBillId.get(bill.id) ?? []).length > 0) : bills
    const visibleCustomerIds = new Set([
      ...scopedBills.map((row) => row.customer_id),
      ...(hasProductFilter ? [] : receipts.map((row) => row.customer_id)),
    ].filter((id): id is bigint => id != null))
    const visibleCustomers = customers.filter((customer) => visibleCustomerIds.has(customer.id))
    const billLineTotals = (billId: bigint) => salesBillLineFactTotals(filteredLinesByBillId.get(billId))

    const receivedByBill = new Map<bigint, number>()
    receipts.forEach((receipt) => {
      if (!receipt.bill_id) return
      const amount = toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount)
      receivedByBill.set(receipt.bill_id, (receivedByBill.get(receipt.bill_id) ?? 0) + amount)
    })

    const rows = visibleCustomers.map((customer) => {
      const customerBills = scopedBills.filter((bill) => bill.customer_id === customer.id && inYearMonth(bill.date, year, month))
      const customerReceipts = receipts.filter((receipt) => receipt.customer_id === customer.id && inYearMonth(receipt.date, year, month))
      const totals = customerBills.reduce((sum, bill) => {
        const lineTotals = billLineTotals(bill.id)
        const revenue = lineTotals.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        const received = receivedByBill.get(bill.id) ?? toNumber(bill.received_amount)
        const cogs = toNumber(bill.cogs_amount ?? bill.total_cost)
        const gp = toNumber(bill.gross_profit) || revenue - cogs
        const receivable = Math.max(0, toNumber(bill.receivable_balance) || toNumber(bill.total_amount) - received)
        const aging = computeFinancialDueAging({
          asOfDate,
          creditTermDays: bill.credit_term ?? customer.credit_term ?? 0,
          documentDate: bill.date,
          dueDate: bill.due_date,
        })
        if (receivable > 0) addToFinancialAgingBucketTotals(sum.agingBuckets, aging.ageBucket, receivable)
        return {
          agingBuckets: sum.agingBuckets,
          billCount: sum.billCount + 1,
          cogs: sum.cogs + cogs,
          gp: sum.gp + gp,
          lowMarginBillCount: sum.lowMarginBillCount + (revenue > 0 && gp / revenue < 0.05 ? 1 : 0),
          negativeMarginBillCount: sum.negativeMarginBillCount + (gp < 0 ? 1 : 0),
          oldestArAgeDays: receivable > 0 ? Math.max(sum.oldestArAgeDays, aging.ageDays) : sum.oldestArAgeDays,
          overdueArAmount: sum.overdueArAmount + (receivable > 0 && aging.ageDays > 0 ? receivable : 0),
          overdueArBillCount: sum.overdueArBillCount + (receivable > 0 && aging.ageDays > 0 ? 1 : 0),
          pendingArBillCount: sum.pendingArBillCount + (receivable > 0 ? 1 : 0),
          qty: sum.qty + lineTotals.qty,
          receivable: sum.receivable + receivable,
          revenue: sum.revenue + revenue,
        }
      }, { agingBuckets: emptyFinancialAgingBucketTotals(), billCount: 0, cogs: 0, gp: 0, lowMarginBillCount: 0, negativeMarginBillCount: 0, oldestArAgeDays: 0, overdueArAmount: 0, overdueArBillCount: 0, pendingArBillCount: 0, qty: 0, receivable: 0, revenue: 0 })
      const receivedAmount = customerReceipts.reduce((sum, receipt) => sum + toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount), 0)
      const gp = totals.gp || totals.revenue - totals.cogs
      const creditLimit = toNumber(customer.credit_limit)

      const customerYearBills = scopedBills.filter((bill) => bill.customer_id === customer.id && inYearMonth(bill.date, year, null))
      const monthlyData = Array.from({ length: 12 }, (_, index) => {
        const monthKey = String(index + 1).padStart(2, '0')
        const monthBills = customerYearBills.filter((bill) => inYearMonth(bill.date, year, monthKey))
        const qty = monthBills.reduce((sum, bill) => sum + billLineTotals(bill.id).qty, 0)
        const revenue = monthBills.reduce((sum, bill) => sum + (billLineTotals(bill.id).amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)), 0)
        return { qty, revenue }
      })

      return {
        agingBuckets: financialAgingBuckets.map((bucket) => ({ amount: totals.agingBuckets[bucket].amount, bucket, count: totals.agingBuckets[bucket].count })),
        avgSell: totals.qty > 0 ? totals.revenue / totals.qty : 0,
        billCount: totals.billCount,
        cogs: totals.cogs,
        code: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
        creditLimit,
        creditUtilizationPct: creditLimit > 0 ? (totals.receivable / creditLimit) * 100 : 0,
        customerName: customer.name,
        gp,
        gpPct: totals.revenue > 0 ? (gp / totals.revenue) * 100 : 0,
        id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
        lowMarginBillCount: totals.lowMarginBillCount,
        negativeMarginBillCount: totals.negativeMarginBillCount,
        oldestArAgeDays: totals.oldestArAgeDays,
        overdueArAmount: totals.overdueArAmount,
        overdueArBillCount: totals.overdueArBillCount,
        pendingArBillCount: totals.pendingArBillCount,
        profitPerKg: totals.qty > 0 ? gp / totals.qty : 0,
        qty: totals.qty,
        receivable: totals.receivable,
        receiptCount: customerReceipts.length,
        receivedAmount,
        revenue: totals.revenue,
        monthlyData,
      }
    }).filter((row) => row.billCount > 0 || row.revenue > 0 || row.receivable > 0)

      .filter((row) => !search || `${row.code} ${row.customerName}`.toLowerCase().includes(search))
      .sort((left, right) => right.revenue - left.revenue)

    const monthly = Array.from({ length: 12 }, (_, index) => {
      const monthKey = String(index + 1).padStart(2, '0')
      const monthBills = scopedBills.filter((bill) => inYearMonth(bill.date, year, monthKey))
      return monthBills.reduce<{ gp: number; month: string; qty: number; revenue: number }>((sum, bill) => {
        const lineTotals = billLineTotals(bill.id)
        const revenue = lineTotals.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        return {
          gp: sum.gp + (toNumber(bill.gross_profit) || revenue - toNumber(bill.cogs_amount ?? bill.total_cost)),
          month: monthKey,
          qty: sum.qty + lineTotals.qty,
          revenue: sum.revenue + revenue,
        }
      }, { gp: 0, month: monthKey, qty: 0, revenue: 0 })
    })

    const detail = detailCustomer && visibleCustomerIds.has(detailCustomer.id) ? (() => {
      const detailBills = scopedBills.filter((bill) => bill.customer_id === detailCustomer.id && inYearMonth(bill.date, year, month))
      const detailReceipts = receipts.filter((receipt) => receipt.customer_id === detailCustomer.id && inYearMonth(receipt.date, year, month))
      const detailYearBills = scopedBills.filter((bill) => bill.customer_id === detailCustomer.id && inYearMonth(bill.date, year, null))
      const detailYearReceipts = receipts.filter((receipt) => receipt.customer_id === detailCustomer.id && inYearMonth(receipt.date, year, null))
      const channelMap = new Map<string, { billCount: number; channelName: string; cogs: number; gp: number; qty: number; revenue: number }>()
      const productMap = new Map<string, { cogs: number; gp: number; productName: string; qty: number; revenue: number }>()

      detailBills.forEach((bill) => {
        const lines = filteredLinesByBillId.get(bill.id) ?? []
        const billItem = salesBillLineFactTotals(lines)
        const billRevenue = billItem.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        const billCogs = toNumber(bill.cogs_amount ?? bill.total_cost)
        const billGp = toNumber(bill.gross_profit) || billRevenue - billCogs
        const channelName = bill.sales_channels?.name ?? 'ไม่ระบุช่องทาง'
        const channel = channelMap.get(channelName) ?? { billCount: 0, channelName, cogs: 0, gp: 0, qty: 0, revenue: 0 }
        channel.billCount += 1
        channel.cogs += billCogs
        channel.gp += billGp
        channel.qty += billItem.qty
        channel.revenue += billRevenue
        channelMap.set(channelName, channel)
        lines.forEach((line) => {
          const productName = line.productName
          const current = productMap.get(productName) ?? { cogs: 0, gp: 0, productName, qty: 0, revenue: 0 }
          current.cogs += line.cogs
          current.gp += line.gp
          current.qty += line.qty
          current.revenue += line.lineAmount
          productMap.set(productName, current)
        })
      })
      const detailTotals = detailBills.reduce((sum, bill) => {
        const lineTotals = billLineTotals(bill.id)
        const revenue = lineTotals.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        const received = receivedByBill.get(bill.id) ?? toNumber(bill.received_amount)
        const receivable = Math.max(0, toNumber(bill.receivable_balance) || toNumber(bill.total_amount) - received)
        const cogs = toNumber(bill.cogs_amount ?? bill.total_cost)
        const gp = toNumber(bill.gross_profit) || revenue - cogs
        const aging = computeFinancialDueAging({
          asOfDate,
          creditTermDays: bill.credit_term ?? customers.find((customer) => customer.id === detailCustomer.id)?.credit_term ?? 0,
          documentDate: bill.date,
          dueDate: bill.due_date,
        })
        if (receivable > 0) addToFinancialAgingBucketTotals(sum.agingBuckets, aging.ageBucket, receivable)
        return {
          agingBuckets: sum.agingBuckets,
          gp: sum.gp + gp,
          lowMarginBillCount: sum.lowMarginBillCount + (revenue > 0 && gp / revenue < 0.05 ? 1 : 0),
          negativeMarginBillCount: sum.negativeMarginBillCount + (gp < 0 ? 1 : 0),
          oldestArAgeDays: receivable > 0 ? Math.max(sum.oldestArAgeDays, aging.ageDays) : sum.oldestArAgeDays,
          overdueArAmount: sum.overdueArAmount + (receivable > 0 && aging.ageDays > 0 ? receivable : 0),
          overdueArBillCount: sum.overdueArBillCount + (receivable > 0 && aging.ageDays > 0 ? 1 : 0),
          pendingArBillCount: sum.pendingArBillCount + (receivable > 0 ? 1 : 0),
          receivable: sum.receivable + receivable,
          revenue: sum.revenue + revenue,
        }
      }, { agingBuckets: emptyFinancialAgingBucketTotals(), gp: 0, lowMarginBillCount: 0, negativeMarginBillCount: 0, oldestArAgeDays: 0, overdueArAmount: 0, overdueArBillCount: 0, pendingArBillCount: 0, receivable: 0, revenue: 0 })
      const detailCustomerMaster = customers.find((customer) => customer.id === detailCustomer.id)
      const detailCreditLimit = toNumber(detailCustomerMaster?.credit_limit)

      return {
        bills: detailBills.slice(0, 50).map((bill) => {
          const lineTotals = billLineTotals(bill.id)
          const revenue = lineTotals.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
          const received = receivedByBill.get(bill.id) ?? toNumber(bill.received_amount)
          const cogs = toNumber(bill.cogs_amount ?? bill.total_cost)
          const gp = toNumber(bill.gross_profit) || revenue - cogs
          const aging = computeFinancialDueAging({
            asOfDate,
            creditTermDays: bill.credit_term ?? detailCustomerMaster?.credit_term ?? 0,
            documentDate: bill.date,
            dueDate: bill.due_date,
          })
          return {
            ageBucket: aging.ageBucket,
            ageDays: aging.ageDays,
            cogs,
            channelName: bill.sales_channels?.name ?? '-',
            date: toDateOnly(bill.date),
            docNo: bill.doc_no,
            dueDate: aging.referenceDate,
            gp,
            href: `/sales/bills/${encodeURIComponent(bill.doc_no)}`,
            qty: lineTotals.qty,
            referenceDateType: aging.referenceDateType,
            receivable: Math.max(0, toNumber(bill.receivable_balance) || toNumber(bill.total_amount) - received),
            received,
            revenue,
            status: bill.status ?? '-',
          }
        }),
        channels: Array.from(channelMap.values()).map((row) => ({
          ...row,
          gpPct: row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0,
        })).sort((left, right) => right.revenue - left.revenue),
        customer: { code: detailCustomer.code, id: detailCustomer.code, name: detailCustomer.name },
        monthly: Array.from({ length: 12 }, (_, index) => {
          const monthKey = String(index + 1).padStart(2, '0')
          const monthBills = detailYearBills.filter((bill) => inYearMonth(bill.date, year, monthKey))
          const monthReceipts = detailYearReceipts.filter((receipt) => inYearMonth(receipt.date, year, monthKey))
          const receivedAmount = monthReceipts.reduce((sum, receipt) => sum + toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount), 0)
          return monthBills.reduce<{
            billCount: number
            gp: number
            month: string
            qty: number
            receivable: number
            receiptCount: number
            receivedAmount: number
            revenue: number
          }>((sum, bill) => {
            const lineTotals = billLineTotals(bill.id)
            const revenue = lineTotals.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
            const received = receivedByBill.get(bill.id) ?? toNumber(bill.received_amount)
            const cogs = toNumber(bill.cogs_amount ?? bill.total_cost)
            return {
              billCount: sum.billCount + 1,
              gp: sum.gp + (toNumber(bill.gross_profit) || revenue - cogs),
              month: monthKey,
              qty: sum.qty + lineTotals.qty,
              receivable: sum.receivable + Math.max(0, toNumber(bill.receivable_balance) || toNumber(bill.total_amount) - received),
              receiptCount: monthReceipts.length,
              receivedAmount,
              revenue: sum.revenue + revenue,
            }
          }, {
            billCount: 0,
            gp: 0,
            month: monthKey,
            qty: 0,
            receivable: 0,
            receiptCount: monthReceipts.length,
            receivedAmount,
            revenue: 0,
          })
        }),
        products: Array.from(productMap.values()).map((row) => ({
          ...row,
          avgSell: row.qty > 0 ? row.revenue / row.qty : 0,
          gpPct: row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0,
        })).sort((left, right) => right.revenue - left.revenue).slice(0, 30),
        receipts: detailReceipts.slice(0, 50).map((receipt) => ({
          amount: toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount),
          date: toDateOnly(receipt.date),
          docNo: receipt.doc_no,
          href: `/sales/receipts?tab=history&q=${encodeURIComponent(receipt.doc_no)}`,
          method: receipt.method ?? '-',
          netAmount: toNumber(receipt.net_amount),
          status: receipt.status ?? '-',
        })),
        signals: {
          agingBuckets: financialAgingBuckets.map((bucket) => ({ amount: detailTotals.agingBuckets[bucket].amount, bucket, count: detailTotals.agingBuckets[bucket].count })),
          creditLimit: detailCreditLimit,
          creditUtilizationPct: detailCreditLimit > 0 ? (detailTotals.receivable / detailCreditLimit) * 100 : 0,
          gpPct: detailTotals.revenue > 0 ? (detailTotals.gp / detailTotals.revenue) * 100 : 0,
          lowMarginBillCount: detailTotals.lowMarginBillCount,
          negativeMarginBillCount: detailTotals.negativeMarginBillCount,
          oldestArAgeDays: detailTotals.oldestArAgeDays,
          overdueArAmount: detailTotals.overdueArAmount,
          overdueArBillCount: detailTotals.overdueArBillCount,
          pendingArAmount: detailTotals.receivable,
          pendingArBillCount: detailTotals.pendingArBillCount,
        },
      }
    })() : null
    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows.map((row) => ({
        AvgSell: row.avgSell,
        Bills: row.billCount,
        COGS: row.cogs,
        Code: row.code,
        CreditLimit: row.creditLimit,
        Customer: row.customerName,
        GP: row.gp,
        GPPct: row.gpPct,
        LowMarginBills: row.lowMarginBillCount,
        NegativeMarginBills: row.negativeMarginBillCount,
        OverdueArAmount: row.overdueArAmount,
        OverdueArBills: row.overdueArBillCount,
        Qty: row.qty,
        Receivable: row.receivable,
        Received: row.receivedAmount,
        Revenue: row.revenue,
      }))), `tracking_customer_${year}${month ? `_${month}` : ''}.xlsx`)
    }

    return NextResponse.json({
      filters: {
        customers: visibleCustomers.map((customer) => {
          const code = requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)
          return { active: customer.active, code, id: code, name: customer.name }
        }),
        productCategories: productFilters.productCategories,
        products: productFilters.products,
      },
      detail,
      monthly,
      rows,
      summary: {
        cogs: rows.reduce((sum, row) => sum + row.cogs, 0),
        customers: rows.length,
        gp: rows.reduce((sum, row) => sum + row.gp, 0),
        qty: rows.reduce((sum, row) => sum + row.qty, 0),
        receivable: rows.reduce((sum, row) => sum + row.receivable, 0),
        receivedAmount: rows.reduce((sum, row) => sum + row.receivedAmount, 0),
        revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      },
      year,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Customer Tracking ไม่ได้', 500)
  }
}
