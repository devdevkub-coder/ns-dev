import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../../../generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  pgPool?: Pool
  prisma?: PrismaClient
}

function hasWeightTicketSummaryDelegates(client: PrismaClient) {
  return typeof client.weight_ticket_product_summaries?.createMany === 'function'
    && typeof client.weight_ticket_product_summary_lines?.createMany === 'function'
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
  if (globalForPrisma.prisma && !hasWeightTicketSummaryDelegates(globalForPrisma.prisma)) {
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
