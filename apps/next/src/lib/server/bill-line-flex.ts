export type BillLineFlexData = {
  balance: number
  branchName: string
  channelName?: string
  date: string
  documentNo: string
  items: Array<{
    productName: string
    qty: number
    unit: string
  }>
  partyName: string
  salesName?: string
  settledAmount: number
  sourceType: 'purchase_bill' | 'sales_bill'
  totalAmount: number
  warehouseName: string
}

function text(value: string | null | undefined, fallback = '-') {
  return String(value ?? '').trim() || fallback
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
      { type: 'text', text: label, color: '#475569', size: 'sm', flex: 2 },
      { type: 'text', text: value, color: '#0f172a', size: 'sm', flex: 4, align: 'end', wrap: true },
    ],
  }
}

function settlementStatus(input: BillLineFlexData) {
  const isPurchase = input.sourceType === 'purchase_bill'
  if (input.balance <= 0.01) return isPurchase ? 'จ่ายครบ' : 'รับครบ'
  if (input.settledAmount > 0.01) return isPurchase ? 'จ่ายบางส่วน' : 'รับบางส่วน'
  return isPurchase ? 'รอจ่าย' : 'รอรับ'
}

export function buildBillLineFlexMessage(input: BillLineFlexData, detailUrl: string) {
  const isPurchase = input.sourceType === 'purchase_bill'
  const title = isPurchase ? '🛒 บิลซื้อ' : '🧾 บิลขาย'
  const partyLabel = isPurchase ? 'Supplier' : 'Customer'
  const settledLabel = isPurchase ? 'จ่ายแล้ว' : 'รับแล้ว'
  const balanceLabel = isPurchase ? 'ค้างจ่าย' : 'ค้างรับ'
  const shownItems = input.items.slice(0, 3)
  const remainingItemCount = input.items.length - shownItems.length
  const contextRows = [
    detailRow(partyLabel, text(input.partyName)),
    detailRow('สาขา', text(input.branchName)),
    detailRow('คลัง', text(input.warehouseName)),
  ]
  if (text(input.salesName, '')) contextRows.push(detailRow('Sale', text(input.salesName)))
  if (!isPurchase && text(input.channelName, '')) contextRows.push(detailRow('ช่องทางขาย', text(input.channelName)))

  const itemRows = shownItems.map((item) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: `• ${text(item.productName)}`,
        color: '#0f172a',
        size: 'sm',
        flex: 4,
        wrap: true,
      },
      {
        type: 'text',
        text: `${number(item.qty)} ${text(item.unit)}`,
        color: '#475569',
        size: 'sm',
        flex: 2,
        align: 'end',
        wrap: true,
      },
    ],
  }))

  if (remainingItemCount > 0) {
    itemRows.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'text',
          text: `• และสินค้าอื่นๆ อีก ${number(remainingItemCount)} รายการ`,
          color: '#0891b2',
          size: 'sm',
          flex: 4,
          wrap: true,
        },
      ],
    })
  }

  return {
    type: 'flex',
    altText: `${title} ${input.documentNo}`,
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
          { type: 'text', text: title, color: '#22d3ee', size: 'sm', weight: 'bold' },
          { type: 'text', text: text(input.documentNo), color: '#f8fafc', size: 'xl', weight: 'bold', wrap: true },
          { type: 'text', text: date(input.date), color: '#94a3b8', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#ffffff',
        paddingAll: '20px',
        spacing: 'md',
        contents: [
          ...contextRows,
          { type: 'separator', color: '#e2e8f0' },
          { type: 'text', text: 'สินค้า', color: '#475569', size: 'sm', weight: 'bold' },
          ...itemRows,
          { type: 'separator', color: '#e2e8f0' },
          detailRow('ยอดรวม', money(input.totalAmount)),
          detailRow(settledLabel, money(input.settledAmount)),
          detailRow(balanceLabel, money(input.balance)),
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
                text: settlementStatus(input),
                color: input.balance > 0 ? '#fbbf24' : '#34d399',
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
            color: '#0891b2',
            action: {
              type: 'uri',
              label: 'เปิดรายละเอียด',
              uri: detailUrl,
            },
          },
        ],
      },
    },
  }
}
