export type SimpleMasterViewKind = 'productTypes' | 'productUnits'

export function simpleMasterViewPermission(kind: SimpleMasterViewKind) {
  return kind === 'productTypes' ? 'master.product_types.view' : 'master.product_units.view'
}
