export const MASTER_DATA_PAGE_PERMISSIONS = {
  customers: {
    view: 'master.customers.view',
  },
  impurities: {
    view: 'master.impurities.view',
    create: 'master.impurities.create',
    update: 'master.impurities.update',
    status: 'master.impurities.status',
  },
  products: {
    view: 'master.products.view',
  },
  productTypes: {
    view: 'master.product_types.view',
  },
  productUnits: {
    view: 'master.product_units.view',
  },
  salespersons: {
    view: 'master.salespersons.view',
    create: 'master.salespersons.create',
    update: 'master.salespersons.update',
    status: 'master.salespersons.status',
  },
} as const
