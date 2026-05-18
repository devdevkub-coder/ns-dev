import { z } from 'zod'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const phonePattern = /^\+?[0-9][0-9\s().-]{7,24}$/

const optionalGeneralText = (label: string, maxLength = 500) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const requiredGeneralText = (label: string, maxLength = 500) => z.string()
  .trim()
  .min(1, `กรอก${label}`)
  .max(maxLength, `${label}ยาวเกินไป`)
  .regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`)

export const companyProfileSchema = z.object({
  address: requiredGeneralText('ที่อยู่', 1000),
  bankInfo: optionalGeneralText('ข้อมูลธนาคาร', 500),
  branchCode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? '00000' : value),
    z.string().trim().regex(/^\d{5}$/, 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก').default('00000'),
  ),
  email: z.preprocess(
    blankToNull,
    z.string()
      .trim()
      .email('รูปแบบอีเมลไม่ถูกต้อง')
      .regex(/^[\x20-\x7E]+$/, 'อีเมลต้องใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์มาตรฐาน')
      .nullable()
      .default(null),
  ),
  fax: z.preprocess(
    blankToNull,
    z.string().trim().regex(phonePattern, 'รูปแบบแฟกซ์ไม่ถูกต้อง').nullable().default(null),
  ),
  footerNote: optionalGeneralText('ข้อความท้ายเอกสาร', 500),
  logoUrl: z.preprocess(
    blankToNull,
    z.string().trim().max(250_000, 'ไฟล์โลโก้ใหญ่เกินไป').nullable().default(null),
  ),
  name: requiredGeneralText('ชื่อบริษัท', 220),
  nameEn: optionalGeneralText('ชื่อบริษัทอังกฤษ', 220),
  phone: z.string()
    .trim()
    .min(1, 'กรอกโทรศัพท์')
    .regex(phonePattern, 'รูปแบบโทรศัพท์ไม่ถูกต้อง')
    .refine((value) => {
      const digits = value.replace(/\D/g, '')
      return digits.length >= 9 && digits.length <= 15
    }, 'โทรศัพท์ต้องมีตัวเลข 9-15 หลัก'),
  taxId: z.preprocess(
    blankToNull,
    z.string().trim().regex(/^\d{13}$/, 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก').nullable().default(null),
  ),
  website: z.preprocess(
    blankToNull,
    z.string().trim().url('รูปแบบเว็บไซต์ไม่ถูกต้อง').nullable().default(null),
  ),
})

export type CompanyProfileFormValues = z.infer<typeof companyProfileSchema>

export const emptyCompanyProfile: CompanyProfileFormValues = {
  address: '',
  bankInfo: null,
  branchCode: '00000',
  email: null,
  fax: null,
  footerNote: null,
  logoUrl: null,
  name: '',
  nameEn: null,
  phone: '',
  taxId: null,
  website: null,
}
