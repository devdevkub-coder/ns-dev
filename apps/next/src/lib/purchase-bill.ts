import { z } from 'zod'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const docNoPattern = /^[A-Za-z0-9_-]+$/
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u

const optionalDocNo = (label: string) => z.preprocess(
  blankToNull,
  z.string().trim().max(50, `${label}ยาวเกินไป`).regex(docNoPattern, `${label}ใช้ได้เฉพาะอังกฤษ ตัวเลข ขีดกลาง และ underscore`).nullable().default(null),
)

const optionalSafeId = (label: string) => z.preprocess(
  blankToNull,
  z.string().trim().max(80, `${label}ยาวเกินไป`).regex(/^[A-Za-z0-9_.:-]+$/, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const optionalGeneralText = (label: string, maxLength = 500) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const requiredGeneralText = (label: string, maxLength = 500) => z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : ''),
  z.string().min(1, `กรอก${label}`).max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`),
)

const money = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).min(0, `${label}ต้องไม่ติดลบ`)
const positiveMoney = (label: string) => money(label).gt(0, `${label}ต้องมากกว่า 0`)

export const purchaseBillItemSchema = z.object({
  deductWeight: money('น้ำหนักหัก').default(0),
  discount: money('ส่วนลด').default(0),
  displayName: optionalGeneralText('ชื่อแสดงในบิล', 120),
  grossWeight: money('น้ำหนักรวม').default(0),
  lotNo: optionalGeneralText('Lot', 80),
  note: optionalGeneralText('หมายเหตุรายการ', 200),
  poBuyId: optionalDocNo('PO Buy'),
  price: money('ราคา').default(0),
  productId: z.string().trim().min(1, 'เลือกสินค้า'),
  qty: positiveMoney('จำนวน/น้ำหนัก'),
  receiptLineId: optionalSafeId('รายการใบรับของ'),
  receiptLineIds: z.array(z.string().trim().max(80).regex(/^[A-Za-z0-9_.:-]+$/, 'รายการใบรับของมีรูปแบบไม่ถูกต้อง')).default([]),
  receiptSummaryId: optionalSafeId('สรุปรายการใบรับของ'),
  receiptTicketDocNo: optionalDocNo('เลขที่ใบรับของ'),
  receiptTicketId: optionalSafeId('ใบรับของ'),
  salesPrice: money('ราคาหน้าใบ').default(0),
}).refine((value) => !value.grossWeight || value.grossWeight >= value.deductWeight, {
  message: 'น้ำหนักหักต้องไม่เกินน้ำหนักรวม',
  path: ['deductWeight'],
})

export const purchaseBillFormSchema = z.object({
  advancePaymentId: optionalSafeId('เอกสารจ่ายเงินล่วงหน้า'),
  branchId: z.string().trim().min(1, 'เลือกสาขา'),
  discountTotal: money('ส่วนลดท้ายบิล').default(0),
  hasVat: z.boolean().default(false),
  items: z.array(purchaseBillItemSchema).min(1, 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'),
  note: optionalGeneralText('หมายเหตุ', 500),
  notes: optionalGeneralText('หมายเหตุ', 500),
  poBuyId: optionalDocNo('Quick Load PO'),
  purchaseChannelId: optionalSafeId('ช่องทางซื้อ'),
  purchaseSource: z.enum(['SPOT_BUY', 'PO_RECEIPT', 'MIXED']).default('SPOT_BUY'),
  refNo: optionalDocNo('เลขที่อ้างอิง'),
  receiptTicketId: optionalSafeId('ใบรับของ'),
  salesId: optionalSafeId('เซลที่ดูแล'),
  supplierId: z.string().trim().min(1, 'เลือกผู้ขาย'),
  transactionMode: z.enum(['STOCK', 'TRADING']).default('STOCK'),
  vatInvoiceDate: z.preprocess(
    blankToNull,
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ใบกำกับภาษีต้องเป็นรูปแบบ YYYY-MM-DD').nullable().default(null),
  ),
  vatInvoiceNo: optionalDocNo('เลขที่ใบกำกับภาษี'),
  vatInvoiceReceived: z.boolean().default(false),
  vatType: z.enum(['NONE', 'EXCLUDE', 'INCLUDE']).default('NONE'),
  warehouseId: optionalSafeId('คลัง'),
}).refine((value) => !value.vatInvoiceReceived || Boolean(value.vatInvoiceNo), {
  message: 'กรอกเลขที่ใบกำกับภาษีเมื่อระบุว่าได้รับแล้ว',
  path: ['vatInvoiceNo'],
}).refine((value) => !value.vatInvoiceReceived || Boolean(value.vatInvoiceDate), {
  message: 'กรอกวันที่ใบกำกับภาษีเมื่อระบุว่าได้รับแล้ว',
  path: ['vatInvoiceDate'],
}).superRefine((value, ctx) => {
  if (value.transactionMode === 'STOCK' && !value.receiptTicketId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'เลือกใบรับของ',
      path: ['receiptTicketId'],
    })
  }
  if (value.transactionMode === 'STOCK' && !value.warehouseId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'เลือกคลัง',
      path: ['warehouseId'],
    })
  }

  if (value.transactionMode === 'STOCK') {
    value.items.forEach((item, index) => {
      if (!item.receiptTicketId || (!item.receiptSummaryId && !item.receiptLineId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'รายการ Stock ต้องมาจากใบรับของ',
          path: ['items', index, 'receiptSummaryId'],
        })
      }

      if (item.qty > 0 && item.price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `รายการที่ ${index + 1} ต้องกรอกราคา/กก. ให้มากกว่า 0`,
          path: ['items', index, 'price'],
        })
      }
    })
  }
})

export const purchaseBillCancelSchema = z.object({
  id: z.string().trim().min(1, 'ระบุบิลที่ต้องการยกเลิก').max(80, 'รหัสบิลยาวเกินไป').regex(/^[A-Za-z0-9_.:-]+$/, 'รหัสบิลมีรูปแบบไม่ถูกต้อง'),
  note: z.string().trim().min(1, 'กรอกหมายเหตุการยกเลิก').max(500, 'หมายเหตุยาวเกินไป').regex(generalTextPattern, 'หมายเหตุมีรูปแบบไม่ถูกต้อง'),
})

export type PurchaseBillFormValues = z.infer<typeof purchaseBillFormSchema>
export type PurchaseBillCancelValues = z.infer<typeof purchaseBillCancelSchema>
