import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findActiveBranchReferenceByCodeOrId: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('@/lib/server/reference-master-cache', () => ({ findActiveBranchReferenceByCodeOrId: mocks.findActiveBranchReferenceByCodeOrId }))
vi.mock('@/lib/server/prisma', () => ({ prisma: { company_profiles: { findFirst: mocks.findFirst } } }))

import { loadWeightTicketCompanyPrintProfile } from './weight-ticket-pdf-profile'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue({ id: 7n, code: '01' })
  mocks.findFirst.mockResolvedValue({
    address: 'Address', bank_info: null, branch_code: '01', email: null, fax: null, footer_note: null,
    logo_url: null, name: 'NS', name_en: null, phone: null, tax_id: null, website: null,
  })
})

describe('weight ticket company print profile', () => {
  it('loads only the selected branch profile', async () => {
    await loadWeightTicketCompanyPrintProfile('01')

    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { branch_id: 7n } })
  })

  it('fails closed when the branch reference cannot be resolved', async () => {
    mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue(null)

    await expect(loadWeightTicketCompanyPrintProfile('missing')).resolves.toBeNull()
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })
})
