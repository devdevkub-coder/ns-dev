import { describe, expect, it } from 'vitest'

import { buildPrintWeightRows } from './weight-ticket-print'
import {
  calculateTicketTotals,
  calculateWeightTicketLineTotals,
  type WeightTicketFormValues,
  type WeightTicketRecord,
  weightTicketFormSchema,
} from './weight-tickets'
import {
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
} from './server/weight-tickets'

const validWtiLine = (id: string, parentId?: string) => ({
  containerDeductionWeight: 0,
  deductionMode: 'none' as const,
  deductionValue: 0,
  grossWeight: 10,
  id,
  imageNames: [`${id}.jpg`],
  impurityId: '',
  parentId,
  productId: 'PROD-A',
  warehouseId: '',
})

type TestWeightTicketLine = Omit<ReturnType<typeof validWtiLine>, 'deductionMode'> & {
  deductionMode: WeightTicketFormValues['lines'][number]['deductionMode']
}

const validWtiPayload = (lines: TestWeightTicketLine[]) => ({
  branchId: 'BR10',
  godownName: 'โกดังทดสอบ',
  lines,
  partyId: 'SUP-1',
  remark: '',
  type: 'WTI',
  vehicleImageNames: [],
  vehicleNo: 'TEST-1',
})

describe('weight ticket totals', () => {
  it('allows WTI metadata to be saved without product lines or a godown, while WTO still requires a product line', () => {
    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([]),
      godownName: '',
    }).success).toBe(true)

    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([]),
      type: 'WTO',
    }).success).toBe(false)
  })

  it('deducts a child impurity from the whole product instead of clipping it to the first lot', () => {
    const totals = calculateTicketTotals([
      {
        containerDeductionWeight: '4',
        deductionMode: 'none',
        deductionValue: '0',
        grossWeight: '22',
        id: 'product-a-lot-1',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'none',
        deductionValue: '0',
        grossWeight: '228',
        id: 'product-a-lot-2',
        parentId: 'product-a-lot-1',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'kg',
        deductionValue: '32',
        grossWeight: '0',
        id: 'product-a-impurity',
        impurityId: 'impurity-1',
        parentId: 'product-a-lot-1',
        productId: 'PROD-A',
      },
    ])

    expect(totals).toEqual({
      containerDeductionWeight: 4,
      deductionWeight: 32,
      grossWeight: 250,
      netWeight: 214,
    })
  })

  it('caps an oversized child impurity inside its product without borrowing another product weight', () => {
    const calculation = calculateWeightTicketLineTotals([
      {
        containerDeductionWeight: '0',
        deductionMode: 'none',
        deductionValue: '0',
        grossWeight: '10',
        id: 'product-a-lot',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'kg',
        deductionValue: '20',
        grossWeight: '0',
        id: 'product-a-impurity',
        impurityId: 'impurity-a',
        parentId: 'product-a-lot',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'none',
        deductionValue: '0',
        grossWeight: '100',
        id: 'product-b-lot',
        productId: 'PROD-B',
      },
    ])

    expect(calculation.totals).toEqual({
      containerDeductionWeight: 0,
      deductionWeight: 10,
      grossWeight: 110,
      netWeight: 100,
    })
    expect(calculation.lineTotalsById.get('product-a-impurity')?.deductionWeight).toBe(10)
    expect(calculation.sourceTotalsByLineId.get('product-a-lot')?.netWeight).toBe(0)
    expect(calculation.sourceTotalsByLineId.get('product-b-lot')?.netWeight).toBe(100)
  })

  it('rejects aggregate child impurity deduction before the calculator clamps it', () => {
    const lines = [
      {
        ...validWtiLine('source-lot'),
        containerDeductionWeight: 2,
        grossWeight: 10,
      },
      {
        ...validWtiLine('impurity-1', 'source-lot'),
        deductionMode: 'kg' as const,
        deductionValue: 5,
        grossWeight: 0,
        imageNames: [],
        impurityId: 'impurity-1',
      },
      {
        ...validWtiLine('impurity-2', 'source-lot'),
        deductionMode: 'kg' as const,
        deductionValue: 5,
        grossWeight: 0,
        imageNames: [],
        impurityId: 'impurity-2',
      },
    ]
    const calculation = calculateWeightTicketLineTotals(lines)
    const result = weightTicketFormSchema.safeParse(validWtiPayload(lines))

    expect(calculation.lineTotalsById.get('impurity-1')?.deductionWeight).toBe(5)
    expect(calculation.lineTotalsById.get('impurity-2')?.deductionWeight).toBe(3)
    expect(calculation.overflowingChildImpurityLineIds).toEqual(new Set(['impurity-2']))
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected aggregate child impurity deduction to fail validation')
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['lines', 2, 'deductionValue'],
    }))
  })

  it('does not let a mismatched child product fund its parent product impurity', () => {
    const lines = [
      {
        containerDeductionWeight: 0,
        deductionMode: 'none' as const,
        deductionValue: 0,
        grossWeight: 10,
        id: 'product-a-lot',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: 0,
        deductionMode: 'none' as const,
        deductionValue: 0,
        grossWeight: 100,
        id: 'crafted-product-b-lot',
        parentId: 'product-a-lot',
        productId: 'PROD-B',
      },
      {
        containerDeductionWeight: 0,
        deductionMode: 'kg' as const,
        deductionValue: 20,
        grossWeight: 0,
        id: 'product-a-impurity',
        impurityId: 'impurity-a',
        parentId: 'product-a-lot',
        productId: 'PROD-A',
      },
    ]

    const calculation = calculateWeightTicketLineTotals(lines)

    expect(calculation.lineTotalsById.get('product-a-impurity')?.deductionWeight).toBe(10)
    expect(calculation.lineTotalsById.get('crafted-product-b-lot')?.netWeight).toBe(100)
    expect(calculation.sourceTotalsByLineId.get('product-a-lot')?.netWeight).toBe(0)
    expect(calculation.totals).toEqual({
      containerDeductionWeight: 0,
      deductionWeight: 10,
      grossWeight: 110,
      netWeight: 100,
    })
  })

  it.each(['WTI', 'WTO'] as const)('rejects mismatched %s child products at the shared create and update request schema', (type) => {
    const warehouseId = type === 'WTO' ? 'WAREHOUSE-1' : ''
    const result = weightTicketFormSchema.safeParse({
      branchId: 'BR10',
      godownName: 'โกดังทดสอบ',
      lines: [
        {
          containerDeductionWeight: 0,
          deductionMode: 'none',
          deductionValue: 0,
          grossWeight: 10,
          id: 'product-a-lot',
          imageNames: ['lot-a.jpg'],
          impurityId: '',
          productId: 'PROD-A',
          warehouseId,
        },
        {
          containerDeductionWeight: 0,
          deductionMode: 'none',
          deductionValue: 0,
          grossWeight: 100,
          id: 'crafted-product-b-lot',
          imageNames: ['lot-b.jpg'],
          impurityId: '',
          parentId: 'product-a-lot',
          productId: 'PROD-B',
          warehouseId,
        },
      ],
      partyId: 'SUP-1',
      remark: '',
      type,
      vehicleImageNames: [],
      vehicleNo: 'TEST-1',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error(`Expected the ${type} request to fail validation`)
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      message: 'สินค้าของรายการย่อยต้องตรงกับสินค้าของรายการหลัก',
      path: ['lines', 1, 'productId'],
    }))
  })

  it('rejects duplicate line ids before they can collide in weight maps', () => {
    const result = weightTicketFormSchema.safeParse(validWtiPayload([
      validWtiLine('duplicate-line'),
      validWtiLine('duplicate-line'),
    ]))

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected duplicate line ids to fail validation')
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['lines', 1, 'id'],
    }))
  })

  it('rejects a line whose parent id does not resolve inside the payload', () => {
    const result = weightTicketFormSchema.safeParse(validWtiPayload([
      validWtiLine('orphan-child', 'missing-parent'),
    ]))

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected an orphan parent id to fail validation')
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['lines', 0, 'parentId'],
    }))
  })

  it('rejects a line that points to itself as its parent', () => {
    const result = weightTicketFormSchema.safeParse(validWtiPayload([
      validWtiLine('self-parent', 'self-parent'),
    ]))

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected a self-parent line to fail validation')
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['lines', 0, 'parentId'],
    }))
  })

  it('rejects a parent cycle that has no root line', () => {
    const result = weightTicketFormSchema.safeParse(validWtiPayload([
      validWtiLine('cycle-a', 'cycle-b'),
      validWtiLine('cycle-b', 'cycle-a'),
    ]))

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected a parent cycle to fail validation')
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['lines', 0, 'parentId'],
    }))
  })

  it('persists the sample line allocation and product summary with the same 214 kg net weight', () => {
    const values: WeightTicketFormValues = {
      branchId: 'BR10',
      godownName: 'โกดังทดสอบ',
      lines: [
        {
          containerDeductionWeight: 4,
          deductionMode: 'none',
          deductionValue: 0,
          grossWeight: 22,
          id: 'product-a-lot-1',
          imageNames: ['lot-1.jpg'],
          impurityId: '',
          impurityProductId: '',
          note: '',
          productId: 'PROD-A',
          warehouseId: '',
        },
        {
          containerDeductionWeight: 0,
          deductionMode: 'none',
          deductionValue: 0,
          grossWeight: 228,
          id: 'product-a-lot-2',
          imageNames: ['lot-2.jpg'],
          impurityId: '',
          impurityProductId: '',
          note: '',
          parentId: 'product-a-lot-1',
          productId: 'PROD-A',
          warehouseId: '',
        },
        {
          containerDeductionWeight: 0,
          deductionMode: 'kg',
          deductionValue: 32,
          grossWeight: 0,
          id: 'product-a-impurity',
          imageNames: [],
          impurityId: '12',
          impurityProductId: '',
          note: '',
          parentId: 'product-a-lot-1',
          productId: 'PROD-A',
          warehouseId: '',
        },
      ],
      partyId: 'SUP-1',
      remark: '',
      type: 'WTI',
      vehicleImageNames: [],
      vehicleNo: 'TEST-1',
    }
    const lineRows = buildWeightTicketLineRows(
      100n,
      values,
      new Map([['PROD-A', { code: 'PROD-A', id: 1n, name: 'สินค้า A' }]]),
      new Map([
        [12n, { id: 12n, name: 'สิ่งเจือปนย่อย' }],
      ]),
    )
    const persistedLines = lineRows.map((line, index) => ({ ...line, id: BigInt(index + 1) }))
    const { summaryRows } = buildWeightTicketProductSummaryRows(100n, persistedLines)

    expect(lineRows.map((line) => ({ deduction: line.deduct_weight, net: line.net_weight }))).toEqual([
      { deduction: 0, net: 0 },
      { deduction: 0, net: 214 },
      { deduction: 32, net: 0 },
    ])
    expect(summaryRows).toHaveLength(1)
    expect(summaryRows[0]).toMatchObject({
      container_deduction_weight: 4,
      deduct_weight: 32,
      gross_weight: 250,
      net_weight: 214,
      product_id: 1n,
      remaining_weight: 214,
    })
  })

  it('prints child impurity only in the lower product summary shared by HTML and React-PDF', () => {
    const line = (
      overrides: Partial<WeightTicketRecord['lines'][number]>,
    ): WeightTicketRecord['lines'][number] => ({
      containerDeductionWeight: '0',
      containerDeductionWeightValue: 0,
      deductionMode: 'none',
      deductionValue: '0',
      deductionWeight: 0,
      grossWeight: '0',
      grossWeightValue: 0,
      id: '',
      imageCount: 0,
      imageNames: [],
      impurityId: '',
      impurityName: '',
      impuritySourceLineNo: null,
      lineNo: 0,
      netWeight: 0,
      note: '',
      parentLineNo: null,
      productId: 'PROD-A',
      productName: 'สินค้า A',
      warehouseId: '',
      warehouseName: '',
      warehouseType: '',
      ...overrides,
    })
    const ticket = {
      lines: [
        line({
          containerDeductionWeight: '4',
          containerDeductionWeightValue: 4,
          grossWeight: '22',
          grossWeightValue: 22,
          id: 'lot-1',
          lineNo: 1,
          netWeight: 0,
        }),
        line({
          grossWeight: '228',
          grossWeightValue: 228,
          id: 'lot-2',
          lineNo: 2,
          netWeight: 214,
          parentLineNo: 1,
        }),
        line({
          deductionMode: 'kg',
          deductionValue: '32',
          deductionWeight: 32,
          id: 'impurity',
          impurityId: '12',
          impurityName: 'สิ่งเจือปนย่อย',
          lineNo: 3,
          parentLineNo: 1,
        }),
        line({
          grossWeight: '32',
          grossWeightValue: 32,
          id: 'impurity-purchase',
          impuritySourceLineNo: 3,
          lineNo: 4,
          netWeight: 32,
          note: 'มาจากสิ่งเจือปน (สิ่งเจือปนย่อย 32 กก.) ของรายการที่ 1: สินค้า A',
          productId: 'PROD-B',
          productName: 'สินค้าสิ่งเจือปน B',
        }),
      ],
      productSummaries: [
        {
          billedWeight: 0,
          categoryName: '-',
          containerDeductionWeight: 4,
          costSnapshotStatus: 'none',
          deductWeight: 32,
          grossWeight: 250,
          hasMixedDeductionProfiles: true,
          id: 'summary-a',
          lineCount: 3,
          netWeight: 214,
          pendingOutQty: 0,
          pendingOutValue: 0,
          productId: 'PROD-A',
          productName: 'สินค้า A',
          remainingWeight: 214,
          unitCostSnapshot: null,
        },
        {
          billedWeight: 0,
          categoryName: '-',
          containerDeductionWeight: 0,
          costSnapshotStatus: 'none',
          deductWeight: 0,
          grossWeight: 32,
          hasMixedDeductionProfiles: false,
          id: 'summary-b',
          lineCount: 1,
          netWeight: 32,
          pendingOutQty: 0,
          pendingOutValue: 0,
          productId: 'PROD-B',
          productName: 'สินค้าสิ่งเจือปน B',
          remainingWeight: 32,
          unitCostSnapshot: null,
        },
      ],
      type: 'WTI',
    } as WeightTicketRecord

    const rows = buildPrintWeightRows(ticket, true)
    const lotRows = rows.filter((row) => row.className === 'lot-row')
    const sourceProductSummaryRows = rows.filter((row) => (
      row.className === 'product-total' && row.productName === 'สินค้า A'
    ))
    const purchaseRows = rows.filter((row) => row.className === 'purchase-row')
    const impurityDisplayRows = rows.filter((row) => row.deductionWeight === 32)

    expect(lotRows.map((row) => ({
      containerDeductionWeight: row.containerDeductionWeight,
      deductionWeight: row.deductionWeight,
      grossWeight: row.grossWeight,
      netWeight: row.netWeight,
    }))).toEqual([
      { containerDeductionWeight: 4, deductionWeight: 0, grossWeight: 22, netWeight: 18 },
      { containerDeductionWeight: 0, deductionWeight: 0, grossWeight: 228, netWeight: 228 },
    ])
    lotRows.forEach((row) => {
      expect(row.netWeight).toBe(row.grossWeight - row.containerDeductionWeight - row.deductionWeight)
    })
    expect(sourceProductSummaryRows).toHaveLength(1)
    expect(sourceProductSummaryRows[0]).toMatchObject({
      containerDeductionWeight: 4,
      deductionWeight: 32,
      netWeight: 214,
    })
    expect(impurityDisplayRows).toHaveLength(1)
    expect(impurityDisplayRows[0]).toBe(sourceProductSummaryRows[0])
    expect(purchaseRows).toHaveLength(1)
    expect(purchaseRows[0]).toMatchObject({ deductionWeight: 0, grossWeight: 32, netWeight: 32 })
    expect(rows.some((row) => row.className === 'source-row')).toBe(false)
  })
})
