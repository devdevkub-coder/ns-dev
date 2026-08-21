import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  attachWeightTicketImagePrintUrls: vi.fn(),
  branchScopeIds: vi.fn(),
  findScopedWeightTicket: vi.fn(),
  generateWeightTicketPdfBuffer: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getWeightTicketUsageCounts: vi.fn(),
  loadWeightTicketCompanyPrintProfile: vi.fn(),
  mapWeightTicketRow: vi.fn(),
  requirePermission: vi.fn(),
  resolveWeightTicketImageBucket: vi.fn(),
  drainWeightTicketImageJobs: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: mocks.after,
}))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error { status = 403 },
  authContextErrorResponse: vi.fn((error: { message: string; status: number }) => Response.json({ error: error.message }, { status: error.status })),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/server/weight-tickets', () => ({
  branchScopeIds: mocks.branchScopeIds,
  findScopedWeightTicket: mocks.findScopedWeightTicket,
  getWeightTicketUsageCounts: mocks.getWeightTicketUsageCounts,
  mapWeightTicketRow: mocks.mapWeightTicketRow,
}))
vi.mock('@/lib/server/weight-ticket-storage', () => ({
  WeightTicketPrintReadinessError: class WeightTicketPrintReadinessError extends Error {
    code = 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY'
    status = 409
  },
  attachWeightTicketImagePrintUrls: mocks.attachWeightTicketImagePrintUrls,
  resolveWeightTicketImageBucket: mocks.resolveWeightTicketImageBucket,
}))
vi.mock('@/lib/server/weight-ticket-pdf-profile', () => ({ loadWeightTicketCompanyPrintProfile: mocks.loadWeightTicketCompanyPrintProfile }))
vi.mock('@/lib/server/weight-ticket-thumbnail-jobs', () => ({ drainWeightTicketImageJobs: mocks.drainWeightTicketImageJobs }))
vi.mock('@/lib/server/pdf/weight-ticket-pdf', () => ({ generateWeightTicketPdfBuffer: mocks.generateWeightTicketPdfBuffer }))
vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status: number) => Response.json({ error: message }, { status })),
}))

import { GET } from './route'

const auth = { appUser: null, authUser: { email: 'tester@example.com' }, isAdmin: false, permissionCodes: new Set(['daily.weight_tickets.view']), roles: [] }
const mappedTicket = { branchId: '01', documentNo: 'WTI012608-0383', status: 'received', type: 'WTI' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(auth)
  mocks.branchScopeIds.mockReturnValue(['01'])
  mocks.findScopedWeightTicket.mockResolvedValue({ id: 125n })
  mocks.getWeightTicketUsageCounts.mockResolvedValue({})
  mocks.mapWeightTicketRow.mockReturnValue(mappedTicket)
  mocks.loadWeightTicketCompanyPrintProfile.mockResolvedValue({ name: 'NS', branchCode: '01' })
  mocks.resolveWeightTicketImageBucket.mockResolvedValue('weight-ticket-images')
  mocks.after.mockImplementation((callback: () => Promise<unknown>) => void callback())
  mocks.attachWeightTicketImagePrintUrls.mockImplementation(async (value) => value)
  mocks.generateWeightTicketPdfBuffer.mockResolvedValue(Buffer.from('%PDF-test'))
})

describe('WTI/WTO direct PDF route boundary', () => {
  it('returns a private attachment PDF within the caller branch scope', async () => {
    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0383/pdf'), { params: Promise.resolve({ id: 'WTI012608-0383' }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('WTI012608-0383.pdf')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.findScopedWeightTicket).toHaveBeenCalledWith('WTI012608-0383', ['01'])
    expect(mocks.drainWeightTicketImageJobs).toHaveBeenCalledWith({
      attachedTicketId: 125n,
      bucket: 'weight-ticket-images',
    })
  })

  it('rejects cancelled tickets even when the caller has view permission', async () => {
    mocks.mapWeightTicketRow.mockReturnValue({ ...mappedTicket, status: 'cancelled' })

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0383/pdf'), { params: Promise.resolve({ id: 'WTI012608-0383' }) })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'NOT_PRINTABLE' })
    expect(mocks.generateWeightTicketPdfBuffer).not.toHaveBeenCalled()
  })

  it('fails closed when the branch print profile is missing', async () => {
    mocks.loadWeightTicketCompanyPrintProfile.mockResolvedValue(null)

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0383/pdf'), { params: Promise.resolve({ id: 'WTI012608-0383' }) })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'PRINT_PROFILE_NOT_READY' })
  })
})
