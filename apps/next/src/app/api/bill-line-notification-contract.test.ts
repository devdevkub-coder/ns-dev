import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function patchHandlerSource(relativePath: string) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const patchStart = source.indexOf('export async function PATCH')

  expect(patchStart).toBeGreaterThanOrEqual(0)
  return source.slice(patchStart)
}

describe('bill edit LINE post-commit contract', () => {
  it('forces a fresh Purchase Bill notification after an edit is committed', () => {
    const source = patchHandlerSource('./purchase/bills/route.ts')
    const editStart = source.indexOf('const updatedBill = await prisma.$transaction')
    const responseStart = source.indexOf('return NextResponse.json({\n      docNo: updatedBill.doc_no', editStart)
    const notificationStart = source.indexOf("{ sourceType: 'purchase_bill', documentNo: updatedBill.doc_no }", editStart)
    const transactionEnd = source.lastIndexOf('\n    })', notificationStart)
    const postCommitSource = source.slice(transactionEnd, responseStart)

    expect(editStart).toBeGreaterThanOrEqual(0)
    expect(transactionEnd).toBeGreaterThan(editStart)
    expect(notificationStart).toBeGreaterThan(transactionEnd)
    expect(responseStart).toBeGreaterThan(editStart)
    expect(postCommitSource).toContain("{ sourceType: 'purchase_bill', documentNo: updatedBill.doc_no }")
    expect(postCommitSource).toContain('{ requestedBy: actor, force: true }')
  })

  it('forces a fresh Sales Bill notification after an edit is committed', () => {
    const source = patchHandlerSource('./sales/bills/route.ts')
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
