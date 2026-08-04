import type { Prisma } from '../../../generated/prisma/client'

type FcdLockClient = Pick<Prisma.TransactionClient, '$executeRaw'>

function normalizedCurrency(value: string) {
  const currency = value.trim().toUpperCase()
  if (!currency) throw new Error('ต้องระบุสกุลเงิน FCD สำหรับล็อกยอดคงเหลือ')
  return currency
}

/**
 * Serializes posting for one FCD account and currency until the enclosing
 * transaction completes. It must not be called outside a transaction.
 */
export async function lockFcdAccountCurrency(
  tx: FcdLockClient,
  accountId: bigint,
  currencyCode: string,
) {
  if (accountId <= 0n) throw new Error('บัญชี FCD สำหรับล็อกยอดคงเหลือไม่ถูกต้อง')
  const currency = normalizedCurrency(currencyCode)
  await tx.$executeRaw`
    select pg_advisory_xact_lock(
      hashtext('fcd-account-currency'),
      hashtext(${accountId.toString()} || ':' || ${currency})
    )
  `
}
