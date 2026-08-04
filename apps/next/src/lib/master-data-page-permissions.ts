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
    create: 'master.product_types.create',
    update: 'master.product_types.update',
    status: 'master.product_types.status',
  },
  productUnits: {
    view: 'master.product_units.view',
    create: 'master.product_units.create',
    update: 'master.product_units.update',
    status: 'master.product_units.status',
  },
  salespersons: {
    view: 'master.salespersons.view',
    create: 'master.salespersons.create',
    update: 'master.salespersons.update',
    status: 'master.salespersons.status',
  },
} as const
