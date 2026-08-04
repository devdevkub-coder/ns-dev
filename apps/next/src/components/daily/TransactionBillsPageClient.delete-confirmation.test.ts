import { describe, expect, it } from 'vitest'

import {
  requestDraftSourceChange,
  requestLocalRowRemoval,
  shouldConfirmPurchaseBillSourceChange,
  shouldConfirmPurchaseBillItemRemoval,
  shouldConfirmPurchaseStockReceiptClear,
  shouldConfirmPurchaseStockAllocationRemoval,
  shouldConfirmSalesBillSourceChange,
  shouldConfirmSalesBillItemRemoval,
  shouldConfirmSalesStockAllocationRemoval,
  shouldConfirmTradingPurchaseSelectorRemoval,
  type PurchaseBillDeletionLine,
  type PurchaseBillSourceResetDraft,
  type PurchaseStockAllocationDeletionLine,
  type SalesBillDeletionLine,
  type SalesBillSourceResetDraft,
  type SalesStockAllocationDeletionLine,
} from './TransactionBillsPageClient'
import type { FormSafetyConfirmation } from '@/components/ui/FormSafetyProvider'

function purchaseLine(overrides: Partial<PurchaseBillDeletionLine> = {}): PurchaseBillDeletionLine {
  return {
    deductWeight: 0,
    discount: 0,
    displayName: null,
    grossWeight: 0,
    lotNo: null,
    note: null,
    poBuyId: null,
    price: 0,
    productId: '',
    qty: 0,
    salesPrice: 0,
    ...overrides,
  }
}

function purchaseStockAllocationLine(
  overrides: Partial<PurchaseStockAllocationDeletionLine> = {},
): PurchaseStockAllocationDeletionLine {
  return {
    discount: 0,
    note: null,
    poBuyId: null,
    price: 0,
    qty: 0,
    salesPrice: 0,
    ...overrides,
  }
}

function salesLine(overrides: Partial<SalesBillDeletionLine> = {}): SalesBillDeletionLine {
  return {
    deductWeight: 0,
    discount: 0,
    grossWeight: 0,
    netWeight: 0,
    note: null,
    poSellId: null,
    price: 0,
    productId: '',
    qty: 0,
    tradingCostSourceId: null,
    ...overrides,
  }
}

function salesStockAllocationLine(
  overrides: Partial<SalesStockAllocationDeletionLine> = {},
): SalesStockAllocationDeletionLine {
  return {
    deductWeight: 0,
    discount: 0,
    netWeight: 0,
    note: null,
    poSellId: null,
    price: 0,
    qty: 0,
    ...overrides,
  }
}

function purchaseSourceDraft(overrides: Partial<PurchaseBillSourceResetDraft> = {}): PurchaseBillSourceResetDraft {
  return {
    discountTotal: 0,
    hasVat: false,
    items: [],
    note: null,
    notes: null,
    receiptTicketId: null,
    transactionMode: 'STOCK',
    vatInvoiceDate: null,
    vatInvoiceNo: null,
    vatInvoiceReceived: false,
    vatType: 'NONE',
    ...overrides,
  }
}

function salesSourceDraft(overrides: Partial<SalesBillSourceResetDraft> = {}): SalesBillSourceResetDraft {
  return {
    branchId: '',
    customerId: '',
    deliveryTicketId: null,
    discountTotal: 0,
    items: [],
    note: null,
    transactionMode: 'STOCK',
    ...overrides,
  }
}

describe('TransactionBillsPageClient local deletion confirmation', () => {
  it('keeps a populated row until the destructive confirmation is accepted', async () => {
    const holder: { confirmation: FormSafetyConfirmation | null } = { confirmation: null }
    let removed = false

    requestLocalRowRemoval(
      true,
      (nextConfirmation) => { holder.confirmation = nextConfirmation },
      {
        cancelLabel: 'ไม่ลบ',
        confirmLabel: 'ลบรายการ',
        description: 'รายการสินค้าที่กรอกไว้จะถูกลบออกจากร่างบิลรับซื้อ',
        destructive: true,
        title: 'ยืนยันการลบรายการสินค้าบิลรับซื้อ',
      },
      () => { removed = true },
    )

    expect(removed).toBe(false)
    if (!holder.confirmation) throw new Error('Expected a deletion confirmation')
    expect(holder.confirmation.title).toBe('ยืนยันการลบรายการสินค้าบิลรับซื้อ')
    await holder.confirmation.onConfirm()
    expect(removed).toBe(true)
  })

  it('removes a blank purchase row immediately but confirms after a business value is entered', () => {
    expect(shouldConfirmPurchaseBillItemRemoval(purchaseLine())).toBe(false)
    expect(shouldConfirmPurchaseBillItemRemoval(purchaseLine({ productId: 'PRODUCT-001' }))).toBe(true)
    expect(shouldConfirmPurchaseBillItemRemoval(purchaseLine({ displayName: 'เศษเหล็กพิเศษ' }))).toBe(true)
    expect(shouldConfirmPurchaseBillItemRemoval(purchaseLine({ grossWeight: 25 }))).toBe(true)
  })

  it('does not count inherited WTI data as entered on a new allocation row', () => {
    expect(shouldConfirmPurchaseStockAllocationRemoval(purchaseStockAllocationLine())).toBe(false)
    expect(shouldConfirmPurchaseStockAllocationRemoval(purchaseStockAllocationLine({ poBuyId: 'POB-001' }))).toBe(true)
    expect(shouldConfirmPurchaseStockAllocationRemoval(purchaseStockAllocationLine({ qty: 25 }))).toBe(true)
  })

  it('confirms a selected Trading purchase source because it cascades to its generated sales rows', () => {
    expect(shouldConfirmTradingPurchaseSelectorRemoval('')).toBe(false)
    expect(shouldConfirmTradingPurchaseSelectorRemoval('PB-TRADING-001')).toBe(true)
  })

  it('removes blank sales rows immediately but confirms populated manual and WTO allocation rows', () => {
    expect(shouldConfirmSalesBillItemRemoval(salesLine())).toBe(false)
    expect(shouldConfirmSalesBillItemRemoval(salesLine({ tradingCostSourceId: 'PB:PB-001:1' }))).toBe(true)
    expect(shouldConfirmSalesBillItemRemoval(salesLine({ productId: 'PRODUCT-001' }))).toBe(true)
    expect(shouldConfirmSalesStockAllocationRemoval(salesStockAllocationLine())).toBe(false)
    expect(shouldConfirmSalesStockAllocationRemoval(salesStockAllocationLine({ netWeight: 15 }))).toBe(true)
    expect(shouldConfirmSalesStockAllocationRemoval(salesStockAllocationLine({ poSellId: 'POS-001' }))).toBe(true)
  })

  it('keeps a selected purchase receipt and its derived draft data until clearing is confirmed', async () => {
    const draft = purchaseSourceDraft({
      items: [{ ...purchaseLine(), receiptTicketId: 'WTI-001' } as PurchaseBillSourceResetDraft['items'][number]],
      receiptTicketId: 'WTI-001',
    })

    expect(shouldConfirmPurchaseStockReceiptClear(draft)).toBe(true)
    expect(shouldConfirmPurchaseBillSourceChange(draft, 'transactionMode', 'TRADING')).toBe(true)
    expect(shouldConfirmPurchaseBillSourceChange(draft, 'receiptTicketId', null)).toBe(true)
    expect(shouldConfirmPurchaseBillSourceChange(purchaseSourceDraft(), 'transactionMode', 'TRADING')).toBe(false)

    const holder: { confirmation: FormSafetyConfirmation | null } = { confirmation: null }
    let applied = 0
    requestDraftSourceChange(true, (confirmation) => { holder.confirmation = confirmation }, {
      cancelLabel: 'คงค่าเดิม',
      confirmLabel: 'ล้างใบรับของ',
      description: 'รายการจากใบรับของจะถูกล้าง',
      destructive: true,
      title: 'ยืนยันการล้างใบรับของ',
    }, () => { applied += 1 })

    expect(applied).toBe(0)
    if (!holder.confirmation) throw new Error('Expected a source-change confirmation')
    await holder.confirmation.onConfirm()
    expect(applied).toBe(1)
  })

  it('confirms sales source changes only when they would replace populated rows or related draft values', () => {
    const populatedDraft = salesSourceDraft({
      deliveryTicketId: 'WTO-001',
      items: [{ ...salesLine(), deliveryTicketId: 'WTO-001' } as SalesBillSourceResetDraft['items'][number]],
      note: 'ส่งพร้อมเอกสาร',
    })

    expect(shouldConfirmSalesBillSourceChange(populatedDraft, 'deliveryTicketId', 'WTO-002')).toBe(true)
    expect(shouldConfirmSalesBillSourceChange(populatedDraft, 'transactionMode', 'TRADING')).toBe(true)
    expect(shouldConfirmSalesBillSourceChange(populatedDraft, 'customerId', 'CUSTOMER-002')).toBe(true)
    expect(shouldConfirmSalesBillSourceChange(populatedDraft, 'customerId', '')).toBe(false)
    expect(shouldConfirmSalesBillSourceChange(salesSourceDraft(), 'transactionMode', 'TRADING')).toBe(false)
    expect(shouldConfirmSalesBillSourceChange(salesSourceDraft(), 'deliveryTicketId', 'WTO-001')).toBe(false)
  })
})
