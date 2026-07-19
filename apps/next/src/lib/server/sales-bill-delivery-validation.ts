export function validateDeliveryItemProductMatch(input: {
  itemProductId: bigint
  itemProductName: string
  summaryProductId: bigint | null
  summaryProductName: string
}) {
  if (input.summaryProductId == null) {
    return 'รายการจากใบส่งของ WTO ไม่มีสินค้าอ้างอิงในระบบ'
  }
  if (input.itemProductId !== input.summaryProductId) {
    return `สินค้า ${input.itemProductName} ไม่ตรงกับใบส่งของ WTO (${input.summaryProductName})`
  }
  return null
}
