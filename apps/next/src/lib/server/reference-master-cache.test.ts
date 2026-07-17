import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const accountsFindMany = vi.fn()
const branchesFindMany = vi.fn()
const currenciesFindMany = vi.fn()
const customersFindMany = vi.fn()
const expenseTypesFindMany = vi.fn()
const machineTypesFindMany = vi.fn()
const overseasRecipientsFindMany = vi.fn()
const overseasRemittancePurposesFindMany = vi.fn()
const productTypesFindMany = vi.fn()
const productUnitsFindMany = vi.fn()
const productsFindMany = vi.fn()
const suppliersFindMany = vi.fn()
const warehousesFindMany = vi.fn()

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    accounts: {
      findMany: accountsFindMany,
    },
    branches: {
      findMany: branchesFindMany,
    },
    currencies: {
      findMany: currenciesFindMany,
    },
    customers: {
      findMany: customersFindMany,
    },
    expense_types: {
      findMany: expenseTypesFindMany,
    },
    overseas_recipients: {
      findMany: overseasRecipientsFindMany,
    },
    overseas_remittance_purposes: {
      findMany: overseasRemittancePurposesFindMany,
    },
    production_machine_types: {
      findMany: machineTypesFindMany,
    },
    product_types: {
      findMany: productTypesFindMany,
    },
    product_units: {
      findMany: productUnitsFindMany,
    },
    products: {
      findMany: productsFindMany,
    },
    suppliers: {
      findMany: suppliersFindMany,
    },
    warehouses: {
      findMany: warehousesFindMany,
    },
  },
}))

describe('reference-master-cache', () => {
  const originalFetch = global.fetch
  const envBackup = {
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    REFERENCE_CACHE_OBSERVABILITY_ENABLED: process.env.REFERENCE_CACHE_OBSERVABILITY_ENABLED,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.KV_REST_API_URL = ''
    process.env.KV_REST_API_TOKEN = ''
    process.env.REFERENCE_CACHE_OBSERVABILITY_ENABLED = ''
    process.env.UPSTASH_REDIS_REST_URL = ''
    process.env.UPSTASH_REDIS_REST_TOKEN = ''
    global.fetch = originalFetch
  })

  afterEach(() => {
    process.env.KV_REST_API_TOKEN = envBackup.KV_REST_API_TOKEN
    process.env.KV_REST_API_URL = envBackup.KV_REST_API_URL
    process.env.REFERENCE_CACHE_OBSERVABILITY_ENABLED = envBackup.REFERENCE_CACHE_OBSERVABILITY_ENABLED
    process.env.UPSTASH_REDIS_REST_TOKEN = envBackup.UPSTASH_REDIS_REST_TOKEN
    process.env.UPSTASH_REDIS_REST_URL = envBackup.UPSTASH_REDIS_REST_URL
    global.fetch = originalFetch
  })

  it('memoizes active branch list in short-lived server cache', async () => {
    branchesFindMany.mockResolvedValue([
      { code: 'B01', id: 1n, name: 'สมุทรสาคร' },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveBranches()
    const second = await cache.listActiveBranches()

    expect(first).toEqual([{ address: null, code: 'B01', id: 1n, name: 'สมุทรสาคร', phone: null }])
    expect(second).toEqual(first)
    expect(branchesFindMany).toHaveBeenCalledTimes(1)
  })

  it('falls back to DB when Redis is configured but unavailable', async () => {
    process.env.KV_REST_API_URL = 'https://redis.example.com'
    process.env.KV_REST_API_TOKEN = 'token'
    global.fetch = vi.fn().mockRejectedValue(new Error('redis down')) as typeof fetch
    branchesFindMany.mockResolvedValue([
      { code: 'B02', id: 2n, name: 'นครสวรรค์' },
    ])

    const cache = await import('./reference-master-cache')
    const rows = await cache.listActiveBranches()

    expect(rows).toEqual([{ address: null, code: 'B02', id: 2n, name: 'นครสวรรค์', phone: null }])
    expect(global.fetch).toHaveBeenCalled()
    expect(branchesFindMany).toHaveBeenCalledTimes(1)
  })

  it('preserves branch master timestamps in the full master cache contract', async () => {
    branchesFindMany.mockResolvedValue([
      {
        active: true,
        address: 'สมุทรสาคร',
        code: 'B01',
        created_at: new Date('2026-07-01T00:00:00.000Z'),
        id: 1n,
        name: 'สมุทรสาคร',
        phone: '034-000-000',
        updated_at: new Date('2026-07-15T00:00:00.000Z'),
      },
    ])

    const cache = await import('./reference-master-cache')
    const rows = await cache.listBranchMasterRecords()

    expect(rows).toEqual([
      {
        active: true,
        address: 'สมุทรสาคร',
        code: 'B01',
        createdAt: '2026-07-01T00:00:00.000Z',
        id: 1n,
        name: 'สมุทรสาคร',
        phone: '034-000-000',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ])
  })

  it('memoizes currencies in short-lived server cache', async () => {
    currenciesFindMany.mockResolvedValue([
      { code: 'USD', id: 1n, name: 'US Dollar', rate_to_thb: 35.25, symbol: 'USD', updated_at: new Date('2026-07-16T00:00:00.000Z') },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listCurrencies()
    const second = await cache.listCurrencies()

    expect(first).toEqual([
      { code: 'USD', id: 1n, name: 'US Dollar', rateToThb: '35.25', symbol: 'USD', updatedAt: '2026-07-16T00:00:00.000Z' },
    ])
    expect(second).toEqual(first)
    expect(currenciesFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active accounts in short-lived server cache', async () => {
    accountsFindMany.mockResolvedValue([
      {
        active: true,
        account_no: '123-456',
        bank: 'KBANK',
        bank_name: 'กสิกรไทย',
        branches: { code: 'B01', id: 1n, name: 'สมุทรสาคร' },
        code: 'ACC001',
        currency: 'THB',
        id: 12n,
        name: 'บัญชีหลัก',
        od_limit: 250000,
        opening_balance: 1000,
        subtype: 'saving',
        type: 'bank',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveAccounts()
    const second = await cache.listActiveAccounts()

    expect(first).toEqual([
      {
        active: true,
        accountNo: '123-456',
        bank: 'KBANK',
        bankName: 'กสิกรไทย',
        branchCode: 'B01',
        branchId: 1n,
        branchName: 'สมุทรสาคร',
        code: 'ACC001',
        currency: 'THB',
        id: 12n,
        name: 'บัญชีหลัก',
        odLimit: '250000',
        openingBalance: '1000',
        subtype: 'saving',
        type: 'bank',
      },
    ])
    expect(second).toEqual(first)
    expect(accountsFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes all accounts in short-lived server cache', async () => {
    accountsFindMany.mockResolvedValue([
      {
        active: false,
        account_no: '999-000',
        bank: 'SCB',
        bank_name: 'ไทยพาณิชย์',
        branches: { code: 'B02', id: 2n, name: 'นครสวรรค์' },
        code: 'ACC999',
        currency: 'USD',
        id: 99n,
        name: 'บัญชีพัก',
        od_limit: null,
        opening_balance: 2500,
        subtype: null,
        type: 'bank',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listAllAccounts()
    const second = await cache.listAllAccounts()

    expect(first).toEqual([
      {
        active: false,
        accountNo: '999-000',
        bank: 'SCB',
        bankName: 'ไทยพาณิชย์',
        branchCode: 'B02',
        branchId: 2n,
        branchName: 'นครสวรรค์',
        code: 'ACC999',
        currency: 'USD',
        id: 99n,
        name: 'บัญชีพัก',
        odLimit: null,
        openingBalance: '2500',
        subtype: null,
        type: 'bank',
      },
    ])
    expect(second).toEqual(first)
    expect(accountsFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active overseas recipients in short-lived server cache', async () => {
    overseasRecipientsFindMany.mockResolvedValue([
      {
        account_no: '999-000',
        active: true,
        bank_name: 'HSBC',
        code: 'BEN001',
        country: 'US',
        currency: 'USD',
        id: 21n,
        name: 'Vendor USA',
        swift: 'HSBCUS33',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveOverseasRecipients()
    const second = await cache.listActiveOverseasRecipients()

    expect(first).toEqual([
      {
        accountNo: '999-000',
        active: true,
        bankName: 'HSBC',
        code: 'BEN001',
        country: 'US',
        currency: 'USD',
        id: 21n,
        name: 'Vendor USA',
        swift: 'HSBCUS33',
      },
    ])
    expect(second).toEqual(first)
    expect(overseasRecipientsFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active remittance purposes in short-lived server cache', async () => {
    overseasRemittancePurposesFindMany.mockResolvedValue([
      {
        active: true,
        code: 'PUR001',
        id: 31n,
        name: 'ค่าสินค้า',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveOverseasRemittancePurposes()
    const second = await cache.listActiveOverseasRemittancePurposes()

    expect(first).toEqual([
      {
        active: true,
        code: 'PUR001',
        id: 31n,
        name: 'ค่าสินค้า',
      },
    ])
    expect(second).toEqual(first)
    expect(overseasRemittancePurposesFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active customers in short-lived server cache', async () => {
    customersFindMany.mockResolvedValue([
      { code: 'CUS001', credit_term: 30, id: 3n, market_scope: 'ในประเทศ', name: 'ลูกค้า A' },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveCustomers()
    const second = await cache.listActiveCustomers()

    expect(first).toEqual([
      { code: 'CUS001', creditLimit: null, creditTerm: 30, id: 3n, marketScope: 'ในประเทศ', name: 'ลูกค้า A' },
    ])
    expect(second).toEqual(first)
    expect(customersFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active customer branch options in short-lived server cache', async () => {
    customersFindMany.mockResolvedValue([
      {
        code: 'CUS001',
        customer_branches: [
          { branches: { code: 'B01' } },
          { branches: { code: 'B02' } },
        ],
        id: 3n,
        market_scope: 'ในประเทศ',
        name: 'ลูกค้า A',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveCustomerBranchOptions()
    const second = await cache.listActiveCustomerBranchOptions()

    expect(first).toEqual([
      { branchIds: ['B01', 'B02'], code: 'CUS001', id: 3n, marketScope: 'ในประเทศ', name: 'ลูกค้า A' },
    ])
    expect(second).toEqual(first)
    expect(customersFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes searched active customers in short-lived server cache using normalized query', async () => {
    customersFindMany.mockResolvedValue([
      { code: 'CUS001', credit_limit: 1000, credit_term: 30, id: 3n, market_scope: 'ในประเทศ', name: 'ลูกค้า A' },
      { code: 'CUS002', credit_limit: 2000, credit_term: 15, id: 4n, market_scope: 'ในประเทศ', name: 'ลูกค้า B' },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.searchActiveCustomers('  cus001   ลูกค้า ')
    const second = await cache.searchActiveCustomers('cus001 ลูกค้า')

    expect(first).toEqual([
      { code: 'CUS001', creditLimit: '1000', creditTerm: 30, id: 3n, marketScope: 'ในประเทศ', name: 'ลูกค้า A' },
    ])
    expect(second).toEqual(first)
    expect(customersFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes expense types in short-lived server cache', async () => {
    expenseTypesFindMany.mockResolvedValue([
      {
        active: true,
        code: 'EXT-001',
        created_at: new Date('2026-07-16T00:00:00.000Z'),
        id: 7n,
        name: 'ค่าใช้จ่ายสำนักงาน',
        updated_at: new Date('2026-07-16T01:00:00.000Z'),
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listExpenseTypes()
    const second = await cache.listExpenseTypes()

    expect(first).toEqual([
      {
        active: true,
        code: 'EXT-001',
        createdAt: '2026-07-16T00:00:00.000Z',
        id: 7n,
        name: 'ค่าใช้จ่ายสำนักงาน',
        updatedAt: '2026-07-16T01:00:00.000Z',
      },
    ])
    expect(second).toEqual(first)
    expect(expenseTypesFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes machine types in short-lived server cache', async () => {
    machineTypesFindMany.mockResolvedValue([
      {
        active: true,
        created_at: new Date('2026-07-16T00:00:00.000Z'),
        id: 10n,
        name: 'เครื่องอัด',
        updated_at: new Date('2026-07-16T01:00:00.000Z'),
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listMachineTypes()
    const second = await cache.listMachineTypes()

    expect(first).toEqual([
      {
        active: true,
        createdAt: '2026-07-16T00:00:00.000Z',
        id: 10n,
        name: 'เครื่องอัด',
        updatedAt: '2026-07-16T01:00:00.000Z',
      },
    ])
    expect(second).toEqual(first)
    expect(machineTypesFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes product types in short-lived server cache', async () => {
    productTypesFindMany.mockResolvedValue([
      {
        active: true,
        code: 'PT-001',
        created_at: new Date('2026-07-16T00:00:00.000Z'),
        id: 8n,
        name: 'โลหะผสม',
        updated_at: new Date('2026-07-16T01:00:00.000Z'),
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listProductTypes()
    const second = await cache.listProductTypes()

    expect(first).toEqual([
      {
        active: true,
        code: 'PT-001',
        createdAt: '2026-07-16T00:00:00.000Z',
        id: 8n,
        name: 'โลหะผสม',
        updatedAt: '2026-07-16T01:00:00.000Z',
      },
    ])
    expect(second).toEqual(first)
    expect(productTypesFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes product units in short-lived server cache', async () => {
    productUnitsFindMany.mockResolvedValue([
      {
        active: true,
        code: 'U001',
        created_at: new Date('2026-07-16T00:00:00.000Z'),
        id: 9n,
        name: 'กิโลกรัม',
        symbol: 'กก.',
        updated_at: new Date('2026-07-16T01:00:00.000Z'),
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listProductUnits()
    const second = await cache.listProductUnits()

    expect(first).toEqual([
      {
        active: true,
        code: 'U001',
        createdAt: '2026-07-16T00:00:00.000Z',
        id: 9n,
        name: 'กิโลกรัม',
        symbol: 'กก.',
        updatedAt: '2026-07-16T01:00:00.000Z',
      },
    ])
    expect(second).toEqual(first)
    expect(productUnitsFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active product options and thumbnail metadata as separate contracts', async () => {
    productsFindMany
      .mockResolvedValueOnce([
        {
          active: true,
          code: 'SKU001',
          id: 41n,
          metal_group: 'เหล็ก',
          name: 'กระทะดำ, ผัด',
          type: 'เหล็ก',
          unit: 'กก.',
        },
      ])
      .mockResolvedValueOnce([
        {
          code: 'SKU001',
          image_thumbnail_storage_key: 'products/sku001/thumb/pan.webp',
        },
      ])

    const cache = await import('./reference-master-cache')
    const firstOptions = await cache.listActiveProductReferences()
    const firstThumbnails = await cache.listActiveProductThumbnailReferences()
    const secondOptions = await cache.listActiveProductReferences()
    const secondThumbnails = await cache.listActiveProductThumbnailReferences()

    expect(firstOptions).toEqual([
      {
        active: true,
        code: 'SKU001',
        id: 41n,
        metalGroup: 'เหล็ก',
        name: 'กระทะดำ, ผัด',
        type: 'เหล็ก',
        unit: 'กก.',
      },
    ])
    expect(firstThumbnails).toEqual([
      { code: 'SKU001', thumbnailStorageKey: 'products/sku001/thumb/pan.webp' },
    ])
    expect(secondOptions).toEqual(firstOptions)
    expect(secondThumbnails).toEqual(firstThumbnails)
    expect(productsFindMany).toHaveBeenCalledTimes(2)
  })

  it('hydrates active product options from Redis without reading the database', async () => {
    process.env.KV_REST_API_URL = 'https://redis.example.com'
    process.env.KV_REST_API_TOKEN = 'token'
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{
        result: JSON.stringify([{
          active: true,
          code: 'SKU002',
          id: '42',
          metalGroup: 'อะลูมิเนียม',
          name: 'กระป๋องอลูมิเนียม',
          type: 'อะลูมิเนียม',
          unit: 'กก.',
        }]),
      }],
      ok: true,
    }) as typeof fetch

    const cache = await import('./reference-master-cache')
    const rows = await cache.listActiveProductReferences()

    expect(rows).toEqual([
      {
        active: true,
        code: 'SKU002',
        id: 42n,
        metalGroup: 'อะลูมิเนียม',
        name: 'กระป๋องอลูมิเนียม',
        type: 'อะลูมิเนียม',
        unit: 'กก.',
      },
    ])
    expect(productsFindMany).not.toHaveBeenCalled()
  })

  it('emits redacted cache read telemetry without including product search text', async () => {
    process.env.REFERENCE_CACHE_OBSERVABILITY_ENABLED = 'true'
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    productsFindMany.mockResolvedValue([
      { active: true, code: 'SKU001', id: 41n, metal_group: null, name: 'กระทะดำ, ผัด', type: null, unit: 'กก.' },
    ])

    const cache = await import('./reference-master-cache')
    await cache.searchActiveProducts('confidential search value')

    const events = info.mock.calls.map(([message]) => JSON.parse(String(message)))
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'reference_cache_read', keyFamily: 'reference:products:active', outcome: 'miss', tier: 'database' }),
      expect.objectContaining({ event: 'reference_cache_read', keyFamily: 'reference:products:search:*', outcome: 'miss', tier: 'database' }),
    ]))
    expect(JSON.stringify(events)).not.toContain('confidential search value')
  })

  it('memoizes active suppliers in short-lived server cache', async () => {
    suppliersFindMany.mockResolvedValue([
      {
        address: '123 ถนนสุขุมวิท',
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
        phone: '0812345678',
        sales_id: 9n,
        sales_rep: 'Sale A',
        tax_id: '0105555555',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveSuppliers()
    const second = await cache.listActiveSuppliers()

    expect(first).toEqual([
      {
        address: '123 ถนนสุขุมวิท',
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
        phone: '0812345678',
        salesId: 9n,
        salesRep: 'Sale A',
        taxId: '0105555555',
      },
    ])
    expect(second).toEqual(first)
    expect(suppliersFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes historical supplier summaries by requested ids', async () => {
    suppliersFindMany.mockResolvedValue([
      {
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
      },
      {
        code: 'SU0002',
        id: 5n,
        name: 'Supplier B',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listSupplierReferencesByIds([5n, '4', 5n, null])
    const second = await cache.listSupplierReferencesByIds(['4', 5n])

    expect(first).toEqual([
      { code: 'SU0001', id: 4n, name: 'Supplier A' },
      { code: 'SU0002', id: 5n, name: 'Supplier B' },
    ])
    expect(second).toEqual(first)
    expect(suppliersFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active supplier payment options in short-lived server cache', async () => {
    suppliersFindMany.mockResolvedValue([
      {
        active: true,
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
        supplier_bank_accounts: [
          {
            account_name: 'Supplier A Main',
            account_no: '123-4-56789-0',
            active: null,
            bank_names: { name: 'KBANK' },
            branch_code: '001',
            code: 'SBA001',
            is_primary: true,
            payment_method: 'เงินโอน',
          },
          {
            account_name: null,
            account_no: null,
            active: true,
            bank_names: null,
            branch_code: null,
            code: 'SBA002',
            is_primary: false,
            payment_method: 'เงินสด',
          },
        ],
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveSupplierPaymentOptions()
    const second = await cache.listActiveSupplierPaymentOptions()

    expect(first).toEqual([
      {
        active: true,
        bankAccount: '123-4-56789-0',
        bankAccounts: [
          { accountName: 'Supplier A Main', accountNo: '123-4-56789-0', active: false, bankName: 'KBANK', branchCode: '001', code: 'SBA001', paymentMethod: 'เงินโอน' },
          { accountName: null, accountNo: null, active: true, bankName: null, branchCode: null, code: 'SBA002', paymentMethod: 'เงินสด' },
        ],
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
      },
    ])
    expect(second).toEqual(first)
    expect(suppliersFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes searched active suppliers in short-lived server cache using normalized query', async () => {
    suppliersFindMany.mockResolvedValue([
      {
        address: '123 ถนนสุขุมวิท',
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
        phone: '0812345678',
        sales_id: 9n,
        sales_rep: 'Sale A',
        tax_id: '0105555555',
      },
      {
        address: '456 ถนนสุขุมวิท',
        code: 'SU0002',
        id: 5n,
        name: 'Supplier B',
        phone: '0899999999',
        sales_id: 10n,
        sales_rep: 'Sale B',
        tax_id: '0206666666',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.searchActiveSuppliers('  su0001   supplier ')
    const second = await cache.searchActiveSuppliers('su0001 supplier')

    expect(first).toEqual([
      {
        address: '123 ถนนสุขุมวิท',
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
        phone: '0812345678',
        salesId: 9n,
        salesRep: 'Sale A',
        taxId: '0105555555',
      },
    ])
    expect(second).toEqual(first)
    expect(suppliersFindMany).toHaveBeenCalledTimes(1)
  })

  it('memoizes active supplier branch options in short-lived server cache', async () => {
    suppliersFindMany.mockResolvedValue([
      {
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
        supplier_branches: [
          { branches: { code: 'B01' } },
          { branches: { code: 'B03' } },
        ],
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveSupplierBranchOptions()
    const second = await cache.listActiveSupplierBranchOptions()

    expect(first).toEqual([
      { branchIds: ['B01', 'B03'], code: 'SU0001', id: 4n, name: 'Supplier A' },
    ])
    expect(second).toEqual(first)
    expect(suppliersFindMany).toHaveBeenCalledTimes(1)
  })

  it('clears scoped warehouse cache after invalidation', async () => {
    warehousesFindMany.mockResolvedValue([
      {
        branches: { code: 'B01' },
        code: 'WH01',
        id: 11n,
        name: 'คลัง RM',
        type: 'RM',
      },
    ])

    const cache = await import('./reference-master-cache')
    const first = await cache.listActiveWarehousesByBranch('B01')
    const second = await cache.listActiveWarehousesByBranch('B01')
    await cache.invalidateWarehouseReferenceCache(['B01'])
    const third = await cache.listActiveWarehousesByBranch('B01')

    expect(first).toEqual([{ branchCode: 'B01', code: 'WH01', id: 11n, name: 'คลัง RM', type: 'RM' }])
    expect(second).toEqual(first)
    expect(third).toEqual(first)
    expect(warehousesFindMany).toHaveBeenCalledTimes(2)
  })

  it('preserves warehouse master createdAt and its schema-defined null updatedAt', async () => {
    warehousesFindMany.mockResolvedValue([
      {
        active: true,
        branches: { code: 'B01', name: 'สมุทรสาคร' },
        code: 'WH01',
        created_at: new Date('2026-07-01T00:00:00.000Z'),
        id: 11n,
        name: 'คลัง RM',
        type: 'RM',
      },
    ])

    const cache = await import('./reference-master-cache')
    const rows = await cache.listWarehouseMasterRecords()

    expect(rows).toEqual([
      {
        active: true,
        branchCode: 'B01',
        branchName: 'สมุทรสาคร',
        code: 'WH01',
        createdAt: '2026-07-01T00:00:00.000Z',
        id: 11n,
        name: 'คลัง RM',
        type: 'RM',
        updatedAt: null,
      },
    ])
  })

  it('clears searched customer cache after invalidation', async () => {
    customersFindMany
      .mockResolvedValueOnce([
        { code: 'CUS001', credit_limit: 1000, credit_term: 30, id: 3n, market_scope: 'ในประเทศ', name: 'ลูกค้า A' },
      ])
      .mockResolvedValueOnce([
        { code: 'CUS001', credit_limit: 1000, credit_term: 30, id: 3n, market_scope: 'ในประเทศ', name: 'ลูกค้า A' },
      ])

    const cache = await import('./reference-master-cache')
    await cache.searchActiveCustomers('cus001')
    await cache.searchActiveCustomers('cus001')
    await cache.invalidateCustomerReferenceCache()
    await cache.searchActiveCustomers('cus001')

    expect(customersFindMany).toHaveBeenCalledTimes(2)
  })

  it('clears active account cache after invalidation', async () => {
    accountsFindMany
      .mockResolvedValueOnce([
        {
          account_no: '123-456',
          bank: 'KBANK',
          bank_name: 'กสิกรไทย',
          branches: { code: 'B01', id: 1n, name: 'สมุทรสาคร' },
          code: 'ACC001',
          currency: 'THB',
          id: 12n,
          name: 'บัญชีหลัก',
          opening_balance: 1000,
          type: 'bank',
        },
      ])
      .mockResolvedValueOnce([
        {
          account_no: '123-456',
          bank: 'KBANK',
          bank_name: 'กสิกรไทย',
          branches: { code: 'B01', id: 1n, name: 'สมุทรสาคร' },
          code: 'ACC001',
          currency: 'THB',
          id: 12n,
          name: 'บัญชีหลัก (ใหม่)',
          opening_balance: 1000,
          type: 'bank',
        },
      ])

    const cache = await import('./reference-master-cache')
    await cache.listActiveAccounts()
    await cache.listActiveAccounts()
    await cache.invalidateAccountReferenceCache()
    const rows = await cache.listActiveAccounts()

    expect(rows[0]?.name).toBe('บัญชีหลัก (ใหม่)')
    expect(accountsFindMany).toHaveBeenCalledTimes(2)
  })

  it('clears active product option, search, and thumbnail caches after invalidation', async () => {
    productsFindMany
      .mockResolvedValueOnce([{ active: true, code: 'SKU001', id: 41n, metal_group: null, name: 'สินค้าเดิม', type: null, unit: 'กก.' }])
      .mockResolvedValueOnce([{ code: 'SKU001', image_thumbnail_storage_key: 'products/sku001/thumb/old.webp' }])
      .mockResolvedValueOnce([{ active: true, code: 'SKU001', id: 41n, metal_group: null, name: 'สินค้าใหม่', type: null, unit: 'กก.' }])
      .mockResolvedValueOnce([{ code: 'SKU001', image_thumbnail_storage_key: 'products/sku001/thumb/new.webp' }])

    const cache = await import('./reference-master-cache')
    await cache.searchActiveProducts('sku001')
    await cache.listActiveProductThumbnailReferences()
    await cache.invalidateProductReferenceCache()
    const options = await cache.searchActiveProducts('sku001')
    const thumbnails = await cache.listActiveProductThumbnailReferences()

    expect(options[0]?.name).toBe('สินค้าใหม่')
    expect(thumbnails[0]?.thumbnailStorageKey).toBe('products/sku001/thumb/new.webp')
    expect(productsFindMany).toHaveBeenCalledTimes(4)
  })

  it('clears overseas recipient cache after invalidation', async () => {
    overseasRecipientsFindMany
      .mockResolvedValueOnce([
        {
          account_no: '999-000',
          active: true,
          bank_name: 'HSBC',
          code: 'BEN001',
          country: 'US',
          currency: 'USD',
          id: 21n,
          name: 'Vendor USA',
          swift: 'HSBCUS33',
        },
      ])
      .mockResolvedValueOnce([
        {
          account_no: '999-000',
          active: true,
          bank_name: 'HSBC',
          code: 'BEN001',
          country: 'US',
          currency: 'USD',
          id: 21n,
          name: 'Vendor USA 2',
          swift: 'HSBCUS33',
        },
      ])

    const cache = await import('./reference-master-cache')
    await cache.listActiveOverseasRecipients()
    await cache.listActiveOverseasRecipients()
    await cache.invalidateOverseasRecipientReferenceCache()
    const rows = await cache.listActiveOverseasRecipients()

    expect(rows[0]?.name).toBe('Vendor USA 2')
    expect(overseasRecipientsFindMany).toHaveBeenCalledTimes(2)
  })

  it('clears remittance purpose cache after invalidation', async () => {
    overseasRemittancePurposesFindMany
      .mockResolvedValueOnce([
        {
          active: true,
          code: 'PUR001',
          id: 31n,
          name: 'ค่าสินค้า',
        },
      ])
      .mockResolvedValueOnce([
        {
          active: true,
          code: 'PUR001',
          id: 31n,
          name: 'ค่าบริการ',
        },
      ])

    const cache = await import('./reference-master-cache')
    await cache.listActiveOverseasRemittancePurposes()
    await cache.listActiveOverseasRemittancePurposes()
    await cache.invalidateOverseasRemittancePurposeReferenceCache()
    const rows = await cache.listActiveOverseasRemittancePurposes()

    expect(rows[0]?.name).toBe('ค่าบริการ')
    expect(overseasRemittancePurposesFindMany).toHaveBeenCalledTimes(2)
  })

  it('clears searched supplier cache after invalidation', async () => {
    suppliersFindMany
      .mockResolvedValueOnce([
        {
          address: '123 ถนนสุขุมวิท',
          code: 'SU0001',
          id: 4n,
          name: 'Supplier A',
          phone: '0812345678',
          sales_id: 9n,
          sales_rep: 'Sale A',
          tax_id: '0105555555',
        },
      ])
      .mockResolvedValueOnce([
        {
          address: '123 ถนนสุขุมวิท',
          code: 'SU0001',
          id: 4n,
          name: 'Supplier A',
          phone: '0812345678',
          sales_id: 9n,
          sales_rep: 'Sale A',
          tax_id: '0105555555',
        },
      ])

    const cache = await import('./reference-master-cache')
    await cache.searchActiveSuppliers('su0001')
    await cache.searchActiveSuppliers('su0001')
    await cache.invalidateSupplierReferenceCache()
    await cache.searchActiveSuppliers('su0001')

    expect(suppliersFindMany).toHaveBeenCalledTimes(2)
  })

  it('clears historical supplier summary cache after invalidation', async () => {
    suppliersFindMany
      .mockResolvedValueOnce([
        {
          code: 'SU0001',
          id: 4n,
          name: 'Supplier A',
        },
      ])
      .mockResolvedValueOnce([
        {
          code: 'SU0001',
          id: 4n,
          name: 'Supplier A',
        },
      ])

    const cache = await import('./reference-master-cache')
    await cache.listSupplierReferencesByIds([4n])
    await cache.listSupplierReferencesByIds(['4'])
    await cache.invalidateSupplierReferenceCache()
    await cache.listSupplierReferencesByIds([4n])

    expect(suppliersFindMany).toHaveBeenCalledTimes(2)
  })

  it('clears active supplier payment option cache after supplier invalidation', async () => {
    suppliersFindMany
      .mockResolvedValueOnce([
        {
          active: true,
          code: 'SU0001',
          id: 4n,
          name: 'Supplier A',
          supplier_bank_accounts: [
            {
              account_name: 'Supplier A Main',
              account_no: '123-4-56789-0',
              active: true,
              bank_names: { name: 'KBANK' },
              branch_code: '001',
              code: 'SBA001',
              is_primary: true,
              payment_method: 'เงินโอน',
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          active: true,
          code: 'SU0001',
          id: 4n,
          name: 'Supplier A',
          supplier_bank_accounts: [
            {
              account_name: 'Supplier A Main 2',
              account_no: '999-9-99999-9',
              active: true,
              bank_names: { name: 'SCB' },
              branch_code: '002',
              code: 'SBA001',
              is_primary: true,
              payment_method: 'เงินโอน',
            },
          ],
        },
      ])

    const cache = await import('./reference-master-cache')
    await cache.listActiveSupplierPaymentOptions()
    await cache.listActiveSupplierPaymentOptions()
    await cache.invalidateSupplierReferenceCache()
    const rows = await cache.listActiveSupplierPaymentOptions()

    expect(rows).toEqual([
      {
        active: true,
        bankAccount: '999-9-99999-9',
        bankAccounts: [
          { accountName: 'Supplier A Main 2', accountNo: '999-9-99999-9', active: true, bankName: 'SCB', branchCode: '002', code: 'SBA001', paymentMethod: 'เงินโอน' },
        ],
        code: 'SU0001',
        id: 4n,
        name: 'Supplier A',
      },
    ])
    expect(suppliersFindMany).toHaveBeenCalledTimes(2)
  })
})
