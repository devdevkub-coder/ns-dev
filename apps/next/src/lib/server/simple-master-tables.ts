import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
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

type SimpleMasterKind = 'accountSubtypes' | 'bankNames' | 'directors' | 'expenseTypes' | 'machineTypes' | 'machines' | 'paymentMethods' | 'productionLines' | 'productionOutputCategories' | 'productTypes' | 'productUnits' | 'remittancePurposes' | 'vatSettings' | 'whtSettings'

type Delegate = {
  findMany: (args?: unknown) => Promise<unknown[]>
  findFirst: (args?: unknown) => Promise<unknown | null>
  upsert: (args: unknown) => Promise<unknown>
  create: (args: unknown) => Promise<unknown>
  update: (args: unknown) => Promise<unknown>
}

type SimpleMasterConfig = {
  delegate: () => Delegate
  prefix: string
  orderBy: unknown
  include?: unknown
  lookupKey?: 'id' | 'code'
  coerceLookupValue?: (value: string) => unknown
  map: (row: unknown) => Record<string, unknown>
  data: (values: ReturnType<typeof parseMasterDataForm>, id: string, code: string) => Record<string, unknown>
  normalizeValues?: (values: ReturnType<typeof parseMasterDataForm>) => Promise<ReturnType<typeof parseMasterDataForm>>
  nextId?: () => Promise<string>
}

const asRecord = (row: unknown) => row as Record<string, unknown>
const directorTypeSchema = z.enum(['กรรมการ', 'พนักงาน', 'อื่นๆ']).nullable()

type SimpleMasterValues = ReturnType<typeof parseMasterDataForm>

async function nextBankNameId() {
  const rows = await prisma.bank_names.findMany({ select: { code: true } })
  const maxNumber = rows.reduce((max, row) => {
    const matched = row.code.match(/^BANK-(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `BANK-${String(maxNumber + 1).padStart(3, '0')}`
}

function permissionForSimpleMaster(kind: SimpleMasterKind, action: 'manage' | 'view') {
  if (kind === 'vatSettings' || kind === 'whtSettings') return 'system.settings.manage'
  return action === 'manage' ? 'master.reference.manage' : 'master.reference.view'
}

function requireSimpleMasterPermission(kind: SimpleMasterKind, action: 'manage' | 'view') {
  return getCurrentAuthContext().then((context) => requirePermission(context, permissionForSimpleMaster(kind, action)))
}

function validateSimpleMasterValues(kind: SimpleMasterKind, values: SimpleMasterValues) {
  if (kind === 'directors') {
    directorTypeSchema.parse(values.type)
  }

  if (kind === 'productionOutputCategories') {
    productionOutputCategoryCodeSchema.parse(values.code)
    productionOutputStockEffectSchema.nullable().parse(values.stockEffect)
  }

  if ((kind === 'vatSettings' || kind === 'whtSettings') && values.ratePercent === null) {
    throw new Error('กรอกอัตราภาษีเป็นเปอร์เซ็นต์')
  }

  return values
}

const configs: Record<SimpleMasterKind, SimpleMasterConfig> = {
  accountSubtypes: {
    delegate: () => prisma.account_subtypes as Delegate,
    prefix: 'AST-',
    orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
        code: record.code,
        name: record.name,
        sortOrder: toNumber(record.sort_order as number | null),
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, code) => ({
      code,
      name: values.name,
      sort_order: values.sortOrder ?? 0,
      active: values.active,
    }),
  },
  bankNames: {
    delegate: () => prisma.bank_names as Delegate,
    prefix: 'BANK-',
    orderBy: [{ name: 'asc' }],
    lookupKey: 'code',
    nextId: nextBankNameId,
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
        code: record.code,
        name: record.name,
        symbol: record.symbol,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, code) => ({
      code,
      name: values.name,
      symbol: values.symbol || null,
      active: values.active,
    }),
  },
  directors: {
    delegate: () => prisma.director_employees as Delegate,
    prefix: 'D',
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
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
    data: (values, _id, code) => ({
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
  expenseTypes: {
    delegate: () => prisma.expense_types as Delegate,
    prefix: 'EXT-',
    orderBy: [{ code: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
        code: record.code,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, code) => ({
      code,
      name: values.name,
      active: values.active,
    }),
  },
  machineTypes: {
    delegate: () => prisma.production_machine_types as Delegate,
    prefix: 'MT-',
    orderBy: [{ name: 'asc' }],
    coerceLookupValue: (value) => {
      const parsed = parseInternalBigIntId(value)
      if (parsed === null) throw new Error('รหัสประเภทเครื่องจักรไม่ถูกต้อง')
      return parsed
    },
    map: (row) => {
      const record = asRecord(row)
      return {
        id: String(record.id),
        code: null,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, _code) => ({
      name: values.name,
      active: values.active,
    }),
  },
  machines: {
    delegate: () => prisma.production_machines as Delegate,
    prefix: 'MC',
    orderBy: [{ name: 'asc' }],
    include: { branches: true },
    coerceLookupValue: (value) => {
      const parsed = parseInternalBigIntId(value)
      if (parsed === null) throw new Error('รหัสเครื่องจักรไม่ถูกต้อง')
      return parsed
    },
    map: (row) => {
      const record = asRecord(row)
      const branch = record.branches as Record<string, unknown> | null | undefined
      return {
        id: String(record.id),
        code: null,
        name: record.name,
        type: record.type,
        branchId: (branch?.code as string | null | undefined) ?? null,
        branchName: branch?.name ?? null,
        capacityKgPerHr: toNumber(record.capacity_kg_per_hr as { toNumber: () => number } | number | null),
        normalYieldPct: toNumber(record.normal_yield_pct as { toNumber: () => number } | number | null),
        stdProcessCostPerHr: toNumber(record.std_process_cost_per_hr as { toNumber: () => number } | number | null),
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, _code) => ({
      name: values.name,
      branch_id: values.branchId ? BigInt(values.branchId) : null,
      type: values.type || null,
      capacity_kg_per_hr: values.capacityKgPerHr,
      normal_yield_pct: values.normalYieldPct,
      std_process_cost_per_hr: values.stdProcessCostPerHr,
      active: values.active,
    }),
    normalizeValues: async (values) => {
      if (!values.branchId) return values
      const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
      if (!branch) throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
      return { ...values, branchId: String(branch.id) }
    },
  },
  productionLines: {
    delegate: () => prisma.production_lines as Delegate,
    prefix: 'PL',
    orderBy: [{ name: 'asc' }],
    include: { branches: true },
    coerceLookupValue: (value) => {
      const parsed = parseInternalBigIntId(value)
      if (parsed === null) throw new Error('รหัสสายการผลิตไม่ถูกต้อง')
      return parsed
    },
    map: (row) => {
      const record = asRecord(row)
      const branch = record.branches as Record<string, unknown> | null | undefined
      return {
        id: String(record.id),
        code: null,
        name: record.name,
        branchId: (branch?.code as string | null | undefined) ?? null,
        branchName: branch?.name ?? null,
        responsiblePerson: record.responsible_person,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, _code) => ({
      name: values.name,
      branch_id: values.branchId ? BigInt(values.branchId) : null,
      responsible_person: values.responsiblePerson || null,
      active: values.active,
    }),
    normalizeValues: async (values) => {
      if (!values.branchId) return values
      const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
      if (!branch) throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
      return { ...values, branchId: String(branch.id) }
    },
  },
  productionOutputCategories: {
    delegate: () => prisma.production_output_categories as Delegate,
    prefix: 'POC',
    orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
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
    data: (values, _id, code) => ({
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
    orderBy: [{ code: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
        code: record.code,
        name: record.name,
        symbol: record.symbol,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, code) => ({
      code,
      name: values.name,
      symbol: values.symbol || null,
      active: values.active,
    }),
  },
  productTypes: {
    delegate: () => prisma.product_types as Delegate,
    prefix: 'PT-',
    orderBy: [{ code: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
        code: record.code,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, code) => ({
      code,
      name: values.name,
      active: values.active,
    }),
  },
  paymentMethods: {
    delegate: () => prisma.payment_methods as Delegate,
    prefix: 'PM-',
    orderBy: [{ code: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
        code: record.code,
        name: record.name,
        type: record.type,
        typeLabel: record.type === 'cash' ? 'เงินสด' : 'ธนาคาร',
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, code) => ({
      code,
      name: values.name,
      type: values.type || 'bank',
      active: values.active,
    }),
  },
  vatSettings: {
    delegate: () => prisma.vat_settings as Delegate,
    prefix: 'VAT-',
    orderBy: [{ active: 'desc' }, { updated_at: 'desc' }, { id: 'asc' }],
    coerceLookupValue: (value) => {
      const parsed = parseInternalBigIntId(value)
      if (parsed === null) throw new Error('รหัส VAT ไม่ถูกต้อง')
      return parsed
    },
    map: (row) => {
      const record = asRecord(row)
      return {
        id: String(record.id),
        code: null,
        name: record.name,
        ratePercent: toNumber(record.rate_percent as { toNumber: () => number } | number | null),
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, _code) => ({
      name: values.name,
      rate_percent: values.ratePercent ?? 7,
      active: values.active,
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
    }),
  },
  whtSettings: {
    delegate: () => prisma.wht_settings as Delegate,
    prefix: 'WHT-',
    orderBy: [{ active: 'desc' }, { updated_at: 'desc' }, { id: 'asc' }],
    coerceLookupValue: (value) => {
      const parsed = parseInternalBigIntId(value)
      if (parsed === null) throw new Error('รหัส WHT ไม่ถูกต้อง')
      return parsed
    },
    map: (row) => {
      const record = asRecord(row)
      return {
        id: String(record.id),
        code: null,
        name: record.name,
        ratePercent: toNumber(record.rate_percent as { toNumber: () => number } | number | null),
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, _code) => ({
      name: values.name,
      rate_percent: values.ratePercent ?? 3,
      active: values.active,
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
    }),
  },
  remittancePurposes: {
    delegate: () => prisma.overseas_remittance_purposes as Delegate,
    prefix: 'RP-',
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    lookupKey: 'code',
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.code,
        code: record.code,
        name: record.name,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, _id, code) => ({
      code,
      name: values.name,
      active: values.active,
    }),
  },
}

async function nextId(config: SimpleMasterConfig) {
  if (config.nextId) return config.nextId()

  if (config.lookupKey === 'code') {
    const last = await config.delegate().findFirst({ orderBy: { code: 'desc' }, select: { code: true } })
    return nextSequentialCode(String(asRecord(last)?.code ?? ''), config.prefix, 3)
  }

  const last = await config.delegate().findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  return nextSequentialCode(String(asRecord(last)?.id ?? ''), config.prefix, 3)
}

export async function listSimpleMasterData(kind: SimpleMasterKind) {
  await requireSimpleMasterPermission(kind, 'view')

  const config = configs[kind]
  const rows = await config.delegate().findMany({ orderBy: config.orderBy, include: config.include })
  return masterDataListJson(rows.map(config.map))
}

export async function saveSimpleMasterData(request: Request, kind: SimpleMasterKind) {
  await requireSimpleMasterPermission(kind, 'manage')

  const config = configs[kind]
  const rawValues = validateSimpleMasterValues(kind, parseMasterDataForm(await request.json()))
  const values = config.normalizeValues ? await config.normalizeValues(rawValues) : rawValues
  if (kind === 'machines' && values.type) {
    const machineType = await prisma.production_machine_types.findFirst({ where: { active: true, name: values.type } })
    if (!machineType) throw new Error('ประเภทเครื่องจักรที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
  const lookupKey = config.lookupKey ?? 'id'
  const nextValue = lookupKey === 'code'
    ? (values.code || values.id || await nextId(config))
    : null
  const id = lookupKey === 'code'
    ? (values.id || values.code || nextValue || '')
    : (values.id || '')
  const code = lookupKey === 'code'
    ? (values.code || nextValue || id)
    : (values.code || '')
  const data = config.data(values, id, code)
  const coerceLookupValue = config.coerceLookupValue ?? ((value: string) => value)

  const row = lookupKey === 'code'
    ? await config.delegate().upsert({
      where: { code },
      create: data,
      update: data,
      include: config.include,
    })
    : values.id
      ? await config.delegate().update({
        where: { id: coerceLookupValue(values.id) },
        data,
        include: config.include,
      })
      : await config.delegate().create({
        data,
        include: config.include,
      })
  return masterDataJson(config.map(row))
}

export async function patchSimpleMasterData(request: Request, kind: SimpleMasterKind, id: string) {
  await requireSimpleMasterPermission(kind, 'manage')

  const config = configs[kind]
  const values = updateMasterDataStatusSchema.parse(await request.json())
  const lookupKey = config.lookupKey ?? 'id'
  const lookupValue = lookupKey === 'code'
    ? id
    : (config.coerceLookupValue ? config.coerceLookupValue(id) : id)
  const row = await config.delegate().update({
    where: { [lookupKey]: lookupValue },
    data: { active: values.active },
    include: config.include,
  })
  return masterDataJson(config.map(row))
}
