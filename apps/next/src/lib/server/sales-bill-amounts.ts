import { toNumber } from '@/lib/server/daily'

type MoneyValue = Parameters<typeof toNumber>[0]

/** Management-report sales revenue: after header discount and before VAT. */
export function salesBillRevenueAmount(bill: { total_amount: MoneyValue; vat_amount: MoneyValue }) {
  return toNumber(bill.total_amount) - toNumber(bill.vat_amount)
}

/** Gross profit on the same pre-VAT revenue basis as the management P&L. */
export function salesBillGrossProfitAmount(bill: { cogs_amount: MoneyValue; total_cost: MoneyValue; total_amount: MoneyValue; vat_amount: MoneyValue }) {
  return salesBillRevenueAmount(bill) - (toNumber(bill.cogs_amount) || toNumber(bill.total_cost))
}
