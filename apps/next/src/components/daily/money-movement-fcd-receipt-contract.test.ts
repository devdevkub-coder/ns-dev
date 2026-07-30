import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MoneyMovementPageClient.tsx', import.meta.url), 'utf8')

describe('foreign customer receipt dependency reset contract', () => {
  it('reloads the exact rate lookup when a context input changes', () => {
    expect(source).toContain("const [foreignRateReloadNonce, setForeignRateReloadNonce] = useState(0)")
    expect(source).toContain('[foreignRateReloadNonce, formOpen, isForeignReceipt, mode, receiptCurrencyCode, receiptRateDate, receiptRateType]')

    for (const handler of ['changeReceiptSourceType', 'changeReceiptCurrency', 'changeReceiptDate', 'changeReceiptBranch', 'changeReceiptCustomer', 'updateReceiptSplit']) {
      const handlerStart = source.indexOf(`function ${handler}`)
      expect(handlerStart).toBeGreaterThanOrEqual(0)
      const handlerSource = source.slice(handlerStart, source.indexOf('\n  function ', handlerStart + 1))
      expect(handlerSource).toContain('setFxRateLookup(null)')
      expect(handlerSource).toContain('setForeignRateReloadNonce((current) => current + 1)')
    }
  })

  it('clears foreign settlement data when branch or customer changes', () => {
    const branchStart = source.indexOf('function changeReceiptBranch')
    const customerStart = source.indexOf('function changeReceiptCustomer')
    const branchSource = source.slice(branchStart, source.indexOf('\n  function ', branchStart + 1))
    const customerSource = source.slice(customerStart, source.indexOf('\n  function ', customerStart + 1))

    for (const handlerSource of [branchSource, customerSource]) {
      expect(handlerSource).toContain("accountId: ''")
      expect(handlerSource).toContain('customerTransferredNativeAmount: undefined')
      expect(handlerSource).toContain('receivedNativeAmount: undefined')
      expect(handlerSource).toContain('fxRate: undefined')
      expect(handlerSource).toContain('fxRateOverrideReason: null')
      expect(handlerSource).toContain('splits: [newReceiptSplit()]')
    }
  })
})
