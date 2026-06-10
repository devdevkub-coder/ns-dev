const stockMovementTypeLabels: Record<string, string> = {
  CUSTOMER_RETURN_IN: 'เข้า - รับคืนจากลูกค้า',
  GRADE_ADJUST_IN: 'เข้า - ปรับเกรด',
  GRADE_ADJUST_OUT: 'ออก - ปรับเกรด',
  PENDING_SALE_OUT: 'ออก - รอขาย',
  PRODUCTION_INPUT_OUT: 'ออก - เบิกเข้าผลิต',
  PRODUCTION_LOSS: 'ออก - สูญเสียจากการผลิต',
  PRODUCTION_OUTPUT_IN: 'เข้า - ผลิตเสร็จเข้า FG',
  PRODUCTION_OUTPUT_RM_IN: 'เข้า - ผลิตเสร็จเข้า RM',
  PRODUCTION_OUTPUT_WIP_OUT: 'ออก - ตัด WIP จากการผลิต',
  SALE_OUT: 'ออก - ขาย',
  STATUS_CONVERT_IN: 'เข้า - แปลงสถานะ',
  STATUS_CONVERT_OUT: 'ออก - แปลงสถานะ',
  STOCK_COUNT_GAIN: 'เข้า - ปรับนับสต๊อกเพิ่ม',
  STOCK_COUNT_LOSS: 'ออก - ปรับนับสต๊อกลด',
  WIP_IN: 'เข้า - รับเข้า WIP',
  ขายออก: 'ออก - ขาย',
  รับซื้อเข้า: 'เข้า - รับซื้อ',
  'โอนระหว่างสาขา-เข้า': 'เข้า - โอนระหว่างสาขา',
  'โอนระหว่างสาขา-ออก': 'ออก - โอนระหว่างสาขา',
}

export function stockMovementTypeLabel(value: string | null | undefined) {
  const key = String(value ?? '').trim()
  if (!key) return '-'
  return stockMovementTypeLabels[key] ?? key
}
