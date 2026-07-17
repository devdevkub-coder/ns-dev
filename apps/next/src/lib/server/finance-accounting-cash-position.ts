import { toBangkokEndOfDay, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

type FinanceCashAccount = {
  balance: number
  bank: string | null
  bankName: string | null
  currency: string | null
  name: string
  odLimit: number
  type: string
}

function accountKind(account: FinanceCashAccount): 'BANK' | 'CASH' | 'FCD' | 'OD' {
  const description = [account.type, account.name, account.bankName, account.bank].filter(Boolean).join(' ').toLowerCase()
  const currency = (account.currency ?? 'THB').trim().toUpperCase()
  if (currency !== 'THB' || description.includes('fcd') || description.includes('foreign')) return 'FCD'
  if (account.odLimit > 0 || description.includes('od')) return 'OD'
  if (description.includes('cash') || description.includes('เงินสด')) return 'CASH'
  return 'BANK'
}

export function summarizeFinanceCashAccounts(accounts: FinanceCashAccount[]) {
  const totals = { bankBalance: 0, cashBalance: 0, odLimit: 0, odUsed: 0 }
  const fcdByCurrency = new Map<string, number>()
  const unlabelledFcd: Array<{ currency: string; value: number }> = []

  for (const account of accounts) {
    const kind = accountKind(account)
    if (kind === 'FCD') {
      const currency = account.currency?.trim().toUpperCase()
      if (currency) fcdByCurrency.set(currency, (fcdByCurrency.get(currency) ?? 0) + account.balance)
      else unlabelledFcd.push({ currency: `ไม่ระบุสกุล (${account.name})`, value: account.balance })
    } else if (kind === 'OD') {
      totals.odLimit += account.odLimit
      if (account.balance < 0) totals.odUsed += Math.abs(account.balance)
      else totals.bankBalance += account.balance
    } else if (kind === 'CASH') {
      totals.cashBalance += account.balance
    } else {
      totals.bankBalance += account.balance
    }
  }

  const balance = totals.cashBalance + totals.bankBalance
  return {
    ...totals,
    balance,
    cashAndBank: balance,
    fcdBalances: [
      ...Array.from(fcdByCurrency, ([currency, value]) => ({ currency, value })),
      ...unlabelledFcd,
    ].filter((row) => row.value !== 0).sort((left, right) => left.currency.localeCompare(right.currency, 'en')),
    odAvailable: Math.max(0, totals.odLimit - totals.odUsed),
  }
}

export async function buildFinanceCashPosition(input: { asOf: Date; branchIds?: bigint[] | null }) {
  const accounts = await prisma.accounts.findMany({
    select: {
      bank: true,
      bank_name: true,
      currency: true,
      id: true,
      name: true,
      od_limit: true,
      opening_balance: true,
      type: true,
    },
    where: { active: true, ...(input.branchIds != null ? { branch_id: { in: input.branchIds } } : {}) },
  })
  if (accounts.length === 0) return summarizeFinanceCashAccounts([])

  const movements = await prisma.bank_statement.groupBy({
    by: ['account_id'],
    _sum: { amount_in: true, amount_out: true },
    where: {
      account_id: { in: accounts.map((account) => account.id) },
      date: { lte: toBangkokEndOfDay(input.asOf) },
    },
  })
  const movementByAccount = new Map(movements.map((row) => [
    row.account_id?.toString() ?? '',
    toNumber(row._sum.amount_in) - toNumber(row._sum.amount_out),
  ] as const))

  return summarizeFinanceCashAccounts(accounts.map((account) => {
    const base = {
      bank: account.bank,
      bankName: account.bank_name,
      currency: account.currency,
      name: account.name,
      odLimit: toNumber(account.od_limit),
      type: account.type,
    }
    const opening = toNumber(account.opening_balance)
    return {
      ...base,
      balance: opening + (accountKind({ ...base, balance: opening }) === 'FCD'
        ? 0
        : movementByAccount.get(account.id.toString()) ?? 0),
    }
  }))
}
