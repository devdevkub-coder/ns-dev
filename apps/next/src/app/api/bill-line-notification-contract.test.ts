import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function handlerSource(relativePath: string, handler: 'PATCH' | 'POST') {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const handlerStart = source.indexOf(`export async function ${handler}`)

  expect(handlerStart).toBeGreaterThanOrEqual(0)
  return source.slice(handlerStart)
}

describe('bill edit LINE post-commit contract', () => {
  it('forces a fresh Purchase Bill notification after an edit is committed', () => {
    const source = handlerSource('./purchase/bills/route.ts', 'PATCH')
    const editStart = source.indexOf('const updatedBill = await prisma.$transaction')
    const responseStart = source.indexOf('return NextResponse.json({\n      docNo: updatedBill.doc_no', editStart)
    const notificationStart = source.indexOf("{ sourceType: 'purchase_bill', documentNo: updatedBill.doc_no }", editStart)
    const transactionEnd = source.lastIndexOf('}, { timeout: PURCHASE_BILL_WRITE_TRANSACTION_TIMEOUT_MS })', notificationStart)
    const postCommitSource = source.slice(transactionEnd, responseStart)

    expect(editStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(editStart)
    expect(notificationStart).toBeGreaterThan(transactionEnd)
    expect(responseStart).toBeGreaterThan(editStart)
    expect(postCommitSource).toContain("{ sourceType: 'purchase_bill', documentNo: updatedBill.doc_no }")
    expect(postCommitSource).toContain('{ requestedBy: actor, force: true }')
  })

  it('forces a fresh Sales Bill notification after an edit is committed', () => {
    const source = handlerSource('./sales/bills/route.ts', 'PATCH')
    const editStart = source.indexOf("if (raw?.action !== 'cancel')")
    const responseStart = source.indexOf("return NextResponse.json({ docNo: bill.doc_no, id: bill.doc_no, status: 'updated' })", editStart)
    const notificationStart = source.indexOf("{ sourceType: 'sales_bill', documentNo: bill.doc_no }", editStart)
    const transactionEnd = source.lastIndexOf('}, { timeout: 30000 })', notificationStart)
    const postCommitSource = source.slice(transactionEnd, responseStart)

    expect(editStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(editStart)
    expect(notificationStart).toBeGreaterThan(transactionEnd)
    expect(responseStart).toBeGreaterThan(editStart)
    expect(postCommitSource).toContain("{ sourceType: 'sales_bill', documentNo: bill.doc_no }")
    expect(postCommitSource).toContain('{ requestedBy: actor, force: true }')
  })
})

describe('LINE notification trigger contracts', () => {
  it('notifies a new Purchase Bill only after its write transaction closes', () => {
    const source = handlerSource('./purchase/bills/route.ts', 'POST')
    const transactionStart = source.indexOf('await prisma.$transaction(async (tx) =>')
    const notificationStart = source.indexOf("{ sourceType: 'purchase_bill', documentNo: bill.doc_no }", transactionStart)
    const transactionEnd = source.lastIndexOf('}, { timeout: PURCHASE_BILL_WRITE_TRANSACTION_TIMEOUT_MS })', notificationStart)

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(transactionStart)
    expect(notificationStart).toBeGreaterThan(transactionEnd)
  })

  it('notifies a new Sales Bill only after its write transaction closes', () => {
    const source = handlerSource('./sales/bills/route.ts', 'POST')
    const transactionStart = source.indexOf('const created = await prisma.$transaction')
    const notificationStart = source.indexOf("{ sourceType: 'sales_bill', documentNo: created.doc_no }", transactionStart)
    const transactionEnd = source.lastIndexOf('\n    })', notificationStart)

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(transactionStart)
    expect(notificationStart).toBeGreaterThan(transactionEnd)
  })

  it('notifies a Supplier Payment only after its write transaction closes', () => {
    const source = handlerSource('./purchase/payments/route.ts', 'POST')
    const transactionStart = source.indexOf('const result = await prisma.$transaction')
    const notificationStart = source.indexOf("{ sourceType: 'purchase_payment', documentNo: result.doc_no }", transactionStart)
    const transactionEnd = source.lastIndexOf('\n    })', notificationStart)

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(transactionStart)
    expect(notificationStart).toBeGreaterThan(transactionEnd)
  })

  it('selects the WTI/WTO auto-send flag after confirmation and executes every queued job', () => {
    const source = handlerSource('./daily/weight-tickets/[id]/route.ts', 'PATCH')
    const transactionStart = source.indexOf('const updated = await prisma.$transaction', source.indexOf('if (confirmParsed.success)'))
    const transactionEnd = source.indexOf('\n      const mapped = mapWeightTicketRow', transactionStart)
    const notificationStart = source.indexOf("const autoSendKey = mapped.type === 'WTI' ? 'LINE_AUTO_SEND_WTI' : 'LINE_AUTO_SEND_WTO'", transactionEnd)
    const notificationSource = source.slice(notificationStart, source.indexOf('\n      const [timeline', notificationStart))

    expect(transactionStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(transactionStart)
    expect(notificationStart).toBeGreaterThan(transactionEnd)
    expect(notificationSource).toContain('enqueueNotificationJob(mapped.documentNo')
    expect(notificationSource).toContain('executeNotificationJob(job.id, { force: false })')
  })

  it('keeps manual WTI/WTO share permission-scoped and explicitly force-sends', () => {
    const source = readFileSync(new URL('./daily/weight-tickets/[id]/notify-line/route.ts', import.meta.url), 'utf8')
      .replaceAll('\r\n', '\n')
    const permissionStart = source.indexOf("requirePermission(auth, 'daily.weight_tickets.share')")
    const scopeStart = source.indexOf('const scopedBranchIds = branchScopeIds(auth)', permissionStart)
    const enqueueStart = source.indexOf('const enqueueResult = await enqueueNotificationJob', scopeStart)

    expect(permissionStart).toBeGreaterThanOrEqual(0)
    expect(scopeStart).toBeGreaterThan(permissionStart)
    expect(enqueueStart).toBeGreaterThan(scopeStart)
    expect(source.slice(enqueueStart)).toContain('enqueueNotificationJob(ticket.doc_no')
    expect(source.slice(enqueueStart)).toContain('force: true')
  })
})
