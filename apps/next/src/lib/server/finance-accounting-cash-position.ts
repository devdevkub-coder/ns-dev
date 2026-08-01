import { toBangkokEndOfDay, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts } from '@/lib/server/reference-master-cache'

type FinanceCashAccount = {
  accountGroup: string | null
  balance: number
  isFcd: boolean
  name: string
  odLimit: number
}

function accountKind(account: FinanceCashAccount): 'BANK' | 'CASH' | 'FCD' {
  if (account.accountGroup === 'cash') return 'CASH'
  if (account.accountGroup === 'bank' && account.isFcd) return 'FCD'
  if (account.accountGroup === 'bank') return 'BANK'
  throw new Error(`บัญชี ${account.name} ไม่มี account group ที่ใช้ใน Cash Position`)
}

export function summarizeFinanceCashAccounts(accounts: FinanceCashAccount[], fcdBalances: Array<{ currency: string; value: number }> = []) {
  const totals = { bankBalance: 0, cashBalance: 0, odLimit: 0, odUsed: 0 }

  for (const account of accounts) {
    const kind = accountKind(account)
    if (kind === 'CASH') totals.cashBalance += account.balance
    else if (account.odLimit > 0) {
      totals.bankBalance += Math.max(0, account.balance)
      totals.odLimit += account.odLimit
      totals.odUsed += Math.max(0, -account.balance)
    } else totals.bankBalance += account.balance
  }

  const balance = totals.cashBalance + totals.bankBalance
  return {
    ...totals,
    balance,
    cashAndBank: balance,
    // This is a native-currency audit projection only. It is deliberately not
    // included in cashAndBank, which is made solely from persisted book THB.
    fcdBalances: fcdBalances
      .filter((row) => row.value !== 0)
      .sort((left, right) => left.currency.localeCompare(right.currency, 'en')),
    odAvailable: Math.max(0, totals.odLimit - totals.odUsed),
  }
}

export async function buildFinanceCashPosition(input: { accountGroups?: Array<'bank' | 'cash' | 'fcd'>; asOf: Date; branchIds?: bigint[] | null }) {
  const cachedAccounts = await listActiveAccounts()
  const allowedBranchIds = input.branchIds == null ? null : new Set(input.branchIds.map((id) => id.toString()))
  const accounts = cachedAccounts
    .filter((account) => account.accountGroup === 'cash' || account.accountGroup === 'bank')
    .filter((account) => {
      if (!input.accountGroups?.length) return true
      return input.accountGroups.some((group) => (
        group === 'fcd' ? account.accountGroup === 'bank' && account.isFcd : account.accountGroup === group
      ))
    })
    .filter((account) => allowedBranchIds === null || (account.branchId != null && allowedBranchIds.has(account.branchId.toString())))
    .map((account) => ({
      accountGroup: account.accountGroup,
      accountNo: account.accountNo,
      bankName: account.bankName ?? account.bank,
      branchName: account.branchName,
      code: account.code,
      currency: account.currency,
      id: account.id,
      isFcd: account.isFcd,
      name: account.name,
      odLimit: account.odLimit == null ? 0 : Number(account.odLimit),
      supportedCurrencies: account.supportedCurrencies,
    }))
  if (accounts.length === 0) return { ...summarizeFinanceCashAccounts([]), accountBalances: [] }

  const asOf = toBangkokEndOfDay(input.asOf)
  const [movements, nativeFcdMovements] = await Promise.all([
    prisma.bank_statement.groupBy({
      by: ['account_id'],
      _sum: { amount_in: true, amount_out: true },
      where: {
        account_id: { in: accounts.map((account) => account.id) },
        date: { lte: asOf },
      },
    }),
    prisma.fcd_ledger_entries.groupBy({
      by: ['currency_code'],
      _sum: { native_amount_in: true, native_amount_out: true },
      where: {
        account_id: { in: accounts.filter((account) => account.isFcd).map((account) => account.id) },
        entry_date: { lte: asOf },
      },
    }),
  ])
  const movementByAccount = new Map(movements.map((row) => [
    row.account_id?.toString() ?? '',
    toNumber(row._sum.amount_in) - toNumber(row._sum.amount_out),
  ] as const))
  const fcdBalances = nativeFcdMovements.map((row) => ({
    currency: row.currency_code,
    value: toNumber(row._sum.native_amount_in) - toNumber(row._sum.native_amount_out),
  }))

  const accountBalances = accounts.map((account) => ({
    accountGroup: account.accountGroup,
    accountNo: account.accountNo,
    balance: movementByAccount.get(account.id.toString()) ?? 0,
    bankName: account.bankName,
    branchName: account.branchName,
    code: account.code,
    currency: account.currency,
    id: account.id.toString(),
    isFcd: account.isFcd,
    name: account.name,
    odLimit: account.odLimit,
    supportedCurrencies: account.supportedCurrencies,
  }))

  return {
    ...summarizeFinanceCashAccounts(
      accountBalances.map((account) => ({
      accountGroup: account.accountGroup,
      balance: account.balance,
      isFcd: account.isFcd,
      name: account.name,
      odLimit: account.odLimit,
      })),
      fcdBalances,
    ),
    accountBalances,
  }
}
