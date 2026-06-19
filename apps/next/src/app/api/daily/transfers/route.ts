import { NextResponse } from 'next/server'
import { stringifyBusinessValue } from '@/lib/business-code'
import { transferFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { bankStatementTransferRows, currentActor, listDailyAccounts, nextDailyDocNo, nextDailyDocNos, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type TransferWithAccounts = Prisma.transfersGetPayload<{
  include: {
    accounts_transfers_from_account_idToaccounts: true
    accounts_transfers_to_account_idToaccounts: true
  }
}>

async function findTransferByDocNo(
  client: Prisma.TransactionClient | typeof prisma,
  value: string,
  select?: Prisma.transfersSelect,
) {
  const transfersClient = client.transfers as typeof prisma.transfers
  return transfersClient.findFirst({
    select,
    where: { doc_no: value },
  })
}

function transferJson(row: TransferWithAccounts) {
  return {
    amount: toNumber(row.amount),
    byPerson: row.created_by ?? '',
    date: toDateOnly(row.date),
    docNo: row.doc_no,
    fee: toNumber(row.fee ?? row.bank_fee),
    fromAccountId: row.accounts_transfers_from_account_idToaccounts?.code ?? '',
    fromAccountName: row.accounts_transfers_from_account_idToaccounts?.name ?? '-',
    id: row.doc_no,
    notes: row.notes ?? '',
    status: row.status ?? 'active',
    toAccountId: row.accounts_transfers_to_account_idToaccounts?.code ?? '',
    toAccountName: row.accounts_transfers_to_account_idToaccounts?.name ?? '-',
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [accounts, rows] = await Promise.all([
      listDailyAccounts(),
      prisma.transfers.findMany({
        include: {
          accounts_transfers_from_account_idToaccounts: true,
          accounts_transfers_to_account_idToaccounts: true,
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
    ])

    return NextResponse.json({ accounts, rows: rows.map(transferJson) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการโอนเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = transferFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const [fromAccount, toAccount] = await Promise.all([
      findActiveAccountReferenceByCode(values.fromAccountId),
      findActiveAccountReferenceByCode(values.toAccountId),
    ])
    if (!fromAccount || !toAccount) {
      throw new Error('บัญชีต้นทางหรือปลายทางไม่ถูกต้อง')
    }

    const allAccounts = await listDailyAccounts()
    const fromAcc = allAccounts.find((a) => a.id === values.fromAccountId)
    if (fromAcc) {
      let oldAmountAndFee = 0
      if (values.id) {
        const prevTransfer = await prisma.transfers.findFirst({
          select: { amount: true, fee: true, bank_fee: true },
          where: { doc_no: values.id },
        })
        if (prevTransfer) {
          oldAmountAndFee = toNumber(prevTransfer.amount) + toNumber(prevTransfer.fee ?? prevTransfer.bank_fee)
        }
      }
      const transferCost = values.amount + values.fee
      const available = (fromAcc.balance ?? 0) + oldAmountAndFee + (fromAcc.subtype === 'current' ? (fromAcc.odLimit ?? 0) : 0)
      if (transferCost > available + 0.01) {
        throw new Error('ยอดจ่ายเกินยอดเงินคงเหลือและวงเงิน OD ที่ใช้ได้ กรุณาลดจำนวนหรือเพิ่มบัญชีจ่าย')
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingTransfer = values.id
        ? await findTransferByDocNo(tx, values.id, {
            doc_no: true,
            id: true,
            status: true,
          })
        : null
      if (values.id && !existingTransfer) {
        throw new Error('ไม่พบรายการโอนเงิน')
      }
      const docNo = values.docNo ?? existingTransfer?.doc_no ?? await nextDailyDocNo('transfers', 'TRF', values.date, tx)
      const transfer = existingTransfer
        ? await tx.transfers.update({
            where: { id: existingTransfer.id },
            data: {
              amount: values.amount,
              bank_fee: values.fee,
              date: normalizeDate(values.date),
              doc_no: docNo,
              fee: values.fee,
              from_account_id: fromAccount.id,
              notes: values.notes,
              to_account_id: toAccount.id,
              updated_at: new Date(),
              updated_by: actor,
            },
          })
        : await tx.transfers.create({
            data: {
              amount: values.amount,
              bank_fee: values.fee,
              created_by: actor,
              date: normalizeDate(values.date),
              doc_no: docNo,
              fee: values.fee,
              from_account_id: fromAccount.id,
              notes: values.notes,
              status: 'active',
              to_account_id: toAccount.id,
              updated_at: new Date(),
              updated_by: actor,
            },
          })

      await tx.bank_statement.deleteMany({
        where: {
          ref_id: transfer.id.toString(),
          ref_type: 'TRF',
        },
      })
      const statementDocNos = await nextDailyDocNos('bank_statement', 'BST', values.date, 2, tx)
      await tx.bank_statement.createMany({
        data: bankStatementTransferRows({
          amount: values.amount,
          by: actor,
          date: values.date,
          docNo,
          entryDocNos: [statementDocNos[0]!, statementDocNos[1]!],
          fee: values.fee,
          fromAccountId: stringifyBusinessValue(fromAccount.id),
          fromAccountName: fromAccount.name,
          id: transfer.id.toString(),
          toAccountId: stringifyBusinessValue(toAccount.id),
          toAccountName: toAccount.name,
        }),
      })

      return transfer
    })

    return NextResponse.json({ id: result.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการโอนเงินไม่ได้', 400)
  }
}
