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
  jpeg: vi.fn(),
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

import { processWeightTicketDownloadAsset, processWeightTicketPrintAsset, processWeightTicketThumbnailAsset } from './weight-ticket-thumbnail-jobs'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveConfig.mockResolvedValue({
    lockTimeoutSeconds: 300,
    maxAttempts: 3,
    drainBatchSize: 20,
    maxDimension: 960,
    printMaxDimension: 400,
    maxSourcePixels: 40_000_000,
    previewPollSeconds: 2,
    retryDelaySeconds: 30,
    webpQuality: 90,
    printJpegQuality: 90,
    downloadMaxDimension: 1600,
    downloadJpegQuality: 100,
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
    print_attempt_count: 1,
    print_status: 'queued',
    print_storage_key: 'attachments/pending/evidence.print.jpg',
    download_attempt_count: 1,
    download_status: 'queued',
    download_storage_key: 'attachments/pending/evidence.download.jpg',
    thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
  })
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })
  mocks.metadata.mockResolvedValue({ height: 3000, width: 4000 })
  mocks.resize.mockReturnThis()
  mocks.rotate.mockReturnThis()
  mocks.webp.mockReturnThis()
  mocks.jpeg.mockReturnThis()
  mocks.toBuffer.mockResolvedValue({ data: Buffer.from([7, 8, 9]), info: { height: 720, width: 960 } })
  mocks.sharp.mockReturnValue({
    metadata: mocks.metadata,
    resize: mocks.resize,
    rotate: mocks.rotate,
    toBuffer: mocks.toBuffer,
    jpeg: mocks.jpeg,
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
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        last_error: null,
        thumbnail_height: 720,
        thumbnail_status: 'ready',
        thumbnail_width: 960,
      }),
      where: { id: 41n, locked_by: expect.any(String) },
    }))
  })

  it('rejects oversized decoded dimensions before resizing', async () => {
    mocks.metadata.mockResolvedValue({ height: 10_000, width: 10_000 })

    const result = await processWeightTicketThumbnailAsset(41n)

    expect(result.status).toBe('queued')
    expect(mocks.resize).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        last_error: expect.stringContaining('ความละเอียดสูงเกิน'),
        thumbnail_status: 'queued',
      }),
      where: { id: 41n, locked_by: expect.any(String) },
    }))
  })

  it('creates a 400px print derivative for both portrait and landscape without touching original storage', async () => {
    mocks.toBuffer.mockResolvedValue({ data: Buffer.from([7, 8, 9]), info: { height: 300, width: 400 } })
    const result = await processWeightTicketPrintAsset(41n)

    expect(result).toEqual({ status: 'ready' })
    expect(mocks.resize).toHaveBeenCalledWith({
      fit: 'inside',
      height: 400,
      kernel: 'lanczos3',
      withoutEnlargement: true,
      width: 400,
    })
    expect(mocks.jpeg).toHaveBeenCalledWith({ mozjpeg: true, quality: 90 })
    expect(mocks.upload).toHaveBeenCalledWith(
      'attachments/pending/evidence.print.jpg',
      Buffer.from([7, 8, 9]),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    )
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalledWith(
      'attachments/pending/evidence.jpg',
      expect.anything(),
      expect.anything(),
    )
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        print_height: 300,
        print_status: 'ready',
        print_width: 400,
      }),
      where: { id: 41n, print_locked_by: expect.any(String) },
    }))

    vi.clearAllMocks()
    mocks.resolveConfig.mockResolvedValue({
      lockTimeoutSeconds: 300,
      maxAttempts: 3,
      drainBatchSize: 20,
      maxDimension: 960,
      printMaxDimension: 400,
      maxSourcePixels: 40_000_000,
      previewPollSeconds: 2,
      retryDelaySeconds: 30,
      webpQuality: 90,
      printJpegQuality: 90,
      previewTtlSeconds: 3600,
      orphanRetentionSeconds: 86400,
    })
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.findUnique.mockResolvedValue({
      attempt_count: 1,
      bucket: 'weight-ticket-images',
      file_name: 'evidence.jpg',
      id: 41n,
      original_storage_key: 'attachments/pending/evidence.jpg',
      print_attempt_count: 1,
      print_status: 'queued',
      print_storage_key: 'attachments/pending/evidence.print.jpg',
      thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
    })
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })
    mocks.metadata.mockResolvedValue({ height: 4000, width: 3000 })
    mocks.resize.mockReturnThis()
    mocks.rotate.mockReturnThis()
    mocks.webp.mockReturnThis()
    mocks.jpeg.mockReturnThis()
    mocks.toBuffer.mockResolvedValue({ data: Buffer.from([7, 8, 9]), info: { height: 400, width: 300 } })
    mocks.sharp.mockReturnValue({
      metadata: mocks.metadata,
      resize: mocks.resize,
      rotate: mocks.rotate,
      toBuffer: mocks.toBuffer,
      jpeg: mocks.jpeg,
      webp: mocks.webp,
    })
    mocks.upload.mockResolvedValue({ error: null })

    await expect(processWeightTicketPrintAsset(41n)).resolves.toEqual({ status: 'ready' })
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ print_height: 400, print_width: 300 }),
    }))
  })

  it('claims print derivatives independently while the thumbnail worker owns its lease', async () => {
    mocks.toBuffer.mockResolvedValue({ data: Buffer.from([7, 8, 9]), info: { height: 300, width: 400 } })
    mocks.findUnique.mockResolvedValue({
      attempt_count: 1,
      bucket: 'weight-ticket-images',
      file_name: 'evidence.jpg',
      id: 41n,
      locked_by: 'thumbnail-worker',
      original_storage_key: 'attachments/pending/evidence.jpg',
      print_attempt_count: 1,
      print_status: 'queued',
      print_storage_key: 'attachments/pending/evidence.print.jpg',
      thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
    })

    await expect(processWeightTicketPrintAsset(41n)).resolves.toEqual({ status: 'ready' })

    const claim = mocks.updateMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined
    expect(claim?.where).toEqual(expect.objectContaining({ id: 41n }))
    expect(claim?.where?.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ print_status: 'queued' }),
    ]))
    expect(claim?.where).not.toHaveProperty('locked_by')
  })

  it('reconciles an existing immutable print object when the ledger is still queued', async () => {
    mocks.toBuffer.mockResolvedValue({ data: Buffer.from([7, 8, 9]), info: { height: 300, width: 400 } })
    mocks.upload.mockResolvedValueOnce({ error: { message: 'The object already exists' } })
    mocks.download
      .mockResolvedValueOnce({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })
      .mockResolvedValueOnce({ data: new Blob([new Uint8Array([7, 8, 9])]), error: null })
    mocks.metadata
      .mockResolvedValueOnce({ height: 3000, width: 4000 })
      .mockResolvedValueOnce({ format: 'jpeg', height: 300, width: 400 })

    await expect(processWeightTicketPrintAsset(41n)).resolves.toEqual({ status: 'ready' })
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ print_height: 300, print_status: 'ready', print_width: 400 }),
    }))
  })

  it('does not trust an existing print object whose bytes differ from the generated derivative', async () => {
    mocks.toBuffer.mockResolvedValue({ data: Buffer.from([7, 8, 9]), info: { height: 300, width: 400 } })
    mocks.upload.mockResolvedValueOnce({ error: { message: 'The object already exists' } })
    mocks.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })
      .mockResolvedValueOnce({ data: new Blob([new Uint8Array([4, 5, 6])]), error: null })
    mocks.metadata.mockResolvedValueOnce({ height: 3000, width: 4000 })

    await expect(processWeightTicketPrintAsset(41n)).resolves.toEqual({ status: 'queued' })
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        print_last_error: expect.stringContaining('ไม่ตรงกับ derivative'),
        print_status: 'queued',
      }),
      where: { id: 41n, print_locked_by: expect.any(String) },
    }))
    expect(mocks.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ print_status: 'ready' }),
    }))
  })

  it('does not overwrite the thumbnail ledger after its lease is reclaimed', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    await expect(processWeightTicketThumbnailAsset(41n)).resolves.toEqual({ status: 'skipped' })
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 41n, locked_by: expect.any(String) },
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

  it('selects queued print derivatives within bucket and ticket scope', async () => {
    const { selectWeightTicketPrintJobs } = await import('./weight-ticket-thumbnail-jobs')
    mocks.findMany.mockResolvedValue([{ id: 41n }])

    await expect(selectWeightTicketPrintJobs({
      attachedTicketId: 77n,
      bucket: 'weight-ticket-images',
    })).resolves.toEqual([{ id: 41n }])
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        attached_ticket_id: 77n,
        bucket: 'weight-ticket-images',
        OR: expect.arrayContaining([
          expect.objectContaining({ print_status: 'queued' }),
          expect.objectContaining({ print_status: 'processing' }),
        ]),
      }),
    }))
  })

  it('does not start print processing while cleanup owns both derivative leases', async () => {
    const { cleanupWeightTicketImageAssets } = await import('./weight-ticket-thumbnail-jobs')
    mocks.findMany.mockResolvedValueOnce([{
      bucket: 'weight-ticket-images',
      id: 94n,
      original_storage_key: 'attachments/pending/cleanup-first.jpg',
      print_storage_key: 'attachments/pending/cleanup-first.print.jpg',
      thumbnail_storage_key: 'attachments/pending/cleanup-first.thumb.webp',
    }])
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    await cleanupWeightTicketImageAssets()
    await expect(processWeightTicketPrintAsset(94n)).resolves.toEqual({ status: 'skipped' })
    const cleanupClaim = mocks.updateMany.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined
    const printClaim = mocks.updateMany.mock.calls[1]?.[0] as { where?: Record<string, unknown> } | undefined
    expect(cleanupClaim?.data).toEqual(expect.objectContaining({
      locked_by: expect.any(String),
      print_locked_by: expect.any(String),
    }))
    expect(printClaim?.where).toEqual(expect.objectContaining({ id: 94n }))
    expect(printClaim?.where).not.toHaveProperty('locked_by')
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('cleans only expired unattached assets and keeps the ledger when Storage deletion fails', async () => {
    const { cleanupWeightTicketImageAssets } = await import('./weight-ticket-thumbnail-jobs')
    mocks.findMany.mockResolvedValueOnce([{
      bucket: 'weight-ticket-images',
      id: 91n,
      original_storage_key: 'attachments/pending/old.jpg',
      print_storage_key: 'attachments/pending/old.print.jpg',
      download_storage_key: 'attachments/pending/old.download.jpg',
      thumbnail_storage_key: 'attachments/pending/old.thumb.webp',
    }])

    await expect(cleanupWeightTicketImageAssets()).resolves.toEqual(expect.objectContaining({ attempted: 1 }))
    expect(mocks.remove).toHaveBeenCalledWith([
      'attachments/pending/old.jpg',
      'attachments/pending/old.thumb.webp',
      'attachments/pending/old.print.jpg',
      'attachments/pending/old.download.jpg',
    ])
    expect(mocks.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 91n }) }))

    mocks.findMany.mockResolvedValueOnce([{
      bucket: 'weight-ticket-images',
      id: 92n,
      original_storage_key: 'attachments/pending/fail.jpg',
      print_storage_key: 'attachments/pending/fail.print.jpg',
      thumbnail_storage_key: 'attachments/pending/fail.thumb.webp',
    }])
    mocks.remove.mockResolvedValueOnce({ error: { message: 'storage unavailable' } })
    await cleanupWeightTicketImageAssets()
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ last_error: expect.stringContaining('storage unavailable') }) }))
  })

  it('does not claim an orphan when a print worker acquires its lease after candidate selection', async () => {
    const { cleanupWeightTicketImageAssets } = await import('./weight-ticket-thumbnail-jobs')
    mocks.findMany.mockResolvedValueOnce([{
      bucket: 'weight-ticket-images',
      id: 93n,
      original_storage_key: 'attachments/pending/race.jpg',
      print_storage_key: 'attachments/pending/race.print.jpg',
      thumbnail_storage_key: 'attachments/pending/race.thumb.webp',
    }])
    mocks.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(cleanupWeightTicketImageAssets()).resolves.toEqual({
      attempted: 1,
      results: [{ id: 93n, status: 'skipped' }],
    })
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { attached_ticket_id: null, id: 93n, locked_by: null, print_locked_by: null, download_locked_by: null },
    }))
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
})

describe('WTI/WTO download derivative worker', () => {
  it('creates a bounded 1600px JPEG without changing the original object', async () => {
    const result = await processWeightTicketDownloadAsset(41n)

    expect(result).toEqual({ status: 'ready' })
    expect(mocks.resize).toHaveBeenCalledWith({
      fit: 'inside',
      height: 1600,
      kernel: 'lanczos3',
      withoutEnlargement: true,
      width: 1600,
    })
    expect(mocks.jpeg).toHaveBeenCalledWith({ mozjpeg: true, quality: 100 })
    expect(mocks.upload).toHaveBeenCalledWith(
      'attachments/pending/evidence.download.jpg',
      Buffer.from([7, 8, 9]),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    )
    expect(mocks.remove).not.toHaveBeenCalledWith(['attachments/pending/evidence.jpg'])
  })
})
