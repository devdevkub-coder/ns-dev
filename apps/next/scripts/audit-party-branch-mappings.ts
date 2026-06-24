import nextEnv from '@next/env'

const projectDir = new URL('..', import.meta.url).pathname
const { loadEnvConfig } = nextEnv
loadEnvConfig(projectDir)

type CountRow = {
  label: string
  count: number
}

async function main() {
  const { prisma } = await import('../src/lib/server/prisma')
  const { isCustomerEligibleForBranch, isSupplierEligibleForBranch } = await import('../src/lib/server/party-branch-eligibility')

  const requiredTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('customer_branches', 'supplier_branches')
    order by table_name
  `
  const tableNames = new Set(requiredTables.map((row) => row.table_name))
  for (const tableName of ['customer_branches', 'supplier_branches']) {
    if (!tableNames.has(tableName)) throw new Error(`missing table ${tableName}`)
  }

  const requiredIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'uq_customer_branches_primary_active',
        'idx_customer_branches_branch_active_customer',
        'idx_customer_branches_customer_active_branch',
        'uq_supplier_branches_primary_active',
        'idx_supplier_branches_branch_active_supplier',
        'idx_supplier_branches_supplier_active_branch'
      )
    order by indexname
  `
  const indexNames = new Set(requiredIndexes.map((row) => row.indexname))
  for (const indexName of [
    'uq_customer_branches_primary_active',
    'idx_customer_branches_branch_active_customer',
    'idx_customer_branches_customer_active_branch',
    'uq_supplier_branches_primary_active',
    'idx_supplier_branches_branch_active_supplier',
    'idx_supplier_branches_supplier_active_branch',
  ]) {
    if (!indexNames.has(indexName)) throw new Error(`missing index ${indexName}`)
  }

  const counts = await prisma.$queryRaw<CountRow[]>`
    select 'active_customers'::text as label, count(*)::int as count
    from public.customers
    where active is true
    union all
    select 'active_customers_without_mapping'::text as label, count(*)::int as count
    from public.customers c
    where c.active is true
      and not exists (
        select 1
        from public.customer_branches cb
        where cb.customer_id = c.id
          and cb.active is true
      )
    union all
    select 'active_suppliers'::text as label, count(*)::int as count
    from public.suppliers
    where active is true
    union all
    select 'active_suppliers_without_mapping'::text as label, count(*)::int as count
    from public.suppliers s
    where s.active is true
      and not exists (
        select 1
        from public.supplier_branches sb
        where sb.supplier_id = s.id
          and sb.active is true
      )
  `

  const sampleUnmappedCustomers = await prisma.$queryRaw<Array<{ code: string; id: bigint; name: string }>>`
    select c.code, c.id, c.name
    from public.customers c
    where c.active is true
      and not exists (
        select 1
        from public.customer_branches cb
        where cb.customer_id = c.id
          and cb.active is true
      )
    order by c.code
    limit 20
  `

  const sampleUnmappedSuppliers = await prisma.$queryRaw<Array<{ code: string; id: bigint; name: string }>>`
    select s.code, s.id, s.name
    from public.suppliers s
    where s.active is true
      and not exists (
        select 1
        from public.supplier_branches sb
        where sb.supplier_id = s.id
          and sb.active is true
      )
    order by s.code
    limit 20
  `
  const firstActiveBranch = await prisma.branches.findFirst({
    orderBy: [{ code: 'asc' }],
    select: { code: true, id: true },
    where: { active: true },
  })
  const mappedCustomer = await prisma.customer_branches.findFirst({
    orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    select: { branch_id: true, customer_id: true },
    where: { active: true },
  })
  const mappedSupplier = await prisma.supplier_branches.findFirst({
    orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    select: { branch_id: true, supplier_id: true },
    where: { active: true },
  })
  const serviceChecks = {
    mappedCustomerAccepted: mappedCustomer
      ? await isCustomerEligibleForBranch({ branchId: mappedCustomer.branch_id, customerId: mappedCustomer.customer_id })
      : null,
    mappedSupplierAccepted: mappedSupplier
      ? await isSupplierEligibleForBranch({ branchId: mappedSupplier.branch_id, supplierId: mappedSupplier.supplier_id })
      : null,
    unmappedCustomerRejected: firstActiveBranch && sampleUnmappedCustomers[0]
      ? !(await isCustomerEligibleForBranch({ branchId: firstActiveBranch.id, customerId: sampleUnmappedCustomers[0].id }))
      : null,
    unmappedSupplierRejected: firstActiveBranch && sampleUnmappedSuppliers[0]
      ? !(await isSupplierEligibleForBranch({ branchId: firstActiveBranch.id, supplierId: sampleUnmappedSuppliers[0].id }))
      : null,
  }
  if (serviceChecks.mappedCustomerAccepted === false) throw new Error('mapped customer eligibility check failed')
  if (serviceChecks.mappedSupplierAccepted === false) throw new Error('mapped supplier eligibility check failed')
  if (serviceChecks.unmappedCustomerRejected === false) throw new Error('unmapped customer reject check failed')
  if (serviceChecks.unmappedSupplierRejected === false) throw new Error('unmapped supplier reject check failed')

  console.log(JSON.stringify({
    checked: {
      tables: requiredTables.length,
      indexes: requiredIndexes.length,
    },
    counts: Object.fromEntries(counts.map((row) => [row.label, row.count])),
    samples: {
      unmappedCustomers: sampleUnmappedCustomers.map(({ code, name }) => ({ code, name })),
      unmappedSuppliers: sampleUnmappedSuppliers.map(({ code, name }) => ({ code, name })),
    },
    serviceChecks,
    strictReady: sampleUnmappedCustomers.length === 0 && sampleUnmappedSuppliers.length === 0,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    const { prisma } = await import('../src/lib/server/prisma')
    await prisma.$disconnect()
  })
