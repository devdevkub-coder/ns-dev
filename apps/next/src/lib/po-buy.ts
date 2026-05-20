import { z } from 'zod'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const safeIdPattern = /^[A-Za-z0-9_.:-]+$/
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u

const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')
const optionalDate = z.preprocess(blankToNull, requiredDate.nullable().default(null))
const optionalGeneralText = (label: string, maxLength = 500) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)
const positiveNumber = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).gt(0, `${label}ต้องมากกว่า 0`)

export const poBuyItemSchema = z.object({
  productId: z.string().trim().min(1, 'เลือกสินค้า').max(80, 'รหัสสินค้ายาวเกินไป').regex(safeIdPattern, 'รหัสสินค้ามีรูปแบบไม่ถูกต้อง'),
  qty: positiveNumber('จำนวน'),
  unitPrice: positiveNumber('ราคา/หน่วย'),
})

export const poBuyFormSchema = z.object({
  branchId: z.string().trim().min(1, 'เลือกสาขา').max(80, 'รหัสสาขายาวเกินไป').regex(safeIdPattern, 'รหัสสาขามีรูปแบบไม่ถูกต้อง'),
  expectedDelivery: optionalDate,
  items: z.array(poBuyItemSchema).min(1, 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ').max(50, 'รายการสินค้ามากเกินไป'),
  notes: optionalGeneralText('หมายเหตุ', 500),
  requireDelivery: z.boolean().default(true),
  supplierId: z.string().trim().min(1, 'เลือก Supplier').max(80, 'รหัส Supplier ยาวเกินไป').regex(safeIdPattern, 'รหัส Supplier มีรูปแบบไม่ถูกต้อง'),
})

export type PoBuyFormValues = z.infer<typeof poBuyFormSchema>
