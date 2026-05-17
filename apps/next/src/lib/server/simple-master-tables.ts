import { prisma } from '@/lib/server/prisma'
import {
  masterDataJson,
  masterDataListJson,
  nextSequentialCode,
  parseMasterDataForm,
  toIso,
  toNumber,
  updateMasterDataStatusSchema,
} from '@/lib/server/master-data'

type SimpleMasterKind = 'directors' | 'machines' | 'productionLines' | 'paymentMethods' | 'remittancePurposes'

type Delegate = {
  findMany: (args?: unknown) => Promise<unknown[]>
  findFirst: (args?: unknown) => Promise<unknown | null>
  upsert: (args: unknown) => Promise<unknown>
  update: (args: unknown) => Promise<unknown>
}

type SimpleMasterConfig = {
  delegate: Delegate
  prefix: string
  orderBy: unknown
  include?: unknown
  map: (row: unknown) => Record<string, unknown>
  data: (values: ReturnType<typeof parseMasterDataForm>, id: string, code: string) => Record<string, unknown>
}

const asRecord = (row: unknown) => row as Record<string, unknown>

const configs: Record<SimpleMasterKind, SimpleMasterConfig> = {
  directors: {
    delegate: prisma.director_employees as Delegate,
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
        bankAccount: record.bank_account,
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
      bank_account: values.bankAccount || null,
      active: values.active,
    }),
  },
  machines: {
    delegate: prisma.production_machines as Delegate,
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
        maintenanceStatus: record.maintenance_status,
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
      maintenance_status: values.maintenanceStatus || null,
      active: values.active,
    }),
  },
  productionLines: {
    delegate: prisma.production_lines as Delegate,
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
  paymentMethods: {
    delegate: prisma.payment_methods as Delegate,
    prefix: 'PM-',
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: record.code,
        name: record.name,
        type: record.type,
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
      active: values.active,
    }),
  },
  remittancePurposes: {
    delegate: prisma.overseas_remittance_purposes as Delegate,
    prefix: 'RP-',
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    map: (row) => {
      const record = asRecord(row)
      return {
        id: record.id,
        code: record.code,
        name: record.name,
        requiredDoc: record.required_doc,
        active: record.active,
        createdAt: toIso(record.created_at as Date | null),
        updatedAt: toIso(record.updated_at as Date | null),
      }
    },
    data: (values, id, code) => ({
      id,
      code,
      name: values.name,
      required_doc: values.requiredDoc || null,
      active: values.active,
    }),
  },
}

async function nextId(config: SimpleMasterConfig) {
  const last = await config.delegate.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  return nextSequentialCode(String(asRecord(last)?.id ?? ''), config.prefix, 3)
}

export async function listSimpleMasterData(kind: SimpleMasterKind) {
  const config = configs[kind]
  const rows = await config.delegate.findMany({ orderBy: config.orderBy, include: config.include })
  return masterDataListJson(rows.map(config.map))
}

export async function saveSimpleMasterData(request: Request, kind: SimpleMasterKind) {
  const config = configs[kind]
  const values = parseMasterDataForm(await request.json())
  const id = values.id || values.code || await nextId(config)
  const code = values.code || id
  const data = config.data(values, id, code)
  const row = await config.delegate.upsert({ where: { id }, create: data, update: data, include: config.include })
  return masterDataJson(config.map(row))
}

export async function patchSimpleMasterData(request: Request, kind: SimpleMasterKind, id: string) {
  const config = configs[kind]
  const values = updateMasterDataStatusSchema.parse(await request.json())
  const row = await config.delegate.update({ where: { id }, data: { active: values.active }, include: config.include })
  return masterDataJson(config.map(row))
}
