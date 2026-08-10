import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  metadata: vi.fn(),
  remove: vi.fn(),
  resize: vi.fn(),
  resolveConfig: vi.fn(),
  rotate: vi.fn(),
  sharp: vi.fn(),
  toBuffer: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  deleteMany: vi.fn(),
  webp: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('sharp', () => ({ default: mocks.sharp }))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    weight_ticket_image_assets: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}))
vi.mock('@/lib/server/supabase-admin', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({ download: mocks.download, remove: mocks.remove, upload: mocks.upload }),
    },
  }),
}))
vi.mock('@/lib/server/weight-ticket-storage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/server/weight-ticket-storage')>(),
  resolveWeightTicketImageProcessingConfig: mocks.resolveConfig,
}))

import { processWeightTicketThumbnailAsset } from './weight-ticket-thumbnail-jobs'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveConfig.mockResolvedValue({
    lockTimeoutSeconds: 300,
    maxAttempts: 3,
    drainBatchSize: 20,
    maxDimension: 960,
    maxSourcePixels: 40_000_000,
    previewPollSeconds: 2,
    retryDelaySeconds: 30,
    webpQuality: 90,
    previewTtlSeconds: 3600,
    orphanRetentionSeconds: 86400,
  })
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.findMany.mockResolvedValue([])
  mocks.remove.mockResolvedValue({ error: null })
  mocks.deleteMany.mockResolvedValue({ count: 1 })
  mocks.findUnique.mockResolvedValue({
    attempt_count: 1,
    bucket: 'weight-ticket-images',
    file_name: 'evidence.jpg',
    id: 41n,
    original_storage_key: 'attachments/pending/evidence.jpg',
    thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
  })
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })
  mocks.metadata.mockResolvedValue({ height: 3000, width: 4000 })
  mocks.resize.mockReturnThis()
  mocks.rotate.mockReturnThis()
  mocks.webp.mockReturnThis()
  mocks.toBuffer.mockResolvedValue({ data: Buffer.from([7, 8, 9]), info: { height: 720, width: 960 } })
  mocks.sharp.mockReturnValue({
    metadata: mocks.metadata,
    resize: mocks.resize,
    rotate: mocks.rotate,
    toBuffer: mocks.toBuffer,
    webp: mocks.webp,
  })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.update.mockResolvedValue({})
})

describe('WTI/WTO thumbnail background worker', () => {
  it('uses high-quality bounded resizing and marks only that image ready', async () => {
    const result = await processWeightTicketThumbnailAsset(41n)

    expect(result).toEqual({ status: 'ready' })
    expect(mocks.metadata).toHaveBeenCalledTimes(1)
    expect(mocks.rotate).toHaveBeenCalledTimes(1)
    expect(mocks.resize).toHaveBeenCalledWith({
      fit: 'inside',
      height: 960,
      kernel: 'lanczos3',
      withoutEnlargement: true,
      width: 960,
    })
    expect(mocks.webp).toHaveBeenCalledWith({ effort: 5, quality: 90, smartSubsample: true })
    expect(mocks.upload).toHaveBeenCalledWith(
      'attachments/pending/evidence.thumb.webp',
      Buffer.from([7, 8, 9]),
      expect.objectContaining({ contentType: 'image/webp', upsert: false }),
    )
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        last_error: null,
        thumbnail_height: 720,
        thumbnail_status: 'ready',
        thumbnail_width: 960,
      }),
      where: { id: 41n },
    }))
  })

  it('rejects oversized decoded dimensions before resizing', async () => {
    mocks.metadata.mockResolvedValue({ height: 10_000, width: 10_000 })

    const result = await processWeightTicketThumbnailAsset(41n)

    expect(result.status).toBe('queued')
    expect(mocks.resize).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        last_error: expect.stringContaining('ความละเอียดสูงเกิน'),
        thumbnail_status: 'queued',
      }),
      where: { id: 41n },
    }))
  })

  it('allows a stale processing lease to be reclaimed after a worker crash', async () => {
    await processWeightTicketThumbnailAsset(41n)

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ thumbnail_status: 'queued' }),
          expect.objectContaining({ thumbnail_status: 'processing' }),
        ]),
      }),
    }))
  })

  it('selects queued and stale processing jobs within bucket and ticket scope', async () => {
    const { selectWeightTicketThumbnailJobs } = await import('./weight-ticket-thumbnail-jobs')
    mocks.findMany.mockResolvedValue([{ id: 41n }])

    await expect(selectWeightTicketThumbnailJobs({
      attachedTicketId: 77n,
      bucket: 'weight-ticket-images',
    })).resolves.toEqual([{ id: 41n }])
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        attached_ticket_id: 77n,
        bucket: 'weight-ticket-images',
        OR: expect.arrayContaining([
          expect.objectContaining({ thumbnail_status: 'queued' }),
          expect.objectContaining({ thumbnail_status: 'processing' }),
        ]),
      }),
    }))
  })

  it('cleans only expired unattached assets and keeps the ledger when Storage deletion fails', async () => {
    const { cleanupWeightTicketImageAssets } = await import('./weight-ticket-thumbnail-jobs')
    mocks.findMany.mockResolvedValueOnce([{
      bucket: 'weight-ticket-images',
      id: 91n,
      original_storage_key: 'attachments/pending/old.jpg',
      thumbnail_storage_key: 'attachments/pending/old.thumb.webp',
    }])

    await expect(cleanupWeightTicketImageAssets()).resolves.toEqual(expect.objectContaining({ attempted: 1 }))
    expect(mocks.remove).toHaveBeenCalledWith([
      'attachments/pending/old.jpg',
      'attachments/pending/old.thumb.webp',
    ])
    expect(mocks.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 91n }) }))

    mocks.findMany.mockResolvedValueOnce([{
      bucket: 'weight-ticket-images',
      id: 92n,
      original_storage_key: 'attachments/pending/fail.jpg',
      thumbnail_storage_key: 'attachments/pending/fail.thumb.webp',
    }])
    mocks.remove.mockResolvedValueOnce({ error: { message: 'storage unavailable' } })
    await cleanupWeightTicketImageAssets()
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ last_error: expect.stringContaining('storage unavailable') }) }))
  })
})
