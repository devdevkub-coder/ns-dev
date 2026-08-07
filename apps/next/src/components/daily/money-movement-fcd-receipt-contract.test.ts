import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MoneyMovementPageClient.tsx', import.meta.url), 'utf8')

describe('foreign customer receipt dependency reset contract', () => {
  it('reloads the exact rate lookup when a context input changes', () => {
    expect(source).toContain("const [foreignRateReloadNonce, setForeignRateReloadNonce] = useState(0)")
    expect(source).toContain('[foreignRateReloadNonce, form.id, formOpen, isForeignReceipt, mode, receiptCurrencyCode, receiptRateDate]')

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
      expect(handlerSource).toContain('fxRate: undefined')
      expect(handlerSource).toContain('splits: [newReceiptSplit()]')
    }
  })

  it('keeps source, account, fee and rate contracts separated by receipt currency', () => {
    expect(source).toContain("const isForeignReceipt = mode === 'receipt'")
    expect(source).toContain('receiptCurrencyCode !== functionalCurrencyCode')
    expect(source).toContain("receiptSourceType === 'SB'")
    expect(source).toContain("receiptSourceType === 'CADV'")
    expect(source).toContain("account.accountGroup === 'cash' || account.accountGroup === 'bank'")
    expect(source).toContain("account.accountGroup === 'bank'")
    expect(source).toContain("account.isFcd === true")
    expect(source).toContain('account.supportedCurrencies')
    expect(source).toContain('activeAccounts={isForeignReceipt ? foreignFcdAccounts : functionalReceiptAccounts}')
    expect(source).toContain("const foreignReceiptPaymentMethods = useMemo(() => paymentMethods.filter((method) => method.type === 'bank')")
    expect(source).toContain('netTargetLabel={isForeignReceipt ? `🎯 ยอดที่ลูกค้าโอน (${receiptCurrencyCode})`')
    expect(source).toContain('discountLabel={`ส่วนลด (${functionalCurrencyCode})`}')
    expect(source).toContain('feeLabel={`ค่าธรรมเนียมธนาคาร (${functionalCurrencyCode})`}')
    expect(source).toContain('กำไร FX จากการปิดบิล')
    expect(source).toContain('ยอดลูกหนี้ก่อนตัด')
    expect(source).toContain('ยอดเงินสดที่ต้องรับ')
    expect(source).toContain('ยอดลูกหนี้คงเหลือ')
    expect(source).toContain('`💰 ยอดที่บันทึกเข้า FCD (${receiptCurrencyCode})`')
    expect(source).toContain('มูลค่าตามบัญชี FCD ({functionalCurrencyCode})')
    expect(source).toContain("? 'รับบางส่วน'")
    expect(source).toContain('splitAmountHelper={isForeignReceipt ?')
    expect(source).toContain('equalSplitFieldWidths={isForeignReceipt}')
    expect(source).toContain('`≈ ${formatMoney(splitBookAmount)} ${functionalCurrencyCode}`')
    expect(source).toContain('calculateCustomerReceiptSettlement')
    expect(source).not.toContain('capReceiptLinesToSettlement')
    expect(source).toContain('const foreignReceiptAmount = isForeignReceipt ? roundMoney(receiptSplitTotal) : 0')
    expect(source).toContain('customerTransferredNativeAmount: isForeign ? transferredNativeAmount : undefined')
    expect(source).not.toContain("moneyInputValue('receipt-customer-transferred-native'")
    expect(source).not.toContain("value={receiptForm?.fxRateOverrideReason ?? ''}")
    expect(source).not.toContain('receipt-received-native')
    expect(source).toContain('ทุกบัญชีต้องเป็น FCD และรองรับ ${receiptCurrencyCode}')
    expect(source).toContain('calculationSummary={isForeignReceipt ?')
    expect(source).toContain("showDiscount={receiptSourceType === 'SB'}")
    expect(source).toContain('showReconciliationSummary={!isForeignReceipt}')
    expect(source).toContain("receiptSourceType === 'SB' ? <div className=\"rounded-md border border-slate-200 bg-slate-50/50 p-4\">")
  })

  it('uses the receipt rate API and server-side CADV guard instead of client-side fallback assumptions', () => {
    expect(source).toContain('/api/finance/foreign/live-fx-rate?${new URLSearchParams({')
    expect(source).toContain('currency: receiptCurrencyCode')
    expect(source).toContain('date: receiptRateDate')
    expect(source).not.toContain('rateType: receiptRateType')
    expect(source).toContain('Rate ล่าสุดจาก Google Finance')

    const receiptService = readFileSync(new URL('../../lib/server/customer-receipts.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(receiptService).toContain('function customerReceiptFxRate(value: number)')
    expect(receiptService).toContain('อัตราแลกเปลี่ยนต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง')
    expect(receiptService).toContain("settlementDifferenceReasonForReceipt('CADV', settlementBookAmount.minus(totalCadVSettlement))")
    expect(receiptService).toContain('settlement_difference_reason: settlementDifferenceReason')
    expect(receiptService).toContain('const carryingThbAmount = settlementBookAmount.minus(bankFeeTotal)')
    expect(receiptService).not.toContain('fxRateOverrideReason')
    expect(receiptService).toContain("paymentMethod.type !== 'bank'")
  })

  it('keeps history filters and all receipt print outputs on the THB book contract', () => {
    expect(source).toContain("const matchesReceiptCurrency = mode !== 'receipt' || !receiptCurrencyFilter || (row.foreignAudit?.currencyCode ?? functionalCurrencyCode) === receiptCurrencyFilter")
    expect(source).toContain("const matchesReceiptSource = mode !== 'receipt' || !receiptSourceFilter || row.sourceType === receiptSourceFilter")
    expect(source).toContain('const matchesAccount = matchesMoneyAccountFilter(row, accountFilter)')
    expect(source).toContain('const matchesBranch = !branchFilter || row.branchId === branchFilter')
    expect(source).toContain('function buildCustomerReceiptPrintHtml(row: MoneyRow, profile: CompanyProfilePrintValues)')
    expect(source).toContain('function buildBatchReceiptPrintHtml(entries: CustomerReceiptPrintEntry[]')
    expect(source).toContain('${buildForeignReceiptAuditPrintHtml(row)}')
    expect(source).toContain('function buildForeignReceiptAuditPrintHtml(row: MoneyRow)')
    expect(source).toContain('ยอดรับ (THB)')
    expect(source).toContain('ข้อมูลต่างประเทศ (audit)')
    expect(source).toContain('มูลค่าเงินรับ ณ วันรับเงิน (THB)')
    expect(source).toContain('เงินสดตัดลูกหนี้ (THB)')
    expect(source).toContain('ยอดตัดลูกหนี้ (THB)')
    expect(source).toContain('กำไร FX จากการปิดบิล (THB)')
    expect(source).toContain('Carrying (THB)')
  })

  it('renders SB and CADV foreign details without mixing their settlement labels', () => {
    expect(source).toContain("row.sourceType === 'SB' ? `")
    expect(source).toContain('เงินสดตัดลูกหนี้ (THB)')
    expect(source).toContain('กำไร FX จากการปิดบิล (THB)')
    expect(source).toContain("row.sourceType === 'CADV' ? 'รายการรับเงินล่วงหน้า Customer' : 'บิลขายที่รับเงิน'")

    const receiptService = readFileSync(new URL('../../lib/server/customer-receipts.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(receiptService).toContain("values.sourceType === 'CADV'\n      ? createForeignCustomerAdvanceReceiptInTransaction")
    expect(receiptService).toContain("replacementValues.sourceType === 'CADV'\n        ? createForeignCustomerAdvanceReceiptInTransaction")
    expect(receiptService).toContain("receiptCurrencyCode !== policy.functionalCurrencyCode")
  })
})
