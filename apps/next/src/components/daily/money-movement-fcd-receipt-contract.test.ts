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

  it('keeps source, account, fee and rate contracts separated by receipt currency', () => {
    expect(source).toContain("const isForeignReceipt = mode === 'receipt'")
    expect(source).toContain('receiptCurrencyCode !== functionalCurrencyCode')
    expect(source).toContain("receiptSourceType === 'SB'")
    expect(source).toContain("receiptSourceType === 'CADV'")
    expect(source).toContain("account.isFcd === true")
    expect(source).toContain('account.supportedCurrencies')
    expect(source).toContain('foreignFcdAccountOptions')
    expect(source).toContain('Bank Fee ({functionalCurrencyCode})')
    expect(source).toContain('Settlement FX ({functionalCurrencyCode})')
    expect(source).toContain("value={receiptForm?.fxRateOverrideReason ?? ''}")
    expect(source).toContain('ทุกบัญชีต้องรองรับ {receiptCurrencyCode}; ยอดรวมต้องเท่ากับยอดเข้าบัญชี FCD จริง')
    expect(source).toContain("{receiptSourceType === 'SB' ? <div><span className=\"text-slate-500\">Settlement FX")
  })

  it('uses the receipt rate API and server-side CADV guard instead of client-side fallback assumptions', () => {
    expect(source).toContain('/api/sales/receipts/rate?${new URLSearchParams({')
    expect(source).toContain('currency: receiptCurrencyCode')
    expect(source).toContain('date: receiptRateDate')
    expect(source).toContain('rateType: receiptRateType')

    const receiptService = readFileSync(new URL('../../lib/server/customer-receipts.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(receiptService).toContain("settlementDifferenceReasonForReceipt('CADV', settlementBookAmount.minus(totalCadVSettlement))")
    expect(receiptService).toContain('settlement_difference_reason: settlementDifferenceReason')
    expect(receiptService).toContain("if (!rateWasSuggested && !values.fxRateOverrideReason?.trim()) throw new Error('กรุณาระบุเหตุผลเมื่อกรอกหรือแก้ไขอัตราแลกเปลี่ยน')")
  })

  it('keeps history filters and all receipt print outputs on the THB book contract', () => {
    expect(source).toContain("const matchesReceiptCurrency = mode !== 'receipt' || !receiptCurrencyFilter || (row.foreignAudit?.currencyCode ?? functionalCurrencyCode) === receiptCurrencyFilter")
    expect(source).toContain("const matchesReceiptSource = mode !== 'receipt' || !receiptSourceFilter || row.sourceType === receiptSourceFilter")
    expect(source).toContain('const matchesAccount = matchesMoneyAccountFilter(row, accountFilter)')
    expect(source).toContain('const matchesBranch = !branchFilter || row.branchId === branchFilter')
    expect(source).toContain('function buildCustomerReceiptPrintHtml(row: MoneyRow)')
    expect(source).toContain('function buildBatchReceiptPrintHtml(rows: MoneyRow[])')
    expect(source).toContain('${buildForeignReceiptAuditPrintHtml(row)}')
    expect(source).toContain('function buildForeignReceiptAuditPrintHtml(row: MoneyRow)')
    expect(source).toContain('ยอดรับ (THB)')
    expect(source).toContain('ข้อมูลต่างประเทศ (audit)')
    expect(source).toContain('Carrying (THB)')
  })

  it('renders SB and CADV foreign details without mixing their settlement labels', () => {
    expect(source).toContain("row.sourceType === 'CADV' ? 'ยอดตัด CADV (THB)' : 'ยอดตัด AR (THB)'")
    expect(source).toContain("...(row.sourceType === 'SB' ? [['Settlement FX (THB)'")
    expect(source).toContain("row.sourceType === 'CADV' ? 'รายการรับเงินล่วงหน้า Customer' : 'บิลขายที่รับเงิน'")

    const receiptService = readFileSync(new URL('../../lib/server/customer-receipts.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(receiptService).toContain("values.sourceType === 'CADV'\n      ? createForeignCustomerAdvanceReceiptInTransaction")
    expect(receiptService).toContain("replacementValues.sourceType === 'CADV'\n        ? createForeignCustomerAdvanceReceiptInTransaction")
    expect(receiptService).toContain("receiptCurrencyCode !== policy.functionalCurrencyCode")
  })
})
