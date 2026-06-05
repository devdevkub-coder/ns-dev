import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'

type AccountReference = {
  accountNo: string | null
  code: string
  id: bigint
  name: string
  type: string
}

export async function findActiveAccountReferenceByCode(
  value: string | null | undefined,
): Promise<AccountReference | null> {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return null

  const account = await prisma.accounts.findFirst({
    select: { account_no: true, code: true, id: true, name: true, type: true },
    where: {
      active: true,
      code: normalized,
    },
  })

  if (!account) return null

  return {
    accountNo: account.account_no,
    code: requireBusinessCode(account.code, `บัญชีเงิน ${account.id}`),
    id: account.id,
    name: account.name,
    type: account.type,
  }
}
