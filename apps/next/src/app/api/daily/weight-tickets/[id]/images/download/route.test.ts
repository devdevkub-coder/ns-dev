import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  createArtifact: vi.fn(),
  deleteArtifacts: vi.fn(),
  download: vi.fn(),
  findMany: vi.fn(),
  findArtifacts: vi.fn(),
  findScopedWeightTicket: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  requirePermission: vi.fn(),
  resolveBucket: vi.fn(),
  resolveConfig: vi.fn(),
  upload: vi.fn(),
  drain: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error { status = 403 },
  authContextErrorResponse: vi.fn((error: { message: string; status: number }) => Response.json({ error: error.message }, { status: error.status })),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: vi.fn((_error: unknown, message: string, status: number) => Response.json({ error: message }, { status })) }))
vi.mock('@/lib/server/auth-response', () => ({ withAuthNoStore: (response: Response) => { response.headers.set('Cache-Control', 'private, no-store'); return response } }))
vi.mock('@/lib/server/prisma', () => ({ prisma: { weight_ticket_image_assets: { findMany: mocks.findMany }, weight_ticket_image_download_artifacts: { create: mocks.createArtifact, deleteMany: mocks.deleteArtifacts, findMany: mocks.findArtifacts } } }))
vi.mock('@/lib/server/supabase-admin', () => ({ getSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl, download: mocks.download, upload: mocks.upload }) } }) }))
vi.mock('@/lib/server/weight-ticket-storage', () => ({ assertWeightTicketImageStorageKey: (value: string) => value, resolveWeightTicketImageBucket: mocks.resolveBucket, resolveWeightTicketImageProcessingConfig: mocks.resolveConfig }))
vi.mock('@/lib/server/weight-ticket-thumbnail-jobs', () => ({ drainWeightTicketDownloadJobs: mocks.drain }))
vi.mock('@/lib/server/weight-tickets', () => ({ branchScopeIds: vi.fn(() => ['01']), findScopedWeightTicket: mocks.findScopedWeightTicket }))

import { GET } from './route'

const reference = JSON.stringify({ bucket: 'weight-ticket-images', fileName: 'evidence.png', storageKey: 'attachments/pending/evidence.png' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ authUser: { email: 'tester@example.com' }, permissionCodes: new Set(['daily.weight_tickets.view']) })
  mocks.resolveBucket.mockResolvedValue('weight-ticket-images')
  mocks.resolveConfig.mockResolvedValue({ drainBatchSize: 20, previewPollSeconds: 2, previewTtlSeconds: 600 })
  mocks.findScopedWeightTicket.mockResolvedValue({ id: 77n, doc_no: 'WTI012608-0351', vehicle_image_names: [reference], weight_ticket_lines: [] })
  mocks.findArtifacts.mockResolvedValue([])
  mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready' }])
  mocks.createArtifact.mockResolvedValue({ id: 1n })
  mocks.deleteArtifacts.mockResolvedValue({ count: 0 })
  mocks.drain.mockResolvedValueOnce({ attempted: 1, results: [] }).mockResolvedValue({ attempted: 0, results: [] })
  mocks.download.mockResolvedValue({ data: new Blob([Buffer.from('download-derivative')]), error: null })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed.zip' }, error: null })
})

describe('WTI/WTO image download route', () => {
  it('downloads only the ready derivative as a private signed ZIP artifact', async () => {
    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.download).toHaveBeenCalledWith('attachments/pending/evidence.download.jpg')
    expect(mocks.download).not.toHaveBeenCalledWith('attachments/pending/evidence.png')
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringContaining('attachments/downloads/'), expect.any(Uint8Array), expect.objectContaining({ contentType: 'application/zip' }))
    expect(await response.json()).toEqual({ files: [{ fileName: 'WTI012608-0351-images.zip', part: 1, totalParts: 1, url: 'https://storage.example/signed.zip' }], split: false })
  })

  it('downloads a duplicated image reference only once', async () => {
    const duplicateReference = JSON.stringify({ bucket: 'weight-ticket-images', fileName: 'evidence-copy.png', storageKey: 'attachments/pending/evidence.png' })
    mocks.findScopedWeightTicket.mockResolvedValue({ id: 77n, doc_no: 'WTI012608-0351', vehicle_image_names: [reference, duplicateReference], weight_ticket_lines: [] })

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download', { headers: { 'x-vercel-id': 'test-trace' } }), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the download derivative is not ready', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'queued' }])
    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(500)
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('splits large derivative sets into multiple ZIP artifacts', async () => {
    const secondReference = JSON.stringify({ bucket: 'weight-ticket-images', fileName: 'second.png', storageKey: 'attachments/pending/second.png' })
    mocks.findScopedWeightTicket.mockResolvedValue({ id: 77n, doc_no: 'WTI012608-0351', vehicle_image_names: [reference, secondReference], weight_ticket_lines: [] })
    mocks.findMany.mockResolvedValue([
      { original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready' },
      { original_storage_key: 'attachments/pending/second.png', download_storage_key: 'attachments/pending/second.download.jpg', download_status: 'ready' },
    ])
    mocks.download.mockImplementation(async (key: string) => ({ data: new Blob([Buffer.alloc(30 * 1024 * 1024, key.includes('second') ? 2 : 1)]), error: null }))

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const payload = await response.json() as { files: Array<{ fileName: string }>; split: boolean }

    expect(response.status).toBe(200)
    expect(payload.split).toBe(true)
    expect(payload.files).toHaveLength(2)
    expect(payload.files[0]?.fileName).toContain('part-01')
    expect(payload.files[1]?.fileName).toContain('part-02')
  })

  it('estimates the ZIP part count from derivative metadata without downloading images', async () => {
    const secondReference = JSON.stringify({ fileName: 'second.png', storageKey: 'attachments/pending/second.png', bucket: 'weight-ticket-images' })
    mocks.findScopedWeightTicket.mockResolvedValue({ id: 77n, doc_no: 'WTI012608-0351', vehicle_image_names: [reference, secondReference], weight_ticket_lines: [] })
    mocks.findMany.mockResolvedValue([
      { original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 30n * 1024n * 1024n },
      { original_storage_key: 'attachments/pending/second.png', download_storage_key: 'attachments/pending/second.download.jpg', download_status: 'ready', download_byte_size: 30n * 1024n * 1024n },
    ])

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ partCount: 2, ready: true })
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
