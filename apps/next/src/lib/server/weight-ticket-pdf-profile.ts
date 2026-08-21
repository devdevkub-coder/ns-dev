import { type CompanyProfilePrintValues } from '@/lib/company-profile'
import { prisma } from '@/lib/server/prisma'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/reference-master-cache'

export async function loadWeightTicketCompanyPrintProfile(branchId: string): Promise<CompanyProfilePrintValues | null> {
  const branch = await findActiveBranchReferenceByCodeOrId(branchId)
  if (!branch?.id) return null
  const profile = await prisma.company_profiles.findFirst({
    where: { branch_id: branch.id },
  })
  if (!profile) return null
  return {
    address: profile.address,
    bankInfo: profile.bank_info,
    branchCode: profile.branch_code ?? '00000',
    email: profile.email,
    fax: profile.fax,
    footerNote: profile.footer_note,
    logoUrl: profile.logo_url,
    name: profile.name,
    nameEn: profile.name_en,
    phone: profile.phone,
    taxId: profile.tax_id,
    website: profile.website,
  }
}
