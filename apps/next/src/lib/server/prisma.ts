import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../../../generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  pgPool?: Pool
  pgPoolConnectionString?: string
  prisma?: PrismaClient
}

function resolveRuntimeDatabaseUrl() {
  const connectionString = process.env.DATABASE_RUNTIME_URL
    ?? process.env.DATABASE_PRISMA_URL
    ?? process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is required for Prisma.')
  }

  const url = new URL(connectionString)
  const isSupabasePooler = url.hostname.endsWith('.pooler.supabase.com')
    && url.username.startsWith('postgres.')
  if (isSupabasePooler && (!url.port || url.port === '5432')) {
    url.port = '6543'
  }

  return url.toString()
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
  const companyProfileFields = runtimeModels?.company_profiles?.fields?.map((field) => field.name) ?? []
  const hasCompanyProfileBranchIdField = companyProfileFields.includes('branch_id')
  const appUserFields = runtimeModels?.app_users?.fields?.map((field) => field.name) ?? []
  const hasAppUserProfileFields = [
    'name_prefix',
    'first_name',
    'last_name',
    'profile_image_url',
    'contact_phone',
    'contact_line_id',
    'contact_note',
  ].every((field) => appUserFields.includes(field))
  const salesBillFields = runtimeModels?.sales_bills?.fields?.map((field) => field.name) ?? []
  const hasSalesBillExportOrderField = salesBillFields.includes('export_order_no')
  const customerAdvanceFields = runtimeModels?.customer_advances?.fields?.map((field) => field.name) ?? []
  const hasCustomerAdvanceVatFields = [
    'subtotal_amount',
    'vat_amount',
    'vat_rate_percent',
    'vat_type',
  ].every((field) => customerAdvanceFields.includes(field))

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
    && typeof clientRecord.payment_approval_status_logs?.createMany === 'function'
    && typeof clientRecord.payment_status_logs?.createMany === 'function'
    && typeof clientRecord.payment_allocations?.createMany === 'function'
    && typeof clientRecord.payment_account_splits?.createMany === 'function'
    && typeof clientRecord.customer_receipts?.findMany === 'function'
    && typeof clientRecord.customer_advances?.findMany === 'function'
    && typeof clientRecord.customer_advance_items?.findMany === 'function'
    && typeof clientRecord.customer_advance_status_logs?.createMany === 'function'
    && typeof clientRecord.customer_receipt_allocations?.createMany === 'function'
    && typeof clientRecord.customer_receipt_status_logs?.createMany === 'function'
    && typeof clientRecord.receipt_voucher_status_logs?.createMany === 'function'
    && typeof clientRecord.stock_holds?.findMany === 'function'
    && typeof clientRecord.stock_issue_status_logs?.createMany === 'function'
    && typeof clientRecord.system_settings?.findMany === 'function'
    && typeof clientRecord.line_groups?.findMany === 'function'
    && hasAccountSubtypeField
    && hasAppUserProfileFields
    && hasCompanyProfileBranchIdField
    && hasCustomerAdvanceVatFields
    && hasPaymentMethodTypeField
    && hasSalesBillExportOrderField
}

function createPrismaClient() {
  const connectionString = resolveRuntimeDatabaseUrl()
  const poolMax = Math.max(1, Number(process.env.DATABASE_POOL_MAX ?? '5') || 5)

  if (globalForPrisma.pgPoolConnectionString !== connectionString) {
    void globalForPrisma.pgPool?.end().catch(() => {})
    globalForPrisma.pgPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      max: poolMax,
    })
    globalForPrisma.pgPoolConnectionString = connectionString
  }

  const pool = globalForPrisma.pgPool
  if (!pool) {
    throw new Error('Failed to initialize database connection pool.')
  }

  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

function getPrismaClient() {
  const connectionString = resolveRuntimeDatabaseUrl()
  if (globalForPrisma.prisma && (
    globalForPrisma.pgPoolConnectionString !== connectionString
    || !hasExpectedDelegates(globalForPrisma.prisma)
  )) {
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
