import { describe, expect, it } from 'vitest'
import { stockMovementTypeLabel } from './stock-movement-types'

describe('stock movement type labels', () => {
  it('maps every movement type currently written by the active app', () => {
    const movementTypes = [
      'CUSTOMER_RETURN_IN',
      'GRADE_ADJUST_IN',
      'GRADE_ADJUST_OUT',
      'GRADE_ADJUST_REVERSE_IN',
      'GRADE_ADJUST_REVERSE_OUT',
      'PRODUCTION_INPUT_OUT',
      'PRODUCTION_INPUT_RETURN_STOCK_IN',
      'PRODUCTION_INPUT_RETURN_WIP_OUT',
      'PRODUCTION_INPUT_REVERSE_STOCK_IN',
      'PRODUCTION_INPUT_REVERSE_WIP_OUT',
      'PRODUCTION_LOSS',
      'PRODUCTION_OUTPUT_IN',
      'PRODUCTION_OUTPUT_REVERSE_STOCK_OUT',
      'PRODUCTION_OUTPUT_REVERSE_WIP_IN',
      'PRODUCTION_OUTPUT_RM_IN',
      'PRODUCTION_OUTPUT_WIP_OUT',
      'STATUS_CONVERT_IN',
      'STATUS_CONVERT_OUT',
      'STATUS_CONVERT_REVERSAL_IN',
      'STATUS_CONVERT_REVERSAL_OUT',
      'STOCK_COUNT_GAIN',
      'STOCK_COUNT_LOSS',
      'STOCK_COUNT_REVERSE_IN',
      'STOCK_COUNT_REVERSE_OUT',
      'WIP_IN',
      'ขายออก',
      'รับซื้อเข้า',
      'รับซื้อเข้า-แก้ไข',
      'รับซื้อเข้า-ยกเลิก',
      'ยกเลิกขายคืนสต๊อก',
      'แก้ไขบิลขายคืนสต๊อก',
      'รับคืนจากใบส่งของ WTO',
      'ของขาดจากรับคืน WTO',
      'โอนระหว่างสาขา-เข้า',
      'โอนระหว่างสาขา-ออก',
    ]

    for (const movementType of movementTypes) {
      expect(stockMovementTypeLabel(movementType)).not.toBe(movementType)
    }
  })
})
