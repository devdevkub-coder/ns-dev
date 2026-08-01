import { describe, expect, it } from 'vitest'

import { isBlankSupplierBankAccount } from '../master-data/suppliers/SuppliersPageClient'
import { isBlankPoSellItem } from '../sales/PoSellPageClient'
import { isBlankCustomerAdvanceLine } from './CustomerAdvanceForm'
import { isBlankPoBuyItem } from './PoBuyPageClient'

describe('purchase and sales local-row removal safety', () => {
  it('treats only an untouched customer-advance line as blank', () => {
    const blankLine = { grossWeight: '', netWeight: '', productId: '', quantity: '' }

    expect(isBlankCustomerAdvanceLine(blankLine)).toBe(true)
    expect(isBlankCustomerAdvanceLine({ ...blankLine, productId: 'PRODUCT-001' })).toBe(false)
    expect(isBlankCustomerAdvanceLine({ ...blankLine, quantity: '1' })).toBe(false)
    expect(isBlankCustomerAdvanceLine({ ...blankLine, grossWeight: '100' })).toBe(false)
    expect(isBlankCustomerAdvanceLine({ ...blankLine, netWeight: '95' })).toBe(false)
  })

  it('treats only a product-less zero-value PO Buy item as blank', () => {
    const blankItem = { productId: '', qty: 0, unitPrice: 0 }

    expect(isBlankPoBuyItem(blankItem)).toBe(true)
    expect(isBlankPoBuyItem({ ...blankItem, productId: 'PRODUCT-001' })).toBe(false)
    expect(isBlankPoBuyItem({ ...blankItem, qty: 1 })).toBe(false)
    expect(isBlankPoBuyItem({ ...blankItem, unitPrice: 25 })).toBe(false)
  })

  it('detects product, quantity, price, discount, and note data in a PO Sell item', () => {
    const blankItem = { discount: 0, note: null, price: 0, productId: '', qty: 0 }

    expect(isBlankPoSellItem(blankItem)).toBe(true)
    expect(isBlankPoSellItem({ ...blankItem, productId: 'PRODUCT-001' })).toBe(false)
    expect(isBlankPoSellItem({ ...blankItem, qty: 1 })).toBe(false)
    expect(isBlankPoSellItem({ ...blankItem, price: 25 })).toBe(false)
    expect(isBlankPoSellItem({ ...blankItem, discount: 5 })).toBe(false)
    expect(isBlankPoSellItem({ ...blankItem, note: 'ส่งช่วงเช้า' })).toBe(false)
  })

  it('only treats a newly-added bank draft with no bank fields as blank', () => {
    const blankAccount = {
      accountNo: null,
      bankAccount: null,
      bankName: null,
      branchCode: null,
      id: null,
      paymentMethod: '',
    }

    expect(isBlankSupplierBankAccount(blankAccount)).toBe(true)
    expect(isBlankSupplierBankAccount({ ...blankAccount, id: 'ACCOUNT-001' })).toBe(false)
    expect(isBlankSupplierBankAccount({ ...blankAccount, paymentMethod: 'โอนเงิน' })).toBe(false)
    expect(isBlankSupplierBankAccount({ ...blankAccount, bankName: 'ธนาคารกรุงไทย' })).toBe(false)
    expect(isBlankSupplierBankAccount({ ...blankAccount, accountNo: '1234567890' })).toBe(false)
    expect(isBlankSupplierBankAccount({ ...blankAccount, bankAccount: 'บริษัท เอ็นเอส จำกัด' })).toBe(false)
    expect(isBlankSupplierBankAccount({ ...blankAccount, branchCode: '0001' })).toBe(false)
  })
})
