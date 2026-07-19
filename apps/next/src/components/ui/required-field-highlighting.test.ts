import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { poSellFormSchema, poSellPageFormSchema } from '../../lib/sales'

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

describe('required manual-entry field highlighting contract', () => {
  it('keeps required manual fields yellow while excluding automatic, readonly, disabled, and invalid fields', () => {
    const css = source('../../app/globals.css')

    expect(css).toContain('--ns-manual-required-bg: #fff7cc')
    expect(css).toContain('--ns-field-invalid-bg: #fef2f2')
    expect(css).toContain('[data-manual-required="true"]')
    expect(css).toContain(':required:not(:disabled):not([readonly])')
    expect(css).toContain(':not([aria-invalid="true"])')
    expect(css).toContain(':not([data-auto-filled="true"])')
    expect(css).toContain('Required manual fields must stay yellow while focused')
    expect(css).toContain('Validation errors override required yellow with a red field surface')
    expect(css).toContain('[aria-invalid="true"]:not(:disabled):not([readonly])')
    expect(css).not.toContain(':where([data-manual-required="true"]):not([data-field-invalid="true"])')
  })

  it('marks the shared searchable, branch, and select field families from their required labels', () => {
    const searchCombobox = source('./SearchCombobox.tsx')
    const select = source('./Select.tsx')
    const branchSelect = source('./BranchSelectCombobox.tsx')

    expect(searchCombobox).toContain("data-manual-required={hasInlineRequired ? 'true' : undefined}")
    expect(searchCombobox).toContain('aria-label={hideLabel ? labelText : undefined}')
    expect(searchCombobox).toContain('const fieldInvalid = Boolean(error && !disabled)')
    expect(searchCombobox).not.toContain('focus-visible:!border-red-500')
    expect(select).toContain("const fieldInvalid = !disabled && ariaInvalid !== undefined && ariaInvalid !== false && ariaInvalid !== 'false'")
    expect(select).not.toContain('focus-visible:!border-red-500')
    expect(source('./BranchSelectCombobox.tsx')).toContain("data-manual-required={hasInlineRequired ? 'true' : undefined}")
    expect(branchSelect).toContain('data-manual-entry-readonly="true"')
    expect(branchSelect).toContain('const fieldInvalid = Boolean(error && !disabled)')
    expect(source('./FormSelectField.tsx')).toContain("data-manual-required={required || hasInlineRequired ? 'true' : undefined}")
  })

  it('checks the editable descendant for composite fields and supports required action groups', () => {
    const css = source('../../app/globals.css')
    const weightTicketForm = source('../daily/WeightTicketFormCore.tsx')

    expect(css).toContain(':where([role="combobox"])[aria-required="true"]')
    expect(css).toContain(':where([data-manual-required="true"]) :where([data-slot="input-group"]):has(input:not(:disabled):not([readonly])')
    expect(css).toContain(':where([data-required-group="true"])[data-manual-required="true"]:not([data-field-invalid="true"])')
    expect(css).toContain('input[data-manual-entry-readonly="true"][readonly]:not(:disabled)')
    expect(weightTicketForm).toMatch(/<ComboboxInput[\s\S]*?data-manual-entry-readonly="true"[\s\S]*?readOnly/)
  })

  it('marks every manual required input in the PO Buy form', () => {
    const poBuy = source('../purchase-flow/PoBuyPageClient.tsx')

    expect(poBuy).toMatch(/<UiSelect[\s\S]*?required[\s\S]*?value=\{form\.branchId\}/)
    expect(poBuy).toContain('label="ผู้ขาย *"')
    expect(poBuy).toMatch(/<DatePickerInput[\s\S]*?required[\s\S]*?value=\{form\.expectedDelivery\}/)
    expect(poBuy).toContain('label="สินค้า *"')
    expect(poBuy).toMatch(/<QuantityPatternInput[\s\S]*?required/)
    expect(poBuy).toMatch(/<MoneyPatternInput[\s\S]*?required/)
  })

  it('keeps the mirrored PO Sell required inputs on the same contract', () => {
    const poSell = source('../sales/PoSellPageClient.tsx')
    const salesSchema = source('../../lib/sales.ts')

    expect(poSell).toMatch(/<UiSelect[\s\S]*?required[\s\S]*?value=\{form\.branchId/)
    expect(poSell).toContain('label="Customer *"')
    expect(poSell).toMatch(/<DatePickerInput[\s\S]*?required[\s\S]*?value=\{form\.expectedDelivery\}/)
    expect(poSell).toContain('label="สินค้า *"')
    expect(poSell).toMatch(/<DecimalPatternInput[\s\S]*?required[\s\S]*?value=\{item\.qty\}/)
    expect(poSell).toMatch(/<DecimalPatternInput[\s\S]*?formatOnBlur[\s\S]*?required[\s\S]*?value=\{item\.price\}/)
    expect(poSell).toContain('<option disabled value="">เลือกสาขา/คลัง</option>')
    expect(poSell).toContain("issue.path.join('.')")
    expect(salesSchema).toContain('export const poSellPageFormSchema')
  })

  it('rejects a PO Sell without the required document branch', () => {
    const validPoSell = {
      branchId: '01',
      channelId: null,
      customerId: 'CUS01',
      expectedDelivery: '2026-07-19',
      hasVat: false,
      items: [{ discount: 0, price: 1, productId: 'P001', qty: 1 }],
      note: null,
      salesPlanId: null,
    }

    expect(poSellFormSchema.safeParse({ ...validPoSell, branchId: '' }).success).toBe(true)
    expect(poSellPageFormSchema.safeParse(validPoSell).success).toBe(true)
    expect(poSellPageFormSchema.safeParse({ ...validPoSell, branchId: '' }).success).toBe(false)
  })

  it('covers the confirmed shared and conditional form gaps from the whole-app audit', () => {
    const masterData = source('../master-data/shared/MasterDataPageClient.tsx')
    const companyProfile = source('../../app/admin/company-profile/CompanyProfilePageClient.tsx')
    const dailyTransfer = source('../daily/DailyTransferPageClient.tsx')
    const customerAdvance = source('../purchase-flow/CustomerAdvanceForm.tsx')
    const dailyExpense = source('../daily/DailyExpensePageClient.tsx')
    const lineSettings = source('../../app/admin/line-settings/LineSettingsPageClient.tsx')
    const moneyMovement = source('../daily/MoneyMovementPageClient.tsx')
    const costAllocator = source('../dual-costing/CostAllocatorPageClient.tsx')
    const receiptVouchers = source('../daily/ReceiptVouchersPageClient.tsx')
    const weightTicketDetail = source('../daily/WeightTicketDetailPageClient.tsx')
    const weightTicketList = source('../daily/WeightTicketListPageClient.tsx')

    expect(masterData).toContain('required={field.required}')
    expect(companyProfile).toMatch(/<textarea[\s\S]*?required[\s\S]*?value=\{form\.address\}/)
    expect(companyProfile).toMatch(/<PhoneInput[\s\S]*?required[\s\S]*?value=\{form\.phone\}/)
    expect(dailyTransfer).toContain('required={props.required}')
    expect(dailyTransfer).toContain('<option disabled value="">เลือก{props.label}</option>')
    expect(customerAdvance).toMatch(/aria-label="จำนวน"[\s\S]*?required[\s\S]*?value=\{line\.quantity\}/)
    expect(dailyExpense).toContain('<MoneyInputControl error={amountError} required')
    expect(dailyExpense).toMatch(/aria-invalid=\{Boolean\(fieldErrors\.supplierPaymentDestinationId\)\}[\s\S]*?disabled=\{!form\.supplierId\}[\s\S]*?required/)
    expect(dailyExpense).toMatch(/<option disabled value="">\{form\.supplierId/)
    expect(dailyExpense).toMatch(/<option disabled value="">\{paymentMethod/)
    expect(lineSettings).toContain('aria-labelledby="line-rule-document-types-label"')
    expect(lineSettings).toContain('data-manual-required="true"')
    expect(lineSettings).toContain('htmlFor="line-channel-access-token"')
    expect(lineSettings).toContain('id="line-channel-access-token"')
    expect(lineSettings).toContain('htmlFor="line-pdf-bucket"')
    expect(lineSettings).toContain('id="line-pdf-bucket"')
    expect(moneyMovement).toContain("useState<'approval' | 'payment' | 'receipt' | null>(null)")
    expect(costAllocator).toContain('<option disabled value="">{sourceType')
    expect(costAllocator).toContain('aria-invalid={Boolean(targetCostError)}')
    expect(receiptVouchers).toContain('const noteInvalid = Boolean(error && !note.trim())')
    expect(weightTicketDetail).toContain('aria-invalid={Boolean(cancelError && !cancelNote.trim())}')
    expect(weightTicketList).toContain('aria-invalid={Boolean(cancelError && !cancelNote.trim())}')
  })

  it('marks the five required authentication inputs', () => {
    const login = source('../../app/login/LoginPageClient.tsx')
    const forgot = source('../../app/forgot-password/ForgotPasswordPageClient.tsx')
    const reset = source('../../app/reset-password/ResetPasswordPageClient.tsx')

    expect(login.match(/\brequired\b/g)).toHaveLength(2)
    expect(forgot.match(/\brequired\b/g)).toHaveLength(1)
    expect(reset.match(/\brequired\b/g)).toHaveLength(2)
  })
})
