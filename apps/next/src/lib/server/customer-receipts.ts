import type { CustomerReceiptFormValues } from '@/lib/daily'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { currentActor, nextBankStatementDocNos, nextDailyDocNo, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../generated/prisma/client'

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
  appUser: { username: string } | null
  authUser: { email?: string }
}

type AccountReference = NonNullable<Awaited<ReturnType<typeof findActiveAccountReferenceByCode>>>

type ReceiptLineInput = {
  discountAmount: number
  receiptAmount: number
  salesBillDocNo: string
  withholdingTaxAmount: number
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
  lines: ReceiptLineInput[]
  netCashIn: number
  withholdingTaxTotal: number
}

type CreateReceiptOptions = {
  replacementOfDocNo?: string
  statusLogAction?: string
}

type CancelReceiptOptions = {
  statusLogAction?: string
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
  if (values.lines && values.lines.length > 0) {
    return values.lines.map((line) => ({
      discountAmount: line.discountAmount,
      receiptAmount: line.receiptAmount,
      salesBillDocNo: line.salesBillDocNo.trim(),
      withholdingTaxAmount: line.withholdingTaxAmount,
    }))
  }

  const billDocNo = values.billId?.trim()
  if (!billDocNo) {
    throw new Error('เลือกบิลขายอย่างน้อย 1 รายการ')
  }

  return [{
    discountAmount: values.discount,
    receiptAmount: values.amount,
    salesBillDocNo: billDocNo,
    withholdingTaxAmount: values.withholdingTax,
  }]
}

async function prepareCustomerReceipt(values: CustomerReceiptFormValues, context: AuthContextForReceipt): Promise<PreparedCustomerReceipt> {
  const actor = currentActor(context)
  const lines = customerReceiptLines(values)
  const duplicateBill = lines.find((line, index) => lines.findIndex((candidate) => candidate.salesBillDocNo === line.salesBillDocNo) !== index)
  if (duplicateBill) {
    throw new Error(`บิลขาย ${duplicateBill.salesBillDocNo} ถูกเลือกซ้ำใน Receipt Voucher เดียวกัน`)
  }

  const grossAmount = roundMoney(lines.reduce((sum, line) => sum + line.receiptAmount, 0))
  const discountTotal = roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0))
  const withholdingTaxTotal = roundMoney(lines.reduce((sum, line) => sum + line.withholdingTaxAmount, 0))
  const bankFeeTotal = roundMoney(values.fee)
  const netCashIn = roundMoney(grossAmount - bankFeeTotal - withholdingTaxTotal)

  assertMoneyEquals(values.amount, grossAmount, 'ยอดรับรวมไม่ตรงกับยอดรับรายบิล')
  assertMoneyEquals(values.discount, discountTotal, 'ส่วนลดรวมไม่ตรงกับส่วนลดรายบิล')
  assertMoneyEquals(values.withholdingTax, withholdingTaxTotal, 'ภาษีหัก ณ ที่จ่ายรวมไม่ตรงกับรายบิล')
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

  return { account, accountSplits, actor, bankFeeTotal, discountTotal, grossAmount, lines, netCashIn, withholdingTaxTotal }
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
  tx: Prisma.TransactionClient,
  options: CreateReceiptOptions = {},
) {
  const {
    account,
    accountSplits,
    actor,
    bankFeeTotal,
    discountTotal,
    grossAmount,
    lines,
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

  const docNo = values.docNo ?? await nextDailyDocNo('customer_receipts', RECEIPT_DOC_PREFIX, values.date, tx)
  const bankStatementDocNos = await nextBankStatementDocNos(values.date, accountSplits.length, tx)
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

  const distinctBranchIds = new Set<bigint>()
  for (const line of lines) {
    const bill = salesBillByDocNo.get(line.salesBillDocNo)
    if (!bill) throw new Error(`ไม่พบบิลขาย ${line.salesBillDocNo}`)
    if (bill.customer_id !== customer.id) {
      throw new Error(`บิลขาย ${line.salesBillDocNo} ไม่ใช่ของลูกค้าที่เลือก`)
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

  const branchId = distinctBranchIds.size === 1 ? [...distinctBranchIds][0] : null
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
      account_id: split.account.id,
      amount_in: split.amount,
      amount_out: 0,
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

  const receiptBankStatements = await tx.bank_statement.findMany({
    orderBy: [{ doc_no: 'asc' }],
    select: { account_id: true, amount_in: true },
    where: {
      amount_in: { gt: 0 },
      ref_id: stringifyBusinessValue(receipt.id),
      ref_type: RECEIPT_REF_TYPE,
    },
  })
  const bankStatementsToReverse = receiptBankStatements.length > 0
    ? receiptBankStatements
    : [{ account_id: receipt.account_id, amount_in: receipt.net_cash_in }]
  const reversalBankDocNos = await nextBankStatementDocNos(toDateString(receipt.date), bankStatementsToReverse.length, tx)
  await tx.bank_statement.createMany({
    data: bankStatementsToReverse.map((statement, index) => ({
      account_id: statement.account_id,
      amount_in: 0,
      amount_out: statement.amount_in,
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
        bankStatementDocNo: reversalBankDocNo,
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

export async function createCustomerReceipt(values: CustomerReceiptFormValues, context: AuthContextForReceipt) {
  if (values.id) {
    return replaceCustomerReceipt(values.id, values, 'แก้ไข Receipt Voucher โดยยกเลิกใบเดิมและออกใบใหม่', context)
  }

  const prepared = await prepareCustomerReceipt(values, context)
  return prisma.$transaction((tx) => createCustomerReceiptInTransaction(values, prepared, tx))
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
  const prepared = await prepareCustomerReceipt(replacementValues, context)

  return prisma.$transaction(async (tx) => {
    await cancelCustomerReceiptInTransaction(tx, normalizedOriginalDocNo, reason, prepared.actor, { statusLogAction: 'reissued' })
    const created = await createCustomerReceiptInTransaction(replacementValues, prepared, tx, {
      replacementOfDocNo: normalizedOriginalDocNo,
      statusLogAction: 'created_from_reissue',
    })
    return { id: created.id, replacedId: normalizedOriginalDocNo }
  })
}

export async function cancelCustomerReceipt(docNo: string, reason: string, context: AuthContextForReceipt) {
  const actor = currentActor(context)
  return prisma.$transaction((tx) => cancelCustomerReceiptInTransaction(tx, docNo, reason, actor))
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10)
}
