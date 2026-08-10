import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  attachWeightTicketImagePreviewUrls: vi.fn(),
  branchScopeIds: vi.fn(),
  findFirst: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  requirePermission: vi.fn(),
  resolveWeightTicketImageBucket: vi.fn(),
  resolveWeightTicketImageProcessingConfig: vi.fn(),
  drainWeightTicketThumbnailJobs: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: mocks.after,
}))
vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status: number) => Response.json({ error: message }, { status })),
}))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {
    status = 403
  },
  authContextErrorResponse: vi.fn((error: { message: string; status: number }) => Response.json({ error: error.message }, { status: error.status })),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/prisma', () => ({ prisma: { weight_tickets: { findFirst: mocks.findFirst } } }))
vi.mock('@/lib/server/weight-ticket-storage', () => ({
  attachWeightTicketImagePreviewUrls: mocks.attachWeightTicketImagePreviewUrls,
  resolveWeightTicketImageBucket: mocks.resolveWeightTicketImageBucket,
  resolveWeightTicketImageProcessingConfig: mocks.resolveWeightTicketImageProcessingConfig,
}))
vi.mock('@/lib/server/weight-ticket-thumbnail-jobs', () => ({ drainWeightTicketThumbnailJobs: mocks.drainWeightTicketThumbnailJobs }))
vi.mock('@/lib/server/weight-tickets', () => ({ branchScopeIds: mocks.branchScopeIds }))

import { GET } from './route'

const auth = { appUser: null, authUser: { email: 'tester@example.com' }, isAdmin: false, permissionCodes: new Set(['daily.weight_tickets.view']), roles: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(auth)
  mocks.branchScopeIds.mockReturnValue(['01'])
  mocks.findFirst.mockResolvedValue({ vehicle_image_names: [], weight_ticket_lines: [] })
  mocks.resolveWeightTicketImageBucket.mockResolvedValue('weight-ticket-images')
  mocks.resolveWeightTicketImageProcessingConfig.mockResolvedValue({ previewPollSeconds: 2 })
  mocks.attachWeightTicketImagePreviewUrls.mockImplementation(async (value) => value)
  mocks.after.mockImplementation((callback: () => Promise<unknown>) => void callback())
})

describe('WTI/WTO image preview route boundary', () => {
  it('returns private no-store previews only within the caller branch scope', async () => {
    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTO-1/images/preview'), {
      params: Promise.resolve({ id: 'WTO-1' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ doc_no: 'WTO-1', branches: { code: { in: ['01'] } } }) }))
    expect(mocks.attachWeightTicketImagePreviewUrls).toHaveBeenCalledWith(expect.objectContaining({ imageNames: [], lines: [], vehicleImageNames: [] }), 'weight-ticket-images')
  })

  it('fails closed when the caller has no branch scope', async () => {
    mocks.branchScopeIds.mockReturnValue([])

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTO-1/images/preview'), {
      params: Promise.resolve({ id: 'WTO-1' }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  it('drains queued and stale processing images only for the displayed ticket', async () => {
    const reference = JSON.stringify({
      bucket: 'weight-ticket-images',
      fileName: 'evidence.jpg',
      storageKey: 'attachments/pending/evidence.jpg',
      thumbnailStorageKey: 'attachments/pending/evidence.thumb.webp',
      thumbnailStatus: 'queued',
    })
    mocks.findFirst.mockResolvedValue({ id: 77n, vehicle_image_names: [reference], weight_ticket_lines: [] })
    mocks.attachWeightTicketImagePreviewUrls.mockResolvedValue({
      imageNames: [reference],
      lines: [],
      vehicleImageNames: [reference],
    })

    await GET(new Request('https://sit.example/api/daily/weight-tickets/WTO-1/images/preview'), {
      params: Promise.resolve({ id: 'WTO-1' }),
    })

    expect(mocks.drainWeightTicketThumbnailJobs).toHaveBeenCalledWith({
      attachedTicketId: 77n,
      bucket: 'weight-ticket-images',
    })
  })
})
