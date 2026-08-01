import 'server-only'
import { requireSingleFinanceCurrencyPolicy, type FinanceCurrencyPolicy } from '@/lib/finance-currency-policy'
import { prisma } from '@/lib/server/prisma'

export async function getFinanceCurrencyPolicy() {
  const rows = await prisma.finance_currency_policies.findMany({
    select: {
      functional_currency_code: true,
    },
    take: 2,
  })

  return requireSingleFinanceCurrencyPolicy(rows.map((row): FinanceCurrencyPolicy => ({
    functionalCurrencyCode: row.functional_currency_code,
  })))
}
