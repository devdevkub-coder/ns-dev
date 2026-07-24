import { describe, expect, it } from 'vitest'
import { permissionForPath, sidebarPermissionSections, type PermissionCatalogEntry } from './navigation'
import {
  PO_BUY_PERMISSIONS,
  PO_SELL_PERMISSIONS,
  poBuyPatchPermission,
  poSellPatchPermission,
} from './po-permissions'

function permission(code: string, module: string, resource: string, action: string): PermissionCatalogEntry {
  return { action, code, description: code, id: code, module, resource }
}

describe('PO page permissions', () => {
  it('maps PO pages and APIs to their dedicated view permissions', () => {
    expect(permissionForPath('/purchase/po-buy')).toBe(PO_BUY_PERMISSIONS.view)
    expect(permissionForPath('/api/purchase/po-buy')).toBe(PO_BUY_PERMISSIONS.view)
    expect(permissionForPath('/sales/po-sell')).toBe(PO_SELL_PERMISSIONS.view)
    expect(permissionForPath('/api/sales/po-sell')).toBe(PO_SELL_PERMISSIONS.view)
  })

  it('groups each PO page with its own actions in Roles & Permissions', () => {
    const catalog = [
      permission(PO_BUY_PERMISSIONS.view, 'purchase', 'po_buy', 'view'),
      permission(PO_BUY_PERMISSIONS.create, 'purchase', 'po_buy', 'create'),
      permission(PO_BUY_PERMISSIONS.update, 'purchase', 'po_buy', 'update'),
      permission(PO_BUY_PERMISSIONS.cancel, 'purchase', 'po_buy', 'cancel'),
      permission(PO_BUY_PERMISSIONS.shortClose, 'purchase', 'po_buy', 'short_close'),
      permission(PO_SELL_PERMISSIONS.view, 'sales', 'po_sell', 'view'),
      permission(PO_SELL_PERMISSIONS.create, 'sales', 'po_sell', 'create'),
      permission(PO_SELL_PERMISSIONS.update, 'sales', 'po_sell', 'update'),
      permission(PO_SELL_PERMISSIONS.cancel, 'sales', 'po_sell', 'cancel'),
      permission(PO_SELL_PERMISSIONS.shortClose, 'sales', 'po_sell', 'short_close'),
      permission('finance.cash.view', 'finance', 'cash', 'view'),
    ]
    const pages = sidebarPermissionSections(catalog).flatMap((section) => section.pages)
    const poBuy = pages.find((page) => page.href === '/purchase/po-buy')
    const poSell = pages.find((page) => page.href === '/sales/po-sell')

    expect(poBuy?.actions.map((item) => item.code).sort()).toEqual(Object.values(PO_BUY_PERMISSIONS).sort())
    expect(poSell?.actions.map((item) => item.code).sort()).toEqual(Object.values(PO_SELL_PERMISSIONS).sort())
    expect(poBuy?.actions.some((item) => item.code === 'finance.cash.view')).toBe(false)
    expect(poSell?.actions.some((item) => item.code === 'finance.cash.view')).toBe(false)
  })

  it('selects the action permission for each PATCH operation', () => {
    expect(poBuyPatchPermission('cancel')).toBe(PO_BUY_PERMISSIONS.cancel)
    expect(poBuyPatchPermission('shortClose')).toBe(PO_BUY_PERMISSIONS.shortClose)
    expect(poSellPatchPermission('update')).toBe(PO_SELL_PERMISSIONS.update)
    expect(poSellPatchPermission('cancel')).toBe(PO_SELL_PERMISSIONS.cancel)
    expect(poSellPatchPermission('shortClose')).toBe(PO_SELL_PERMISSIONS.shortClose)
  })
})
