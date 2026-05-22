import { toNumber } from '@/lib/server/daily'

type PurchaseBillItemRow = {
  amount?: unknown
  deduct_weight?: unknown
  discount?: unknown
  display_name?: string | null
  gross_weight?: unknown
  line_no?: number | null
  lot_no?: string | null
  note?: string | null
  po_buy_id?: string | null
  price?: unknown
  product_code?: string | null
  product_id?: string | null
  product_name?: string | null
  qty?: unknown
  sales_price?: unknown
  unit?: string | null
}

type PurchaseBillWithLineItems = {
  purchase_bill_items?: PurchaseBillItemRow[] | null
}

export type PurchaseBillJsonItem = Record<string, any> & {
  amount: number
  deductWeight: number
  discount: number
  displayName?: string
  grossWeight: number
  lineId: string
  lotNo?: string
  note?: string
  poBuyId?: string
  price: number
  productCode: string
  productId: string
  productName: string
  qty: number
  salesPrice: number
  unit: string
}

export function purchaseBillItemRows(row: PurchaseBillWithLineItems): PurchaseBillJsonItem[] {
  const lineRows = row.purchase_bill_items ?? []
  if (lineRows.length) {
    return lineRows.map((item, index) => ({
      amount: toNumber(item.amount as Parameters<typeof toNumber>[0]),
      deductWeight: toNumber(item.deduct_weight as Parameters<typeof toNumber>[0]),
      discount: toNumber(item.discount as Parameters<typeof toNumber>[0]),
      displayName: item.display_name ?? undefined,
      grossWeight: toNumber(item.gross_weight as Parameters<typeof toNumber>[0]),
      lineId: String(item.line_no ?? index + 1),
      lotNo: item.lot_no ?? undefined,
      note: item.note ?? undefined,
      poBuyId: item.po_buy_id ?? undefined,
      price: toNumber(item.price as Parameters<typeof toNumber>[0]),
      productCode: item.product_code ?? '',
      productId: item.product_id ?? '',
      productName: item.product_name ?? item.product_id ?? '',
      qty: toNumber(item.qty as Parameters<typeof toNumber>[0]),
      salesPrice: toNumber(item.sales_price as Parameters<typeof toNumber>[0]),
      unit: item.unit ?? 'กก.',
    }))
  }

  return []
}

export function purchaseBillItemQty(row: PurchaseBillWithLineItems) {
  return purchaseBillItemRows(row).reduce((sum, item) => sum + item.qty, 0)
}
