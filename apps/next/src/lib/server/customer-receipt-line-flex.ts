export type CustomerReceiptLineFlexData = {
  allocations: Array<{
    allocatedArAmount: number
    discount: number
    receiptAmount: number
    salesBillDocumentNo: string
    withholdingTax: number
  }>
  branchName: string
  companyAccounts: Array<{
    accountCode?: string
    accountName: string
    amount: number
  }>
  customerName: string
  date: string
  discount: number
  documentNo: string
  fee: number
  netCashIn: number
  notes?: string
  paymentMethod: string
  receivedAmount: number
  status: string
  withholdingTax: number
}

const MAX_ALLOCATIONS = 4
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

function detailRow(label: string, value: string, emphasized = false) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#475569', size: 'sm', flex: 3, weight: 'bold', wrap: true },
      {
        type: 'text',
        text: value,
        color: '#0f172a',
        size: emphasized ? 'md' : 'sm',
        flex: 4,
        ...(emphasized ? { weight: 'bold' } : {}),
        align: 'end',
        wrap: true,
      },
    ],
  }
}

function sectionTab(label: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: '#ecfdf5',
    cornerRadius: 'md',
    paddingAll: '10px',
    contents: [
      { type: 'text', text: label, color: '#065f46', size: 'sm', weight: 'bold', wrap: true },
    ],
  }
}

function allocationRow(allocation: CustomerReceiptLineFlexData['allocations'][number]) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 4,
        spacing: 'xs',
        contents: [
          { type: 'text', text: text(allocation.salesBillDocumentNo), color: '#0f172a', size: 'md', weight: 'bold', wrap: true },
          {
            type: 'text',
            text: `รับ ${money(allocation.receiptAmount)} · WHT ${money(allocation.withholdingTax)} · ลด ${money(allocation.discount)}`,
            color: '#64748b',
            size: 'sm',
            wrap: true,
          },
        ],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 2,
        contents: [
          { type: 'text', text: 'ตัดลูกหนี้', color: '#64748b', size: 'sm', weight: 'bold', align: 'end' },
          { type: 'text', text: money(allocation.allocatedArAmount), color: '#047857', size: 'md', weight: 'bold', align: 'end', wrap: true },
        ],
      },
    ],
  }
}

function accountRow(account: CustomerReceiptLineFlexData['companyAccounts'][number]) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: [text(account.accountCode, ''), text(account.accountName)].filter(Boolean).join(' - '),
        color: '#0f172a',
        size: 'md',
        flex: 4,
        weight: 'bold',
        wrap: true,
      },
      { type: 'text', text: money(account.amount), color: '#047857', size: 'md', flex: 2, weight: 'bold', align: 'end', wrap: true },
    ],
  }
}

function remainingRow(label: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#047857', size: 'sm', flex: 1, weight: 'bold', wrap: true },
    ],
  }
}

function isCancelledStatus(value: string) {
  return ['cancelled', 'canceled', 'reversed', 'void'].includes(value.trim().toLowerCase())
}

function receiptStatus(value: string) {
  if (isCancelledStatus(value)) return 'ยกเลิกแล้ว'
  if (['active', 'completed', 'received', 'success'].includes(value.trim().toLowerCase())) return 'รับเงินแล้ว'
  return text(value)
}

export function buildCustomerReceiptLineFlexMessage(input: CustomerReceiptLineFlexData, detailUrl: string) {
  const shownAllocations = input.allocations.slice(0, MAX_ALLOCATIONS)
  const remainingAllocations = input.allocations.length - shownAllocations.length
  const shownAccounts = input.companyAccounts.slice(0, MAX_COMPANY_ACCOUNTS)
  const remainingAccounts = input.companyAccounts.length - shownAccounts.length
  const allocationRows: Array<ReturnType<typeof allocationRow> | ReturnType<typeof remainingRow>> = shownAllocations.map(allocationRow)
  const accountRows: Array<ReturnType<typeof accountRow> | ReturnType<typeof remainingRow>> = shownAccounts.map(accountRow)
  const allocatedArTotal = input.receivedAmount + input.discount + input.withholdingTax

  if (remainingAllocations > 0) allocationRows.push(remainingRow(`+ อีก ${number(remainingAllocations)} บิลขาย`))
  if (remainingAccounts > 0) accountRows.push(remainingRow(`+ อีก ${number(remainingAccounts)} บัญชี`))

  return {
    type: 'flex',
    altText: `ใบรับเงิน Customer ${text(input.documentNo)}`,
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
          { type: 'text', text: 'ใบรับเงิน Customer', color: '#34d399', size: 'md', weight: 'bold' },
          { type: 'text', text: text(input.documentNo), color: '#f8fafc', size: 'xl', weight: 'bold', wrap: true },
          { type: 'text', text: date(input.date), color: '#cbd5e1', size: 'sm', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#f8fafc',
        paddingAll: '20px',
        spacing: 'md',
        contents: [
          detailRow('สาขา', text(input.branchName)),
          detailRow('ลูกค้า', text(input.customerName), true),
          detailRow('วิธีรับหลัก', text(input.paymentMethod)),
          sectionTab('SB / ตัดลูกหนี้'),
          ...(allocationRows.length > 0 ? allocationRows : [detailRow('รายการ', '-')]),
          sectionTab('บัญชีบริษัทที่รับเงิน'),
          ...(accountRows.length > 0 ? accountRows : [detailRow('รายการ', '-')]),
          sectionTab('สรุปยอดรับเงิน'),
          detailRow('ยอดรับ', money(input.receivedAmount), true),
          detailRow('ส่วนลด', money(input.discount)),
          detailRow('ภาษีหัก ณ ที่จ่าย', money(input.withholdingTax)),
          detailRow('ยอดตัดลูกหนี้', money(allocatedArTotal), true),
          detailRow('ค่าธรรมเนียม', money(input.fee)),
          detailRow('เงินเข้าสุทธิ', money(input.netCashIn), true),
          detailRow('หมายเหตุ', text(input.notes)),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#ffffff',
        paddingAll: '16px',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'สถานะ', color: '#475569', size: 'sm', weight: 'bold' },
              {
                type: 'text',
                text: receiptStatus(input.status),
                color: isCancelledStatus(input.status) ? '#dc2626' : '#047857',
                size: 'md',
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
            color: '#047857',
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
