export const PO_BUY_PERMISSIONS = {
  cancel: 'purchase.po_buy.cancel',
  create: 'purchase.po_buy.create',
  shortClose: 'purchase.po_buy.short_close',
  update: 'purchase.po_buy.update',
  view: 'purchase.po_buy.view',
} as const

export const PO_SELL_PERMISSIONS = {
  cancel: 'sales.po_sell.cancel',
  create: 'sales.po_sell.create',
  shortClose: 'sales.po_sell.short_close',
  update: 'sales.po_sell.update',
  view: 'sales.po_sell.view',
} as const

export function poBuyPatchPermission(action: unknown) {
  return action === 'shortClose' ? PO_BUY_PERMISSIONS.shortClose : PO_BUY_PERMISSIONS.cancel
}

export function poSellPatchPermission(action: unknown) {
  if (action === 'cancel') return PO_SELL_PERMISSIONS.cancel
  if (action === 'shortClose') return PO_SELL_PERMISSIONS.shortClose
  return PO_SELL_PERMISSIONS.update
}
