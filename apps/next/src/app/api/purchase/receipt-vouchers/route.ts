import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '../../../../../generated/prisma/client'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { isPurchaseBillCancelledStatus, PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'

export const runtime = 'nodejs'

const receiptVoucherItemSchema = z.object({
  description: z.string().trim().min(1, 'กรุณากรอกรายการ'),
  price: z.coerce.number().min(0, 'ราคาต้องไม่ติดลบ'),
  qty: z.coerce.number().min(0, 'จำนวนต้องไม่ติดลบ'),
  unit: z.string().trim().optional().nullable(),
})

const receiptVoucherWriteSchema = z.object({
  action: z.literal('save').optional(),
  amountInWords: z.string().trim().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ไม่ถูกต้อง'),
  docNo: z.string().trim().optional().nullable(),
  items: z.array(receiptVoucherItemSchema).optional().default([]),
  licensePlate: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  paymentMethod: z.string().trim().optional().nullable(),
  purchaseBillDocNo: z.string().trim().optional().nullable(),
  salesPerson: z.string().trim().optional().nullable(),
  sellerAddress: z.string().trim().optional().nullable(),
  sellerName: z.string().trim().optional().nullable(),
  sellerPhone: z.string().trim().optional().nullable(),
  sellerTaxId: z.string().trim().optional().nullable(),
  supplierCode: z.string().trim().optional().nullable(),
})

const receiptVoucherCancelSchema = z.object({
  action: z.literal('cancel'),
  docNo: z.string().trim().min(1, 'ไม่พบเลขที่ใบสำคัญรับเงิน'),
  note: z.string().trim().min(1, 'กรุณากรอกเหตุผลการยกเลิก'),
})

type ReceiptVoucherStatusLogAction = 'cancelled' | 'created' | 'edited'

async function appendReceiptVoucherStatusLog(
  tx: Prisma.TransactionClient,
  params: {
    action: ReceiptVoucherStatusLogAction
    actor: string
    fromStatus?: string | null
    note?: string | null
    receiptVoucherDocNo: string
    receiptVoucherId: bigint
    toStatus: string
    totalAmount: Prisma.Decimal | number | null
  },
) {
  await tx.receipt_voucher_status_logs.create({
    data: {
      action: params.action,
      created_by: params.actor,
      from_status: params.fromStatus ?? null,
      note: params.note ?? null,
      receipt_voucher_doc_no: params.receiptVoucherDocNo,
      receipt_voucher_id: params.receiptVoucherId,
      to_status: params.toStatus,
      total_amount_snapshot: toVoucherNumber(params.totalAmount),
    },
  })
}

function thaiBahtText(value: number) {
  if (!Number.isFinite(value)) return ''
  if (value === 0) return 'ศูนย์บาทถ้วน'
  const digitText = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const unitText = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
  const convert = (input: string) => {
    let text = ''
    for (let index = 0; index < input.length; index += 1) {
      const digit = Number(input[index])
      const position = input.length - index - 1
      if (digit !== 0) {
        if (position % 6 === 1) {
          text += digit === 1 ? 'สิบ' : digit === 2 ? 'ยี่สิบ' : `${digitText[digit]}สิบ`
        } else if (position % 6 === 0 && digit === 1 && input.length > 1 && index > 0 && input[index - 1] !== '0') {
          text += 'เอ็ด'
        } else {
          text += `${digitText[digit]}${unitText[position % 6]}`
        }
      }
      if (position > 0 && position % 6 === 0) text += 'ล้าน'
    }
    return text
  }
  const [baht, satang] = value.toFixed(2).split('.')
  const bahtText = baht ? convert(baht) : ''
  const satangText = satang && satang !== '00' ? `${convert(satang)}สตางค์` : ''
  if (bahtText && !satangText) return `${bahtText}บาทถ้วน`
  if (!bahtText && satangText) return satangText
  return `${bahtText}บาท${satangText}`
}

async function nextReceiptVoucherDocNo(tx: Prisma.TransactionClient, date: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `RV${compactDate}-`
  await tx.$executeRaw`
    select pg_advisory_xact_lock(hashtext(${`receipt_vouchers:${startsWith}`}))
  `
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.receipt_vouchers
    where doc_no like ${`${startsWith}%`}
    order by doc_no desc
    limit 1
  `
  const parsedLastNumber = Number(rows[0]?.doc_no.split('-').at(-1) ?? 0)
  const lastNumber = Number.isFinite(parsedLastNumber) ? parsedLastNumber : 0
  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
}

function normalizeVoucherItems(values: z.infer<typeof receiptVoucherWriteSchema>) {
  if (values.items.length === 0) throw new Error('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ')
  return values.items.map((item, index) => {
    const qty = Number(item.qty)
    const price = Number(item.price)
    return {
      amount: Math.round((qty * price + Number.EPSILON) * 100) / 100,
      description: item.description.trim(),
      id: `RVI-${index + 1}`,
      lineNo: index + 1,
      price,
      qty,
      unit: item.unit?.trim() || 'กก.',
    }
  })
}

function purchaseBillItemDescription(item: {
  display_name: string | null
  product_code: string | null
  product_name: string | null
}) {
  if (item.display_name) return item.display_name
  const code = item.product_code ? `${item.product_code} ` : ''
  return `${code}${item.product_name ?? 'รายการสินค้า'}`.trim()
}

function toVoucherNumber(value: Prisma.Decimal | number | string | null) {
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value)
}

function normalizePurchaseBillVoucherItems(items: Array<{
  amount: Prisma.Decimal | number | null
  display_name: string | null
  line_no: number
  price: Prisma.Decimal | number | null
  product_code: string | null
  product_name: string | null
  qty: Prisma.Decimal | number | null
  unit: string | null
}>) {
  if (items.length === 0) throw new Error('บิลซื้อที่เลือกไม่มีรายการสินค้า')
  return items.map((item, index) => {
    const qty = toVoucherNumber(item.qty)
    const price = toVoucherNumber(item.price)
    const amount = item.amount == null
      ? Math.round((qty * price + Number.EPSILON) * 100) / 100
      : toVoucherNumber(item.amount)
    return {
      amount,
      description: purchaseBillItemDescription(item),
      id: `RVI-${index + 1}`,
      lineNo: index + 1,
      price,
      qty,
      unit: item.unit?.trim() || 'กก.',
    }
  })
}

async function buildVoucherWriteData(
  tx: Prisma.TransactionClient,
  values: z.infer<typeof receiptVoucherWriteSchema>,
  actor: string,
  payerSignerName: string,
) {
  const purchaseBill = values.purchaseBillDocNo
    ? await tx.purchase_bills.findUnique({
      select: {
        doc_no: true,
        id: true,
        license_plate: true,
        purchase_bill_items: {
          orderBy: { line_no: 'asc' },
          select: {
            amount: true,
            display_name: true,
            line_no: true,
            price: true,
            product_code: true,
            product_name: true,
            qty: true,
            unit: true,
          },
          where: { item_status: 'active' },
        },
        status: true,
        supplier_address_snapshot: true,
        supplier_name_snapshot: true,
        supplier_phone_snapshot: true,
        supplier_sales_rep_snapshot: true,
        supplier_tax_id_snapshot: true,
        suppliers: { select: { code: true } },
      },
      where: { doc_no: values.purchaseBillDocNo },
    })
    : null
  if (values.purchaseBillDocNo && !purchaseBill) throw new Error('ไม่พบบิลซื้อที่เลือก')
  if (purchaseBill && isPurchaseBillCancelledStatus(purchaseBill.status as (typeof PURCHASE_BILL_CANCELLED_STATUSES)[number] | null)) {
    throw new Error('บิลซื้อที่เลือกถูกยกเลิกแล้ว')
  }
  if (purchaseBill && values.supplierCode && purchaseBill.suppliers?.code !== values.supplierCode) {
    throw new Error('บิลซื้อที่เลือกไม่ตรงกับ Supplier')
  }
  const items = purchaseBill ? normalizePurchaseBillVoucherItems(purchaseBill.purchase_bill_items) : normalizeVoucherItems(values)
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0)
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)
  const sellerName = purchaseBill ? purchaseBill.supplier_name_snapshot ?? '' : values.sellerName?.trim() ?? ''
  if (!purchaseBill && !sellerName) throw new Error('กรุณากรอกชื่อผู้รับเงิน')
  return {
    amount_in_words: values.amountInWords?.trim() || thaiBahtText(totalAmount),
    date: normalizeDate(values.date),
    items: items as Prisma.InputJsonValue,
    license_plate: purchaseBill ? purchaseBill.license_plate ?? null : values.licensePlate || null,
    note: values.note || null,
    payer_signer_name: payerSignerName,
    payment_method: 'รับเงินสด',
    purchase_bill_doc_no: purchaseBill?.doc_no ?? null,
    purchase_bill_id: purchaseBill?.id ?? null,
    receiver_signer_name: sellerName,
    sales_person: purchaseBill ? purchaseBill.supplier_sales_rep_snapshot : values.salesPerson || null,
    seller_address: purchaseBill ? purchaseBill.supplier_address_snapshot : values.sellerAddress || null,
    seller_name: sellerName,
    seller_phone: purchaseBill ? purchaseBill.supplier_phone_snapshot : values.sellerPhone || null,
    seller_tax_id: purchaseBill ? purchaseBill.supplier_tax_id_snapshot : values.sellerTaxId || null,
    total_amount: totalAmount,
    total_qty: totalQty,
    updated_at: new Date(),
    updated_by: actor,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const actor = currentActor(context)

    const [suppliers, purchaseBills, rows, companyProfile] = await Promise.all([
      prisma.suppliers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          active: true,
          address: true,
          code: true,
          name: true,
          phone: true,
          sales_rep: true,
          tax_id: true,
        },
        take: 5000,
        where: { active: true },
      }),
      prisma.purchase_bills.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        select: {
          date: true,
          doc_no: true,
          id: true,
          license_plate: true,
          note: true,
          notes: true,
          purchase_bill_items: {
            orderBy: { line_no: 'asc' },
            select: {
              amount: true,
              display_name: true,
              line_no: true,
              price: true,
              product_code: true,
              product_name: true,
              qty: true,
              unit: true,
            },
            where: { item_status: 'active' },
          },
          suppliers: {
            select: {
              code: true,
            },
          },
          supplier_address_snapshot: true,
          supplier_name_snapshot: true,
          supplier_phone_snapshot: true,
          supplier_sales_rep_snapshot: true,
          supplier_tax_id_snapshot: true,
          total_amount: true,
        },
        take: 5000,
        where: { status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] } },
      }),
      prisma.receipt_vouchers.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        include: {
          receipt_voucher_status_logs: {
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
            select: {
              action: true,
              created_at: true,
              created_by: true,
              from_status: true,
              id: true,
              note: true,
              to_status: true,
              total_amount_snapshot: true,
            },
          },
        },
        take: 5000,
      }),
      prisma.company_profiles.findFirst({
        orderBy: [{ branch_code: 'asc' }, { created_at: 'asc' }],
      }),
    ])

    return NextResponse.json({
      companyProfile: companyProfile
        ? {
          address: companyProfile.address,
          logoUrl: companyProfile.logo_url ?? '',
          name: companyProfile.name,
          nameEn: companyProfile.name_en ?? '',
          phone: companyProfile.phone,
          taxId: companyProfile.tax_id ?? '',
        }
        : null,
      currentActor: actor,
      suppliers: suppliers.map((supplier) => ({
        address: supplier.address ?? '',
        code: supplier.code,
        id: supplier.code,
        name: supplier.name,
        phone: supplier.phone ?? '',
        taxId: supplier.tax_id ?? '',
      })),
      purchaseBills: purchaseBills.map((bill) => ({
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.doc_no,
        items: bill.purchase_bill_items.map((item) => ({
          amount: toNumber(item.amount),
          description: purchaseBillItemDescription(item),
          id: `${bill.doc_no}-${item.line_no}`,
          price: toNumber(item.price),
          qty: toNumber(item.qty),
          unit: item.unit ?? 'กก.',
        })),
        licensePlate: bill.license_plate ?? '',
        note: bill.note ?? bill.notes ?? '',
        salesPerson: bill.supplier_sales_rep_snapshot ?? '',
        sellerAddress: bill.supplier_address_snapshot ?? '',
        sellerCode: bill.suppliers?.code ?? '',
        sellerName: bill.supplier_name_snapshot ?? '',
        sellerPhone: bill.supplier_phone_snapshot ?? '',
        sellerTaxId: bill.supplier_tax_id_snapshot ?? '',
        totalAmount: toNumber(bill.total_amount),
      })),
      rows: rows.map((row) => ({
        amountInWords: row.amount_in_words ?? '',
        createdAt: row.created_at?.toISOString() ?? '',
        createdBy: row.created_by ?? '',
        date: toDateOnly(row.date),
        docNo: row.doc_no,
        id: row.doc_no,
        items: row.items ?? [],
        licensePlate: row.license_plate ?? '',
        note: row.note ?? '',
        payerSignerName: row.payer_signer_name ?? row.created_by ?? '',
        paymentMethod: row.payment_method ?? '',
        purchaseBillId: row.purchase_bill_doc_no ?? '',
        purchaseBillDocNo: row.purchase_bill_doc_no ?? '',
        salesPerson: row.sales_person ?? '',
        sellerAddress: row.seller_address ?? '',
        sellerName: row.seller_name ?? '',
        sellerPhone: row.seller_phone ?? '',
        sellerTaxId: row.seller_tax_id ?? '',
        status: row.status,
        cancelNote: row.cancel_note ?? '',
        cancelledAt: row.cancelled_at?.toISOString() ?? '',
        cancelledBy: row.cancelled_by ?? '',
        timeline: row.receipt_voucher_status_logs.map((log) => ({
          action: log.action,
          createdAt: log.created_at.toISOString(),
          createdBy: log.created_by ?? '',
          fromStatus: log.from_status ?? '',
          id: String(log.id),
          note: log.note ?? '',
          toStatus: log.to_status,
          totalAmount: toNumber(log.total_amount_snapshot),
        })),
        totalAmount: toNumber(row.total_amount),
        totalQty: toNumber(row.total_qty),
        updatedAt: row.updated_at?.toISOString() ?? '',
        updatedBy: row.updated_by ?? '',
      })),
    })
  } catch (caught) {
    console.error('API Error in GET /api/purchase/receipt-vouchers:', caught)
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดใบสำคัญรับเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const actor = currentActor(context)
    const values = receiptVoucherWriteSchema.parse(await request.json())

    const created = await prisma.$transaction(async (tx) => {
      const docNo = await nextReceiptVoucherDocNo(tx, values.date)
      const data = await buildVoucherWriteData(tx, values, actor, actor)
      const created = await tx.receipt_vouchers.create({
        data: {
          doc_no: docNo,
          ...data,
          created_by: actor,
          status: 'active',
        },
        select: { doc_no: true, id: true, total_amount: true },
      })
      await appendReceiptVoucherStatusLog(tx, {
        action: 'created',
        actor,
        receiptVoucherDocNo: docNo,
        receiptVoucherId: created.id,
        toStatus: 'active',
        totalAmount: created.total_amount,
      })
      return created
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.doc_no }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกใบสำคัญรับเงินไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const actor = currentActor(context)
    const body = await request.json()
    if (body?.action === 'cancel') {
      const values = receiptVoucherCancelSchema.parse(body)
      const cancelled = await prisma.$transaction(async (tx) => {
        const existing = await tx.receipt_vouchers.findUnique({
          select: { doc_no: true, id: true, status: true, total_amount: true },
          where: { doc_no: values.docNo },
        })
        if (!existing) throw new Error('ไม่พบใบสำคัญรับเงินที่ต้องการยกเลิก')
        if (existing.status === 'cancelled') throw new Error('ใบสำคัญรับเงินนี้ถูกยกเลิกแล้ว')

        const cancelledAt = new Date()
        const updated = await tx.receipt_vouchers.update({
          data: {
            cancel_note: values.note,
            cancelled_at: cancelledAt,
            cancelled_by: actor,
            status: 'cancelled',
            updated_at: cancelledAt,
            updated_by: actor,
          },
          select: { doc_no: true, id: true, total_amount: true },
          where: { doc_no: values.docNo },
        })
        await appendReceiptVoucherStatusLog(tx, {
          action: 'cancelled',
          actor,
          fromStatus: existing.status,
          note: values.note,
          receiptVoucherDocNo: updated.doc_no ?? values.docNo,
          receiptVoucherId: updated.id,
          toStatus: 'cancelled',
          totalAmount: updated.total_amount,
        })
        return updated
      })

      return NextResponse.json({ docNo: cancelled.doc_no, id: cancelled.doc_no })
    }

    const values = receiptVoucherWriteSchema.extend({
      docNo: z.string().trim().min(1, 'ไม่พบเลขที่ใบสำคัญรับเงิน'),
    }).parse(body)

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.receipt_vouchers.findUnique({
        select: { created_by: true, doc_no: true, id: true, status: true },
        where: { doc_no: values.docNo },
      })
      if (!existing) throw new Error('ไม่พบใบสำคัญรับเงินที่ต้องการแก้ไข')
      if (existing.status === 'cancelled') throw new Error('ใบสำคัญรับเงินที่ยกเลิกแล้วไม่สามารถแก้ไขได้')
      const data = await buildVoucherWriteData(tx, values, actor, existing.created_by ?? actor)
      const updated = await tx.receipt_vouchers.update({
        data,
        select: { doc_no: true, id: true, total_amount: true },
        where: { doc_no: values.docNo },
      })
      await appendReceiptVoucherStatusLog(tx, {
        action: 'edited',
        actor,
        fromStatus: existing.status,
        note: values.note || null,
        receiptVoucherDocNo: updated.doc_no ?? values.docNo,
        receiptVoucherId: updated.id,
        toStatus: existing.status,
        totalAmount: updated.total_amount,
      })
      return updated
    })

    return NextResponse.json({ docNo: updated.doc_no, id: updated.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขใบสำคัญรับเงินไม่ได้', 400)
  }
}
