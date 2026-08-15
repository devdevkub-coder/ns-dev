import { describe, expect, it } from 'vitest'

import {
  requestWeightTicketSelectionChange,
  getWeightTicketRelatedLineIds,
  getWeightTicketVisibleRemoteChangedLineIds,
  removeImpurityPurchaseLinesForSource,
  removeWeightTicketLot,
  shouldConfirmWeightTicketBranchChange,
  shouldConfirmWeightTicketImpurityChange,
  shouldConfirmWeightTicketImpurityRemoval,
  shouldConfirmWeightTicketLotRemoval,
  shouldConfirmWeightTicketProductChange,
  shouldConfirmWeightTicketProductRemoval,
  isBlankAddedWeightTicketDraftLine,
  type WeightTicketDeletionLine,
} from './WeightTicketFormCore'

const DEFAULT_IMPURITY_NOTE = 'หักสิ่งเจือปนเพิ่มเติม'

function line(overrides: Partial<WeightTicketDeletionLine> = {}): WeightTicketDeletionLine {
  return {
    containerDeductionWeight: '',
    deductionMode: 'none',
    deductionValue: '',
    grossWeight: '',
    id: 'line',
    imageFiles: [],
    imageNames: [],
    impurityId: '',
    impurityProductId: '',
    impurityPurchaseAction: 'none',
    impuritySourceLineId: undefined,
    note: '',
    parentId: undefined,
    productId: '',
    warehouseId: '',
    ...overrides,
  }
}

describe('WeightTicketFormCore local deletion confirmation', () => {
  function expectGuardedChange(shouldConfirm: boolean) {
    let mutations = 0
    let pendingConfirm: (() => void) | undefined
    const originalState = { retained: true }
    let state = originalState
    requestWeightTicketSelectionChange(
      shouldConfirm,
      (request) => { pendingConfirm = request.onConfirm },
      {
        cancelLabel: 'ไม่เปลี่ยน',
        confirmLabel: 'ยืนยัน',
        description: 'ข้อมูลที่เกี่ยวข้องจะถูกล้าง',
        destructive: true,
        title: 'ยืนยันการเปลี่ยน?',
      },
      () => {
        mutations += 1
        state = { retained: false }
      },
    )
    return {
      confirm: () => pendingConfirm?.(),
      mutations: () => mutations,
      state: () => state,
      wasConfirmationRequested: () => Boolean(pendingConfirm),
    }
  }

  it('changes a blank branch immediately, but keeps populated warehouse and party data on cancel', () => {
    const blank = expectGuardedChange(shouldConfirmWeightTicketBranchChange([line()], false))
    expect(blank.wasConfirmationRequested()).toBe(false)
    expect(blank.mutations()).toBe(1)

    const populated = expectGuardedChange(shouldConfirmWeightTicketBranchChange([line({ warehouseId: 'warehouse-1' })], true))
    expect(populated.wasConfirmationRequested()).toBe(true)
    expect(populated.mutations()).toBe(0)
    expect(populated.state()).toEqual({ retained: true })
    populated.confirm()
    expect(populated.mutations()).toBe(1)
  })

  it('changes a blank product immediately, but cancels before resetting populated children', () => {
    const blankLines = [
      line({ id: 'product-1', productId: 'product-1' }),
      line({ id: 'lot-blank', parentId: 'product-1', productId: 'product-1', warehouseId: 'warehouse-1' }),
    ]
    const blank = expectGuardedChange(shouldConfirmWeightTicketProductChange(blankLines, 'product-1'))
    expect(blank.wasConfirmationRequested()).toBe(false)
    expect(blank.mutations()).toBe(1)

    const populatedLines = [...blankLines, line({ id: 'lot-1', parentId: 'product-1', grossWeight: '25' })]
    const populated = expectGuardedChange(shouldConfirmWeightTicketProductChange(populatedLines, 'product-1'))
    expect(populated.wasConfirmationRequested()).toBe(true)
    expect(populated.state()).toEqual({ retained: true })
    populated.confirm()
    expect(populated.mutations()).toBe(1)
  })

  it('changes blank impurity fields immediately, but preserves linked purchases until confirmed', () => {
    const source = line({ id: 'impurity-1' })
    const blank = expectGuardedChange(shouldConfirmWeightTicketImpurityChange([source], source.id))
    expect(blank.wasConfirmationRequested()).toBe(false)
    expect(blank.mutations()).toBe(1)

    const populated = expectGuardedChange(shouldConfirmWeightTicketImpurityChange([
      source,
      line({ id: 'purchase-1', impuritySourceLineId: source.id, grossWeight: '2' }),
    ], source.id))
    expect(populated.wasConfirmationRequested()).toBe(true)
    expect(populated.mutations()).toBe(0)
    expect(populated.state()).toEqual({ retained: true })
    populated.confirm()
    expect(populated.mutations()).toBe(1)
  })

  it('tracks and removes nested impurity purchases with their source tree', () => {
    const product = line({ id: 'product-1', productId: 'product-1', warehouseId: 'warehouse-1' })
    const source = line({
      id: 'impurity-1',
      parentId: product.id,
      productId: product.productId,
      warehouseId: product.warehouseId,
      impurityId: 'impurity-1',
      deductionMode: 'kg',
      deductionValue: '30',
    })
    const purchase = line({
      id: 'purchase-1',
      parentId: product.id,
      productId: 'product-2',
      grossWeight: '30',
      impuritySourceLineId: source.id,
    })
    const nestedSource = line({
      id: 'nested-impurity-1',
      parentId: purchase.id,
      productId: purchase.productId,
      impurityId: 'impurity-2',
      deductionMode: 'kg',
      deductionValue: '5',
    })
    const nestedPurchase = line({
      id: 'nested-purchase-1',
      parentId: product.id,
      productId: 'product-3',
      grossWeight: '5',
      impuritySourceLineId: nestedSource.id,
    })
    const lines = [product, source, purchase, nestedSource, nestedPurchase]

    expect(getWeightTicketRelatedLineIds(lines, source.id)).toEqual(new Set([
      source.id,
      purchase.id,
      nestedSource.id,
      nestedPurchase.id,
    ]))
    expect(getWeightTicketRelatedLineIds(lines, purchase.id)).toEqual(new Set([
      purchase.id,
      nestedSource.id,
      nestedPurchase.id,
    ]))
    expect(shouldConfirmWeightTicketImpurityChange(lines, source.id)).toBe(true)
    expect(removeImpurityPurchaseLinesForSource(lines, source.id).map((entry) => entry.id)).toEqual([
      product.id,
      source.id,
    ])
  })

  it('preserves every real lot and its nested lots when removing an impurity purchase root', () => {
    const product = line({ id: 'product-1', productId: 'product-1', warehouseId: 'warehouse-1' })
    const source = line({
      id: 'impurity-1',
      parentId: product.id,
      productId: product.productId,
      warehouseId: product.warehouseId,
      impurityId: 'impurity-1',
      deductionMode: 'kg',
      deductionValue: '30',
    })
    const purchaseRoot = line({
      id: 'purchase-root',
      productId: 'product-2',
      grossWeight: '30',
      impuritySourceLineId: source.id,
    })
    const lot2 = line({ id: 'lot-2', parentId: purchaseRoot.id, productId: 'product-2', grossWeight: '20' })
    const lot3 = line({ id: 'lot-3', parentId: purchaseRoot.id, productId: 'product-2', grossWeight: '10' })
    const nestedLot = line({ id: 'nested-lot', parentId: lot3.id, productId: 'product-2', grossWeight: '4' })

    const nextLines = removeImpurityPurchaseLinesForSource(
      [product, source, purchaseRoot, lot2, lot3, nestedLot],
      source.id,
    )

    expect(nextLines.map((entry) => entry.id)).toEqual([
      product.id,
      source.id,
      lot2.id,
      lot3.id,
      nestedLot.id,
    ])
    expect(nextLines.find((entry) => entry.id === lot2.id)?.parentId).toBeUndefined()
    expect(nextLines.find((entry) => entry.id === lot3.id)?.parentId).toBe(lot2.id)
    expect(nextLines.find((entry) => entry.id === nestedLot.id)?.parentId).toBe(lot3.id)
  })

  it('keeps a selected impurity product until a main impurity change is confirmed', () => {
    const source = line({
      id: 'impurity-1',
      impurityProductId: 'other-product',
      impurityProductName: 'สินค้าที่ปนมา',
    })
    const guarded = expectGuardedChange(
      shouldConfirmWeightTicketImpurityChange([source], source.id, false, true),
    )

    expect(guarded.wasConfirmationRequested()).toBe(true)
    expect(guarded.mutations()).toBe(0)
    expect(guarded.state()).toEqual({ retained: true })
    guarded.confirm()
    expect(guarded.mutations()).toBe(1)
  })

  it('removes a blank extra product immediately but confirms when its deletion would remove populated data', () => {
    const firstProduct = line({ id: 'product-1', productId: 'product-1' })
    const blankExtraProduct = line({ id: 'product-2' })

    expect(shouldConfirmWeightTicketProductRemoval([firstProduct, blankExtraProduct], blankExtraProduct.id)).toBe(false)
    expect(shouldConfirmWeightTicketProductRemoval([
      firstProduct,
      { ...blankExtraProduct, productId: 'product-2' },
    ], blankExtraProduct.id)).toBe(true)

    const populatedLot = line({
      id: 'lot-2',
      parentId: blankExtraProduct.id,
      grossWeight: '25',
    })
    expect(shouldConfirmWeightTicketProductRemoval([firstProduct, blankExtraProduct, populatedLot], blankExtraProduct.id)).toBe(true)
  })

  it('does not treat inherited product and warehouse values as entered data on a fresh lot', () => {
    const blankLot = line({
      id: 'lot-1',
      parentId: 'product-1',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
    })

    expect(shouldConfirmWeightTicketLotRemoval(blankLot)).toBe(false)
    expect(shouldConfirmWeightTicketLotRemoval({ ...blankLot, grossWeight: '25' })).toBe(true)
    expect(shouldConfirmWeightTicketLotRemoval({
      ...blankLot,
      imageFiles: [{ fileName: 'evidence.jpg', id: 'file-1', rawValue: 'evidence.jpg', url: 'https://example.com/evidence.jpg' }],
    })).toBe(true)
  })

  it('ignores only untouched newly added lots and impurities when checking discard state', () => {
    const blankLot = line({
      id: 'lot-1',
      parentId: 'product-1',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
    })
    const blankImpurity = line({
      id: 'impurity-1',
      parentId: 'lot-1',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      grossWeight: '0',
      containerDeductionWeight: '0',
      deductionMode: 'kg',
      note: DEFAULT_IMPURITY_NOTE,
    })

    expect(isBlankAddedWeightTicketDraftLine(blankLot)).toBe(true)
    expect(isBlankAddedWeightTicketDraftLine(blankImpurity)).toBe(true)
    expect(isBlankAddedWeightTicketDraftLine({ ...blankLot, grossWeight: '25' })).toBe(false)
    expect(isBlankAddedWeightTicketDraftLine({ ...blankImpurity, impurityId: 'impurity-1' })).toBe(false)
  })

  it('removes a freshly seeded impurity immediately but confirms after it or its purchase line has data', () => {
    const product = line({ id: 'product-1', productId: 'product-1', warehouseId: 'warehouse-1' })
    const freshImpurity = line({
      id: 'impurity-1',
      parentId: product.id,
      productId: product.productId,
      warehouseId: product.warehouseId,
      grossWeight: '0',
      containerDeductionWeight: '0',
      deductionMode: 'kg',
      impurityId: 'default-impurity',
      impurityPurchaseAction: 'none',
      note: DEFAULT_IMPURITY_NOTE,
    })

    expect(shouldConfirmWeightTicketImpurityRemoval([product, freshImpurity], freshImpurity.id, 'default-impurity')).toBe(false)
    expect(shouldConfirmWeightTicketImpurityRemoval([
      product,
      { ...freshImpurity, deductionValue: '1.5' },
    ], freshImpurity.id, 'default-impurity')).toBe(true)

    const linkedPurchaseLine = line({
      id: 'purchase-1',
      productId: 'reclaimed-product',
      grossWeight: '1.5',
      impuritySourceLineId: freshImpurity.id,
    })
    expect(shouldConfirmWeightTicketImpurityRemoval([
      product,
      freshImpurity,
      linkedPurchaseLine,
    ], freshImpurity.id, 'default-impurity')).toBe(true)
  })

  it('promotes the second lot when the first lot is removed and keeps linked relations', () => {
    const firstLot = line({ id: 'lot-1', productId: 'product-1' })
    const secondLot = line({ id: 'lot-2', parentId: firstLot.id, productId: 'product-1', grossWeight: '25' })
    const impurity = line({ id: 'impurity-1', parentId: firstLot.id, impurityId: 'impurity-1', deductionMode: 'kg', productId: 'product-1' })
    const purchase = line({ id: 'purchase-1', parentId: firstLot.id, impuritySourceLineId: impurity.id, productId: 'product-2', grossWeight: '2' })

    const nextLines = removeWeightTicketLot([firstLot, secondLot, impurity, purchase], firstLot.id)

    expect(nextLines).toEqual([
      { ...secondLot, parentId: undefined },
      { ...impurity, parentId: secondLot.id },
      { ...purchase, parentId: secondLot.id },
    ])
  })

  it('does not remove the first lot when it is the only lot', () => {
    const firstLot = line({ id: 'lot-1', productId: 'product-1' })

    expect(removeWeightTicketLot([firstLot], firstLot.id)).toEqual([firstLot])
  })

  it('keeps realtime notices on the exact changed lines only', () => {
    const visibleIds = getWeightTicketVisibleRemoteChangedLineIds(
      [{ id: 'product-1' }, { id: 'lot-1' }, { id: 'impurity-1' }],
      ['lot-1', 'impurity-1', 'deleted-line', 'product-1', 'lot-1'],
    )

    expect([...visibleIds]).toEqual(['lot-1', 'impurity-1', 'product-1'])
  })
})
