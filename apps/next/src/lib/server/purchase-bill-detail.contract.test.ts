import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detailSource = readFileSync(new URL('./purchase-bill-detail.ts', import.meta.url), 'utf8')
const paymentRouteSource = readFileSync(new URL('../../app/api/purchase/payments/route.ts', import.meta.url), 'utf8')

describe('purchase bill payment timeline contract', () => {
  it('shows PMT date and every paying company account', () => {
    expect(paymentRouteSource).toContain('const paymentAccountsForLog = paymentSplits.map')
    expect(paymentRouteSource).toContain('paymentAccounts: paymentAccountsForLog')
    expect(detailSource).toContain('prisma.payment_allocations.findMany')
    expect(detailSource).toContain('prisma.payment_account_splits.findMany')
    expect(detailSource).toContain('paymentApprovalIds')
    expect(detailSource).toContain('วันที่จ่ายตามเอกสาร PMT')
    expect(detailSource).toContain('ธนาคารบริษัทที่จ่ายออก')
    expect(detailSource).toContain('เลขที่บัญชีบริษัทที่จ่ายออก')
  })
})
