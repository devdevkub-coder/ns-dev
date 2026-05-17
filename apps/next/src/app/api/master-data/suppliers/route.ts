import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, normalizeCode, parseMasterDataForm, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

type SupplierRow = Awaited<ReturnType<typeof prisma.suppliers.findMany>>[number] & {
  branches?: { name: string } | null
}

function mapSupplier(row: SupplierRow) {
  return {
    id: row.id,
    code: row.code ?? row.id,
    name: row.name,
    active: row.active ?? true,
    type: row.type,
    taxId: row.tax_id,
    phone: row.phone,
    email: row.email,
    contact: row.contact ?? row.sales_rep,
    address: row.address,
    bankName: row.bank_name,
    accountNo: row.bank_account,
    bankAccount: row.bank_account_name,
    creditTerm: row.credit_term,
    creditLimit: toNumber(row.credit_limit),
    branchId: row.branch_id,
    branchName: row.branches?.name ?? row.branch_id,
    note: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

async function getNextCode() {
  const last = await prisma.suppliers.findFirst({ where: { code: { startsWith: 'SUP' } }, orderBy: { code: 'desc' }, select: { code: true } })
  return nextSequentialCode(last?.code, 'SUP')
}

export async function GET() {
  try {
    const rows = await prisma.suppliers.findMany({ include: { branches: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }] })
    return masterDataListJson(rows.map(mapSupplier))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลผู้ขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || await getNextCode())
    const row = await prisma.suppliers.upsert({
      where: { id: values.id || code },
      create: {
        id: values.id || code,
        code,
        name: values.name,
        type: values.type || null,
        tax_id: values.taxId || null,
        phone: values.phone || null,
        email: values.email || null,
        contact: values.contact || null,
        address: values.address || null,
        bank_name: values.bankName || null,
        bank_account: values.accountNo || null,
        bank_account_name: values.bankAccount || null,
        credit_term: values.creditTerm,
        credit_limit: values.creditLimit,
        branch_id: values.branchId || null,
        notes: values.note || null,
        active: values.active,
      },
      update: {
        code,
        name: values.name,
        type: values.type || null,
        tax_id: values.taxId || null,
        phone: values.phone || null,
        email: values.email || null,
        contact: values.contact || null,
        address: values.address || null,
        bank_name: values.bankName || null,
        bank_account: values.accountNo || null,
        bank_account_name: values.bankAccount || null,
        credit_term: values.creditTerm,
        credit_limit: values.creditLimit,
        branch_id: values.branchId || null,
        notes: values.note || null,
        active: values.active,
      },
      include: { branches: true },
    })
    return masterDataJson(mapSupplier(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลผู้ขายไม่ได้')
  }
}
