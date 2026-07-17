import type { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'

type BranchReferenceDbRow = {
  address: string | null
  code: string
  id: bigint
  name: string
  phone: string | null
}

type CurrencyReferenceDbRow = {
  code: string
  id: bigint
  name: string
  rate_to_thb: { toString: () => string } | number | null
  symbol: string | null
  updated_at: Date | null
}

type CustomerReferenceDbRow = {
  code: string
  credit_limit: { toString: () => string } | number | null
  credit_term: number | null
  id: bigint
  market_scope: string | null
  name: string
}

type CustomerBranchMappingDbRow = {
  branches: { code: string } | null
}

type CustomerBranchOptionDbRow = {
  code: string
  customer_branches: CustomerBranchMappingDbRow[]
  id: bigint
  market_scope: string | null
  name: string
}

type ExpenseTypeDbRow = {
  active: boolean | null
  code: string
  created_at: Date | null
  id: bigint
  name: string
  updated_at: Date | null
}

type ProductTypeDbRow = {
  active: boolean | null
  code: string
  created_at: Date | null
  id: bigint
  name: string
  updated_at: Date | null
}

type ProductUnitDbRow = {
  active: boolean | null
  code: string
  created_at: Date | null
  id: bigint
  name: string
  symbol: string | null
  updated_at: Date | null
}

type ProductReferenceDbRow = {
  active: boolean | null
  code: string
  id: bigint
  metal_group: string | null
  name: string
  type: string | null
  unit: string | null
}

type ProductThumbnailReferenceDbRow = {
  code: string
  image_thumbnail_storage_key: string | null
}

type MachineTypeDbRow = {
  active: boolean | null
  created_at: Date | null
  id: bigint
  name: string
  updated_at: Date | null
}

type SupplierReferenceDbRow = {
  address: string | null
  code: string
  id: bigint
  name: string
  phone: string | null
  sales_id: bigint | null
  sales_rep: string | null
  tax_id: string | null
}

type SupplierSummaryDbRow = {
  code: string
  id: bigint
  name: string
}

type SupplierPaymentBankAccountDbRow = {
  account_name: string | null
  account_no: string | null
  active: boolean | null
  bank_names: { name: string } | null
  branch_code: string | null
  code: string
  is_primary: boolean | null
  payment_method: string | null
}

type SupplierPaymentOptionDbRow = {
  active: boolean | null
  code: string
  id: bigint
  name: string
  supplier_bank_accounts: SupplierPaymentBankAccountDbRow[]
}

type SupplierBranchMappingDbRow = {
  branches: { code: string } | null
}

type SupplierBranchOptionDbRow = {
  code: string
  id: bigint
  name: string
  supplier_branches: SupplierBranchMappingDbRow[]
}

type BankNameDbRow = {
  active: boolean | null
  code: string
  id: bigint
  name: string
  symbol: string | null
}

type AccountReferenceDbRow = {
  active: boolean | null
  account_no: string | null
  bank: string | null
  bank_name: string | null
  branches: { code: string; id: bigint; name: string } | null
  code: string
  currency: string | null
  id: bigint
  name: string
  od_limit: { toString: () => string } | number | null
  opening_balance: { toString: () => string } | number | null
  subtype: string | null
  type: string
}

type OverseasRecipientDbRow = {
  account_no: string | null
  active: boolean | null
  bank_name: string | null
  code: string
  country: string | null
  currency: string | null
  id: bigint
  name: string
  swift: string | null
}

type OverseasRemittancePurposeDbRow = {
  active: boolean | null
  code: string
  id: bigint
  name: string
}

type WarehouseDbRow = {
  branches: { code: string } | null
  code: string
  id: bigint
  name: string
  type: string | null
}

type PaymentMethodDbRow = {
  active: boolean | null
  code: string
  id: bigint
  name: string
  type: string
}

type CachedBranchRecord = {
  active: boolean
  address: string | null
  code: string
  createdAt: string | null
  id: string
  name: string
  phone: string | null
  updatedAt: string | null
}

type CachedCurrencyRecord = {
  code: string
  id: string
  name: string
  rateToThb: string | null
  symbol: string | null
  updatedAt: string | null
}

type CachedCustomerRecord = {
  code: string
  creditLimit: string | null
  creditTerm: number | null
  id: string
  marketScope: string | null
  name: string
}

type CachedCustomerBranchOptionRecord = {
  branchIds: string[]
  code: string
  id: string
  marketScope: string | null
  name: string
}

type CachedExpenseTypeRecord = {
  active: boolean
  code: string
  createdAt: string | null
  id: string
  name: string
  updatedAt: string | null
}

type CachedProductTypeRecord = {
  active: boolean
  code: string
  createdAt: string | null
  id: string
  name: string
  updatedAt: string | null
}

type CachedProductUnitRecord = {
  active: boolean
  code: string
  createdAt: string | null
  id: string
  name: string
  symbol: string | null
  updatedAt: string | null
}

type CachedProductReferenceRecord = {
  active: boolean
  code: string
  id: string
  metalGroup: string | null
  name: string
  type: string | null
  unit: string | null
}

type CachedProductThumbnailReferenceRecord = {
  code: string
  thumbnailStorageKey: string | null
}

type CachedMachineTypeRecord = {
  active: boolean
  createdAt: string | null
  id: string
  name: string
  updatedAt: string | null
}

type CachedBankNameRecord = {
  active: boolean
  code: string
  id: string
  name: string
  symbol: string | null
}

type CachedAccountReferenceRecord = {
  active: boolean
  accountNo: string | null
  bank: string | null
  bankName: string | null
  branchCode: string | null
  branchId: string | null
  branchName: string | null
  code: string
  currency: string | null
  id: string
  name: string
  odLimit: string | null
  openingBalance: string | null
  subtype: string | null
  type: string
}

type CachedOverseasRecipientReferenceRecord = {
  accountNo: string | null
  active: boolean
  bankName: string | null
  code: string
  country: string | null
  currency: string | null
  id: string
  name: string
  swift: string | null
}

type CachedOverseasRemittancePurposeReferenceRecord = {
  active: boolean
  code: string
  id: string
  name: string
}

type CachedWarehouseRecord = {
  active: boolean
  branchCode: string | null
  branchName: string | null
  code: string
  createdAt: string | null
  id: string
  name: string
  type: string | null
  updatedAt: string | null
}

type CachedPaymentMethodRecord = {
  active: boolean
  code: string
  id: string
  name: string
  type: string
}

type CachedSupplierRecord = {
  address: string | null
  code: string
  id: string
  name: string
  phone: string | null
  salesId: string | null
  salesRep: string | null
  taxId: string | null
}

type CachedSupplierBranchOptionRecord = {
  branchIds: string[]
  code: string
  id: string
  name: string
}

type CachedSupplierSummaryRecord = {
  code: string
  id: string
  name: string
}

type CachedSupplierPaymentBankAccountRecord = {
  accountName: string | null
  accountNo: string | null
  active: boolean
  bankName: string | null
  branchCode: string | null
  code: string
  paymentMethod: string | null
}

type CachedSupplierPaymentOptionRecord = {
  active: boolean
  bankAccount: string | null
  bankAccounts: CachedSupplierPaymentBankAccountRecord[]
  code: string
  id: string
  name: string
}

type ReferenceCacheReadTier = 'database' | 'redis' | 'server'
type RedisReadResult<T> =
  | { state: 'disabled' | 'error' | 'invalid' | 'miss' }
  | { state: 'hit'; value: T }

export type BranchReferenceRecord = {
  address: string | null
  code: string
  id: bigint
  name: string
  phone: string | null
}

export type BranchMasterRecord = {
  active: boolean
  address: string | null
  code: string
  createdAt: string | null
  id: bigint
  name: string
  phone: string | null
  updatedAt: string | null
}

export type CurrencyReferenceRecord = {
  code: string
  id: bigint
  name: string
  rateToThb: string | null
  symbol: string | null
  updatedAt: string | null
}

export type CustomerReferenceRecord = {
  code: string
  creditLimit: string | null
  creditTerm: number | null
  id: bigint
  marketScope: string | null
  name: string
}

export type CustomerBranchOptionRecord = {
  branchIds: string[]
  code: string
  id: bigint
  marketScope: string | null
  name: string
}

export type ExpenseTypeReferenceRecord = {
  active: boolean
  code: string
  createdAt: string | null
  id: bigint
  name: string
  updatedAt: string | null
}

export type ProductTypeReferenceRecord = {
  active: boolean
  code: string
  createdAt: string | null
  id: bigint
  name: string
  updatedAt: string | null
}

export type ProductUnitReferenceRecord = {
  active: boolean
  code: string
  createdAt: string | null
  id: bigint
  name: string
  symbol: string | null
  updatedAt: string | null
}

export type ProductReferenceRecord = {
  active: boolean
  code: string
  id: bigint
  metalGroup: string | null
  name: string
  type: string | null
  unit: string | null
}

export type ProductThumbnailReferenceRecord = {
  code: string
  thumbnailStorageKey: string | null
}

export type MachineTypeReferenceRecord = {
  active: boolean
  createdAt: string | null
  id: bigint
  name: string
  updatedAt: string | null
}

export type SupplierReferenceRecord = {
  address: string | null
  code: string
  id: bigint
  name: string
  phone: string | null
  salesId: bigint | null
  salesRep: string | null
  taxId: string | null
}

export type SupplierBranchOptionRecord = {
  branchIds: string[]
  code: string
  id: bigint
  name: string
}

export type SupplierSummaryReferenceRecord = {
  code: string
  id: bigint
  name: string
}

export type SupplierPaymentBankAccountReferenceRecord = {
  accountName: string | null
  accountNo: string | null
  active: boolean
  bankName: string | null
  branchCode: string | null
  code: string
  paymentMethod: string | null
}

export type SupplierPaymentOptionReferenceRecord = {
  active: boolean
  bankAccount: string | null
  bankAccounts: SupplierPaymentBankAccountReferenceRecord[]
  code: string
  id: bigint
  name: string
}

export type BankNameReferenceRecord = {
  active: boolean
  code: string
  id: bigint
  name: string
  symbol: string | null
}

export type AccountReferenceRecord = {
  active: boolean
  accountNo: string | null
  bank: string | null
  bankName: string | null
  branchCode: string | null
  branchId: bigint | null
  branchName: string | null
  code: string
  currency: string | null
  id: bigint
  name: string
  odLimit: string | null
  openingBalance: string | null
  subtype: string | null
  type: string
}

export type OverseasRecipientReferenceRecord = {
  accountNo: string | null
  active: boolean
  bankName: string | null
  code: string
  country: string | null
  currency: string | null
  id: bigint
  name: string
  swift: string | null
}

export type OverseasRemittancePurposeReferenceRecord = {
  active: boolean
  code: string
  id: bigint
  name: string
}

export type WarehouseReferenceRecord = {
  branchCode: string | null
  code: string
  id: bigint
  name: string
  type: string | null
}

export type WarehouseMasterRecord = {
  active: boolean
  branchCode: string | null
  branchName: string | null
  code: string
  createdAt: string | null
  id: bigint
  name: string
  type: string | null
  updatedAt: string | null
}

export type PaymentMethodReferenceRecord = {
  active: boolean
  code: string
  id: bigint
  name: string
  type: string
}

const SERVER_CACHE_TTL_MS = 15_000
const REDIS_CACHE_TTL_SECONDS = 300
const REDIS_SEARCH_CACHE_TTL_SECONDS = 120
const KEY_ACCOUNTS_ACTIVE = 'reference:accounts:active'
const KEY_ACCOUNTS_ALL = 'reference:accounts:all'
const KEY_BANK_NAMES_ACTIVE = 'reference:bank-names:active'
const KEY_BRANCHES_ACTIVE = 'reference:branches:active'
const KEY_BRANCHES_MASTER_LIST = 'reference:branches:master-list'
const KEY_CURRENCIES_ALL = 'reference:currencies:all'
const KEY_CUSTOMERS_ACTIVE = 'reference:customers:active'
const KEY_CUSTOMERS_ACTIVE_BRANCH_OPTIONS = 'reference:customers:active:branch-options'
const KEY_CUSTOMERS_SEARCH_PREFIX = 'reference:customers:search:'
const KEY_EXPENSE_TYPES_ALL = 'reference:expense-types:all'
const KEY_MACHINE_TYPES_ALL = 'reference:machine-types:all'
const KEY_OVERSEAS_RECIPIENTS_ACTIVE = 'reference:overseas-recipients:active'
const KEY_OVERSEAS_REMITTANCE_PURPOSES_ACTIVE = 'reference:overseas-remittance-purposes:active'
const KEY_PAYMENT_METHODS_ACTIVE = 'reference:payment-methods:active'
const KEY_PRODUCT_TYPES_ALL = 'reference:product-types:all'
const KEY_PRODUCT_UNITS_ALL = 'reference:product-units:all'
const KEY_PRODUCTS_ACTIVE = 'reference:products:active'
const KEY_PRODUCTS_SEARCH_PREFIX = 'reference:products:search:'
const KEY_PRODUCTS_THUMBNAILS_ACTIVE = 'reference:products:thumbnails:active'
const KEY_SUPPLIERS_ACTIVE = 'reference:suppliers:active'
const KEY_SUPPLIERS_ACTIVE_BRANCH_OPTIONS = 'reference:suppliers:active:branch-options'
const KEY_SUPPLIERS_ACTIVE_PAYMENT_OPTIONS = 'reference:suppliers:active:payment-options'
const KEY_SUPPLIERS_BY_ID_PREFIX = 'reference:suppliers:by-id:'
const KEY_SUPPLIERS_SEARCH_PREFIX = 'reference:suppliers:search:'
const KEY_WAREHOUSES_ACTIVE = 'reference:warehouses:active'
const KEY_WAREHOUSES_MASTER_LIST = 'reference:warehouses:master-list'
const KEY_WAREHOUSES_ACTIVE_BRANCH_PREFIX = 'reference:warehouses:active:branch:'

const serverCache = new Map<string, { expiresAt: number; value: unknown }>()
type RedisPipelineResult = Array<{ error?: string; result?: unknown }>

function getServerCache<T>(key: string) {
  const entry = serverCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    serverCache.delete(key)
    return null
  }
  return entry.value as T
}

function setServerCache(key: string, value: unknown, ttlMs = SERVER_CACHE_TTL_MS) {
  serverCache.set(key, { expiresAt: Date.now() + ttlMs, value })
}

function deleteServerCache(key: string) {
  serverCache.delete(key)
}

function deleteServerCacheByPrefix(prefix: string) {
  for (const key of serverCache.keys()) {
    if (key.startsWith(prefix)) serverCache.delete(key)
  }
}

function normalizeBranchCode(value: string) {
  return value.trim().toUpperCase()
}

function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function searchableText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? null
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? null
  if (!url || !token) return null
  return { token, url: url.replace(/\/+$/, '') }
}

function referenceCacheObservabilityEnabled() {
  if (process.env.REFERENCE_CACHE_OBSERVABILITY_ENABLED === 'false') return false
  return process.env.NODE_ENV === 'production' || process.env.REFERENCE_CACHE_OBSERVABILITY_ENABLED === 'true'
}

function referenceCacheKeyFamily(key: string) {
  const parts = key.split(':')
  const dynamicBoundary = parts.findIndex((part) => part === 'branch' || part === 'by-id' || part === 'search')
  if (dynamicBoundary >= 0) return `${parts.slice(0, dynamicBoundary + 1).join(':')}:*`
  return key
}

function recordReferenceCacheRead({ outcome, tier, key }: { key: string; outcome: 'hit' | 'miss'; tier: ReferenceCacheReadTier }) {
  if (!referenceCacheObservabilityEnabled()) return
  console.info(JSON.stringify({
    event: 'reference_cache_read',
    keyFamily: referenceCacheKeyFamily(key),
    outcome,
    tier,
  }))
}

function recordReferenceCacheError({ key, stage }: { key: string; stage: 'redis_read' | 'redis_write' }) {
  if (!referenceCacheObservabilityEnabled()) return
  console.warn(JSON.stringify({
    event: 'reference_cache_error',
    keyFamily: referenceCacheKeyFamily(key),
    stage,
  }))
}

async function runRedisPipeline(commands: string[][]) {
  const config = redisConfig()
  if (!config || commands.length === 0) return null

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const payload = await response.json()
    return Array.isArray(payload) ? (payload as RedisPipelineResult) : null
  } catch {
    return null
  }
}

async function redisGetJson<T>(key: string): Promise<RedisReadResult<T>> {
  if (!redisConfig()) return { state: 'disabled' }
  const result = await runRedisPipeline([['GET', key]])
  if (!result) return { state: 'error' }
  const value = result?.[0]?.result
  if (typeof value !== 'string') return { state: 'miss' }
  try {
    return { state: 'hit', value: JSON.parse(value) as T }
  } catch {
    return { state: 'invalid' }
  }
}

async function redisSetJson(key: string, value: unknown, ttlSeconds = REDIS_CACHE_TTL_SECONDS) {
  const result = await runRedisPipeline([['SET', key, JSON.stringify(value), 'EX', String(ttlSeconds)]])
  if (!result && redisConfig()) recordReferenceCacheError({ key, stage: 'redis_write' })
}

async function redisDeleteKeys(keys: string[]) {
  const normalizedKeys = [...new Set(keys.filter(Boolean))]
  if (!normalizedKeys.length) return
  await runRedisPipeline(normalizedKeys.map((key) => ['DEL', key]))
}

async function redisDeleteByPrefixes(prefixes: string[]) {
  const normalizedPrefixes = [...new Set(prefixes.filter(Boolean))]
  if (!normalizedPrefixes.length) return

  const scanResponses = await runRedisPipeline(normalizedPrefixes.map((prefix) => ['KEYS', `${prefix}*`]))
  const keys = scanResponses
    ?.flatMap((entry) => (Array.isArray(entry?.result) ? entry.result : []))
    .filter((value): value is string => typeof value === 'string')

  if (keys?.length) await redisDeleteKeys(keys)
}

function hydrateBranchRecord(row: CachedBranchRecord): BranchReferenceRecord {
  return {
    address: row.address ?? null,
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
    phone: row.phone ?? null,
  }
}

function hydrateBranchMasterRecord(row: CachedBranchRecord): BranchMasterRecord {
  return {
    active: row.active,
    address: row.address ?? null,
    code: row.code,
    createdAt: row.createdAt,
    id: BigInt(row.id),
    name: row.name,
    phone: row.phone ?? null,
    updatedAt: row.updatedAt,
  }
}

function hydrateCurrencyRecord(row: CachedCurrencyRecord): CurrencyReferenceRecord {
  return {
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
    rateToThb: row.rateToThb ?? null,
    symbol: row.symbol ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function hydrateCustomerRecord(row: CachedCustomerRecord): CustomerReferenceRecord {
  return {
    code: row.code,
    creditLimit: row.creditLimit ?? null,
    creditTerm: row.creditTerm ?? null,
    id: BigInt(row.id),
    marketScope: row.marketScope ?? null,
    name: row.name,
  }
}

function hydrateCustomerBranchOptionRecord(row: CachedCustomerBranchOptionRecord): CustomerBranchOptionRecord {
  return {
    branchIds: row.branchIds,
    code: row.code,
    id: BigInt(row.id),
    marketScope: row.marketScope ?? null,
    name: row.name,
  }
}

function hydrateExpenseTypeRecord(row: CachedExpenseTypeRecord): ExpenseTypeReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    createdAt: row.createdAt ?? null,
    id: BigInt(row.id),
    name: row.name,
    updatedAt: row.updatedAt ?? null,
  }
}

function hydrateSupplierRecord(row: CachedSupplierRecord): SupplierReferenceRecord {
  return {
    address: row.address ?? null,
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
    phone: row.phone ?? null,
    salesId: row.salesId ? BigInt(row.salesId) : null,
    salesRep: row.salesRep ?? null,
    taxId: row.taxId ?? null,
  }
}

function hydrateSupplierBranchOptionRecord(row: CachedSupplierBranchOptionRecord): SupplierBranchOptionRecord {
  return {
    branchIds: row.branchIds,
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
  }
}

function hydrateSupplierSummaryRecord(row: CachedSupplierSummaryRecord): SupplierSummaryReferenceRecord {
  return {
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
  }
}

function hydrateSupplierPaymentOptionRecord(row: CachedSupplierPaymentOptionRecord): SupplierPaymentOptionReferenceRecord {
  return {
    active: row.active,
    bankAccount: row.bankAccount ?? null,
    bankAccounts: row.bankAccounts.map((account) => ({
      accountName: account.accountName ?? null,
      accountNo: account.accountNo ?? null,
      active: account.active,
      bankName: account.bankName ?? null,
      branchCode: account.branchCode ?? null,
      code: account.code,
      paymentMethod: account.paymentMethod ?? null,
    })),
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
  }
}

function hydrateProductTypeRecord(row: CachedProductTypeRecord): ProductTypeReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    createdAt: row.createdAt ?? null,
    id: BigInt(row.id),
    name: row.name,
    updatedAt: row.updatedAt ?? null,
  }
}

function hydrateProductUnitRecord(row: CachedProductUnitRecord): ProductUnitReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    createdAt: row.createdAt ?? null,
    id: BigInt(row.id),
    name: row.name,
    symbol: row.symbol ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function hydrateProductReferenceRecord(row: CachedProductReferenceRecord): ProductReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    id: BigInt(row.id),
    metalGroup: row.metalGroup ?? null,
    name: row.name,
    type: row.type ?? null,
    unit: row.unit ?? null,
  }
}

function hydrateProductThumbnailReferenceRecord(row: CachedProductThumbnailReferenceRecord): ProductThumbnailReferenceRecord {
  return {
    code: row.code,
    thumbnailStorageKey: row.thumbnailStorageKey ?? null,
  }
}

function hydrateMachineTypeRecord(row: CachedMachineTypeRecord): MachineTypeReferenceRecord {
  return {
    active: row.active,
    createdAt: row.createdAt ?? null,
    id: BigInt(row.id),
    name: row.name,
    updatedAt: row.updatedAt ?? null,
  }
}

function hydrateBankNameRecord(row: CachedBankNameRecord): BankNameReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
    symbol: row.symbol ?? null,
  }
}

function hydrateAccountReferenceRecord(row: CachedAccountReferenceRecord): AccountReferenceRecord {
  return {
    active: row.active,
    accountNo: row.accountNo ?? null,
    bank: row.bank ?? null,
    bankName: row.bankName ?? null,
    branchCode: row.branchCode ?? null,
    branchId: row.branchId ? BigInt(row.branchId) : null,
    branchName: row.branchName ?? null,
    code: row.code,
    currency: row.currency ?? null,
    id: BigInt(row.id),
    name: row.name,
    odLimit: row.odLimit ?? null,
    openingBalance: row.openingBalance ?? null,
    subtype: row.subtype ?? null,
    type: row.type,
  }
}

function hydrateOverseasRecipientReferenceRecord(row: CachedOverseasRecipientReferenceRecord): OverseasRecipientReferenceRecord {
  return {
    accountNo: row.accountNo ?? null,
    active: row.active,
    bankName: row.bankName ?? null,
    code: row.code,
    country: row.country ?? null,
    currency: row.currency ?? null,
    id: BigInt(row.id),
    name: row.name,
    swift: row.swift ?? null,
  }
}

function hydrateOverseasRemittancePurposeReferenceRecord(
  row: CachedOverseasRemittancePurposeReferenceRecord,
): OverseasRemittancePurposeReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
  }
}

function dehydrateBranchRecord(row: BranchReferenceRecord): CachedBranchRecord {
  return {
    active: true,
    address: row.address ?? null,
    code: row.code,
    createdAt: null,
    id: row.id.toString(),
    name: row.name,
    phone: row.phone ?? null,
    updatedAt: null,
  }
}

function dehydrateBranchMasterRecord(row: BranchMasterRecord): CachedBranchRecord {
  return {
    active: row.active,
    address: row.address ?? null,
    code: row.code,
    createdAt: row.createdAt,
    id: row.id.toString(),
    name: row.name,
    phone: row.phone ?? null,
    updatedAt: row.updatedAt,
  }
}

function dehydrateCurrencyRecord(row: CurrencyReferenceRecord): CachedCurrencyRecord {
  return {
    code: row.code,
    id: row.id.toString(),
    name: row.name,
    rateToThb: row.rateToThb ?? null,
    symbol: row.symbol ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function dehydrateCustomerRecord(row: CustomerReferenceRecord): CachedCustomerRecord {
  return {
    code: row.code,
    creditLimit: row.creditLimit ?? null,
    creditTerm: row.creditTerm ?? null,
    id: row.id.toString(),
    marketScope: row.marketScope ?? null,
    name: row.name,
  }
}

function dehydrateCustomerBranchOptionRecord(row: CustomerBranchOptionRecord): CachedCustomerBranchOptionRecord {
  return {
    branchIds: row.branchIds,
    code: row.code,
    id: row.id.toString(),
    marketScope: row.marketScope ?? null,
    name: row.name,
  }
}

function dehydrateExpenseTypeRecord(row: ExpenseTypeReferenceRecord): CachedExpenseTypeRecord {
  return {
    active: row.active,
    code: row.code,
    createdAt: row.createdAt ?? null,
    id: row.id.toString(),
    name: row.name,
    updatedAt: row.updatedAt ?? null,
  }
}

function dehydrateSupplierRecord(row: SupplierReferenceRecord): CachedSupplierRecord {
  return {
    address: row.address ?? null,
    code: row.code,
    id: row.id.toString(),
    name: row.name,
    phone: row.phone ?? null,
    salesId: row.salesId?.toString() ?? null,
    salesRep: row.salesRep ?? null,
    taxId: row.taxId ?? null,
  }
}

function dehydrateSupplierBranchOptionRecord(row: SupplierBranchOptionRecord): CachedSupplierBranchOptionRecord {
  return {
    branchIds: row.branchIds,
    code: row.code,
    id: row.id.toString(),
    name: row.name,
  }
}

function dehydrateSupplierSummaryRecord(row: SupplierSummaryReferenceRecord): CachedSupplierSummaryRecord {
  return {
    code: row.code,
    id: row.id.toString(),
    name: row.name,
  }
}

function dehydrateSupplierPaymentOptionRecord(row: SupplierPaymentOptionReferenceRecord): CachedSupplierPaymentOptionRecord {
  return {
    active: row.active,
    bankAccount: row.bankAccount ?? null,
    bankAccounts: row.bankAccounts.map((account) => ({
      accountName: account.accountName ?? null,
      accountNo: account.accountNo ?? null,
      active: account.active,
      bankName: account.bankName ?? null,
      branchCode: account.branchCode ?? null,
      code: account.code,
      paymentMethod: account.paymentMethod ?? null,
    })),
    code: row.code,
    id: row.id.toString(),
    name: row.name,
  }
}

function dehydrateProductTypeRecord(row: ProductTypeReferenceRecord): CachedProductTypeRecord {
  return {
    active: row.active,
    code: row.code,
    createdAt: row.createdAt ?? null,
    id: row.id.toString(),
    name: row.name,
    updatedAt: row.updatedAt ?? null,
  }
}

function dehydrateProductUnitRecord(row: ProductUnitReferenceRecord): CachedProductUnitRecord {
  return {
    active: row.active,
    code: row.code,
    createdAt: row.createdAt ?? null,
    id: row.id.toString(),
    name: row.name,
    symbol: row.symbol ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function dehydrateProductReferenceRecord(row: ProductReferenceRecord): CachedProductReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    id: row.id.toString(),
    metalGroup: row.metalGroup ?? null,
    name: row.name,
    type: row.type ?? null,
    unit: row.unit ?? null,
  }
}

function dehydrateProductThumbnailReferenceRecord(row: ProductThumbnailReferenceRecord): CachedProductThumbnailReferenceRecord {
  return {
    code: row.code,
    thumbnailStorageKey: row.thumbnailStorageKey ?? null,
  }
}

function dehydrateMachineTypeRecord(row: MachineTypeReferenceRecord): CachedMachineTypeRecord {
  return {
    active: row.active,
    createdAt: row.createdAt ?? null,
    id: row.id.toString(),
    name: row.name,
    updatedAt: row.updatedAt ?? null,
  }
}

function dehydrateBankNameRecord(row: BankNameReferenceRecord): CachedBankNameRecord {
  return {
    active: row.active,
    code: row.code,
    id: row.id.toString(),
    name: row.name,
    symbol: row.symbol ?? null,
  }
}

function dehydrateAccountReferenceRecord(row: AccountReferenceRecord): CachedAccountReferenceRecord {
  return {
    active: row.active,
    accountNo: row.accountNo ?? null,
    bank: row.bank ?? null,
    bankName: row.bankName ?? null,
    branchCode: row.branchCode ?? null,
    branchId: row.branchId?.toString() ?? null,
    branchName: row.branchName ?? null,
    code: row.code,
    currency: row.currency ?? null,
    id: row.id.toString(),
    name: row.name,
    odLimit: row.odLimit ?? null,
    openingBalance: row.openingBalance ?? null,
    subtype: row.subtype ?? null,
    type: row.type,
  }
}

function dehydrateOverseasRecipientReferenceRecord(
  row: OverseasRecipientReferenceRecord,
): CachedOverseasRecipientReferenceRecord {
  return {
    accountNo: row.accountNo ?? null,
    active: row.active,
    bankName: row.bankName ?? null,
    code: row.code,
    country: row.country ?? null,
    currency: row.currency ?? null,
    id: row.id.toString(),
    name: row.name,
    swift: row.swift ?? null,
  }
}

function dehydrateOverseasRemittancePurposeReferenceRecord(
  row: OverseasRemittancePurposeReferenceRecord,
): CachedOverseasRemittancePurposeReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    id: row.id.toString(),
    name: row.name,
  }
}

function hydrateWarehouseRecord(row: CachedWarehouseRecord): WarehouseReferenceRecord {
  return {
    branchCode: row.branchCode ?? null,
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
    type: row.type ?? null,
  }
}

function hydrateWarehouseMasterRecord(row: CachedWarehouseRecord): WarehouseMasterRecord {
  return {
    active: row.active,
    branchCode: row.branchCode ?? null,
    branchName: row.branchName ?? null,
    code: row.code,
    createdAt: row.createdAt,
    id: BigInt(row.id),
    name: row.name,
    type: row.type ?? null,
    updatedAt: row.updatedAt,
  }
}

function dehydrateWarehouseRecord(row: WarehouseReferenceRecord): CachedWarehouseRecord {
  return {
    active: true,
    branchCode: row.branchCode ?? null,
    branchName: null,
    code: row.code,
    createdAt: null,
    id: row.id.toString(),
    name: row.name,
    type: row.type ?? null,
    updatedAt: null,
  }
}

function dehydrateWarehouseMasterRecord(row: WarehouseMasterRecord): CachedWarehouseRecord {
  return {
    active: row.active,
    branchCode: row.branchCode ?? null,
    branchName: row.branchName ?? null,
    code: row.code,
    createdAt: row.createdAt,
    id: row.id.toString(),
    name: row.name,
    type: row.type ?? null,
    updatedAt: row.updatedAt,
  }
}

function hydratePaymentMethodRecord(row: CachedPaymentMethodRecord): PaymentMethodReferenceRecord {
  return {
    active: row.active,
    code: row.code,
    id: BigInt(row.id),
    name: row.name,
    type: row.type,
  }
}

function dehydratePaymentMethodRecord(row: PaymentMethodReferenceRecord): CachedPaymentMethodRecord {
  return {
    active: row.active,
    code: row.code,
    id: row.id.toString(),
    name: row.name,
    type: row.type,
  }
}

async function readThroughCache<T>({
  dbReader,
  fromCache,
  key,
  toCache,
  ttlSeconds,
}: {
  key: string
  fromCache: (value: unknown) => T
  toCache: (value: T) => unknown
  dbReader: () => Promise<T>
  ttlSeconds?: number
}) {
  const serverValue = getServerCache<T>(key)
  if (serverValue) {
    recordReferenceCacheRead({ key, outcome: 'hit', tier: 'server' })
    return serverValue
  }

  const redisValue = await redisGetJson<unknown>(key)
  if (redisValue.state === 'hit') {
    const hydrated = fromCache(redisValue.value)
    setServerCache(key, hydrated)
    recordReferenceCacheRead({ key, outcome: 'hit', tier: 'redis' })
    return hydrated
  }

  if (redisValue.state === 'error' || redisValue.state === 'invalid') {
    recordReferenceCacheError({ key, stage: 'redis_read' })
  }

  const dbValue = await dbReader()
  setServerCache(key, dbValue)
  await redisSetJson(key, toCache(dbValue), ttlSeconds)
  recordReferenceCacheRead({ key, outcome: 'miss', tier: 'database' })
  return dbValue
}

export async function listActiveBranches() {
  return readThroughCache<BranchReferenceRecord[]>({
    key: KEY_BRANCHES_ACTIVE,
    fromCache: (value) => (value as CachedBranchRecord[]).map(hydrateBranchRecord),
    toCache: (value) => value.map(dehydrateBranchRecord),
    dbReader: async () => {
      const rows: BranchReferenceDbRow[] = await prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { address: true, code: true, id: true, name: true, phone: true },
        where: { active: true },
      })
      return rows.map((row: (typeof rows)[number]) => ({
        address: row.address ?? null,
        code: row.code,
        id: row.id,
        name: row.name,
        phone: row.phone ?? null,
      }))
    },
  })
}

export async function listBranchMasterRecords() {
  return readThroughCache<BranchMasterRecord[]>({
    key: KEY_BRANCHES_MASTER_LIST,
    fromCache: (value) => (value as CachedBranchRecord[]).map(hydrateBranchMasterRecord),
    toCache: (value) => value.map(dehydrateBranchMasterRecord),
    dbReader: async () => {
      const rows = await prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, address: true, code: true, created_at: true, id: true, name: true, phone: true, updated_at: true },
      })
      return rows.map((row: (typeof rows)[number]) => ({
        active: row.active === true,
        address: row.address ?? null,
        code: row.code,
        createdAt: row.created_at?.toISOString() ?? null,
        id: row.id,
        name: row.name,
        phone: row.phone ?? null,
        updatedAt: row.updated_at?.toISOString() ?? null,
      }))
    },
  })
}

export async function listActiveBranchesByCodes(codes: string[]) {
  const normalizedCodes = [...new Set(codes.map(normalizeBranchCode).filter(Boolean))]
  if (!normalizedCodes.length) return []
  const rows = await listActiveBranches()
  return rows.filter((row) => normalizedCodes.includes(row.code))
}

export async function listCurrencies() {
  return readThroughCache<CurrencyReferenceRecord[]>({
    key: KEY_CURRENCIES_ALL,
    fromCache: (value) => (value as CachedCurrencyRecord[]).map(hydrateCurrencyRecord),
    toCache: (value) => value.map(dehydrateCurrencyRecord),
    dbReader: async () => {
      const rows: CurrencyReferenceDbRow[] = await prisma.currencies.findMany({
        orderBy: [{ code: 'asc' }, { symbol: 'asc' }, { name: 'asc' }],
        select: { code: true, id: true, name: true, rate_to_thb: true, symbol: true, updated_at: true },
      })
      return rows.map((row: (typeof rows)[number]) => ({
        code: row.code,
        id: row.id,
        name: row.name,
        rateToThb: row.rate_to_thb?.toString() ?? null,
        symbol: row.symbol ?? null,
        updatedAt: row.updated_at?.toISOString() ?? null,
      }))
    },
  })
}

export async function listActiveCustomers() {
  return readThroughCache<CustomerReferenceRecord[]>({
    key: KEY_CUSTOMERS_ACTIVE,
    fromCache: (value) => (value as CachedCustomerRecord[]).map(hydrateCustomerRecord),
    toCache: (value) => value.map(dehydrateCustomerRecord),
    dbReader: async () => {
      const rows: CustomerReferenceDbRow[] = await prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { code: true, credit_limit: true, credit_term: true, id: true, market_scope: true, name: true },
        where: { active: true },
      })
      return rows.map((row: (typeof rows)[number]) => ({
        code: requireBusinessCode(row.code, `ลูกค้า ${row.id}`),
        creditLimit: row.credit_limit?.toString() ?? null,
        creditTerm: row.credit_term ?? null,
        id: row.id,
        marketScope: row.market_scope ?? null,
        name: row.name,
      }))
    },
  })
}

export async function listActiveCustomerBranchOptions() {
  return readThroughCache<CustomerBranchOptionRecord[]>({
    key: KEY_CUSTOMERS_ACTIVE_BRANCH_OPTIONS,
    fromCache: (value) => (value as CachedCustomerBranchOptionRecord[]).map(hydrateCustomerBranchOptionRecord),
    toCache: (value) => value.map(dehydrateCustomerBranchOptionRecord),
    dbReader: async () => {
      const rows: CustomerBranchOptionDbRow[] = await prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          code: true,
          customer_branches: {
            select: {
              branches: { select: { code: true } },
            },
            where: { active: true },
          },
          id: true,
          market_scope: true,
          name: true,
        },
        where: { active: true },
      })
      return rows.map((row) => ({
        branchIds: row.customer_branches
          .map((mapping: CustomerBranchMappingDbRow) => mapping.branches?.code)
          .filter((branchCode): branchCode is string => Boolean(branchCode)),
        code: requireBusinessCode(row.code, `ลูกค้า ${row.id}`),
        id: row.id,
        marketScope: row.market_scope ?? null,
        name: row.name,
      }))
    },
  })
}

export async function listActiveCustomerBranchOptionsByBranchCodes(codes: string[]) {
  const normalizedCodes = [...new Set(codes.map(normalizeBranchCode).filter(Boolean))]
  const rows = await listActiveCustomerBranchOptions()
  if (!normalizedCodes.length) return rows
  return rows.filter((row) => row.branchIds.some((branchCode) => normalizedCodes.includes(normalizeBranchCode(branchCode))))
}

export async function searchActiveCustomers(query: string) {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return listActiveCustomers()
  return readThroughCache<CustomerReferenceRecord[]>({
    key: `${KEY_CUSTOMERS_SEARCH_PREFIX}${normalizedQuery}`,
    fromCache: (value) => (value as CachedCustomerRecord[]).map(hydrateCustomerRecord),
    toCache: (value) => value.map(dehydrateCustomerRecord),
    ttlSeconds: REDIS_SEARCH_CACHE_TTL_SECONDS,
    dbReader: async () => {
      const rows = await listActiveCustomers()
      return rows.filter((row) => searchableText([row.code, row.name]).includes(normalizedQuery))
    },
  })
}

export async function findActiveCustomerReferenceByCodeOrId(value: string | bigint | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const internalId = parseInternalBigIntId(normalized)
  const rows = await listActiveCustomers()
  return rows.find((row) => row.code === normalized.toUpperCase() || (internalId != null && row.id === internalId)) ?? null
}

export async function findCurrencyReferenceByCode(code: string | null | undefined) {
  const normalized = String(code ?? '').trim().toUpperCase()
  if (!normalized) return null
  const rows = await listCurrencies()
  return rows.find((row) => row.code.toUpperCase() === normalized || String(row.symbol ?? '').trim().toUpperCase() === normalized) ?? null
}

export async function listExpenseTypes() {
  return readThroughCache<ExpenseTypeReferenceRecord[]>({
    key: KEY_EXPENSE_TYPES_ALL,
    fromCache: (value) => (value as CachedExpenseTypeRecord[]).map(hydrateExpenseTypeRecord),
    toCache: (value) => value.map(dehydrateExpenseTypeRecord),
    dbReader: async () => {
      const rows: ExpenseTypeDbRow[] = await prisma.expense_types.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, created_at: true, id: true, name: true, updated_at: true },
      })
      return rows.map((row) => ({
        active: row.active === true,
        code: row.code,
        createdAt: row.created_at?.toISOString() ?? null,
        id: row.id,
        name: row.name,
        updatedAt: row.updated_at?.toISOString() ?? null,
      }))
    },
  })
}

export async function findActiveExpenseTypeReferenceByCode(code: string | null | undefined) {
  const normalized = String(code ?? '').trim().toUpperCase()
  if (!normalized) return null
  const rows = await listExpenseTypes()
  return rows.find((row) => row.active && row.code.toUpperCase() === normalized) ?? null
}

export async function listProductTypes() {
  return readThroughCache<ProductTypeReferenceRecord[]>({
    key: KEY_PRODUCT_TYPES_ALL,
    fromCache: (value) => (value as CachedProductTypeRecord[]).map(hydrateProductTypeRecord),
    toCache: (value) => value.map(dehydrateProductTypeRecord),
    dbReader: async () => {
      const rows: ProductTypeDbRow[] = await prisma.product_types.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, created_at: true, id: true, name: true, updated_at: true },
      })
      return rows.map((row) => ({
        active: row.active ?? true,
        code: row.code,
        createdAt: row.created_at?.toISOString() ?? null,
        id: row.id,
        name: row.name,
        updatedAt: row.updated_at?.toISOString() ?? null,
      }))
    },
  })
}

export async function findActiveProductTypeReferenceByName(name: string | null | undefined) {
  const normalized = String(name ?? '').trim()
  if (!normalized) return null
  const rows = await listProductTypes()
  return rows.find((row) => row.active && row.name === normalized) ?? null
}

export async function listProductUnits() {
  return readThroughCache<ProductUnitReferenceRecord[]>({
    key: KEY_PRODUCT_UNITS_ALL,
    fromCache: (value) => (value as CachedProductUnitRecord[]).map(hydrateProductUnitRecord),
    toCache: (value) => value.map(dehydrateProductUnitRecord),
    dbReader: async () => {
      const rows: ProductUnitDbRow[] = await prisma.product_units.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, created_at: true, id: true, name: true, symbol: true, updated_at: true },
      })
      return rows.map((row) => ({
        active: row.active ?? true,
        code: row.code,
        createdAt: row.created_at?.toISOString() ?? null,
        id: row.id,
        name: row.name,
        symbol: row.symbol ?? null,
        updatedAt: row.updated_at?.toISOString() ?? null,
      }))
    },
  })
}

export async function listActiveProductReferences() {
  return readThroughCache<ProductReferenceRecord[]>({
    key: KEY_PRODUCTS_ACTIVE,
    fromCache: (value) => (value as CachedProductReferenceRecord[]).map(hydrateProductReferenceRecord),
    toCache: (value) => value.map(dehydrateProductReferenceRecord),
    dbReader: async () => {
      const rows: ProductReferenceDbRow[] = await prisma.products.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: { active: true, code: true, id: true, metal_group: true, name: true, type: true, unit: true },
        where: { active: true },
      })
      return rows.map((row) => ({
        active: row.active === true,
        code: requireBusinessCode(row.code, `สินค้า ${row.id}`),
        id: row.id,
        metalGroup: row.metal_group ?? null,
        name: row.name,
        type: row.type ?? null,
        unit: row.unit ?? null,
      }))
    },
  })
}

export async function searchActiveProducts(query: string) {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return listActiveProductReferences()
  return readThroughCache<ProductReferenceRecord[]>({
    key: `${KEY_PRODUCTS_SEARCH_PREFIX}${normalizedQuery}`,
    fromCache: (value) => (value as CachedProductReferenceRecord[]).map(hydrateProductReferenceRecord),
    toCache: (value) => value.map(dehydrateProductReferenceRecord),
    ttlSeconds: REDIS_SEARCH_CACHE_TTL_SECONDS,
    dbReader: async () => {
      const rows = await listActiveProductReferences()
      return rows.filter((row) => searchableText([row.code, row.name, row.type, row.unit, row.metalGroup]).includes(normalizedQuery))
    },
  })
}

export async function listActiveProductThumbnailReferences() {
  return readThroughCache<ProductThumbnailReferenceRecord[]>({
    key: KEY_PRODUCTS_THUMBNAILS_ACTIVE,
    fromCache: (value) => (value as CachedProductThumbnailReferenceRecord[]).map(hydrateProductThumbnailReferenceRecord),
    toCache: (value) => value.map(dehydrateProductThumbnailReferenceRecord),
    dbReader: async () => {
      const rows: ProductThumbnailReferenceDbRow[] = await prisma.products.findMany({
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { code: true, image_thumbnail_storage_key: true },
        where: { active: true },
      })
      return rows.map((row) => ({
        code: requireBusinessCode(row.code, 'สินค้า thumbnail'),
        thumbnailStorageKey: row.image_thumbnail_storage_key ?? null,
      }))
    },
  })
}

export async function findActiveProductUnitReferenceByNameOrSymbol(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const normalizedUpper = normalized.toUpperCase()
  const rows = await listProductUnits()
  return rows.find((row) => row.active && (row.name === normalized || String(row.symbol ?? '').trim().toUpperCase() === normalizedUpper)) ?? null
}

export async function listMachineTypes() {
  return readThroughCache<MachineTypeReferenceRecord[]>({
    key: KEY_MACHINE_TYPES_ALL,
    fromCache: (value) => (value as CachedMachineTypeRecord[]).map(hydrateMachineTypeRecord),
    toCache: (value) => value.map(dehydrateMachineTypeRecord),
    dbReader: async () => {
      const rows: MachineTypeDbRow[] = await prisma.production_machine_types.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, created_at: true, id: true, name: true, updated_at: true },
      })
      return rows.map((row) => ({
        active: row.active ?? true,
        createdAt: row.created_at?.toISOString() ?? null,
        id: row.id,
        name: row.name,
        updatedAt: row.updated_at?.toISOString() ?? null,
      }))
    },
  })
}

async function listAccountReferences(where: Prisma.accountsWhereInput | undefined, key: string) {
  return readThroughCache<AccountReferenceRecord[]>({
    key,
    fromCache: (value) => (value as CachedAccountReferenceRecord[]).map(hydrateAccountReferenceRecord),
    toCache: (value) => value.map(dehydrateAccountReferenceRecord),
    dbReader: async () => {
      const rows: AccountReferenceDbRow[] = await prisma.accounts.findMany({
        orderBy: [{ name: 'asc' }, { account_no: 'asc' }],
        select: {
          active: true,
          account_no: true,
          bank: true,
          bank_name: true,
          branches: { select: { code: true, id: true, name: true } },
          code: true,
          currency: true,
          id: true,
          name: true,
          od_limit: true,
          opening_balance: true,
          subtype: true,
          type: true,
        },
        where,
      })
      return rows.map((row) => ({
        active: row.active ?? true,
        accountNo: row.account_no ?? null,
        bank: row.bank ?? null,
        bankName: row.bank_name ?? null,
        branchCode: row.branches?.code ?? null,
        branchId: row.branches?.id ?? null,
        branchName: row.branches?.name ?? null,
        code: requireBusinessCode(row.code, `บัญชีเงิน ${row.id}`),
        currency: row.currency ?? null,
        id: row.id,
        name: row.name,
        odLimit: row.od_limit?.toString() ?? null,
        openingBalance: row.opening_balance?.toString() ?? null,
        subtype: row.subtype ?? null,
        type: row.type,
      }))
    },
  })
}

export async function listActiveAccounts() {
  return listAccountReferences({ active: true }, KEY_ACCOUNTS_ACTIVE)
}

export async function listAllAccounts() {
  return listAccountReferences(undefined, KEY_ACCOUNTS_ALL)
}

export async function findActiveAccountReferenceByCodeOrId(value: string | bigint | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const internalId = parseInternalBigIntId(normalized)
  const rows = await listActiveAccounts()
  return rows.find((row) => row.code === normalized.toUpperCase() || (internalId != null && row.id === internalId)) ?? null
}

export async function listActiveOverseasRecipients() {
  return readThroughCache<OverseasRecipientReferenceRecord[]>({
    key: KEY_OVERSEAS_RECIPIENTS_ACTIVE,
    fromCache: (value) => (value as CachedOverseasRecipientReferenceRecord[]).map(hydrateOverseasRecipientReferenceRecord),
    toCache: (value) => value.map(dehydrateOverseasRecipientReferenceRecord),
    dbReader: async () => {
      const rows: OverseasRecipientDbRow[] = await prisma.overseas_recipients.findMany({
        orderBy: [{ name: 'asc' }],
        select: {
          account_no: true,
          active: true,
          bank_name: true,
          code: true,
          country: true,
          currency: true,
          id: true,
          name: true,
          swift: true,
        },
        where: { active: true },
      })
      return rows.map((row) => ({
        accountNo: row.account_no ?? null,
        active: row.active ?? true,
        bankName: row.bank_name ?? null,
        code: requireBusinessCode(row.code, `ผู้รับเงินต่างประเทศ ${row.id}`),
        country: row.country ?? null,
        currency: row.currency ?? null,
        id: row.id,
        name: row.name,
        swift: row.swift ?? null,
      }))
    },
  })
}

export async function listActiveOverseasRemittancePurposes() {
  return readThroughCache<OverseasRemittancePurposeReferenceRecord[]>({
    key: KEY_OVERSEAS_REMITTANCE_PURPOSES_ACTIVE,
    fromCache: (value) => (value as CachedOverseasRemittancePurposeReferenceRecord[]).map(hydrateOverseasRemittancePurposeReferenceRecord),
    toCache: (value) => value.map(dehydrateOverseasRemittancePurposeReferenceRecord),
    dbReader: async () => {
      const rows: OverseasRemittancePurposeDbRow[] = await prisma.overseas_remittance_purposes.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      })
      return rows.map((row) => ({
        active: row.active ?? true,
        code: requireBusinessCode(row.code, `วัตถุประสงค์โอน ${row.id}`),
        id: row.id,
        name: row.name,
      }))
    },
  })
}

export async function listActiveSuppliers() {
  return readThroughCache<SupplierReferenceRecord[]>({
    key: KEY_SUPPLIERS_ACTIVE,
    fromCache: (value) => (value as CachedSupplierRecord[]).map(hydrateSupplierRecord),
    toCache: (value) => value.map(dehydrateSupplierRecord),
    dbReader: async () => {
      const rows: SupplierReferenceDbRow[] = await prisma.suppliers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { address: true, code: true, id: true, name: true, phone: true, sales_id: true, sales_rep: true, tax_id: true },
        where: { active: true },
      })
      return rows.map((row) => ({
        address: row.address ?? null,
        code: requireBusinessCode(row.code, `ผู้ขาย ${row.id}`),
        id: row.id,
        name: row.name,
        phone: row.phone ?? null,
        salesId: row.sales_id ?? null,
        salesRep: row.sales_rep ?? null,
        taxId: row.tax_id ?? null,
      }))
    },
  })
}

export async function listSupplierReferencesByIds(ids: Array<bigint | string | null | undefined>) {
  const normalizedIds = [...new Set(
    ids
      .map((value) => parseInternalBigIntId(value == null ? null : String(value)))
      .filter((value): value is bigint => value != null),
  )].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  if (!normalizedIds.length) return [] satisfies SupplierSummaryReferenceRecord[]

  const key = `${KEY_SUPPLIERS_BY_ID_PREFIX}${normalizedIds.map((id) => id.toString()).join(',')}`
  return readThroughCache<SupplierSummaryReferenceRecord[]>({
    key,
    fromCache: (value) => (value as CachedSupplierSummaryRecord[]).map(hydrateSupplierSummaryRecord),
    toCache: (value) => value.map(dehydrateSupplierSummaryRecord),
    dbReader: async () => {
      const rows: SupplierSummaryDbRow[] = await prisma.suppliers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { code: true, id: true, name: true },
        where: { id: { in: normalizedIds } },
      })
      return rows.map((row) => ({
        code: requireBusinessCode(row.code, `ผู้ขาย ${row.id}`),
        id: row.id,
        name: row.name,
      }))
    },
  })
}

export async function listActiveSupplierPaymentOptions() {
  return readThroughCache<SupplierPaymentOptionReferenceRecord[]>({
    key: KEY_SUPPLIERS_ACTIVE_PAYMENT_OPTIONS,
    fromCache: (value) => (value as CachedSupplierPaymentOptionRecord[]).map(hydrateSupplierPaymentOptionRecord),
    toCache: (value) => value.map(dehydrateSupplierPaymentOptionRecord),
    dbReader: async () => {
      const rows: SupplierPaymentOptionDbRow[] = await prisma.suppliers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          active: true,
          code: true,
          id: true,
          name: true,
          supplier_bank_accounts: {
            include: {
              bank_names: {
                select: { name: true },
              },
            },
            orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
          },
        },
        where: { active: true },
      })
      return rows.map((row) => ({
        active: row.active === true,
        bankAccount: row.supplier_bank_accounts.find((account: SupplierPaymentBankAccountDbRow) => account.is_primary)?.account_no
          ?? row.supplier_bank_accounts[0]?.account_no
          ?? null,
        bankAccounts: row.supplier_bank_accounts.map((account: SupplierPaymentBankAccountDbRow) => ({
          accountName: account.account_name,
          accountNo: account.account_no,
          active: account.active === true,
          bankName: account.bank_names?.name ?? null,
          branchCode: account.branch_code,
          code: account.code,
          paymentMethod: account.payment_method ?? null,
        })),
        code: requireBusinessCode(row.code, `ผู้ขาย ${row.id}`),
        id: row.id,
        name: row.name,
      }))
    },
  })
}

export async function searchActiveSuppliers(query: string) {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return listActiveSuppliers()
  return readThroughCache<SupplierReferenceRecord[]>({
    key: `${KEY_SUPPLIERS_SEARCH_PREFIX}${normalizedQuery}`,
    fromCache: (value) => (value as CachedSupplierRecord[]).map(hydrateSupplierRecord),
    toCache: (value) => value.map(dehydrateSupplierRecord),
    ttlSeconds: REDIS_SEARCH_CACHE_TTL_SECONDS,
    dbReader: async () => {
      const rows = await listActiveSuppliers()
      return rows.filter((row) => searchableText([row.code, row.name]).includes(normalizedQuery))
    },
  })
}

export async function listActiveSupplierBranchOptions() {
  return readThroughCache<SupplierBranchOptionRecord[]>({
    key: KEY_SUPPLIERS_ACTIVE_BRANCH_OPTIONS,
    fromCache: (value) => (value as CachedSupplierBranchOptionRecord[]).map(hydrateSupplierBranchOptionRecord),
    toCache: (value) => value.map(dehydrateSupplierBranchOptionRecord),
    dbReader: async () => {
      const rows: SupplierBranchOptionDbRow[] = await prisma.suppliers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          code: true,
          id: true,
          name: true,
          supplier_branches: {
            select: {
              branches: { select: { code: true } },
            },
            where: { active: true },
          },
        },
        where: { active: true },
      })
      return rows.map((row) => ({
        branchIds: row.supplier_branches
          .map((mapping: SupplierBranchMappingDbRow) => mapping.branches?.code)
          .filter((branchCode): branchCode is string => Boolean(branchCode)),
        code: requireBusinessCode(row.code, `ผู้ขาย ${row.id}`),
        id: row.id,
        name: row.name,
      }))
    },
  })
}

export async function listActiveSupplierBranchOptionsByBranchCodes(codes: string[]) {
  const normalizedCodes = [...new Set(codes.map(normalizeBranchCode).filter(Boolean))]
  const rows = await listActiveSupplierBranchOptions()
  if (!normalizedCodes.length) return rows
  return rows.filter((row) => row.branchIds.some((branchCode) => normalizedCodes.includes(normalizeBranchCode(branchCode))))
}

export async function findActiveMachineTypeReferenceByName(name: string | null | undefined) {
  const normalized = String(name ?? '').trim()
  if (!normalized) return null
  const rows = await listMachineTypes()
  return rows.find((row) => row.active && row.name === normalized) ?? null
}

export async function findActiveSupplierReferenceByCodeOrId(value: string | bigint | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const internalId = parseInternalBigIntId(normalized)
  const rows = await listActiveSuppliers()
  return rows.find((row) => row.code === normalized.toUpperCase() || (internalId != null && row.id === internalId)) ?? null
}

export async function listActiveBankNames() {
  return readThroughCache<BankNameReferenceRecord[]>({
    key: KEY_BANK_NAMES_ACTIVE,
    fromCache: (value) => (value as CachedBankNameRecord[]).map(hydrateBankNameRecord),
    toCache: (value) => value.map(dehydrateBankNameRecord),
    dbReader: async () => {
      const rows: BankNameDbRow[] = await prisma.bank_names.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, id: true, name: true, symbol: true },
        where: { active: true },
      })
      return rows.map((row) => ({
        active: row.active ?? true,
        code: row.code,
        id: row.id,
        name: row.name,
        symbol: row.symbol ?? null,
      }))
    },
  })
}

export async function findActiveBankNameReferenceByName(name: string | null | undefined) {
  const normalized = String(name ?? '').trim()
  if (!normalized) return null
  const rows = await listActiveBankNames()
  return rows.find((row) => row.name === normalized) ?? null
}

export async function listActivePaymentMethods() {
  return readThroughCache<PaymentMethodReferenceRecord[]>({
    key: KEY_PAYMENT_METHODS_ACTIVE,
    fromCache: (value) => (value as CachedPaymentMethodRecord[]).map(hydratePaymentMethodRecord),
    toCache: (value) => value.map(dehydratePaymentMethodRecord),
    dbReader: async () => {
      const rows: PaymentMethodDbRow[] = await prisma.payment_methods.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, id: true, name: true, type: true },
        where: { active: true },
      })
      return rows.map((row) => ({
        active: row.active ?? true,
        code: row.code,
        id: row.id,
        name: row.name,
        type: row.type,
      }))
    },
  })
}

export async function findActivePaymentMethodReferenceByName(name: string | null | undefined) {
  const normalized = String(name ?? '').trim()
  if (!normalized) return null
  const rows = await listActivePaymentMethods()
  return rows.find((row) => row.name === normalized) ?? null
}

export async function findActiveBranchReferenceByCodeOrId(value: string | bigint | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const rows = await listActiveBranches()
  const numericId = /^\d+$/.test(normalized) ? BigInt(normalized) : null
  return rows.find((row) => row.code === normalized.toUpperCase() || (numericId != null && row.id === numericId)) ?? null
}

export async function listActiveWarehouses() {
  return readThroughCache<WarehouseReferenceRecord[]>({
    key: KEY_WAREHOUSES_ACTIVE,
    fromCache: (value) => (value as CachedWarehouseRecord[]).map(hydrateWarehouseRecord),
    toCache: (value) => value.map(dehydrateWarehouseRecord),
    dbReader: async () => {
      const rows: WarehouseDbRow[] = await prisma.warehouses.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          branches: { select: { code: true } },
          code: true,
          id: true,
          name: true,
          type: true,
        },
        where: { active: true },
      })
      return rows.map((row) => ({
        branchCode: row.branches?.code ?? null,
        code: row.code,
        id: row.id,
        name: row.name,
        type: row.type ?? null,
      }))
    },
  })
}

export async function listWarehouseMasterRecords() {
  return readThroughCache<WarehouseMasterRecord[]>({
    key: KEY_WAREHOUSES_MASTER_LIST,
    fromCache: (value) => (value as CachedWarehouseRecord[]).map(hydrateWarehouseMasterRecord),
    toCache: (value) => value.map(dehydrateWarehouseMasterRecord),
    dbReader: async () => {
      const rows = await prisma.warehouses.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          active: true,
          branches: { select: { code: true, name: true } },
          code: true,
          created_at: true,
          id: true,
          name: true,
          type: true,
        },
      })
      return rows.map((row: (typeof rows)[number]) => ({
        active: row.active === true,
        branchCode: row.branches?.code ?? null,
        branchName: row.branches?.name ?? null,
        code: row.code,
        createdAt: row.created_at?.toISOString() ?? null,
        id: row.id,
        name: row.name,
        type: row.type ?? null,
        updatedAt: null,
      }))
    },
  })
}

export async function listActiveWarehousesByBranch(branchCode: string) {
  const normalizedBranchCode = normalizeBranchCode(branchCode)
  if (!normalizedBranchCode) return []
  const key = `${KEY_WAREHOUSES_ACTIVE_BRANCH_PREFIX}${normalizedBranchCode}`
  return readThroughCache<WarehouseReferenceRecord[]>({
    key,
    fromCache: (value) => (value as CachedWarehouseRecord[]).map(hydrateWarehouseRecord),
    toCache: (value) => value.map(dehydrateWarehouseRecord),
    dbReader: async () => {
      const rows: WarehouseDbRow[] = await prisma.warehouses.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          branches: { select: { code: true } },
          code: true,
          id: true,
          name: true,
          type: true,
        },
        where: {
          active: true,
          branches: { code: normalizedBranchCode },
        },
      })
      return rows.map((row) => ({
        branchCode: row.branches?.code ?? null,
        code: row.code,
        id: row.id,
        name: row.name,
        type: row.type ?? null,
      }))
    },
  })
}

export async function findActiveWarehouseReferenceByCodeOrId(value: string | bigint | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const rows = await listActiveWarehouses()
  const numericId = /^\d+$/.test(normalized) ? BigInt(normalized) : null
  return rows.find((row) => row.code === normalized.toUpperCase() || (numericId != null && row.id === numericId)) ?? null
}

export async function invalidateBranchReferenceCache() {
  deleteServerCache(KEY_BRANCHES_ACTIVE)
  deleteServerCache(KEY_BRANCHES_MASTER_LIST)
  deleteServerCache(KEY_WAREHOUSES_ACTIVE)
  deleteServerCache(KEY_WAREHOUSES_MASTER_LIST)
  deleteServerCacheByPrefix(KEY_WAREHOUSES_ACTIVE_BRANCH_PREFIX)
  await Promise.all([
    redisDeleteKeys([KEY_BRANCHES_ACTIVE, KEY_BRANCHES_MASTER_LIST, KEY_WAREHOUSES_ACTIVE, KEY_WAREHOUSES_MASTER_LIST]),
    redisDeleteByPrefixes([KEY_WAREHOUSES_ACTIVE_BRANCH_PREFIX]),
  ])
}

export async function invalidateBankNameReferenceCache() {
  deleteServerCache(KEY_BANK_NAMES_ACTIVE)
  deleteServerCache(KEY_SUPPLIERS_ACTIVE_PAYMENT_OPTIONS)
  await redisDeleteKeys([KEY_BANK_NAMES_ACTIVE, KEY_SUPPLIERS_ACTIVE_PAYMENT_OPTIONS])
}

export async function invalidateAccountReferenceCache() {
  deleteServerCache(KEY_ACCOUNTS_ACTIVE)
  deleteServerCache(KEY_ACCOUNTS_ALL)
  await redisDeleteKeys([KEY_ACCOUNTS_ACTIVE, KEY_ACCOUNTS_ALL])
}

export async function invalidateCurrencyReferenceCache() {
  deleteServerCache(KEY_CURRENCIES_ALL)
  await redisDeleteKeys([KEY_CURRENCIES_ALL])
}

export async function invalidateCustomerReferenceCache() {
  deleteServerCache(KEY_CUSTOMERS_ACTIVE)
  deleteServerCache(KEY_CUSTOMERS_ACTIVE_BRANCH_OPTIONS)
  deleteServerCacheByPrefix(KEY_CUSTOMERS_SEARCH_PREFIX)
  await Promise.all([
    redisDeleteKeys([KEY_CUSTOMERS_ACTIVE, KEY_CUSTOMERS_ACTIVE_BRANCH_OPTIONS]),
    redisDeleteByPrefixes([KEY_CUSTOMERS_SEARCH_PREFIX]),
  ])
}

export async function invalidateExpenseTypeReferenceCache() {
  deleteServerCache(KEY_EXPENSE_TYPES_ALL)
  await redisDeleteKeys([KEY_EXPENSE_TYPES_ALL])
}

export async function invalidateMachineTypeReferenceCache() {
  deleteServerCache(KEY_MACHINE_TYPES_ALL)
  await redisDeleteKeys([KEY_MACHINE_TYPES_ALL])
}

export async function invalidateOverseasRecipientReferenceCache() {
  deleteServerCache(KEY_OVERSEAS_RECIPIENTS_ACTIVE)
  await redisDeleteKeys([KEY_OVERSEAS_RECIPIENTS_ACTIVE])
}

export async function invalidateOverseasRemittancePurposeReferenceCache() {
  deleteServerCache(KEY_OVERSEAS_REMITTANCE_PURPOSES_ACTIVE)
  await redisDeleteKeys([KEY_OVERSEAS_REMITTANCE_PURPOSES_ACTIVE])
}

export async function invalidateProductTypeReferenceCache() {
  deleteServerCache(KEY_PRODUCT_TYPES_ALL)
  await redisDeleteKeys([KEY_PRODUCT_TYPES_ALL])
}

export async function invalidateProductUnitReferenceCache() {
  deleteServerCache(KEY_PRODUCT_UNITS_ALL)
  await redisDeleteKeys([KEY_PRODUCT_UNITS_ALL])
}

export async function invalidateProductReferenceCache() {
  deleteServerCache(KEY_PRODUCTS_ACTIVE)
  deleteServerCache(KEY_PRODUCTS_THUMBNAILS_ACTIVE)
  deleteServerCacheByPrefix(KEY_PRODUCTS_SEARCH_PREFIX)
  await Promise.all([
    redisDeleteKeys([KEY_PRODUCTS_ACTIVE, KEY_PRODUCTS_THUMBNAILS_ACTIVE]),
    redisDeleteByPrefixes([KEY_PRODUCTS_SEARCH_PREFIX]),
  ])
}

export async function invalidateSupplierReferenceCache() {
  deleteServerCache(KEY_SUPPLIERS_ACTIVE)
  deleteServerCache(KEY_SUPPLIERS_ACTIVE_BRANCH_OPTIONS)
  deleteServerCache(KEY_SUPPLIERS_ACTIVE_PAYMENT_OPTIONS)
  deleteServerCacheByPrefix(KEY_SUPPLIERS_BY_ID_PREFIX)
  deleteServerCacheByPrefix(KEY_SUPPLIERS_SEARCH_PREFIX)
  await Promise.all([
    redisDeleteKeys([KEY_SUPPLIERS_ACTIVE, KEY_SUPPLIERS_ACTIVE_BRANCH_OPTIONS, KEY_SUPPLIERS_ACTIVE_PAYMENT_OPTIONS]),
    redisDeleteByPrefixes([KEY_SUPPLIERS_BY_ID_PREFIX]),
    redisDeleteByPrefixes([KEY_SUPPLIERS_SEARCH_PREFIX]),
  ])
}

export async function invalidatePaymentMethodReferenceCache() {
  deleteServerCache(KEY_PAYMENT_METHODS_ACTIVE)
  await redisDeleteKeys([KEY_PAYMENT_METHODS_ACTIVE])
}

export async function invalidateWarehouseReferenceCache(branchCodes: string[] = []) {
  deleteServerCache(KEY_WAREHOUSES_ACTIVE)
  deleteServerCache(KEY_WAREHOUSES_MASTER_LIST)
  deleteServerCacheByPrefix(KEY_WAREHOUSES_ACTIVE_BRANCH_PREFIX)
  await Promise.all([
    redisDeleteKeys([KEY_WAREHOUSES_ACTIVE, KEY_WAREHOUSES_MASTER_LIST, ...branchCodes.map((code) => `${KEY_WAREHOUSES_ACTIVE_BRANCH_PREFIX}${normalizeBranchCode(code)}`)]),
    redisDeleteByPrefixes(branchCodes.length ? [] : [KEY_WAREHOUSES_ACTIVE_BRANCH_PREFIX]),
  ])
}
