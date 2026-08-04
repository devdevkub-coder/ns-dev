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
} as const
