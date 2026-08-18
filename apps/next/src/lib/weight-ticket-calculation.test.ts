import { describe, expect, it } from 'vitest'

import { buildPrintWeightRows } from './weight-ticket-print'
import {
  calculateTicketTotals,
  calculateWeightTicketLineTotals,
  isWeightTicketDraftLotSkeleton,
  type WeightTicketFormValues,
  type WeightTicketRecord,
  weightTicketFormSchema,
} from './weight-tickets'
import {
  buildWeightTicketRenumberedLineReferences,
  buildWeightTicketLineRows,
  buildWeightTicketDerivedFacts,
  buildWeightTicketProductSummaryRows,
  WeightTicketDataContractError,
} from './server/weight-tickets'

const validWtiLine = (id: string, parentId?: string) => ({
  containerDeductionWeight: 0,
  deductionMode: 'none' as const,
  deductionValue: 0,
  grossWeight: 10,
  id,
  imageNames: [`${id}.jpg`],
  impurityId: '',
  impuritySourceLineId: undefined as string | undefined,
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
  it('rebuilds ticket totals, image count, and summaries from the remaining persisted lines after delete-only writes', () => {
    const remainingLines = [
      {
        container_deduction_weight: 1,
        deduct_weight: 0,
        deduction_mode: 'none',
        deduction_value: 0,
        gross_weight: 10,
        id: 101n,
        image_count: 1,
        impurity_id: null,
        impurity_source_line_no: null,
        line_no: 1,
        net_weight: 9,
        parent_line_no: null,
        product_id: 10n,
        product_name: 'สินค้า A',
        weight_ticket_id: 100n,
        warehouse_id: null,
      },
      {
        container_deduction_weight: 0,
        deduct_weight: 0,
        deduction_mode: 'none',
        deduction_value: 0,
        gross_weight: 50,
        id: 103n,
        image_count: 2,
        impurity_id: null,
        impurity_source_line_no: null,
        line_no: 2,
        net_weight: 50,
        parent_line_no: null,
        product_id: 11n,
        product_name: 'สินค้า B',
        weight_ticket_id: 100n,
        warehouse_id: null,
      },
    ]

    const facts = buildWeightTicketDerivedFacts(100n, 3, remainingLines)

    expect(facts).toMatchObject({
      imageCount: 6,
      totals: {
        containerDeductionWeight: 1,
        deductionWeight: 0,
        grossWeight: 60,
        netWeight: 59,
      },
    })
    expect(facts.summaryRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ lineIds: [101n], line_count: 1, product_id: 10n, net_weight: 9 }),
      expect.objectContaining({ lineIds: [103n], line_count: 1, product_id: 11n, net_weight: 50 }),
    ]))
    expect(facts.summaryRows).toHaveLength(2)
  })

  it('recalculates persisted line net weight before rebuilding summaries after a child deletion', () => {
    const remainingLines = [{
      container_deduction_weight: 0,
      deduct_weight: 0,
      deduction_mode: 'none',
      deduction_value: 0,
      gross_weight: 100,
      id: 201n,
      image_count: 0,
      impurity_id: null,
      impurity_source_line_no: null,
      line_no: 1,
      net_weight: 90,
      parent_line_no: null,
      product_id: 20n,
      product_name: 'สินค้า A',
      weight_ticket_id: 200n,
      warehouse_id: null,
    }]

    const facts = buildWeightTicketDerivedFacts(200n, 0, remainingLines)

    expect(facts.derivedLineRows[0]?.net_weight).toBe(100)
    expect(facts.summaryRows[0]?.net_weight).toBe(100)
    expect(facts.totals.netWeight).toBe(100)
  })

  it('remaps line-number relationships from stable line ids after compaction', () => {
    expect(buildWeightTicketRenumberedLineReferences([
      { id: 301n, line_no: 2, parent_line_no: null, impurity_source_line_no: null },
      { id: 302n, line_no: 4, parent_line_no: 2, impurity_source_line_no: 2 },
    ])).toEqual([
      { id: 301n, line_no: 1, parent_line_no: null, impurity_source_line_no: null },
      { id: 302n, line_no: 2, parent_line_no: 1, impurity_source_line_no: 1 },
    ])
    expect(() => buildWeightTicketRenumberedLineReferences([
      { id: 303n, line_no: 2, parent_line_no: 9, impurity_source_line_no: null },
    ])).toThrow('อ้างถึงเต๋าที่ไม่พบ')
  })

  it('recognizes the blank child lot shape used by incremental add drafts', () => {
    const blankChildLot = {
      ...validWtiLine('draft-lot', 'source-lot'),
      grossWeight: 0,
      imageNames: [],
    }

    expect(isWeightTicketDraftLotSkeleton(blankChildLot)).toBe(true)
    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([validWtiLine('source-lot'), blankChildLot]),
      draftLineIds: ['draft-lot'],
    }).success).toBe(true)
    // The shared schema validates the line shape. POST/PUT enforce the
    // explicit draftLineIds contract before persistence.
    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([validWtiLine('source-lot'), blankChildLot]),
    }).success).toBe(true)
  })

  it('allows header-only drafts for WTI and WTO while a normal WTO save still requires lines and a godown', () => {
    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([]),
      godownName: '',
    }).success).toBe(true)

    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([]),
      godownName: 'โกดังทดสอบ',
      saveScope: 'header',
      type: 'WTO',
    }).success).toBe(true)

    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([]),
      godownName: 'โกดังทดสอบ',
      type: 'WTO',
    }).success).toBe(false)

    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([{
        ...validWtiLine('header-with-line'),
        warehouseId: 'WAREHOUSE-1',
      }]),
      godownName: 'โกดังทดสอบ',
      saveScope: 'header',
      type: 'WTO',
    }).success).toBe(false)

    expect(weightTicketFormSchema.safeParse({
      ...validWtiPayload([{
        ...validWtiLine('wto-line'),
        warehouseId: 'WAREHOUSE-1',
      }]),
      godownName: '',
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

  it('deducts a nested impurity from the purchased impurity line without deducting the source product twice', () => {
    const calculation = calculateWeightTicketLineTotals([
      {
        containerDeductionWeight: '0',
        deductionMode: 'none',
        deductionValue: '0',
        grossWeight: '100',
        id: 'source-product',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'kg',
        deductionValue: '30',
        grossWeight: '0',
        id: 'source-impurity',
        impurityId: 'impurity-a',
        parentId: 'source-product',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'none',
        deductionValue: '0',
        grossWeight: '30',
        id: 'purchased-product',
        impuritySourceLineId: 'source-impurity',
        productId: 'PROD-B',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'kg',
        deductionValue: '5',
        grossWeight: '0',
        id: 'nested-impurity',
        impurityId: 'impurity-b',
        parentId: 'purchased-product',
        productId: 'PROD-B',
      },
    ])

    expect(calculation.lineTotalsById.get('source-product')?.netWeight).toBe(70)
    expect(calculation.lineTotalsById.get('purchased-product')?.netWeight).toBe(25)
    expect(calculation.lineTotalsById.get('nested-impurity')?.deductionWeight).toBe(5)
    expect(calculation.totals).toEqual({
      containerDeductionWeight: 0,
      deductionWeight: 35,
      grossWeight: 130,
      netWeight: 95,
    })
  })

  it('accepts a nested impurity under a purchased impurity line and preserves both relations', () => {
    const result = weightTicketFormSchema.safeParse(validWtiPayload([
      {
        ...validWtiLine('source-product'),
        grossWeight: 100,
      },
      {
        ...validWtiLine('source-impurity', 'source-product'),
        deductionMode: 'kg',
        deductionValue: 30,
        grossWeight: 0,
        imageNames: [],
        impurityId: 'impurity-a',
      },
      {
        ...validWtiLine('purchased-product'),
        grossWeight: 30,
        impuritySourceLineId: 'source-impurity',
        productId: 'PROD-B',
      },
      {
        ...validWtiLine('nested-impurity', 'purchased-product'),
        deductionMode: 'kg',
        deductionValue: 5,
        grossWeight: 0,
        imageNames: [],
        impurityId: 'impurity-b',
        productId: 'PROD-B',
      },
    ]))

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Expected nested impurity payload to pass validation')
    expect(result.data.lines[2]).toMatchObject({
      id: 'purchased-product',
      impuritySourceLineId: 'source-impurity',
    })
    expect(result.data.lines[3]).toMatchObject({
      id: 'nested-impurity',
      parentId: 'purchased-product',
    })
  })

  it('deducts a second impurity from the remaining weight of the original product', () => {
    const calculation = calculateWeightTicketLineTotals([
      {
        containerDeductionWeight: '0',
        deductionMode: 'none',
        deductionValue: '0',
        grossWeight: '100',
        id: 'source-product',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'kg',
        deductionValue: '30',
        grossWeight: '0',
        id: 'source-impurity',
        impurityId: 'impurity-a',
        parentId: 'source-product',
        productId: 'PROD-A',
      },
      {
        containerDeductionWeight: '0',
        deductionMode: 'kg',
        deductionValue: '5',
        grossWeight: '0',
        id: 'nested-impurity',
        impurityId: 'impurity-b',
        parentId: 'source-impurity',
        productId: 'PROD-A',
      },
    ])

    expect(calculation.lineTotalsById.get('source-product')?.netWeight).toBe(65)
    expect(calculation.lineTotalsById.get('source-impurity')?.deductionWeight).toBe(30)
    expect(calculation.lineTotalsById.get('nested-impurity')?.deductionWeight).toBe(5)
    expect(calculation.sourceTotalsByLineId.get('source-product')?.deductionWeight).toBe(35)
    expect(calculation.totals).toMatchObject({ deductionWeight: 35, netWeight: 65 })
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

  it('rejects a self-parent relationship before serializing rows for persistence', () => {
    const values = validWtiPayload([
      validWtiLine('self-parent', 'self-parent'),
    ]) as unknown as WeightTicketFormValues

    expect(() => buildWeightTicketLineRows(
      100n,
      values,
      new Map([['PROD-A', { code: 'PROD-A', id: 1n, name: 'สินค้า A' }]]),
      new Map(),
    )).toThrowError(new WeightTicketDataContractError('รายการที่ 1 ไม่สามารถอ้างตัวเองเป็นรายการหลักได้'))
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
      version: 1,
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
