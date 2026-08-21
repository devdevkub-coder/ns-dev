import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  createArtifact: vi.fn(),
  deleteArtifacts: vi.fn(),
  download: vi.fn(),
  findMany: vi.fn(),
  findArtifacts: vi.fn(),
  findArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  findScopedWeightTicket: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  requirePermission: vi.fn(),
  resolveBucket: vi.fn(),
  resolveConfig: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
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
vi.mock('@/lib/server/prisma', () => ({ prisma: { weight_ticket_image_assets: { findMany: mocks.findMany }, weight_ticket_image_download_artifacts: { create: mocks.createArtifact, deleteMany: mocks.deleteArtifacts, findMany: mocks.findArtifacts, findFirst: mocks.findArtifact, update: mocks.updateArtifact } } }))
vi.mock('@/lib/server/supabase-admin', () => ({ getSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl, download: mocks.download, upload: mocks.upload, remove: mocks.remove }) } }) }))
vi.mock('@/lib/server/weight-ticket-storage', () => ({ assertWeightTicketImageStorageKey: (value: string) => value, resolveWeightTicketImageBucket: mocks.resolveBucket, resolveWeightTicketImageProcessingConfig: mocks.resolveConfig }))
vi.mock('@/lib/server/weight-ticket-thumbnail-jobs', () => ({ drainWeightTicketDownloadJobs: mocks.drain }))
vi.mock('@/lib/server/weight-tickets', () => ({ branchScopeIds: vi.fn(() => ['01']), findScopedWeightTicket: mocks.findScopedWeightTicket }))

import { GET } from './route'

const reference = JSON.stringify({ bucket: 'weight-ticket-images', fileName: 'evidence.png', storageKey: 'attachments/pending/evidence.png' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ authUser: { email: 'tester@example.com' }, permissionCodes: new Set(['daily.weight_tickets.view']) })
  mocks.resolveBucket.mockResolvedValue('weight-ticket-images')
  mocks.resolveConfig.mockResolvedValue({ drainBatchSize: 20, previewPollSeconds: 2, previewTtlSeconds: 600, downloadArtifactRetentionSeconds: 86400 })
  mocks.findScopedWeightTicket.mockResolvedValue({ id: 77n, doc_no: 'WTI012608-0351', vehicle_image_names: [reference], weight_ticket_lines: [] })
  mocks.findArtifacts.mockResolvedValue([])
  mocks.findArtifact.mockResolvedValue(null)
  mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
  mocks.createArtifact.mockResolvedValue({ id: 1n })
  mocks.deleteArtifacts.mockResolvedValue({ count: 0 })
  mocks.remove.mockResolvedValue({ error: null })
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
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringContaining('attachments/downloads/'), expect.any(ReadableStream), expect.objectContaining({ contentType: 'application/zip' }))
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
      { original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 30n * 1024n * 1024n },
      { original_storage_key: 'attachments/pending/second.png', download_storage_key: 'attachments/pending/second.download.jpg', download_status: 'ready', download_byte_size: 30n * 1024n * 1024n },
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
    expect(await response.json()).toEqual({ partCount: 2, partitionSignature: expect.stringMatching(/^[a-f0-9]{64}$/), ready: true })
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('reloads derivative metadata after draining jobs before building the ZIP', async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'queued' }])
      .mockResolvedValueOnce([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledTimes(2)
    expect(mocks.download).toHaveBeenCalledWith('attachments/pending/evidence.download.jpg')
  })

  it('builds only the requested ZIP part while preserving the estimated total', async () => {
    const secondReference = JSON.stringify({ fileName: 'second.png', storageKey: 'attachments/pending/second.png', bucket: 'weight-ticket-images' })
    mocks.findScopedWeightTicket.mockResolvedValue({ id: 77n, doc_no: 'WTI012608-0351', vehicle_image_names: [reference, secondReference], weight_ticket_lines: [] })
    mocks.findMany.mockResolvedValue([
      { original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 30n * 1024n * 1024n },
      { original_storage_key: 'attachments/pending/second.png', download_storage_key: 'attachments/pending/second.download.jpg', download_status: 'ready', download_byte_size: 30n * 1024n * 1024n },
    ])

    const estimateResponse = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const estimate = await estimateResponse.json() as { partitionSignature: string }
    const response = await GET(new Request(`https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=2&partitionSignature=${estimate.partitionSignature}`), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const payload = await response.json() as { files: Array<{ fileName: string; part: number; totalParts: number }>; split: boolean }

    expect(response.status).toBe(200)
    expect(payload).toEqual({ files: [{ fileName: 'WTI012608-0351-images-part-02.zip', part: 2, totalParts: 2, url: 'https://storage.example/signed.zip' }], split: true })
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(mocks.download).toHaveBeenCalledWith('attachments/pending/second.download.jpg')
  })

  it('rejects a requested part when the partition signature is stale', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=1&partitionSignature=stale'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(500)
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.findArtifact).not.toHaveBeenCalled()
  })

  it('reuses a prepared part without downloading derivatives again', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
    const estimateResponse = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const estimate = await estimateResponse.json() as { partitionSignature: string }
    mocks.findArtifact.mockResolvedValue({ bucket: 'weight-ticket-images', storage_key: `attachments/downloads/77/${estimate.partitionSignature}/WTI012608-0351-images-part-01.zip` })

    const response = await GET(new Request(`https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=1&partitionSignature=${estimate.partitionSignature}`), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ files: [{ fileName: 'WTI012608-0351-images-part-01.zip', part: 1, totalParts: 1, url: 'https://storage.example/signed.zip' }], split: false })
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.updateArtifact).toHaveBeenCalledWith(expect.objectContaining({ where: { storage_key: expect.stringContaining(`attachments/downloads/77/${estimate.partitionSignature}/`) } }))
  })

  it('re-signs a prepared part without draining jobs or rebuilding the ZIP', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
    const estimateResponse = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const estimate = await estimateResponse.json() as { partitionSignature: string }
    mocks.findArtifact.mockResolvedValue({ bucket: 'weight-ticket-images', storage_key: `attachments/downloads/77/${estimate.partitionSignature}/WTI012608-0351-images-part-01.zip` })

    const response = await GET(new Request(`https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=1&partitionSignature=${estimate.partitionSignature}&resign=true`), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(mocks.drain).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.updateArtifact).toHaveBeenCalledTimes(1)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(expect.stringContaining(`attachments/downloads/77/${estimate.partitionSignature}/`), 600)
  })

  it('reuses the artifact when Storage reports a deterministic upload conflict before the ledger row is visible', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
    const estimateResponse = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const estimate = await estimateResponse.json() as { partitionSignature: string }
    const storageKey = `attachments/downloads/77/${estimate.partitionSignature}/WTI012608-0351-images-part-01.zip`
    mocks.upload.mockResolvedValueOnce({ error: { message: 'already exists' } })
    mocks.findArtifact.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ bucket: 'weight-ticket-images', storage_key: storageKey })

    const response = await GET(new Request(`https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=1&partitionSignature=${estimate.partitionSignature}`), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ files: [{ fileName: 'WTI012608-0351-images.zip', part: 1, totalParts: 1, url: 'https://storage.example/signed.zip' }], split: false })
    expect(mocks.createArtifact).not.toHaveBeenCalled()
    expect(mocks.updateArtifact).toHaveBeenCalledWith(expect.objectContaining({ where: { storage_key: storageKey } }))
  })

  it('adopts a deterministic Storage artifact when the concurrent ledger row is not visible yet', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
    const estimateResponse = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const estimate = await estimateResponse.json() as { partitionSignature: string }
    const storageKey = `attachments/downloads/77/${estimate.partitionSignature}/WTI012608-0351-images-part-01.zip`
    mocks.upload.mockResolvedValueOnce({ error: { message: 'already exists' } })
    mocks.findArtifact.mockResolvedValue(null)

    const response = await GET(new Request(`https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=1&partitionSignature=${estimate.partitionSignature}`), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ files: [{ fileName: 'WTI012608-0351-images.zip', part: 1, totalParts: 1, url: 'https://storage.example/signed.zip' }], split: false })
    expect(mocks.createArtifact).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storage_key: storageKey }) }))
    expect(mocks.updateArtifact).toHaveBeenCalledWith(expect.objectContaining({ where: { storage_key: storageKey } }))
  })

  it('waits for a concurrent ledger row before leaving a deterministic conflict unresolved', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
    const estimateResponse = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const estimate = await estimateResponse.json() as { partitionSignature: string }
    const storageKey = `attachments/downloads/77/${estimate.partitionSignature}/WTI012608-0351-images-part-01.zip`
    mocks.upload.mockResolvedValueOnce({ error: { message: 'already exists' } })
    mocks.findArtifact.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ bucket: 'weight-ticket-images', storage_key: storageKey })

    const response = await GET(new Request(`https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=1&partitionSignature=${estimate.partitionSignature}`), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(200)
    expect(mocks.createArtifact).not.toHaveBeenCalled()
    expect(mocks.updateArtifact).toHaveBeenCalledWith(expect.objectContaining({ where: { storage_key: storageKey } }))
  })

  it('does not adopt an artifact for a non-conflict Storage upload error', async () => {
    mocks.findMany.mockResolvedValue([{ original_storage_key: 'attachments/pending/evidence.png', download_storage_key: 'attachments/pending/evidence.download.jpg', download_status: 'ready', download_byte_size: 10n }])
    const estimateResponse = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?estimate=true'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })
    const estimate = await estimateResponse.json() as { partitionSignature: string }
    mocks.upload.mockResolvedValueOnce({ error: { message: 'mime type application/zip is not supported' } })

    const response = await GET(new Request(`https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download?part=1&partitionSignature=${estimate.partitionSignature}`), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(500)
    expect(mocks.createArtifact).not.toHaveBeenCalled()
    expect(mocks.updateArtifact).not.toHaveBeenCalled()
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringContaining('attachments/downloads/')])
  })

  it('fails without creating an artifact when an individual derivative exceeds the raw part limit', async () => {
    mocks.download.mockResolvedValue({ data: new Blob([Buffer.alloc(46 * 1024 * 1024)]), error: null })

    const response = await GET(new Request('https://sit.example/api/daily/weight-tickets/WTI012608-0351/images/download'), { params: Promise.resolve({ id: 'WTI012608-0351' }) })

    expect(response.status).toBe(500)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.createArtifact).not.toHaveBeenCalled()
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringContaining('attachments/downloads/')])
  })
})
