import type { CustomerReceiptFormValues } from '@/lib/daily'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { applyCustomerAdvanceReceipt, reverseCustomerAdvanceReceipt } from '@/lib/server/customer-advance-settlement'
import { documentBranchCode, nextBankStatementDocNos, nextDailyDocNo, normalizeDate, toNumber } from '@/lib/server/daily'
import { requireFinanceActor } from '@/lib/server/finance-actor'
import { prisma } from '@/lib/server/prisma'
import { getFinanceCurrencyPolicy } from '@/lib/server/finance-currency-policy'
import { functionalBankStatementMovement, reverseFunctionalBankStatementInflow } from '@/lib/server/bank-statement-booking'
import { postFcdReceiptAccountSplits, reverseFcdReceiptAccountSplits } from '@/lib/server/fcd-receipt-posting'
import { settlementDifferenceReasonForReceipt } from '@/lib/server/customer-receipt-settlement-difference'
import { findFcdRateSnapshot } from '@/lib/server/fcd-rate-snapshot'
import { calculateSettlementBookAmount, fcdFxRate, requireFcdInputMoneyAmount } from '@/lib/server/fcd-money'
import { Prisma } from '../../../generated/prisma/client'

const RECEIPT_DOC_PREFIX = 'RCP'
const RECEIPT_REF_TYPE = 'RCP'
const RECEIPT_CANCEL_REF_TYPE = 'RCP-CANCEL'
const CUSTOMER_RECEIPT_STATUS_ACTIVE = 'active'
const CUSTOMER_RECEIPT_STATUS_CANCELLED = 'cancelled'
const CUSTOMER_RECEIPT_STATUS_PENDING = 'pending'
const SALES_BILL_STATUS_OPEN = 'open'
const SALES_BILL_STATUS_PARTIAL = 'partial'
const SALES_BILL_STATUS_PAID = 'paid'
const MONEY_EPSILON = 0.005

type AuthContextForReceipt = {
  appUser: { email: string | null } | null
  authUser: { email?: string }
}

type AccountReference = NonNullable<Awaited<ReturnType<typeof findActiveAccountReferenceByCode>>>

type ReceiptLineInput = {
  discountAmount: number
  receiptAmount: number
  salesBillDocNo: string
  withholdingTaxAmount: number
}

type CustomerAdvanceReceiptLineInput = {
  customerAdvanceDocNo: string
  receiptAmount: number
}

type ReceiptAccountSplitInput = {
  account: AccountReference
  amount: number
}

type PaymentMethodReference = {
  code: string
  id: bigint
  name: string
  type: string
}

type PreparedCustomerReceipt = {
  account: AccountReference
  accountSplits: ReceiptAccountSplitInput[]
  actor: string
  bankFeeTotal: number
  discountTotal: number
  grossAmount: number
  customerAdvanceLines: CustomerAdvanceReceiptLineInput[]
  salesBillLines: ReceiptLineInput[]
  netCashIn: number
  sourceType: CustomerReceiptFormValues['sourceType']
  withholdingTaxTotal: number
}

type CreateReceiptOptions = {
  replacementOfDocNo?: string
  statusLogAction?: string
}

type CreateForeignReceiptOptions = {
  replacementOfId?: bigint
  statusLogAction?: string
}

type CancelReceiptOptions = {
  statusLogAction?: string
}

function foreignReceiptCurrency(values: CustomerReceiptFormValues, functionalCurrencyCode: string) {
  return (values.receiptCurrencyCode ?? functionalCurrencyCode).trim().toUpperCase()
}

function decimalReceiptMoney(value: number, label: string) {
  return requireFcdInputMoneyAmount(value)
}

function allocateForeignReceiptLines<T extends { arAmount: Prisma.Decimal }>(
  lines: T[],
  totalNative: Prisma.Decimal,
  totalSettlement: Prisma.Decimal,
) {
  const totalAr = lines.reduce((total, line) => total.plus(line.arAmount), new Prisma.Decimal(0))
  if (totalAr.lte(0)) throw new Error('ยอดตัด AR ต้องมากกว่า 0')
  let remainingNative = totalNative
  let remainingSettlement = totalSettlement
  return lines.map((line, index) => {
    const nativeAmount = index === lines.length - 1
      ? remainingNative
      : totalNative.mul(line.arAmount).div(totalAr).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    const settlementBookAmount = index === lines.length - 1
      ? remainingSettlement
      : totalSettlement.mul(line.arAmount).div(totalAr).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    remainingNative = remainingNative.minus(nativeAmount)
    remainingSettlement = remainingSettlement.minus(settlementBookAmount)
    return { nativeAmount, settlementBookAmount }
  })
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function assertMoneyEquals(left: number, right: number, message: string) {
  if (Math.abs(roundMoney(left) - roundMoney(right)) > MONEY_EPSILON) {
    throw new Error(message)
  }
}

function customerReceiptLines(values: CustomerReceiptFormValues): ReceiptLineInput[] {
  if (values.sourceType !== 'SB') return []
  if (values.salesBillLines.length > 0) {
    return values.salesBillLines.map((line) => ({
      discountAmount: line.discountAmount,
      receiptAmount: line.receiptAmount,
      salesBillDocNo: line.salesBillDocNo.trim(),
      withholdingTaxAmount: line.withholdingTaxAmount,
    }))
  }

  throw new Error('เลือกบิลขายอย่างน้อย 1 รายการ')
}

async function prepareCustomerReceipt(values: CustomerReceiptFormValues, context: AuthContextForReceipt): Promise<PreparedCustomerReceipt> {
  const actor = requireFinanceActor(context)
  const lines = customerReceiptLines(values)
  const customerAdvanceLines = values.sourceType === 'CADV'
    ? values.customerAdvanceLines.map((line) => ({ customerAdvanceDocNo: line.customerAdvanceDocNo.trim(), receiptAmount: line.receiptAmount }))
    : []
  if (values.sourceType === 'CADV' && customerAdvanceLines.length === 0) throw new Error('เลือก CADV อย่างน้อย 1 รายการ')
  const duplicateBill = lines.find((line, index) => lines.findIndex((candidate) => candidate.salesBillDocNo === line.salesBillDocNo) !== index)
  if (duplicateBill) {
    throw new Error(`บิลขาย ${duplicateBill.salesBillDocNo} ถูกเลือกซ้ำใน Receipt Voucher เดียวกัน`)
  }

  const duplicateCustomerAdvance = customerAdvanceLines.find((line, index) => customerAdvanceLines.findIndex((candidate) => candidate.customerAdvanceDocNo === line.customerAdvanceDocNo) !== index)
  if (duplicateCustomerAdvance) throw new Error(`CADV ${duplicateCustomerAdvance.customerAdvanceDocNo} ถูกเลือกซ้ำใน Receipt Voucher เดียวกัน`)

  const grossAmount = values.sourceType === 'SB'
    ? roundMoney(lines.reduce((sum, line) => sum + line.receiptAmount, 0))
    : roundMoney(customerAdvanceLines.reduce((sum, line) => sum + line.receiptAmount, 0))
  const discountTotal = values.sourceType === 'SB' ? roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0)) : 0
  const withholdingTaxTotal = values.sourceType === 'SB' ? roundMoney(lines.reduce((sum, line) => sum + line.withholdingTaxAmount, 0)) : 0
  const bankFeeTotal = roundMoney(values.fee)
  const netCashIn = roundMoney(grossAmount - bankFeeTotal - withholdingTaxTotal)

  assertMoneyEquals(values.amount, grossAmount, 'ยอดรับรวมไม่ตรงกับยอดรับรายบิล')
  assertMoneyEquals(values.discount, discountTotal, 'ส่วนลดรวมไม่ตรงกับรายการต้นทาง')
  assertMoneyEquals(values.withholdingTax, withholdingTaxTotal, 'ภาษีหัก ณ ที่จ่ายรวมไม่ตรงกับรายการต้นทาง')
  if (netCashIn < 0) {
    throw new Error('ยอดรับสุทธิต้องไม่ติดลบ')
  }

  const rawSplits = values.splits && values.splits.length > 0
    ? values.splits
    : [{ accountId: values.accountId, amount: netCashIn, id: null }]
  const splitTotal = roundMoney(rawSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0))
  assertMoneyEquals(splitTotal, netCashIn, 'รวมยอดแยกบัญชีรับเงินต้องเท่ากับยอดสุทธิที่ต้องรับ')

  const splitAccountCodes = [...new Set(rawSplits.map((split) => split.accountId).filter(Boolean))]
  const splitAccountReferences = await Promise.all(splitAccountCodes.map(async (code) => [code, await findActiveAccountReferenceByCode(code)] as const))
  const splitAccountByCode = new Map(splitAccountReferences)
  if (splitAccountReferences.some(([, splitAccount]) => !splitAccount)) {
    throw new Error('บัญชีรับเงินบางรายการไม่ถูกต้องหรือไม่ active')
  }
  const accountSplits = rawSplits.map((split) => {
    const splitAccount = splitAccountByCode.get(split.accountId)
    if (!splitAccount) throw new Error('บัญชีรับเงินบางรายการไม่ถูกต้องหรือไม่ active')
    return { account: splitAccount, amount: roundMoney(Number(split.amount) || 0) }
  }).filter((split) => split.amount > 0)
  const account = accountSplits[0]?.account ?? null
  if (!account) {
    throw new Error('บัญชีรับเงินไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
  if (account.accountGroup === 'virtual') {
    throw new Error('บัญชีเจ้าหนี้เงินทดรองจ่ายใช้รับเงินลูกค้าไม่ได้')
  }

  return { account, accountSplits, actor, bankFeeTotal, customerAdvanceLines, discountTotal, grossAmount, netCashIn, salesBillLines: lines, sourceType: values.sourceType, withholdingTaxTotal }
}

async function findActiveCustomerByCode(value: string | null | undefined, tx: Prisma.TransactionClient) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return null

  const customer = await tx.customers.findFirst({
    select: { code: true, id: true, name: true },
    where: { active: true, code: normalized },
  })
  if (!customer) return null

  return {
    code: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
    id: customer.id,
    name: customer.name,
  }
}

async function findActivePaymentMethod(value: string, tx: Prisma.TransactionClient): Promise<PaymentMethodReference | null> {
  const normalized = value.trim()
  if (!normalized) return null

  const method = await tx.payment_methods.findFirst({
    select: { code: true, id: true, name: true, type: true },
    where: {
      active: true,
      OR: [
        { code: normalized.toUpperCase() },
        { name: normalized },
      ],
    },
  })
  if (!method) return null

  return {
    code: method.code,
    id: method.id,
    name: method.name,
    type: method.type,
  }
}

async function createCustomerReceiptInTransaction(
  values: CustomerReceiptFormValues,
  prepared: PreparedCustomerReceipt,
  functionalCurrencyCode: string,
  tx: Prisma.TransactionClient,
  options: CreateReceiptOptions = {},
) {
  if (values.sourceType === 'CADV') {
    return createCustomerAdvanceReceiptInTransaction(values, prepared, functionalCurrencyCode, tx, options)
  }

  const {
    account,
    accountSplits,
    actor,
    bankFeeTotal,
    discountTotal,
    grossAmount,
    salesBillLines: lines,
    netCashIn,
    withholdingTaxTotal,
  } = prepared

  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('customer_receipts.doc_no'))`
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`

  const customer = await findActiveCustomerByCode(values.customerId, tx)
  if (!customer) {
    throw new Error('ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  const paymentMethod = await findActivePaymentMethod(values.method, tx)
  if (!paymentMethod) {
    throw new Error('วิธีรับเงินไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  const billDocNos = lines.map((line) => line.salesBillDocNo)
  const salesBills = await tx.sales_bills.findMany({
    select: {
      branch_id: true,
      customer_id: true,
      doc_no: true,
      id: true,
      receivable_balance: true,
      received_amount: true,
      status: true,
      total_amount: true,
    },
    where: { doc_no: { in: billDocNos } },
  })
  const salesBillByDocNo = new Map(salesBills.map((bill) => [bill.doc_no, bill]))

  const missingBill = billDocNos.find((lineDocNo) => !salesBillByDocNo.has(lineDocNo))
  if (missingBill) {
    throw new Error(`ไม่พบบิลขาย ${missingBill}`)
  }

  const selectedBranch = values.branchId
    ? await tx.branches.findFirst({ select: { code: true, id: true }, where: { active: true, code: values.branchId } })
    : null
  if (!selectedBranch) throw new Error('กรุณาเลือกสาขาก่อนเลือกบิลขาย')
  const branchCode = documentBranchCode(selectedBranch.code)
  if (!branchCode) throw new Error('สาขาที่เลือกไม่มีรหัสสาขาสำหรับสร้างเลขที่ใบรับเงิน')

  const distinctBranchIds = new Set<bigint>()
  for (const line of lines) {
    const bill = salesBillByDocNo.get(line.salesBillDocNo)
    if (!bill) throw new Error(`ไม่พบบิลขาย ${line.salesBillDocNo}`)
    if (bill.customer_id !== customer.id) {
      throw new Error(`บิลขาย ${line.salesBillDocNo} ไม่ใช่ของลูกค้าที่เลือก`)
    }
    if (bill.branch_id !== selectedBranch.id) {
      throw new Error(`บิลขาย ${line.salesBillDocNo} ไม่อยู่ในสาขาที่เลือก`)
    }
    if (String(bill.status ?? '').toLowerCase() === 'cancelled') {
      throw new Error(`บิลขาย ${line.salesBillDocNo} ถูกยกเลิกแล้ว`)
    }

    const outstanding = roundMoney(toNumber(bill.receivable_balance))
    const allocatedArAmount = roundMoney(line.receiptAmount + line.discountAmount + line.withholdingTaxAmount)
    if (outstanding <= MONEY_EPSILON) {
      throw new Error(`บิลขาย ${line.salesBillDocNo} ไม่มียอดค้างรับ`)
    }
    if (allocatedArAmount > outstanding + MONEY_EPSILON) {
      throw new Error(`ยอดรับของบิลขาย ${line.salesBillDocNo} เกินยอดค้างรับ`)
    }
    if (bill.branch_id) {
      distinctBranchIds.add(bill.branch_id)
    }
  }

  if (distinctBranchIds.size !== 1 || !distinctBranchIds.has(selectedBranch.id)) {
    throw new Error('บิลขายที่เลือกต้องอยู่ในสาขาเดียวกัน')
  }
  const docNo = values.docNo ?? await nextDailyDocNo('customer_receipts', RECEIPT_DOC_PREFIX, values.date, tx, branchCode)
  const bankStatementDocNos = await nextBankStatementDocNos(values.date, branchCode, accountSplits.length, tx)
  const branchId = selectedBranch.id
  const existingReceipt = await tx.customer_receipts.findUnique({
    select: { customer_id: true, id: true, status: true },
    where: { doc_no: docNo },
  })
  if (existingReceipt && existingReceipt.status !== CUSTOMER_RECEIPT_STATUS_PENDING) {
    throw new Error(`เลขที่ Receipt Voucher ${docNo} ถูกใช้งานแล้ว`)
  }
  if (existingReceipt && existingReceipt.customer_id !== customer.id) {
    throw new Error(`Receipt Voucher ${docNo} ไม่ใช่ของลูกค้าที่เลือก`)
  }

  const receiptHeader = existingReceipt
    ? await tx.customer_receipts.update({
      data: {
        account_code_snapshot: account.code,
        account_id: account.id,
        account_name_snapshot: account.name,
        bank_fee_total: bankFeeTotal,
        branch_id: branchId,
        customer_code_snapshot: customer.code,
        customer_name_snapshot: customer.name,
        date: normalizeDate(values.date),
        discount_total: discountTotal,
        gross_amount: grossAmount,
        net_cash_in: netCashIn,
        notes: values.notes,
        payment_method_code_snapshot: paymentMethod.code,
        payment_method_id: paymentMethod.id,
        payment_method_name_snapshot: paymentMethod.name,
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        source_type: 'SB',
        updated_at: new Date(),
        updated_by: actor,
        version: { increment: 1 },
        withholding_tax_total: withholdingTaxTotal,
      },
      where: { id: existingReceipt.id },
    })
    : await tx.customer_receipts.create({
      data: {
        account_code_snapshot: account.code,
        account_id: account.id,
        account_name_snapshot: account.name,
        bank_fee_total: bankFeeTotal,
        branch_id: branchId,
        customer_code_snapshot: customer.code,
        customer_id: customer.id,
        customer_name_snapshot: customer.name,
        date: normalizeDate(values.date),
        discount_total: discountTotal,
        doc_no: docNo,
        gross_amount: grossAmount,
        net_cash_in: netCashIn,
        notes: values.notes,
        payment_method_code_snapshot: paymentMethod.code,
        payment_method_id: paymentMethod.id,
        payment_method_name_snapshot: paymentMethod.name,
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        source_type: 'SB',
        updated_by: actor,
        withholding_tax_total: withholdingTaxTotal,
        created_by: actor,
      },
    })

  if (existingReceipt) {
    await tx.customer_receipt_allocations.deleteMany({
      where: { receipt_id: receiptHeader.id, status: CUSTOMER_RECEIPT_STATUS_PENDING },
    })
  }

  await tx.bank_statement.createMany({
    data: accountSplits.map((split, index) => ({
      ...functionalBankStatementMovement({
        amountIn: split.amount,
        amountOut: 0,
        functionalCurrencyCode,
        idempotencyKey: `customer-receipt:${docNo}:split:${index + 1}`,
        sourceEventKey: `customer-receipt:${docNo}:split:${index + 1}`,
        sourceEventType: 'customer_receipt',
      }),
      account_id: split.account.id,
      branch_id: branchId,
      created_by: actor,
      date: normalizeDate(values.date),
      description: `${docNo} - รับเงิน Customer${accountSplits.length > 1 ? ` (split ${index + 1}/${accountSplits.length})` : ''}`,
      doc_no: bankStatementDocNos[index]!,
      ref_id: stringifyBusinessValue(receiptHeader.id),
      ref_no: docNo,
      ref_type: RECEIPT_REF_TYPE,
      type: 'รับเงิน Customer',
    })),
  })
  const createdBankStatements = await tx.bank_statement.findMany({
    where: { doc_no: { in: bankStatementDocNos } },
  })
  const bankStatementByDocNo = new Map(createdBankStatements.map((statement) => [statement.doc_no, statement] as const))
  const primaryBankStatementDocNo = bankStatementDocNos[0]!
  const primaryBankStatement = bankStatementByDocNo.get(primaryBankStatementDocNo)

  await tx.customer_receipts.update({
    data: {
      bank_statement_doc_no: primaryBankStatementDocNo,
      bank_statement_id: primaryBankStatement?.id ?? null,
    },
    where: { id: receiptHeader.id },
  })

  for (const [index, line] of lines.entries()) {
    const bill = salesBillByDocNo.get(line.salesBillDocNo)
    if (!bill) throw new Error(`ไม่พบบิลขาย ${line.salesBillDocNo}`)

    const lineBankFee = index === 0 ? bankFeeTotal : 0
    const lineNetAmount = roundMoney(line.receiptAmount - line.withholdingTaxAmount - lineBankFee)
    const allocatedArAmount = roundMoney(line.receiptAmount + line.discountAmount + line.withholdingTaxAmount)
    const outstandingBefore = roundMoney(toNumber(bill.receivable_balance))
    const outstandingAfter = roundMoney(outstandingBefore - allocatedArAmount)
    const receivedAfter = roundMoney(toNumber(bill.received_amount) + allocatedArAmount)
    const nextStatus = outstandingAfter <= MONEY_EPSILON ? SALES_BILL_STATUS_PAID : SALES_BILL_STATUS_PARTIAL

    const legacyReceiptLine = await tx.receipts.create({
      data: {
        account_id: account.id,
        amount: line.receiptAmount,
        bank_fee: lineBankFee,
        bill_id: bill.id,
        branch_id: branchId,
        created_by: actor,
        customer_id: customer.id,
        date: normalizeDate(values.date),
        discount: line.discountAmount,
        doc_no: docNo,
        fee: lineBankFee,
        lines: {
          customerReceiptId: stringifyBusinessValue(receiptHeader.id),
          lineNo: index + 1,
          paymentMethodCode: paymentMethod.code,
          salesBillDocNo: line.salesBillDocNo,
        },
        method: paymentMethod.name,
        net_amount: lineNetAmount,
        notes: values.notes,
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        updated_by: actor,
        voucher_id: docNo,
        withholding_tax: line.withholdingTaxAmount,
      },
    })

    await tx.customer_receipt_allocations.create({
      data: {
        allocated_ar_amount: allocatedArAmount,
        created_by: actor,
        customer_code_snapshot: customer.code,
        discount_amount: line.discountAmount,
        line_no: index + 1,
        outstanding_after: Math.max(0, outstandingAfter),
        outstanding_before: outstandingBefore,
        receipt_amount: line.receiptAmount,
        receipt_id: receiptHeader.id,
        receipt_line_id: legacyReceiptLine.id,
        sales_bill_doc_no_snapshot: line.salesBillDocNo,
        sales_bill_id: bill.id,
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        updated_by: actor,
        withholding_tax_amount: line.withholdingTaxAmount,
      },
    })

    await tx.sales_bills.update({
      data: {
        receivable_balance: Math.max(0, outstandingAfter),
        received_amount: receivedAfter,
        status: nextStatus,
        updated_at: new Date(),
        updated_by: actor,
      },
      where: { id: bill.id },
    })

    await tx.sales_bill_status_logs.create({
      data: {
        action: 'customer_receipt_allocated',
        created_by: actor,
        event_key: `sales-bill.receipt.${docNo}.${bill.doc_no}.${index + 1}`,
        from_status: bill.status,
        meta: {
          allocationLineNo: index + 1,
          customerReceiptDocNo: docNo,
          legacyReceiptLineId: stringifyBusinessValue(legacyReceiptLine.id),
          replacementOfDocNo: options.replacementOfDocNo ?? null,
        },
        note: options.replacementOfDocNo ? `ออกใบแทน ${options.replacementOfDocNo}` : `รับเงิน ${docNo}`,
        receivable_balance_snapshot: Math.max(0, outstandingAfter),
        received_amount_snapshot: receivedAfter,
        sales_bill_doc_no: bill.doc_no,
        sales_bill_id: bill.id,
        to_status: nextStatus,
        total_amount_snapshot: toNumber(bill.total_amount),
      },
    })
  }

  await tx.customer_receipt_status_logs.create({
    data: {
      action: options.statusLogAction ?? 'created',
      created_by: actor,
      event_key: `customer-receipt.${options.statusLogAction ?? 'created'}.${docNo}`,
      gross_amount_snapshot: grossAmount,
      meta: {
        allocationCount: lines.length,
        bankStatementDocNos,
        netCashIn,
        replacementOfDocNo: options.replacementOfDocNo ?? null,
        splitCount: accountSplits.length,
      },
      net_cash_in_snapshot: netCashIn,
      note: options.replacementOfDocNo ? `ออกใบแทน ${options.replacementOfDocNo}` : 'บันทึกรับเงิน Customer',
      receipt_doc_no: docNo,
      receipt_id: receiptHeader.id,
      to_status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
    },
  })

  return { id: docNo }
}

async function createCustomerAdvanceReceiptInTransaction(
  values: CustomerReceiptFormValues,
  prepared: PreparedCustomerReceipt,
  functionalCurrencyCode: string,
  tx: Prisma.TransactionClient,
  options: CreateReceiptOptions = {},
) {
  const {
    account,
    accountSplits,
    actor,
    bankFeeTotal,
    customerAdvanceLines,
    grossAmount,
    netCashIn,
  } = prepared

  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('customer_receipts.doc_no'))`
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`

  const customer = await findActiveCustomerByCode(values.customerId, tx)
  if (!customer) throw new Error('ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
  const paymentMethod = await findActivePaymentMethod(values.method, tx)
  if (!paymentMethod) throw new Error('วิธีรับเงินไม่ถูกต้องหรือถูกปิดใช้งาน')

  const customerAdvanceRows = await tx.customer_advances.findMany({
    select: {
      branch_id: true,
      customer_id: true,
      customer_advance_statuses: { select: { code: true } },
      doc_no: true,
      id: true,
      target_amount: true,
      received_amount: true,
    },
    where: { doc_no: { in: customerAdvanceLines.map((line) => line.customerAdvanceDocNo) } },
  })
  const advanceByDocNo = new Map(customerAdvanceRows.map((advance) => [advance.doc_no, advance]))
  const missingAdvance = customerAdvanceLines.find((line) => !advanceByDocNo.has(line.customerAdvanceDocNo))
  if (missingAdvance) throw new Error(`ไม่พบ CADV ${missingAdvance.customerAdvanceDocNo}`)

  const branchIds = new Set<bigint>()
  for (const line of customerAdvanceLines) {
    const advance = advanceByDocNo.get(line.customerAdvanceDocNo)
    if (!advance) throw new Error(`ไม่พบ CADV ${line.customerAdvanceDocNo}`)
    if (advance.customer_id !== customer.id) throw new Error(`CADV ${line.customerAdvanceDocNo} ไม่ใช่ของลูกค้าที่เลือก`)
    if (advance.customer_advance_statuses.code === 'cancelled') throw new Error(`CADV ${line.customerAdvanceDocNo} ถูกยกเลิกแล้ว`)
    const remaining = roundMoney(toNumber(advance.target_amount) - toNumber(advance.received_amount))
    if (line.receiptAmount > remaining + MONEY_EPSILON) throw new Error(`ยอดรับ CADV ${line.customerAdvanceDocNo} เกินยอดคงเหลือ`)
    if (advance.branch_id) branchIds.add(advance.branch_id)
  }

  const branchId = branchIds.size === 1 ? [...branchIds][0] : null
  const branch = branchId
    ? await tx.branches.findUnique({ select: { code: true }, where: { id: branchId } })
    : null
  const docNo = values.docNo ?? await nextDailyDocNo('customer_receipts', RECEIPT_DOC_PREFIX, values.date, tx, documentBranchCode(branch?.code))
  if (!branch?.code) throw new Error('ไม่พบรหัสสาขาสำหรับออกเลข Bank Statement ของ CADV')
  const bankStatementDocNos = await nextBankStatementDocNos(values.date, documentBranchCode(branch.code)!, accountSplits.length, tx)
  const existingReceipt = await tx.customer_receipts.findUnique({
    select: { customer_id: true, id: true, source_type: true, status: true },
    where: { doc_no: docNo },
  })
  if (existingReceipt && existingReceipt.status !== CUSTOMER_RECEIPT_STATUS_PENDING) throw new Error(`เลขที่ Receipt Voucher ${docNo} ถูกใช้งานแล้ว`)
  if (existingReceipt && existingReceipt.customer_id !== customer.id) throw new Error(`Receipt Voucher ${docNo} ไม่ใช่ของลูกค้าที่เลือก`)
  if (existingReceipt && existingReceipt.source_type !== 'CADV') throw new Error(`Receipt Voucher ${docNo} ไม่ใช่รายการ CADV`)

  const receiptHeader = existingReceipt
    ? await tx.customer_receipts.update({
      data: {
        account_code_snapshot: account.code,
        account_id: account.id,
        account_name_snapshot: account.name,
        bank_fee_total: bankFeeTotal,
        branch_id: branchId,
        customer_code_snapshot: customer.code,
        customer_name_snapshot: customer.name,
        date: normalizeDate(values.date),
        discount_total: 0,
        gross_amount: grossAmount,
        net_cash_in: netCashIn,
        notes: values.notes,
        payment_method_code_snapshot: paymentMethod.code,
        payment_method_id: paymentMethod.id,
        payment_method_name_snapshot: paymentMethod.name,
        source_type: 'CADV',
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        updated_at: new Date(),
        updated_by: actor,
        version: { increment: 1 },
        withholding_tax_total: 0,
      },
      where: { id: existingReceipt.id },
    })
    : await tx.customer_receipts.create({
      data: {
        account_code_snapshot: account.code,
        account_id: account.id,
        account_name_snapshot: account.name,
        bank_fee_total: bankFeeTotal,
        branch_id: branchId,
        customer_code_snapshot: customer.code,
        customer_id: customer.id,
        customer_name_snapshot: customer.name,
        date: normalizeDate(values.date),
        discount_total: 0,
        doc_no: docNo,
        gross_amount: grossAmount,
        net_cash_in: netCashIn,
        notes: values.notes,
        payment_method_code_snapshot: paymentMethod.code,
        payment_method_id: paymentMethod.id,
        payment_method_name_snapshot: paymentMethod.name,
        source_type: 'CADV',
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        updated_by: actor,
        withholding_tax_total: 0,
        created_by: actor,
      },
    })

  if (existingReceipt) {
    await tx.customer_receipt_advance_allocations.deleteMany({
      where: { receipt_id: receiptHeader.id, status: CUSTOMER_RECEIPT_STATUS_PENDING },
    })
  }

  await tx.bank_statement.createMany({
    data: accountSplits.map((split, index) => ({
      ...functionalBankStatementMovement({
        amountIn: split.amount,
        amountOut: 0,
        functionalCurrencyCode,
        idempotencyKey: `customer-advance-receipt:${docNo}:split:${index + 1}`,
        sourceEventKey: `customer-advance-receipt:${docNo}:split:${index + 1}`,
        sourceEventType: 'customer_advance_receipt',
      }),
      account_id: split.account.id,
      branch_id: branchId,
      created_by: actor,
      date: normalizeDate(values.date),
      description: `${docNo} - รับเงิน CADV${accountSplits.length > 1 ? ` (split ${index + 1}/${accountSplits.length})` : ''}`,
      doc_no: bankStatementDocNos[index]!,
      ref_id: stringifyBusinessValue(receiptHeader.id),
      ref_no: docNo,
      ref_type: RECEIPT_REF_TYPE,
      type: 'รับเงิน Customer',
    })),
  })
  const createdBankStatements = await tx.bank_statement.findMany({ where: { doc_no: { in: bankStatementDocNos } } })
  const bankStatementByDocNo = new Map(createdBankStatements.map((statement) => [statement.doc_no, statement]))
  const primaryBankStatementDocNo = bankStatementDocNos[0]!
  await tx.customer_receipts.update({
    data: { bank_statement_doc_no: primaryBankStatementDocNo, bank_statement_id: bankStatementByDocNo.get(primaryBankStatementDocNo)?.id ?? null },
    where: { id: receiptHeader.id },
  })

  for (const [index, line] of customerAdvanceLines.entries()) {
    const advance = advanceByDocNo.get(line.customerAdvanceDocNo)
    if (!advance) throw new Error(`ไม่พบ CADV ${line.customerAdvanceDocNo}`)
    const settlement = await applyCustomerAdvanceReceipt(tx, advance.id, line.receiptAmount, actor)
    await tx.customer_receipt_advance_allocations.create({
      data: {
        available_after: settlement.availableAfter,
        available_before: settlement.availableBefore,
        created_by: actor,
        customer_advance_doc_no_snapshot: advance.doc_no,
        customer_advance_id: advance.id,
        customer_code_snapshot: customer.code,
        line_no: index + 1,
        receipt_amount: line.receiptAmount,
        received_after: settlement.receivedAfter,
        received_before: settlement.receivedBefore,
        receipt_id: receiptHeader.id,
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        updated_by: actor,
      },
    })
  }

  await tx.customer_receipt_status_logs.create({
    data: {
      action: options.statusLogAction ?? 'created',
      created_by: actor,
      event_key: `customer-receipt.${options.statusLogAction ?? 'created'}.${docNo}`,
      gross_amount_snapshot: grossAmount,
      meta: {
        allocationCount: customerAdvanceLines.length,
        bankStatementDocNos,
        netCashIn,
        replacementOfDocNo: options.replacementOfDocNo ?? null,
        sourceType: 'CADV',
        splitCount: accountSplits.length,
      },
      net_cash_in_snapshot: netCashIn,
      note: options.replacementOfDocNo ? `ออกใบแทน ${options.replacementOfDocNo}` : 'บันทึกรับเงิน CADV',
      receipt_doc_no: docNo,
      receipt_id: receiptHeader.id,
      to_status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
    },
  })

  return { id: docNo }
}

async function cancelCustomerAdvanceReceiptInTransaction(
  tx: Prisma.TransactionClient,
  docNo: string,
  reason: string,
  actor: string,
  options: CancelReceiptOptions = {},
) {
  const receipt = await tx.customer_receipts.findUnique({
    include: { customer_receipt_advance_allocations: { orderBy: [{ line_no: 'asc' }] } },
    where: { doc_no: docNo },
  })
  if (!receipt) throw new Error('ไม่พบ Receipt Voucher CADV ที่ต้องการยกเลิก')
  if (receipt.source_type !== 'CADV') throw new Error(`Receipt Voucher ${docNo} ไม่ใช่รายการ CADV`)

  const receiptBankStatements = await tx.bank_statement.findMany({
    orderBy: [{ doc_no: 'asc' }],
    select: { account_id: true, book_amount_in: true, book_fx_rate: true, movement_currency_code: true, native_amount_in: true },
    where: { book_amount_in: { gt: 0 }, ref_id: stringifyBusinessValue(receipt.id), ref_type: RECEIPT_REF_TYPE },
  })
  if (receiptBankStatements.length === 0) throw new Error('ไม่พบ Bank Statement ที่ persist สำหรับยกเลิก Receipt Voucher CADV')
  const bankStatementsToReverse = receiptBankStatements
  if (!receipt.branch_id) throw new Error('Receipt Voucher CADV ไม่มีสาขาสำหรับออกเลข Bank Statement')
  const receiptBranch = await tx.branches.findUnique({ select: { code: true }, where: { id: receipt.branch_id } })
  if (!receiptBranch?.code) throw new Error('ไม่พบรหัสสาขาสำหรับยกเลิก Bank Statement CADV')
  const reversalBankDocNos = await nextBankStatementDocNos(toDateString(receipt.date), documentBranchCode(receiptBranch.code)!, bankStatementsToReverse.length, tx)
  await tx.bank_statement.createMany({
    data: bankStatementsToReverse.map((statement, index) => ({
      ...reverseFunctionalBankStatementInflow({
        bookAmountIn: statement.book_amount_in,
        bookFxRate: statement.book_fx_rate,
        idempotencyKey: `customer-advance-receipt:${receipt.doc_no}:cancel:split:${index + 1}`,
        movementCurrencyCode: statement.movement_currency_code,
        nativeAmountIn: statement.native_amount_in,
        sourceEventKey: `customer-advance-receipt:${receipt.doc_no}:cancel:split:${index + 1}`,
        sourceEventType: 'customer_advance_receipt_reversal',
      }),
      account_id: statement.account_id,
      branch_id: receipt.branch_id,
      created_by: actor,
      date: receipt.date,
      description: `${receipt.doc_no} - ยกเลิกรับเงิน CADV${bankStatementsToReverse.length > 1 ? ` (split ${index + 1}/${bankStatementsToReverse.length})` : ''}`,
      doc_no: reversalBankDocNos[index]!,
      ref_id: stringifyBusinessValue(receipt.id),
      ref_no: receipt.doc_no,
      ref_type: RECEIPT_CANCEL_REF_TYPE,
      type: 'ยกเลิกรับเงิน Customer',
    })),
  })

  for (const allocation of receipt.customer_receipt_advance_allocations) {
    if (allocation.status !== CUSTOMER_RECEIPT_STATUS_ACTIVE) continue
    await reverseCustomerAdvanceReceipt(tx, allocation.customer_advance_id, toNumber(allocation.receipt_amount), actor)
    await tx.customer_receipt_advance_allocations.update({
      data: { status: CUSTOMER_RECEIPT_STATUS_CANCELLED, updated_at: new Date(), updated_by: actor, version: { increment: 1 } },
      where: { id: allocation.id },
    })
  }

  await tx.customer_receipts.update({
    data: {
      cancel_reason: reason,
      cancelled_at: new Date(),
      cancelled_by: actor,
      status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
      updated_at: new Date(),
      updated_by: actor,
      version: { increment: 1 },
    },
    where: { id: receipt.id },
  })
  const statusLogAction = options.statusLogAction ?? 'cancelled'
  await tx.customer_receipt_status_logs.create({
    data: {
      action: statusLogAction,
      created_by: actor,
      event_key: `customer-receipt.${statusLogAction}.${receipt.doc_no}`,
      from_status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
      gross_amount_snapshot: receipt.gross_amount,
      meta: { bankStatementDocNos: reversalBankDocNos, reason, sourceType: 'CADV' },
      net_cash_in_snapshot: receipt.net_cash_in,
      note: reason,
      receipt_doc_no: receipt.doc_no,
      receipt_id: receipt.id,
      to_status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
    },
  })

  return { id: receipt.doc_no, status: CUSTOMER_RECEIPT_STATUS_CANCELLED }
}

async function cancelForeignCustomerAdvanceReceiptInTransaction(
  tx: Prisma.TransactionClient,
  docNo: string,
  reason: string,
  actor: string,
  options: CancelReceiptOptions = {},
) {
  const receipt = await tx.customer_receipts.findUnique({
    include: { customer_receipt_advance_allocations: { orderBy: [{ line_no: 'asc' }] } },
    where: { doc_no: docNo },
  })
  if (!receipt || receipt.source_type !== 'CADV' || !receipt.receipt_currency_code) {
    throw new Error('ไม่พบ Receipt Voucher CADV ต่างประเทศที่ต้องการยกเลิก')
  }
  if (!receipt.branch_id) throw new Error('Receipt Voucher CADV ต่างประเทศไม่มีสาขาสำหรับยกเลิก')
  const branch = await tx.branches.findUnique({ select: { code: true }, where: { id: receipt.branch_id } })
  const branchCode = documentBranchCode(branch?.code)
  if (!branchCode) throw new Error('ไม่พบรหัสสาขาสำหรับยกเลิก Bank Statement CADV ต่างประเทศ')
  const splits = await tx.customer_receipt_account_splits.findMany({ select: { id: true }, where: { receipt_id: receipt.id } })
  if (splits.length === 0) throw new Error('ไม่พบ FCD split สำหรับยกเลิก Receipt Voucher CADV ต่างประเทศ')
  const reversalBankDocNos = await nextBankStatementDocNos(toDateString(receipt.date), branchCode, splits.length, tx)
  await reverseFcdReceiptAccountSplits(tx, {
    actor,
    bankStatementDocNos: reversalBankDocNos,
    branchId: receipt.branch_id,
    date: toDateString(receipt.date),
    receiptDocNo: receipt.doc_no,
    receiptId: receipt.id,
    sourceEventKey: `customer-advance-receipt:${receipt.doc_no}:cancel`,
  })
  for (const allocation of receipt.customer_receipt_advance_allocations) {
    if (allocation.status !== CUSTOMER_RECEIPT_STATUS_ACTIVE) continue
    await reverseCustomerAdvanceReceipt(tx, allocation.customer_advance_id, toNumber(allocation.receipt_amount), actor)
    await tx.customer_receipt_advance_allocations.update({
      data: { status: CUSTOMER_RECEIPT_STATUS_CANCELLED, updated_at: new Date(), updated_by: actor, version: { increment: 1 } },
      where: { id: allocation.id },
    })
  }
  await tx.customer_receipts.update({
    data: {
      cancel_reason: reason,
      cancelled_at: new Date(),
      cancelled_by: actor,
      status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
      updated_at: new Date(),
      updated_by: actor,
      version: { increment: 1 },
    },
    where: { id: receipt.id },
  })
  const statusLogAction = options.statusLogAction ?? 'cancelled'
  await tx.customer_receipt_status_logs.create({
    data: {
      action: statusLogAction,
      created_by: actor,
      event_key: `customer-receipt.${statusLogAction}.${receipt.doc_no}`,
      from_status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
      gross_amount_snapshot: receipt.gross_amount,
      meta: { bankStatementDocNos: reversalBankDocNos, reason, sourceType: 'CADV' },
      net_cash_in_snapshot: receipt.net_cash_in,
      note: reason,
      receipt_doc_no: receipt.doc_no,
      receipt_id: receipt.id,
      to_status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
    },
  })
  return { id: receipt.doc_no, status: CUSTOMER_RECEIPT_STATUS_CANCELLED }
}

async function cancelCustomerReceiptInTransaction(
  tx: Prisma.TransactionClient,
  docNo: string,
  reason: string,
  actor: string,
  options: CancelReceiptOptions = {},
) {
  const normalizedDocNo = docNo.trim()
  const normalizedReason = reason.trim()
  if (!normalizedDocNo) {
    throw new Error('ไม่พบเลขที่ Receipt Voucher ที่ต้องการยกเลิก')
  }
  if (!normalizedReason) {
    throw new Error('กรุณาระบุเหตุผลการยกเลิก')
  }

  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('customer_receipts.cancel'))`
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`

  const receipt = await tx.customer_receipts.findUnique({
    include: {
      customer_receipt_allocations: {
        include: {
          sales_bills: {
            select: {
              doc_no: true,
              id: true,
              receivable_balance: true,
              received_amount: true,
              status: true,
              total_amount: true,
            },
          },
        },
        orderBy: [{ line_no: 'asc' }],
      },
      customer_receipt_advance_allocations: {
        orderBy: [{ line_no: 'asc' }],
      },
    },
    where: { doc_no: normalizedDocNo },
  })
  if (!receipt) {
    throw new Error('ไม่พบ Receipt Voucher ที่ต้องการยกเลิก')
  }
  if (receipt.status === CUSTOMER_RECEIPT_STATUS_PENDING) {
    for (const allocation of receipt.customer_receipt_allocations) {
      if (allocation.status !== CUSTOMER_RECEIPT_STATUS_PENDING) continue
      await tx.customer_receipt_allocations.update({
        data: {
          status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
          updated_at: new Date(),
          updated_by: actor,
          version: { increment: 1 },
        },
        where: { id: allocation.id },
      })
    }

    await tx.customer_receipts.update({
      data: {
        cancel_reason: normalizedReason,
        cancelled_at: new Date(),
        cancelled_by: actor,
        status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
        updated_at: new Date(),
        updated_by: actor,
        version: { increment: 1 },
      },
      where: { id: receipt.id },
    })

    const statusLogAction = options.statusLogAction ?? 'pending_cancelled'
    await tx.customer_receipt_status_logs.create({
      data: {
        action: statusLogAction,
        created_by: actor,
        event_key: `customer-receipt.${statusLogAction}.${receipt.doc_no}`,
        from_status: CUSTOMER_RECEIPT_STATUS_PENDING,
        gross_amount_snapshot: receipt.gross_amount,
        meta: { reason: normalizedReason },
        net_cash_in_snapshot: receipt.net_cash_in,
        note: normalizedReason,
        receipt_doc_no: receipt.doc_no,
        receipt_id: receipt.id,
        to_status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
      },
    })

    return { id: receipt.doc_no, status: CUSTOMER_RECEIPT_STATUS_CANCELLED }
  }
  if (receipt.status !== CUSTOMER_RECEIPT_STATUS_ACTIVE) {
    throw new Error('Receipt Voucher นี้ถูกยกเลิกแล้ว')
  }

  if (receipt.source_type === 'CADV') {
    if (receipt.receipt_currency_code) {
      return cancelForeignCustomerAdvanceReceiptInTransaction(tx, receipt.doc_no, normalizedReason, actor, options)
    }
    return cancelCustomerAdvanceReceiptInTransaction(tx, receipt.doc_no, normalizedReason, actor, options)
  }

  if (!receipt.branch_id) throw new Error('Receipt Voucher Customer ไม่มีสาขาสำหรับออกเลข Bank Statement')
  const receiptBranch = await tx.branches.findUnique({ select: { code: true }, where: { id: receipt.branch_id } })
  if (!receiptBranch?.code) throw new Error('ไม่พบรหัสสาขาสำหรับยกเลิก Bank Statement Customer')
  const foreignSplits = receipt.receipt_currency_code
    ? await tx.customer_receipt_account_splits.findMany({ select: { id: true }, where: { receipt_id: receipt.id } })
    : []
  const receiptBankStatements = receipt.receipt_currency_code ? [] : await tx.bank_statement.findMany({
    orderBy: [{ doc_no: 'asc' }],
    select: { account_id: true, book_amount_in: true, book_fx_rate: true, movement_currency_code: true, native_amount_in: true },
    where: { book_amount_in: { gt: 0 }, ref_id: stringifyBusinessValue(receipt.id), ref_type: RECEIPT_REF_TYPE },
  })
  if (!receipt.receipt_currency_code && receiptBankStatements.length === 0) {
    throw new Error('ไม่พบ Bank Statement ที่ persist สำหรับยกเลิก Receipt Voucher Customer')
  }
  const bankStatementsToReverse = receiptBankStatements
  const reversalCount = receipt.receipt_currency_code ? foreignSplits.length : bankStatementsToReverse.length
  if (reversalCount === 0) throw new Error('ไม่พบรายการรับเงินที่ต้องยกเลิก')
  const reversalBankDocNos = await nextBankStatementDocNos(toDateString(receipt.date), documentBranchCode(receiptBranch.code)!, reversalCount, tx)
  if (receipt.receipt_currency_code) {
    await reverseFcdReceiptAccountSplits(tx, {
      actor,
      bankStatementDocNos: reversalBankDocNos,
      branchId: receipt.branch_id,
      date: toDateString(receipt.date),
      receiptDocNo: receipt.doc_no,
      receiptId: receipt.id,
      sourceEventKey: `customer-receipt:${receipt.doc_no}:cancel`,
    })
  } else {
    await tx.bank_statement.createMany({
      data: bankStatementsToReverse.map((statement, index) => ({
        ...reverseFunctionalBankStatementInflow({
          bookAmountIn: statement.book_amount_in,
          bookFxRate: statement.book_fx_rate,
          idempotencyKey: `customer-receipt:${receipt.doc_no}:cancel:split:${index + 1}`,
          movementCurrencyCode: statement.movement_currency_code,
          nativeAmountIn: statement.native_amount_in,
          sourceEventKey: `customer-receipt:${receipt.doc_no}:cancel:split:${index + 1}`,
          sourceEventType: 'customer_receipt_reversal',
        }),
        account_id: statement.account_id,
        branch_id: receipt.branch_id,
        created_by: actor,
        date: receipt.date,
        description: `${receipt.doc_no} - ยกเลิกรับเงิน Customer${bankStatementsToReverse.length > 1 ? ` (split ${index + 1}/${bankStatementsToReverse.length})` : ''}`,
        doc_no: reversalBankDocNos[index]!,
        ref_id: stringifyBusinessValue(receipt.id),
        ref_no: receipt.doc_no,
        ref_type: RECEIPT_CANCEL_REF_TYPE,
        type: 'ยกเลิกรับเงิน Customer',
      })),
    })
  }

  for (const allocation of receipt.customer_receipt_allocations) {
    if (allocation.status !== CUSTOMER_RECEIPT_STATUS_ACTIVE) continue

    const bill = allocation.sales_bills
    const allocatedArAmount = roundMoney(toNumber(allocation.allocated_ar_amount))
    const receivedAfter = roundMoney(Math.max(0, toNumber(bill.received_amount) - allocatedArAmount))
    const outstandingAfter = roundMoney(toNumber(bill.receivable_balance) + allocatedArAmount)
    const totalAmount = roundMoney(toNumber(bill.total_amount))
    const nextStatus = receivedAfter <= MONEY_EPSILON
      ? SALES_BILL_STATUS_OPEN
      : outstandingAfter <= MONEY_EPSILON || receivedAfter >= totalAmount
        ? SALES_BILL_STATUS_PAID
        : SALES_BILL_STATUS_PARTIAL

    await tx.customer_receipt_allocations.update({
      data: {
        status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
        updated_by: actor,
        updated_at: new Date(),
        version: { increment: 1 },
      },
      where: { id: allocation.id },
    })

    if (allocation.receipt_line_id) {
      await tx.receipts.update({
        data: {
          status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
          updated_by: actor,
          updated_at: new Date(),
          version: { increment: 1 },
        },
        where: { id: allocation.receipt_line_id },
      })
    }

    await tx.sales_bills.update({
      data: {
        receivable_balance: Math.max(0, outstandingAfter),
        received_amount: receivedAfter,
        status: nextStatus,
        updated_at: new Date(),
        updated_by: actor,
      },
      where: { id: bill.id },
    })

    await tx.sales_bill_status_logs.create({
      data: {
        action: 'customer_receipt_cancelled',
        created_by: actor,
        event_key: `sales-bill.receipt-cancel.${receipt.doc_no}.${bill.doc_no}.${allocation.line_no}`,
        from_status: bill.status,
        meta: {
          allocationId: stringifyBusinessValue(allocation.id),
          allocationLineNo: allocation.line_no,
          customerReceiptDocNo: receipt.doc_no,
          reason: normalizedReason,
        },
        note: `ยกเลิกรับเงิน ${receipt.doc_no}`,
        receivable_balance_snapshot: Math.max(0, outstandingAfter),
        received_amount_snapshot: receivedAfter,
        sales_bill_doc_no: bill.doc_no,
        sales_bill_id: bill.id,
        to_status: nextStatus,
        total_amount_snapshot: totalAmount,
      },
    })
  }

  await tx.customer_receipts.update({
    data: {
      cancel_reason: normalizedReason,
      cancelled_at: new Date(),
      cancelled_by: actor,
      status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
      updated_at: new Date(),
      updated_by: actor,
      version: { increment: 1 },
    },
    where: { id: receipt.id },
  })

  const statusLogAction = options.statusLogAction ?? 'cancelled'
  await tx.customer_receipt_status_logs.create({
    data: {
      action: statusLogAction,
      created_by: actor,
      event_key: `customer-receipt.${statusLogAction}.${receipt.doc_no}`,
      from_status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
      gross_amount_snapshot: receipt.gross_amount,
      meta: {
        bankStatementDocNos: reversalBankDocNos,
        reason: normalizedReason,
      },
      net_cash_in_snapshot: receipt.net_cash_in,
      note: normalizedReason,
      receipt_doc_no: receipt.doc_no,
      receipt_id: receipt.id,
      to_status: CUSTOMER_RECEIPT_STATUS_CANCELLED,
    },
  })

  return { id: receipt.doc_no, status: CUSTOMER_RECEIPT_STATUS_CANCELLED }
}

async function createForeignCustomerAdvanceReceiptInTransaction(
  values: CustomerReceiptFormValues,
  context: AuthContextForReceipt,
  functionalCurrencyCode: string,
  tx: Prisma.TransactionClient,
  options: CreateForeignReceiptOptions = {},
) {
  if (values.sourceType !== 'CADV') throw new Error('ประเภทเอกสารรับเงินต่างประเทศไม่ถูกต้อง')
  const currencyCode = foreignReceiptCurrency(values, functionalCurrencyCode)
  const customerTransferredNativeAmount = decimalReceiptMoney(values.customerTransferredNativeAmount ?? 0, 'ยอดที่ลูกค้าโอน')
  const receivedNativeAmount = decimalReceiptMoney(values.receivedNativeAmount ?? 0, 'ยอดเข้าบัญชีจริง')
  const rate = fcdFxRate(values.fxRate ?? 0)
  const rateType = values.fxRateType?.trim()
  if (!rateType) throw new Error('ต้องระบุประเภทอัตราแลกเปลี่ยน')
  if (receivedNativeAmount.gt(customerTransferredNativeAmount)) throw new Error('ยอดเข้าบัญชีจริงต้องไม่มากกว่ายอดที่ลูกค้าโอน')
  const settlementBookAmount = calculateSettlementBookAmount(customerTransferredNativeAmount, rate)
  const carryingThbAmount = calculateSettlementBookAmount(receivedNativeAmount, rate)
  const bankFeeTotal = decimalReceiptMoney(values.fee, 'ค่าธรรมเนียมธนาคาร')
  if (!settlementBookAmount.minus(carryingThbAmount).eq(bankFeeTotal)) {
    throw new Error('ยอดที่ลูกค้าโอน, ยอดเข้าบัญชีจริง, rate และ Bank Fee (THB) ต้อง reconcile กัน')
  }

  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('customer_receipts.doc_no'))`
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`
  const [receiptCurrency, customer, paymentMethod] = await Promise.all([
    tx.currencies.findUnique({ select: { code: true }, where: { code: currencyCode } }),
    findActiveCustomerByCode(values.customerId, tx),
    findActivePaymentMethod(values.method, tx),
  ])
  if (!receiptCurrency) throw new Error(`ไม่พบสกุลเงิน ${currencyCode} ใน Currency Master`)
  if (!customer) throw new Error('ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (!paymentMethod) throw new Error('วิธีรับเงินไม่ถูกต้องหรือถูกปิดใช้งาน')

  const lines = values.customerAdvanceLines.map((line) => ({
    customerAdvanceDocNo: line.customerAdvanceDocNo.trim(),
    receiptAmount: decimalReceiptMoney(line.receiptAmount, 'ยอดตัด CADV'),
  }))
  if (lines.length === 0) throw new Error('เลือก CADV อย่างน้อย 1 รายการ')
  if (new Set(lines.map((line) => line.customerAdvanceDocNo)).size !== lines.length) throw new Error('เลือก CADV ซ้ำใน Receipt Voucher เดียวกัน')
  const advances = await tx.customer_advances.findMany({
    select: {
      branch_id: true,
      currency_code: true,
      customer_id: true,
      customer_advance_statuses: { select: { code: true } },
      doc_no: true,
      id: true,
      received_amount: true,
      target_amount: true,
    },
    where: { doc_no: { in: lines.map((line) => line.customerAdvanceDocNo) } },
  })
  const advanceByDocNo = new Map(advances.map((advance) => [advance.doc_no, advance]))
  if (advances.length !== lines.length) throw new Error('ไม่พบ CADV บางรายการ')
  const branchIds = new Set<bigint>()
  for (const line of lines) {
    const advance = advanceByDocNo.get(line.customerAdvanceDocNo)
    if (!advance) throw new Error(`ไม่พบ CADV ${line.customerAdvanceDocNo}`)
    if (advance.customer_id !== customer.id) throw new Error(`CADV ${line.customerAdvanceDocNo} ไม่ใช่ของลูกค้าที่เลือก`)
    if (advance.currency_code !== functionalCurrencyCode) throw new Error(`CADV ${line.customerAdvanceDocNo} ไม่ได้บันทึกเป็นสกุลเงินหลักของบริษัท`)
    if (advance.customer_advance_statuses.code === 'cancelled') throw new Error(`CADV ${line.customerAdvanceDocNo} ถูกยกเลิกแล้ว`)
    const remaining = decimalReceiptMoney(toNumber(advance.target_amount), 'ยอดคงเหลือ CADV').minus(decimalReceiptMoney(toNumber(advance.received_amount), 'ยอดรับ CADV'))
    if (line.receiptAmount.gt(remaining)) throw new Error(`ยอดตัด CADV ${line.customerAdvanceDocNo} เกินยอดคงเหลือ`)
    branchIds.add(advance.branch_id)
  }
  if (branchIds.size !== 1) throw new Error('CADV ที่รับเงินใน Receipt เดียวกันต้องอยู่สาขาเดียวกัน')
  const branchId = [...branchIds][0]!
  const branch = await tx.branches.findUnique({ select: { code: true }, where: { id: branchId } })
  const branchCode = documentBranchCode(branch?.code)
  if (!branchCode) throw new Error('ไม่พบรหัสสาขาสำหรับออกเลขที่ Receipt Voucher CADV')
  const totalCadVSettlement = lines.reduce((total, line) => total.plus(line.receiptAmount), new Prisma.Decimal(0))
  const settlementDifferenceReason = settlementDifferenceReasonForReceipt('CADV', settlementBookAmount.minus(totalCadVSettlement))

  const rawSplits = values.splits?.length ? values.splits : []
  if (rawSplits.length === 0) throw new Error('เลือกบัญชี FCD รับเงินอย่างน้อย 1 รายการ')
  const splitNativeTotal = rawSplits.reduce((total, split) => total.plus(decimalReceiptMoney(split.amount, 'ยอดเข้าบัญชี FCD')), new Prisma.Decimal(0))
  if (!splitNativeTotal.eq(receivedNativeAmount)) throw new Error('รวมยอดเข้าบัญชี FCD ต้องเท่ากับยอดเข้าบัญชีจริง')

  const docNo = values.docNo ?? await nextDailyDocNo('customer_receipts', RECEIPT_DOC_PREFIX, values.date, tx, branchCode)
  const bankStatementDocNos = await nextBankStatementDocNos(values.date, branchCode, rawSplits.length, tx)
  const primaryAccountCode = rawSplits[0]!.accountId.trim().toUpperCase()
  const primaryAccount = await tx.accounts.findFirst({ select: { code: true, id: true, name: true }, where: { active: true, code: primaryAccountCode, is_fcd: true } })
  if (!primaryAccount) throw new Error('บัญชี FCD หลักไม่ถูกต้องหรือไม่ active')
  const exactRate = await findFcdRateSnapshot(tx, { fromCurrency: currencyCode, rateDate: values.date, rateType, toCurrency: functionalCurrencyCode })
  const rateWasSuggested = exactRate.kind === 'suggested' && fcdFxRate(exactRate.rate).eq(rate)
  if (!rateWasSuggested && !values.fxRateOverrideReason?.trim()) throw new Error('กรุณาระบุเหตุผลเมื่อกรอกหรือแก้ไขอัตราแลกเปลี่ยน')
  const actor = requireFinanceActor(context)
  const receipt = await tx.customer_receipts.create({
    data: {
      account_code_snapshot: primaryAccount.code,
      account_id: primaryAccount.id,
      account_name_snapshot: primaryAccount.name,
      bank_fee_total: bankFeeTotal,
      branch_id: branchId,
      carrying_thb_amount: carryingThbAmount,
      created_by: actor,
      customer_code_snapshot: customer.code,
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_transferred_native_amount: customerTransferredNativeAmount,
      date: normalizeDate(values.date),
      discount_total: 0,
      doc_no: docNo,
      fx_rate: rate,
      fx_rate_date: normalizeDate(values.date),
      fx_rate_id: exactRate.kind === 'suggested' && rateWasSuggested ? exactRate.rateId : null,
      fx_rate_overridden: !rateWasSuggested,
      fx_rate_override_reason: rateWasSuggested ? null : values.fxRateOverrideReason?.trim() ?? null,
      fx_rate_reference: exactRate.kind === 'suggested' && rateWasSuggested ? exactRate.rateId.toString() : null,
      fx_rate_source: exactRate.kind === 'suggested' && rateWasSuggested ? exactRate.source : null,
      fx_rate_type: rateType,
      gross_amount: settlementBookAmount,
      net_cash_in: carryingThbAmount,
      notes: values.notes,
      payment_method_code_snapshot: paymentMethod.code,
      payment_method_id: paymentMethod.id,
      payment_method_name_snapshot: paymentMethod.name,
      receipt_currency_code: currencyCode,
      received_native_amount: receivedNativeAmount,
      replacement_of_id: options.replacementOfId ?? null,
      settlement_book_amount: settlementBookAmount,
      settlement_difference_reason: settlementDifferenceReason,
      settlement_fx_difference: 0,
      source_type: 'CADV',
      status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
      updated_by: actor,
      withholding_tax_total: 0,
    },
  })
  const postedSplits = await postFcdReceiptAccountSplits(tx, {
    actor,
    bankStatementDocNos,
    branchId,
    currencyCode,
    date: values.date,
    rate,
    receiptDocNo: docNo,
    receiptId: receipt.id,
    sourceEventKey: `customer-advance-receipt:${docNo}`,
    splits: rawSplits.map((split) => ({ accountCode: split.accountId, nativeAmount: split.amount })),
  })
  await tx.customer_receipts.update({ data: { bank_statement_doc_no: bankStatementDocNos[0]!, bank_statement_id: postedSplits.created[0]!.bankStatementId }, where: { id: receipt.id } })
  const allocationSnapshots = allocateForeignReceiptLines(lines.map((line) => ({ arAmount: line.receiptAmount })), customerTransferredNativeAmount, settlementBookAmount)
  for (const [index, line] of lines.entries()) {
    const advance = advanceByDocNo.get(line.customerAdvanceDocNo)!
    const settlement = await applyCustomerAdvanceReceipt(tx, advance.id, line.receiptAmount.toNumber(), actor)
    const snapshot = allocationSnapshots[index]!
    await tx.customer_receipt_advance_allocations.create({
      data: {
        available_after: settlement.availableAfter,
        available_before: settlement.availableBefore,
        created_by: actor,
        customer_advance_doc_no_snapshot: advance.doc_no,
        customer_advance_id: advance.id,
        customer_code_snapshot: customer.code,
        line_no: index + 1,
        native_amount_allocated: snapshot.nativeAmount,
        receipt_amount: line.receiptAmount,
        received_after: settlement.receivedAfter,
        received_before: settlement.receivedBefore,
        receipt_id: receipt.id,
        settlement_book_amount: snapshot.settlementBookAmount,
        status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
        updated_by: actor,
      },
    })
  }
  const statusLogAction = options.statusLogAction ?? 'foreign_created'
  await tx.customer_receipt_status_logs.create({
    data: {
      action: statusLogAction,
      created_by: actor,
      event_key: `customer-receipt.${statusLogAction}.${docNo}`,
      gross_amount_snapshot: settlementBookAmount,
      meta: { bankStatementDocNos, currencyCode, fcdLedgerEntryIds: postedSplits.created.map((split) => split.fcdLedgerEntryId.toString()), rate: rate.toFixed(3), receivedNativeAmount: receivedNativeAmount.toFixed(2), sourceType: 'CADV' },
      net_cash_in_snapshot: carryingThbAmount,
      note: 'บันทึกรับเงิน CADV เข้าบัญชี FCD',
      receipt_doc_no: docNo,
      receipt_id: receipt.id,
      to_status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
    },
  })
  return { id: docNo }
}

async function createForeignSalesBillReceiptInTransaction(
  values: CustomerReceiptFormValues,
  context: AuthContextForReceipt,
  functionalCurrencyCode: string,
  tx: Prisma.TransactionClient,
  options: CreateForeignReceiptOptions = {},
) {
  if (values.sourceType !== 'SB') throw new Error('การรับเงินต่างประเทศจาก CADV ยังไม่พร้อมใช้งาน')
  const currencyCode = foreignReceiptCurrency(values, functionalCurrencyCode)
  const customerTransferredNativeAmount = decimalReceiptMoney(values.customerTransferredNativeAmount ?? 0, 'ยอดที่ลูกค้าโอน')
  const receivedNativeAmount = decimalReceiptMoney(values.receivedNativeAmount ?? 0, 'ยอดเข้าบัญชีจริง')
  const rate = fcdFxRate(values.fxRate ?? 0)
  const rateType = values.fxRateType?.trim()
  if (!rateType) throw new Error('ต้องระบุประเภทอัตราแลกเปลี่ยน')
  if (receivedNativeAmount.gt(customerTransferredNativeAmount)) {
    throw new Error('ยอดเข้าบัญชีจริงต้องไม่มากกว่ายอดที่ลูกค้าโอน')
  }
  const settlementBookAmount = calculateSettlementBookAmount(customerTransferredNativeAmount, rate)
  const carryingThbAmount = calculateSettlementBookAmount(receivedNativeAmount, rate)
  const bankFeeTotal = decimalReceiptMoney(values.fee, 'ค่าธรรมเนียมธนาคาร')
  if (!settlementBookAmount.minus(carryingThbAmount).eq(bankFeeTotal)) {
    throw new Error('ยอดที่ลูกค้าโอน, ยอดเข้าบัญชีจริง, rate และ Bank Fee (THB) ต้อง reconcile กัน')
  }

  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('customer_receipts.doc_no'))`
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`
  const [receiptCurrency, customer, paymentMethod] = await Promise.all([
    tx.currencies.findUnique({ select: { code: true }, where: { code: currencyCode } }),
    findActiveCustomerByCode(values.customerId, tx),
    findActivePaymentMethod(values.method, tx),
  ])
  if (!receiptCurrency) throw new Error(`ไม่พบสกุลเงิน ${currencyCode} ใน Currency Master`)
  if (!customer) throw new Error('ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (!paymentMethod) throw new Error('วิธีรับเงินไม่ถูกต้องหรือถูกปิดใช้งาน')
  const selectedBranch = values.branchId
    ? await tx.branches.findFirst({ select: { code: true, id: true }, where: { active: true, code: values.branchId } })
    : null
  if (!selectedBranch) throw new Error('กรุณาเลือกสาขาก่อนเลือกบิลขาย')
  const branchCode = documentBranchCode(selectedBranch.code)
  if (!branchCode) throw new Error('สาขาที่เลือกไม่มีรหัสสาขาสำหรับสร้างเลขที่ใบรับเงิน')

  const lines = customerReceiptLines(values)
  const billDocNos = lines.map((line) => line.salesBillDocNo)
  const bills = await tx.sales_bills.findMany({
    select: { branch_id: true, customer_id: true, doc_no: true, id: true, receivable_balance: true, received_amount: true, status: true, total_amount: true },
    where: { doc_no: { in: billDocNos } },
  })
  const billByDocNo = new Map(bills.map((bill) => [bill.doc_no, bill]))
  if (bills.length !== billDocNos.length) throw new Error('ไม่พบบิลขายบางรายการ')
  const allocationInputs = lines.map((line) => {
    const bill = billByDocNo.get(line.salesBillDocNo)
    if (!bill) throw new Error(`ไม่พบบิลขาย ${line.salesBillDocNo}`)
    if (bill.customer_id !== customer.id || bill.branch_id !== selectedBranch.id) throw new Error(`บิลขาย ${line.salesBillDocNo} ไม่ตรงกับลูกค้าหรือสาขาที่เลือก`)
    if (String(bill.status ?? '').toLowerCase() === 'cancelled') throw new Error(`บิลขาย ${line.salesBillDocNo} ถูกยกเลิกแล้ว`)
    const arAmount = decimalReceiptMoney(line.receiptAmount + line.discountAmount + line.withholdingTaxAmount, 'ยอดตัด AR')
    const outstanding = decimalReceiptMoney(toNumber(bill.receivable_balance), 'ยอดค้างรับ')
    if (arAmount.gt(outstanding)) throw new Error(`ยอดตัด AR ของบิลขาย ${line.salesBillDocNo} เกินยอดค้างรับ`)
    return { arAmount, bill, line }
  })
  const totalArAmount = allocationInputs.reduce((total, item) => total.plus(item.arAmount), new Prisma.Decimal(0))
  const settlementDifference = settlementBookAmount.minus(totalArAmount)
  const settlementDifferenceReason = settlementDifferenceReasonForReceipt('SB', settlementDifference)
  const allocationSnapshots = allocateForeignReceiptLines(allocationInputs, customerTransferredNativeAmount, settlementBookAmount)

  const exactRate = await findFcdRateSnapshot(tx, { fromCurrency: currencyCode, rateDate: values.date, rateType, toCurrency: functionalCurrencyCode })
  const rateWasSuggested = exactRate.kind === 'suggested' && fcdFxRate(exactRate.rate).eq(rate)
  if (!rateWasSuggested && !values.fxRateOverrideReason?.trim()) {
    throw new Error('กรุณาระบุเหตุผลเมื่อกรอกหรือแก้ไขอัตราแลกเปลี่ยน')
  }

  const rawSplits = values.splits?.length ? values.splits : []
  if (rawSplits.length === 0) throw new Error('เลือกบัญชี FCD รับเงินอย่างน้อย 1 รายการ')
  const splitNativeTotal = rawSplits.reduce((total, split) => total.plus(decimalReceiptMoney(split.amount, 'ยอดเข้าบัญชี FCD')), new Prisma.Decimal(0))
  if (!splitNativeTotal.eq(receivedNativeAmount)) throw new Error('รวมยอดเข้าบัญชี FCD ต้องเท่ากับยอดเข้าบัญชีจริง')

  const docNo = values.docNo ?? await nextDailyDocNo('customer_receipts', RECEIPT_DOC_PREFIX, values.date, tx, branchCode)
  const bankStatementDocNos = await nextBankStatementDocNos(values.date, branchCode, rawSplits.length, tx)
  const primaryAccountCode = rawSplits[0]!.accountId.trim().toUpperCase()
  const primaryAccount = await tx.accounts.findFirst({ select: { code: true, id: true, name: true }, where: { active: true, code: primaryAccountCode, is_fcd: true } })
  if (!primaryAccount) throw new Error('บัญชี FCD หลักไม่ถูกต้องหรือไม่ active')
  const actor = requireFinanceActor(context)
  const receipt = await tx.customer_receipts.create({
    data: {
      account_code_snapshot: primaryAccount.code,
      account_id: primaryAccount.id,
      account_name_snapshot: primaryAccount.name,
      bank_fee_total: bankFeeTotal,
      branch_id: selectedBranch.id,
      carrying_thb_amount: carryingThbAmount,
      created_by: actor,
      customer_code_snapshot: customer.code,
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_transferred_native_amount: customerTransferredNativeAmount,
      date: normalizeDate(values.date),
      discount_total: allocationInputs.reduce((total, item) => total.plus(decimalReceiptMoney(item.line.discountAmount, 'ส่วนลด')), new Prisma.Decimal(0)),
      doc_no: docNo,
      fx_rate: rate,
      fx_rate_date: normalizeDate(values.date),
      fx_rate_id: exactRate.kind === 'suggested' && rateWasSuggested ? exactRate.rateId : null,
      fx_rate_overridden: !rateWasSuggested,
      fx_rate_override_reason: rateWasSuggested ? null : values.fxRateOverrideReason?.trim() ?? null,
      fx_rate_reference: exactRate.kind === 'suggested' && rateWasSuggested ? exactRate.rateId.toString() : null,
      fx_rate_source: exactRate.kind === 'suggested' && rateWasSuggested ? exactRate.source : null,
      fx_rate_type: rateType,
      gross_amount: settlementBookAmount,
      net_cash_in: carryingThbAmount,
      notes: values.notes,
      payment_method_code_snapshot: paymentMethod.code,
      payment_method_id: paymentMethod.id,
      payment_method_name_snapshot: paymentMethod.name,
      receipt_currency_code: currencyCode,
      received_native_amount: receivedNativeAmount,
      replacement_of_id: options.replacementOfId ?? null,
      settlement_book_amount: settlementBookAmount,
      settlement_difference_reason: settlementDifferenceReason,
      settlement_fx_difference: settlementDifference,
      source_type: 'SB',
      status: CUSTOMER_RECEIPT_STATUS_ACTIVE,
      updated_by: actor,
      withholding_tax_total: allocationInputs.reduce((total, item) => total.plus(decimalReceiptMoney(item.line.withholdingTaxAmount, 'ภาษีหัก ณ ที่จ่าย')), new Prisma.Decimal(0)),
    },
  })
  const postedSplits = await postFcdReceiptAccountSplits(tx, {
    actor,
    bankStatementDocNos,
    branchId: selectedBranch.id,
    currencyCode,
    date: values.date,
    rate,
    receiptDocNo: docNo,
    receiptId: receipt.id,
    sourceEventKey: `customer-receipt:${docNo}`,
    splits: rawSplits.map((split) => ({ accountCode: split.accountId, nativeAmount: split.amount })),
  })
  await tx.customer_receipts.update({ data: { bank_statement_doc_no: bankStatementDocNos[0]!, bank_statement_id: postedSplits.created[0]!.bankStatementId }, where: { id: receipt.id } })

  for (const [index, item] of allocationInputs.entries()) {
    const snapshot = allocationSnapshots[index]!
    const bill = item.bill
    const outstandingBefore = decimalReceiptMoney(toNumber(bill.receivable_balance), 'ยอดค้างรับ')
    const outstandingAfter = outstandingBefore.minus(item.arAmount)
    const receivedAfter = decimalReceiptMoney(toNumber(bill.received_amount), 'ยอดรับแล้ว').plus(item.arAmount)
    const nextStatus = outstandingAfter.lte(0) ? SALES_BILL_STATUS_PAID : SALES_BILL_STATUS_PARTIAL
    const legacyReceipt = await tx.receipts.create({
      data: { account_id: primaryAccount.id, amount: item.line.receiptAmount, bank_fee: 0, bill_id: bill.id, branch_id: selectedBranch.id, created_by: actor, customer_id: customer.id, date: normalizeDate(values.date), discount: item.line.discountAmount, doc_no: docNo, fee: 0, lines: { customerReceiptId: receipt.id.toString(), lineNo: index + 1, paymentMethodCode: paymentMethod.code, salesBillDocNo: bill.doc_no }, method: paymentMethod.name, net_amount: item.line.receiptAmount, notes: values.notes, status: CUSTOMER_RECEIPT_STATUS_ACTIVE, updated_by: actor, voucher_id: docNo, withholding_tax: item.line.withholdingTaxAmount },
    })
    await tx.customer_receipt_allocations.create({
        data: { allocated_ar_amount: item.arAmount, created_by: actor, customer_code_snapshot: customer.code, discount_amount: item.line.discountAmount, line_no: index + 1, native_amount_allocated: snapshot.nativeAmount, outstanding_after: outstandingAfter, outstanding_before: outstandingBefore, receipt_amount: item.line.receiptAmount, receipt_id: receipt.id, receipt_line_id: legacyReceipt.id, sales_bill_doc_no_snapshot: bill.doc_no, sales_bill_id: bill.id, settlement_book_amount: snapshot.settlementBookAmount, settlement_difference_reason: settlementDifferenceReasonForReceipt('SB', snapshot.settlementBookAmount.minus(item.arAmount)), settlement_fx_difference: snapshot.settlementBookAmount.minus(item.arAmount), status: CUSTOMER_RECEIPT_STATUS_ACTIVE, updated_by: actor, withholding_tax_amount: item.line.withholdingTaxAmount },
    })
    await tx.sales_bills.update({ data: { receivable_balance: outstandingAfter, received_amount: receivedAfter, status: nextStatus, updated_at: new Date(), updated_by: actor }, where: { id: bill.id } })
  }
  const statusLogAction = options.statusLogAction ?? 'foreign_created'
  await tx.customer_receipt_status_logs.create({
    data: { action: statusLogAction, created_by: actor, event_key: `customer-receipt.${statusLogAction}.${docNo}`, gross_amount_snapshot: settlementBookAmount, meta: { bankStatementDocNos, currencyCode, fcdLedgerEntryIds: postedSplits.created.map((split) => split.fcdLedgerEntryId.toString()), rate: rate.toFixed(3), receivedNativeAmount: receivedNativeAmount.toFixed(2), settlementDifference: settlementDifference.toFixed(2) }, net_cash_in_snapshot: carryingThbAmount, note: 'บันทึกรับเงิน Customer เข้าบัญชี FCD', receipt_doc_no: docNo, receipt_id: receipt.id, to_status: CUSTOMER_RECEIPT_STATUS_ACTIVE },
  })
  return { id: docNo }
}

export async function createCustomerReceipt(values: CustomerReceiptFormValues, context: AuthContextForReceipt) {
  if (values.id) {
    return replaceCustomerReceipt(values.id, values, 'แก้ไข Receipt Voucher โดยยกเลิกใบเดิมและออกใบใหม่', context)
  }

  const policy = await getFinanceCurrencyPolicy()
  const receiptCurrencyCode = foreignReceiptCurrency(values, policy.functionalCurrencyCode)
  if (receiptCurrencyCode !== policy.functionalCurrencyCode) {
    return prisma.$transaction((tx) => values.sourceType === 'CADV'
      ? createForeignCustomerAdvanceReceiptInTransaction(values, context, policy.functionalCurrencyCode, tx)
      : createForeignSalesBillReceiptInTransaction(values, context, policy.functionalCurrencyCode, tx))
  }

  const prepared = await prepareCustomerReceipt(values, context)
  return prisma.$transaction((tx) => createCustomerReceiptInTransaction(values, prepared, policy.functionalCurrencyCode, tx))
}

export async function replaceCustomerReceipt(originalDocNo: string, values: CustomerReceiptFormValues, reason: string, context: AuthContextForReceipt) {
  const normalizedOriginalDocNo = originalDocNo.trim()
  if (!normalizedOriginalDocNo) {
    throw new Error('ไม่พบเลขที่ Receipt Voucher ที่ต้องการแก้ไข')
  }

  const replacementValues: CustomerReceiptFormValues = {
    ...values,
    docNo: null,
    id: null,
  }
  const policy = await getFinanceCurrencyPolicy()
  const receiptCurrencyCode = foreignReceiptCurrency(replacementValues, policy.functionalCurrencyCode)
  if (receiptCurrencyCode !== policy.functionalCurrencyCode) {
    const actor = requireFinanceActor(context)
    return prisma.$transaction(async (tx) => {
      const original = await tx.customer_receipts.findUnique({ select: { id: true }, where: { doc_no: normalizedOriginalDocNo } })
      if (!original) throw new Error('ไม่พบ Receipt Voucher ที่ต้องการแก้ไข')
      await cancelCustomerReceiptInTransaction(tx, normalizedOriginalDocNo, reason, actor, { statusLogAction: 'reissued' })
      const created = await (replacementValues.sourceType === 'CADV'
        ? createForeignCustomerAdvanceReceiptInTransaction(replacementValues, context, policy.functionalCurrencyCode, tx, {
            replacementOfId: original.id,
            statusLogAction: 'created_from_reissue',
          })
        : createForeignSalesBillReceiptInTransaction(replacementValues, context, policy.functionalCurrencyCode, tx, {
        replacementOfId: original.id,
        statusLogAction: 'created_from_reissue',
          }))
      return { id: created.id, replacedId: normalizedOriginalDocNo }
    })
  }

  const prepared = await prepareCustomerReceipt(replacementValues, context)

  return prisma.$transaction(async (tx) => {
    await cancelCustomerReceiptInTransaction(tx, normalizedOriginalDocNo, reason, prepared.actor, { statusLogAction: 'reissued' })
    const created = await createCustomerReceiptInTransaction(replacementValues, prepared, policy.functionalCurrencyCode, tx, {
      replacementOfDocNo: normalizedOriginalDocNo,
      statusLogAction: 'created_from_reissue',
    })
    return { id: created.id, replacedId: normalizedOriginalDocNo }
  })
}

export async function cancelCustomerReceipt(docNo: string, reason: string, context: AuthContextForReceipt) {
  const actor = requireFinanceActor(context)
  return prisma.$transaction((tx) => cancelCustomerReceiptInTransaction(tx, docNo, reason, actor))
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10)
}
