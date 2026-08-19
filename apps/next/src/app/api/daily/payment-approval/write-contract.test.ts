import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')

describe('payment approval purchase bill write contract', () => {
  it('locks the purchase bill before reading the approval source', () => {
    const transactionStart = routeSource.indexOf('const result = await prisma.$transaction')
    const lockStart = routeSource.indexOf('await lockPurchaseBillWriteSources(tx', transactionStart)
    const billsReadStart = routeSource.indexOf('const bills = await tx.purchase_bills.findMany', transactionStart)

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(lockStart).toBeGreaterThan(transactionStart)
    expect(billsReadStart).toBeGreaterThan(lockStart)
    expect(routeSource).toContain('PurchaseBillWriteConflictError')
  })
})
