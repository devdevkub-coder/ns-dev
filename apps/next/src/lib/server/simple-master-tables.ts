import { z } from 'zod'
import { prisma } from '@/lib/server/prisma'
import { getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import {
  productionOutputCategoryCodeSchema,
  productionOutputStockEffectSchema,
} from '@/lib/production-output-categories'
import {
  masterDataJson,
  masterDataListJson,
  nextSequentialCode,
  parseMasterDataForm,
  toIso,
  toNumber,
  updateMasterDataStatusSchema,
} from '@/lib/server/master-data'

type SimpleMasterKind = 'bankNames' | 'directors' | 'machineTypes' | 'machines' | 'productionLines' | 'productionOutputCategories' | 'productTypes' | 'productUnits' | 'paymentMethods' | 'remittancePurposes'

type Delegate = {
  findMany: (args?: unknown) => Promise<unknown[]>
  findFirst: (args?: unknown) => Promise<unknown | null>
  upsert: (args: unknown) => Promise<unknown>
  update: (args: unknown) => Promise<unknown>
}

type SimpleMasterConfig = {
  delegate: () => Delegate
  prefix: string
  orderBy: unknown
  include?: unknown
  map: (row: unknown) => Record<string, unknown>
  data: (values: ReturnType<typeof parseMasterDataForm>, id: string, code: string) => Record<string, unknown>
  nextId?: () => Promise<string>
}

const asRecord = (row: unknown) => row as Record<string, unknown>
const directorTypeSchema = z.enum(['กรรมการ', 'พนักงาน', 'อื่นๆ']).nullable()

type SimpleMasterValues = ReturnType<typeof parseMasterDataForm>

async function nextBankNameId() {
  const rows = await prisma.bank_names.findMany({ select: { id: true } })
  const maxNumber = rows.reduce((max, row) => {
    const matched = row.id.match(/^BANK-(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `BANK-${String(maxNumber + 1).padStart(3, '0')}`
}

function requireReferencePermission(permissionCode: 'master.reference.view' | 'master.reference.manage') {
  return getCurrentAuthContext().then((context) => requirePermission(context, permissionCode))
}

function validateSimpleMasterValues(kind: SimpleMasterKind, values: SimpleMasterValues) {
  if (kind === 'directors') {
    directorTypeSchema.parse(values.type)
  }

  if (kind === 'productionOutputCategories') {
    productionOutputCategoryCodeSchema.parse(values.code)
    productionOutputStockEffectSchema.nullable().parse(values.stockEffect)
  }

  return values
}

const configs: Record<SimpleMasterKind, SimpleMasterConfig> = {
  bankNames: {
    delegate: () => prisma.bank_names as Delegate,
    prefix: 'BANK-',
    orderBy: [{ name: 'asc' }],
    nextId: nextBankNameId,
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: null,
        name: record.name,
        symbol: record.symbol,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, _code) => ({
      id,
      name: values.name,
      symbol: values.symbol || null,
      active: values.active,
    }),
  },
  directors: {
    delegate: () => prisma.director_employees as Delegate,
    prefix: 'D',
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: record.code,
        name: record.name,
        type: record.type,
        phone: record.phone,
        bankName: record.bank_name,
        accountNo: record.account_no ?? record.bank_account,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, code) => ({
      id,
      code,
      name: values.name,
      type: values.type || null,
      phone: values.phone || null,
      bank_name: values.bankName || null,
      account_no: values.accountNo || null,
      bank_account: values.accountNo || null,
      active: values.active,
    }),
  },
  machineTypes: {
    delegate: () => prisma.production_machine_types as Delegate,
    prefix: 'MT-',
    orderBy: [{ name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: null,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, _code) => ({
      id,
      name: values.name,
      active: values.active,
    }),
  },
  machines: {
    delegate: () => prisma.production_machines as Delegate,
    prefix: 'MC',
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    include: { branches: true },
    map: (row) => {
      const record = asRecord(row)
      const branch = record.branches as Record<string, unknown> | null | undefined
      return {
        id: record.id,
        code: record.code,
        name: record.name,
        type: record.type,
        branchId: record.branch_id,
        branchName: branch?.name ?? null,
        capacityKgPerHr: toNumber(record.capacity_kg_per_hr as { toNumber: () => number } | number | null),
        normalYieldPct: toNumber(record.normal_yield_pct as { toNumber: () => number } | number | null),
        stdProcessCostPerHr: toNumber(record.std_process_cost_per_hr as { toNumber: () => number } | number | null),
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, code) => ({
      id,
      code,
      name: values.name,
      branch_id: values.branchId || null,
      type: values.type || null,
      capacity_kg_per_hr: values.capacityKgPerHr,
      normal_yield_pct: values.normalYieldPct,
      std_process_cost_per_hr: values.stdProcessCostPerHr,
      active: values.active,
    }),
  },
  productionLines: {
    delegate: () => prisma.production_lines as Delegate,
    prefix: 'PL',
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    include: { branches: true },
    map: (row) => {
      const record = asRecord(row)
      const branch = record.branches as Record<string, unknown> | null | undefined
      return {
        id: record.id,
        code: record.code,
        name: record.name,
        branchId: record.branch_id,
        branchName: branch?.name ?? null,
        responsiblePerson: record.responsible_person,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, code) => ({
      id,
      code,
      name: values.name,
      branch_id: values.branchId || null,
      responsible_person: values.responsiblePerson || null,
      active: values.active,
    }),
  },
  productionOutputCategories: {
    delegate: () => prisma.production_output_categories as Delegate,
    prefix: 'POC',
    orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: record.code,
        name: record.name_th,
        stockEffect: record.stock_effect,
        availableForSale: record.available_for_sale,
        sortOrder: toNumber(record.sort_order as number | null),
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, code) => ({
      id,
      code,
      name_th: values.name,
      name_en: null,
      stock_effect: values.stockEffect || 'stock_in',
      available_for_sale: values.availableForSale,
      sort_order: values.sortOrder ?? 0,
      active: values.active,
    }),
  },
  productUnits: {
    delegate: () => prisma.product_units as Delegate,
    prefix: 'U',
    orderBy: [{ name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: null,
        name: record.name,
        symbol: record.symbol,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, _code) => ({
      id,
      name: values.name,
      symbol: values.symbol || null,
      active: values.active,
    }),
  },
  productTypes: {
    delegate: () => prisma.product_types as Delegate,
    prefix: 'PT-',
    orderBy: [{ name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: null,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, _code) => ({
      id,
      name: values.name,
      active: values.active,
    }),
  },
  paymentMethods: {
    delegate: () => prisma.payment_methods as Delegate,
    prefix: 'PM-',
    orderBy: [{ name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: null,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, _code) => ({
      id,
      name: values.name,
      active: values.active,
    }),
  },
  remittancePurposes: {
    delegate: () => prisma.overseas_remittance_purposes as Delegate,
    prefix: 'RP-',
    orderBy: [{ name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: null,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, _code) => ({
      id,
      name: values.name,
      active: values.active,
    }),
  },
}

async function nextId(config: SimpleMasterConfig) {
  if (config.nextId) return config.nextId()

  const last = await config.delegate().findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  return nextSequentialCode(String(asRecord(last)?.id ?? ''), config.prefix, 3)
}

export async function listSimpleMasterData(kind: SimpleMasterKind) {
  await requireReferencePermission('master.reference.view')

  const config = configs[kind]
  const rows = await config.delegate().findMany({ orderBy: config.orderBy, include: config.include })
  return masterDataListJson(rows.map(config.map))
}

export async function saveSimpleMasterData(request: Request, kind: SimpleMasterKind) {
  await requireReferencePermission('master.reference.manage')

  const config = configs[kind]
  const values = validateSimpleMasterValues(kind, parseMasterDataForm(await request.json()))
  if (kind === 'machines' && values.type) {
    const machineType = await prisma.production_machine_types.findFirst({ where: { active: true, name: values.type } })
    if (!machineType) throw new Error('ประเภทเครื่องจักรที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
  const id = values.id || values.code || await nextId(config)
  const code = values.code || id
  const data = config.data(values, id, code)
  const row = await config.delegate().upsert({ where: { id }, create: data, update: data, include: config.include })
  return masterDataJson(config.map(row))
}

export async function patchSimpleMasterData(request: Request, kind: SimpleMasterKind, id: string) {
  await requireReferencePermission('master.reference.manage')

  const config = configs[kind]
  const values = updateMasterDataStatusSchema.parse(await request.json())
  const row = await config.delegate().update({ where: { id }, data: { active: values.active }, include: config.include })
  return masterDataJson(config.map(row))
}
