import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../../../generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  pgPool?: Pool
  prisma?: PrismaClient
}

function hasExpectedDelegates(client: PrismaClient) {
  const clientRecord = client as unknown as Record<string, Record<string, unknown> | undefined>
  const runtimeModels = (client as PrismaClient & {
    _runtimeDataModel?: {
      models?: Record<string, { fields?: Array<{ name?: string }> }>
    }
  })._runtimeDataModel?.models

  const accountFields = runtimeModels?.accounts?.fields?.map((field) => field.name) ?? []
  const hasAccountSubtypeField = accountFields.includes('subtype')
  const paymentMethodFields = runtimeModels?.payment_methods?.fields?.map((field) => field.name) ?? []
  const hasPaymentMethodTypeField = paymentMethodFields.includes('type')

  return typeof clientRecord.weight_ticket_product_summaries?.createMany === 'function'
    && typeof clientRecord.weight_ticket_product_summary_lines?.createMany === 'function'
    && typeof clientRecord.payment_approvals?.findMany === 'function'
    && typeof clientRecord.supplier_advance_payments?.findMany === 'function'
    && typeof clientRecord.supplier_advance_allocations?.findMany === 'function'
    && typeof clientRecord.account_subtypes?.findMany === 'function'
    && typeof clientRecord.po_buy_allocation_logs?.createMany === 'function'
    && typeof clientRecord.weight_ticket_usage_logs?.createMany === 'function'
    && typeof clientRecord.supplier_advance_allocation_logs?.createMany === 'function'
    && typeof clientRecord.supplier_advance_status_logs?.createMany === 'function'
    && hasAccountSubtypeField
    && hasPaymentMethodTypeField
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is required for Prisma.')
  }

  globalForPrisma.pgPool ??= new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    max: Number(process.env.DATABASE_POOL_MAX ?? '1'),
  })

  return new PrismaClient({ adapter: new PrismaPg(globalForPrisma.pgPool) })
}

function getPrismaClient() {
  if (globalForPrisma.prisma && !hasExpectedDelegates(globalForPrisma.prisma)) {
    void globalForPrisma.prisma.$disconnect().catch(() => {})
    globalForPrisma.prisma = undefined
  }

  globalForPrisma.prisma ??= createPrismaClient()
  return globalForPrisma.prisma
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrismaClient(), property, receiver)
  },
})
