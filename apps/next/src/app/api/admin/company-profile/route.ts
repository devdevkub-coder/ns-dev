import { NextResponse } from 'next/server'
import { z } from 'zod'
import { companyProfileSchema, type CompanyProfileFormValues } from '@/lib/company-profile'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { findActiveBranchReferenceByCodeOrId, listActiveBranches } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

const branchIdSchema = z.string().trim().min(1, 'เลือกสาขา')

type BranchRow = {
  address: string | null
  code: string
  id: bigint
  name: string
  phone: string | null
}

type CompanyProfileRow = {
  address: string
  bank_info: string | null
  branch_code: string | null
  branch_id: bigint | null
  email: string | null
  fax: string | null
  footer_note: string | null
  logo_url: string | null
  name: string
  name_en: string | null
  phone: string
  tax_id: string | null
  website: string | null
}

function branchJson(row: BranchRow) {
  return {
    address: row.address,
    code: row.code,
    hasProfile: false,
    id: row.code,
    name: row.name,
    phone: row.phone,
  }
}

function branchListJson(rows: BranchRow[], profileBranchIds: Set<string>) {
  return rows.map((row) => ({
    ...branchJson(row),
    hasProfile: profileBranchIds.has(row.id.toString()),
  }))
}

function rowToProfile(row: CompanyProfileRow): CompanyProfileFormValues {
  return {
    address: row.address,
    bankInfo: row.bank_info,
    branchCode: row.branch_code ?? '00000',
    email: row.email,
    fax: row.fax,
    footerNote: row.footer_note,
    logoUrl: row.logo_url,
    name: row.name,
    nameEn: row.name_en,
    phone: row.phone,
    taxId: row.tax_id,
    website: row.website,
  }
}

function newProfileForBranch(): CompanyProfileFormValues {
  return {
    address: '',
    bankInfo: null,
    branchCode: '00000',
    email: null,
    fax: null,
    footerNote: null,
    logoUrl: null,
    name: '',
    nameEn: null,
    phone: '',
    taxId: null,
    website: null,
  }
}

function profileForBranch(profile: CompanyProfileRow | null) {
  if (profile) return rowToProfile(profile)
  return newProfileForBranch()
}

async function activeBranches() {
  return listActiveBranches()
}

async function findActiveBranch(value: string | null | undefined) {
  return findActiveBranchReferenceByCodeOrId(value)
}

async function profileBranchIdSet() {
  const rows = await prisma.company_profiles.findMany({
    select: { branch_id: true },
    where: { branch_id: { not: null } },
  })
  const branchIds = rows
    .map((row: { branch_id: bigint | null }) => row.branch_id?.toString() ?? null)
    .filter((value: string | null): value is string => value != null)
  return new Set<string>(branchIds)
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const url = new URL(request.url)
    const branches = await activeBranches()
    const requestedBranchId = url.searchParams.get('branchId')
    const branch = await findActiveBranch(requestedBranchId || branches[0]?.code)
    const [profile, profileBranchIds] = await Promise.all([
      branch
        ? prisma.company_profiles.findFirst({
            where: { branch_id: branch.id },
          })
        : Promise.resolve(null),
      profileBranchIdSet(),
    ])

    return NextResponse.json({
      branches: branchListJson(branches, profileBranchIds),
      profile: profileForBranch(profile),
      profileConfigured: Boolean(profile),
      selectedBranchId: branch?.code ?? null,
      selectedBranchName: branch?.name ?? null,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลบริษัทไม่สำเร็จ', 500)
  }
}

export async function PUT(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const body = await request.json()
    const branchId = branchIdSchema.parse(body.branchId)
    const branch = await findActiveBranch(branchId)
    if (!branch) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }

    const values = companyProfileSchema.parse(body)
    const actor = currentActor(context)
    const existing = await prisma.company_profiles.findFirst({
      select: { id: true },
      where: { branch_id: branch.id },
    })
    const data = {
      address: values.address,
      bank_info: values.bankInfo,
      branch_code: values.branchCode,
      branch_id: branch.id,
      email: values.email,
      fax: values.fax,
      footer_note: values.footerNote,
      logo_url: values.logoUrl,
      name: values.name,
      name_en: values.nameEn,
      phone: values.phone,
      tax_id: values.taxId,
      updated_by: actor,
      website: values.website,
    }
    const row = existing
      ? await prisma.company_profiles.update({
          data,
          where: { id: existing.id },
        })
      : await prisma.company_profiles.create({
          data,
        })

    return NextResponse.json({
      branches: branchListJson(await activeBranches(), await profileBranchIdSet()),
      profile: rowToProfile(row),
      profileConfigured: true,
      selectedBranchId: branch.code,
      selectedBranchName: branch.name,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลบริษัทไม่สำเร็จ', 400)
  }
}
