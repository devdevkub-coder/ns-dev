export type PurchasePaymentLineFlexData = {
  approvals: Array<{
    amount: number
    approvalNo: string
    sourceDocumentNo: string
    sourceType: string
  }>
  branchName: string
  companyAccounts: Array<{
    accountCode?: string
    accountName: string
    amount: number
  }>
  date: string
  destinationAccountNo?: string
  destinationBankName?: string
  discount: number
  documentNo: string
  fee: number
  netCashOut: number
  notes?: string
  paidAmount: number
  payeeName: string
  paymentMethod: string
  status: string
  withholdingTax: number
}

const MAX_APPROVALS = 4
const MAX_COMPANY_ACCOUNTS = 4

function text(value: string | null | undefined, fallback = '-') {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || fallback
}

function number(value: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)
}

function money(value: number) {
  return `฿${number(value)}`
}

function date(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return text(value)
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(parsed)
}

function detailRow(label: string, value: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#94a3b8', size: 'sm', flex: 3, wrap: true },
      { type: 'text', text: value, color: '#f8fafc', size: 'sm', flex: 4, align: 'end', wrap: true },
    ],
  }
}

function listRow(label: string, amount: number) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#e2e8f0', size: 'sm', flex: 4, wrap: true },
      { type: 'text', text: money(amount), color: '#cbd5e1', size: 'sm', flex: 2, align: 'end', wrap: true },
    ],
  }
}

function remainingRow(label: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#6ee7b7', size: 'sm', flex: 1, wrap: true },
    ],
  }
}

function maskedAccountNumber(value: string | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? `•••• ${digits.slice(-4)}` : '-'
}

function sourceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    advance_payment: 'เงินล่วงหน้า',
    expense: 'ค่าใช้จ่าย',
    petty_advance_return: 'คืนเงินสำรองจ่าย',
    purchase_bill: 'บิลซื้อ',
  }
  return labels[value] ?? text(value, 'เอกสาร')
}

function isCancelledStatus(value: string) {
  return ['cancelled', 'canceled', 'reversed', 'void'].includes(value.trim().toLowerCase())
}

function paymentStatus(value: string) {
  if (isCancelledStatus(value)) return 'ยกเลิกแล้ว'
  if (['active', 'completed', 'paid', 'posted', 'success'].includes(value.trim().toLowerCase())) return 'เสร็จสิ้น'
  return text(value)
}

export function buildPurchasePaymentLineFlexMessage(input: PurchasePaymentLineFlexData, detailUrl: string) {
  const shownApprovals = input.approvals.slice(0, MAX_APPROVALS)
  const remainingApprovals = input.approvals.length - shownApprovals.length
  const shownAccounts = input.companyAccounts.slice(0, MAX_COMPANY_ACCOUNTS)
  const remainingAccounts = input.companyAccounts.length - shownAccounts.length
  const approvalRows = shownApprovals.map((approval) => listRow(
    `${text(approval.approvalNo)} • ${sourceTypeLabel(approval.sourceType)} ${text(approval.sourceDocumentNo)}`,
    approval.amount,
  ))
  const accountRows = shownAccounts.map((account) => listRow(
    [text(account.accountCode, ''), text(account.accountName)].filter(Boolean).join(' - '),
    account.amount,
  ))
  if (remainingApprovals > 0) approvalRows.push(remainingRow(`+ อีก ${number(remainingApprovals)} PMA`))
  if (remainingAccounts > 0) accountRows.push(remainingRow(`+ อีก ${number(remainingAccounts)} บัญชี`))

  return {
    type: 'flex',
    altText: `ใบจ่ายเงิน Supplier ${text(input.documentNo)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0f172a',
        paddingAll: '20px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'ใบจ่ายเงิน Supplier', color: '#34d399', size: 'sm', weight: 'bold' },
          { type: 'text', text: text(input.documentNo), color: '#f8fafc', size: 'xl', weight: 'bold', wrap: true },
          { type: 'text', text: date(input.date), color: '#94a3b8', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1e293b',
        paddingAll: '20px',
        spacing: 'md',
        contents: [
          detailRow('สาขา', text(input.branchName)),
          detailRow('ผู้รับเงิน', text(input.payeeName)),
          detailRow('วิธีจ่าย', text(input.paymentMethod)),
          detailRow('ธนาคารปลายทาง', text(input.destinationBankName)),
          detailRow('บัญชีปลายทาง', maskedAccountNumber(input.destinationAccountNo)),
          { type: 'separator', color: '#475569' },
          { type: 'text', text: 'PMA / เอกสารต้นทาง', color: '#94a3b8', size: 'sm' },
          ...(approvalRows.length > 0 ? approvalRows : [detailRow('รายการ', '-')]),
          { type: 'separator', color: '#475569' },
          { type: 'text', text: 'บัญชีบริษัทที่ใช้จ่าย', color: '#94a3b8', size: 'sm' },
          ...(accountRows.length > 0 ? accountRows : [detailRow('รายการ', '-')]),
          { type: 'separator', color: '#475569' },
          detailRow('ยอดจ่าย', money(input.paidAmount)),
          detailRow('ส่วนลด', money(input.discount)),
          detailRow('ภาษีหัก ณ ที่จ่าย', money(input.withholdingTax)),
          detailRow('ค่าธรรมเนียม', money(input.fee)),
          detailRow('เงินออกสุทธิ', money(input.netCashOut)),
          detailRow('หมายเหตุ', text(input.notes)),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#020617',
        paddingAll: '16px',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'สถานะ', color: '#94a3b8', size: 'sm' },
              {
                type: 'text',
                text: paymentStatus(input.status),
                color: isCancelledStatus(input.status) ? '#f87171' : '#34d399',
                size: 'sm',
                weight: 'bold',
                align: 'end',
                wrap: true,
              },
            ],
          },
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#059669',
            action: {
              type: 'uri',
              label: 'เปิดในระบบ',
              uri: detailUrl,
            },
          },
        ],
      },
    },
  }
}
