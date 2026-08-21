import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  createSignedUrls: vi.fn(),
  findAssets: vi.fn(),
  findSettings: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    system_settings: { findMany: mocks.findSettings },
    weight_ticket_image_assets: { findMany: mocks.findAssets },
  },
}))
vi.mock('@/lib/server/supabase-admin', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mocks.createSignedUrl,
        createSignedUrls: mocks.createSignedUrls,
      }),
    },
  }),
}))

import { assertWeightTicketImageAssetOwnership, attachWeightTicketImagePreviewUrls, attachWeightTicketImagePrintUrls, normalizeWeightTicketImageReferences, resolveWeightTicketImageProcessingConfig, resolveWeightTicketImageUploadConfig } from './weight-ticket-storage'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/evidence.jpg?token=short-lived' },
    error: null,
  })
  // The batched API returns one entry per requested path; default mock returns
  // a signed URL for every path so tests see the happy-path cache.
  mocks.createSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}?token=short-lived` })),
    error: null,
  }))
  mocks.findAssets.mockImplementation(async ({ where }: { where: { original_storage_key: { in: string[] } } }) => (
    where.original_storage_key.in.map((storageKey) => ({
      byte_size: 345678n,
      original_storage_key: storageKey,
      print_height: 300,
      print_status: 'ready',
      print_storage_key: storageKey.replace(/\.(jpg|png|webp)$/i, '.print.jpg'),
      print_width: 400,
      thumbnail_status: 'ready',
      thumbnail_storage_key: storageKey.replace(/\.(jpg|png|webp)$/i, '.thumb.webp'),
    }))
  ))
  mocks.findSettings.mockResolvedValue([
    { key: 'WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES', value: '4194304' },
    { key: 'WEIGHT_TICKET_IMAGE_UPLOAD_CONCURRENCY', value: '6' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_MAX_DIMENSION', value: '960' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_WEBP_QUALITY', value: '90' },
    { key: 'WEIGHT_TICKET_PRINT_MAX_DIMENSION', value: '400' },
    { key: 'WEIGHT_TICKET_PRINT_JPEG_QUALITY', value: '90' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_MAX_SOURCE_PIXELS', value: '40000000' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_MAX_ATTEMPTS', value: '3' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_RETRY_DELAY_SECONDS', value: '30' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_LOCK_TIMEOUT_SECONDS', value: '300' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_PREVIEW_POLL_SECONDS', value: '2' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_DRAIN_BATCH_SIZE', value: '20' },
    { key: 'WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS', value: '3600' },
    { key: 'WEIGHT_TICKET_IMAGE_ORPHAN_RETENTION_SECONDS', value: '86400' },
  ])
})

function storedReference(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    bucket: 'weight-ticket-images',
    fileName: 'evidence.jpg',
    storageKey: 'attachments/pending/evidence.jpg',
    thumbnailStorageKey: 'attachments/pending/evidence.thumb.webp',
    ...overrides,
  })
}

describe('WTI/WTO private image reference contract', () => {
  it('accepts the Vercel-safe 4 MB upload boundary', async () => {
    mocks.findSettings.mockImplementation(async () => [
      { key: 'WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES', value: '4194304' },
      { key: 'WEIGHT_TICKET_IMAGE_UPLOAD_CONCURRENCY', value: '6' },
    ])

    await expect(resolveWeightTicketImageUploadConfig()).resolves.toEqual({
      maxUploadBytes: 4194304,
      uploadConcurrency: 6,
    })
  })

  it('rejects an upload setting above the Vercel-safe boundary', async () => {
    mocks.findSettings.mockImplementation(async () => [
      { key: 'WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES', value: '4194305' },
      { key: 'WEIGHT_TICKET_IMAGE_UPLOAD_CONCURRENCY', value: '6' },
    ])

    await expect(resolveWeightTicketImageUploadConfig()).rejects.toThrow('WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES')
  })

  it('requires explicit processing settings instead of using runtime fallbacks', async () => {
    mocks.findSettings.mockResolvedValue([])

    await expect(resolveWeightTicketImageProcessingConfig()).rejects.toThrow('WEIGHT_TICKET_THUMBNAIL_LOCK_TIMEOUT_SECONDS')
  })

  it('returns a typed 503 when formal print settings are unavailable', async () => {
    mocks.findSettings.mockResolvedValue([])

    await expect(attachWeightTicketImagePrintUrls({
      imageNames: [],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toMatchObject({
      code: 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY',
      status: 503,
    })
  })

  it('strips a preview-only signed URL before persistence', () => {
    const signedReference = storedReference({ url: 'https://signed.example/evidence.jpg?token=short-lived' })
    const values = normalizeWeightTicketImageReferences({
      lines: [{ imageNames: [signedReference] }],
      vehicleImageNames: [],
    }, 'weight-ticket-images')

    expect(JSON.parse(values.lines[0].imageNames[0] ?? '{}')).toEqual({
      bucket: 'weight-ticket-images',
      fileName: 'evidence.jpg',
      storageKey: 'attachments/pending/evidence.jpg',
      thumbnailStorageKey: 'attachments/pending/evidence.thumb.webp',
    })
  })

  it('rejects legacy data URLs instead of uploading them during LINE/PDF or save', () => {
    expect(() => normalizeWeightTicketImageReferences({
      lines: [{ imageNames: ['data:image/jpeg;base64,AAAA'] }],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).toThrow('รูปหลักฐานรูปแบบเก่า')
  })

  it('rejects references from the public PDF/artifact bucket', () => {
    expect(() => normalizeWeightTicketImageReferences({
      lines: [{ imageNames: [JSON.stringify({
        bucket: 'weight-ticket-pdfs',
        fileName: 'evidence.jpg',
        storageKey: 'legacy/evidence.jpg',
        thumbnailStorageKey: 'legacy/evidence.thumb.webp',
      })] }],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).toThrow('bucket ไม่ตรง')
  })

  it('rejects image storage keys outside the attachments namespace', () => {
    for (const storageKey of [
      'weight-ticket-pdfs/secret.jpg',
      'attachments/../secret.jpg',
      'attachments/%2e%2e/secret.jpg',
      'attachments/foo?x=1.jpg',
      'attachments/foo#fragment.jpg',
      'attachments//secret.jpg',
    ]) {
      expect(() => normalizeWeightTicketImageReferences({
        lines: [{ imageNames: [JSON.stringify({
          bucket: 'weight-ticket-images',
          fileName: 'secret.jpg',
          storageKey,
          thumbnailStorageKey: 'attachments/pending/evidence.thumb.webp',
        })] }],
        vehicleImageNames: [],
      }, 'weight-ticket-images')).toThrow('storage key')
    }
  })

  it('fails closed when preview input references another bucket or a legacy value', async () => {
    const wrongBucketReference = JSON.stringify({
      bucket: 'weight-ticket-pdfs',
      fileName: 'public-artifact.jpg',
      storageKey: 'legacy/public-artifact.jpg',
      thumbnailStorageKey: 'legacy/public-artifact.thumb.webp',
      url: 'https://public.example/public-artifact.jpg',
    })
    const validReference = storedReference({ storageKey: 'attachments/01/evidence.jpg', thumbnailStorageKey: 'attachments/01/evidence.thumb.webp' })

    await expect(attachWeightTicketImagePreviewUrls({
      imageNames: [wrongBucketReference, 'legacy-name.jpg', validReference],
      lines: [{ imageNames: [wrongBucketReference] }],
      vehicleImageNames: [wrongBucketReference],
    }, 'weight-ticket-images')).rejects.toThrow('bucket หรือ storage key')
  })

  it('surfaces malformed same-bucket keys instead of silently dropping them from preview', async () => {
    await expect(attachWeightTicketImagePreviewUrls({
      imageNames: [JSON.stringify({
        bucket: 'weight-ticket-images',
        fileName: 'broken.jpg',
        storageKey: 'attachments/%2e%2e/broken.jpg',
        thumbnailStorageKey: 'attachments/%2e%2e/broken.thumb.webp',
      })],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toThrow('storage key')
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('returns queued images explicitly without signing a missing thumbnail', async () => {
    mocks.findAssets.mockResolvedValue([{
      original_storage_key: 'attachments/pending/evidence.jpg',
      thumbnail_status: 'queued',
      thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
    }])

    const result = await attachWeightTicketImagePreviewUrls({
      imageNames: [storedReference()],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')

    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
    expect(JSON.parse(result.imageNames[0] ?? '{}')).toEqual(expect.objectContaining({
      storageKey: 'attachments/pending/evidence.jpg',
      thumbnailStatus: 'queued',
    }))
    expect(JSON.parse(result.imageNames[0] ?? '{}')).not.toHaveProperty('thumbnailUrl')
  })

  it('represents a missing ledger row as failed without falling back to the original', async () => {
    mocks.findAssets.mockResolvedValue([])
    const result = await attachWeightTicketImagePreviewUrls({
      imageNames: [storedReference()],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')

    expect(JSON.parse(result.imageNames[0] ?? '{}')).toEqual(expect.objectContaining({ thumbnailStatus: 'failed' }))
    expect(JSON.parse(result.imageNames[0] ?? '{}')).not.toHaveProperty('thumbnailUrl')
  })

  it('fails closed for a legacy reference without a thumbnail key', async () => {
    // Images uploaded before the thumbnail pipeline have no thumbnailStorageKey
    // and no asset ledger row. Runtime preview must not return the original
    // reference as a fallback; migration/backfill owns recovery.
    mocks.findAssets.mockResolvedValue([{
      original_storage_key: 'attachments/pending/evidence.jpg',
      thumbnail_status: 'ready',
      thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
    }])
    const legacy = JSON.stringify({
      bucket: 'weight-ticket-images',
      fileName: 'legacy-evidence.jpg',
      storageKey: 'attachments/pending/legacy-evidence.jpg',
    })
    const healthy = storedReference()

    await expect(attachWeightTicketImagePreviewUrls({
      imageNames: [legacy, healthy],
      lines: [{ imageNames: [legacy] }],
      vehicleImageNames: [legacy],
    }, 'weight-ticket-images')).rejects.toThrow('ยังไม่มี thumbnail')
  })

  it('resolves a legacy reference through the asset ledger thumbnail when the ledger knows it', async () => {
    // A reference missing thumbnailStorageKey can still get a preview when the
    // asset ledger row carries the generated thumbnail key and status.
    const legacy = JSON.stringify({
      bucket: 'weight-ticket-images',
      fileName: 'ledger-evidence.jpg',
      storageKey: 'attachments/pending/ledger-evidence.jpg',
    })
    mocks.findAssets.mockResolvedValue([{
      original_storage_key: 'attachments/pending/ledger-evidence.jpg',
      thumbnail_status: 'ready',
      thumbnail_storage_key: 'attachments/pending/ledger-evidence.thumb.webp',
    }])

    const result = await attachWeightTicketImagePreviewUrls({
      imageNames: [legacy],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')

    expect(mocks.createSignedUrls).toHaveBeenCalledWith(
      ['attachments/pending/ledger-evidence.thumb.webp'],
      expect.any(Number),
    )
    expect(JSON.parse(result.imageNames[0] ?? '{}')).toEqual(expect.objectContaining({
      thumbnailStatus: 'ready',
      thumbnailStorageKey: 'attachments/pending/ledger-evidence.thumb.webp',
      thumbnailUrl: expect.stringContaining('https://signed.example/attachments/pending/ledger-evidence.thumb.webp'),
    }))
  })

  it('represents a signed thumbnail failure as failed without returning the original URL', async () => {
    // Both the batched API and the single-key fallback fail so the resolver
    // marks the thumbnail as failed and never leaks an unsigned URL.
    mocks.createSignedUrls.mockResolvedValue({ data: [], error: { message: 'temporary storage error' } })
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'temporary storage error' } })
    const result = await attachWeightTicketImagePreviewUrls({
      imageNames: [storedReference()],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')

    expect(JSON.parse(result.imageNames[0] ?? '{}')).toEqual(expect.objectContaining({ thumbnailStatus: 'failed' }))
    expect(JSON.parse(result.imageNames[0] ?? '{}')).not.toHaveProperty('url')
  })

  it('signs only the bounded print derivative for WTI/WTO evidence across vehicle, product and line images', async () => {
    const wti = storedReference({
      fileName: 'wti-product.jpg',
      storageKey: 'attachments/wti/product.jpg',
      thumbnailStorageKey: 'attachments/wti/product.thumb.webp',
    })
    const wto = storedReference({
      fileName: 'wto-vehicle.jpg',
      storageKey: 'attachments/wto/vehicle.jpg',
      thumbnailStorageKey: 'attachments/wto/vehicle.thumb.webp',
    })

    const result = await attachWeightTicketImagePrintUrls({
      imageNames: [wti],
      lines: [{ imageNames: [wto, wti] }],
      vehicleImageNames: [wto],
    }, 'weight-ticket-images')

    expect(mocks.createSignedUrls).toHaveBeenCalledWith([
      'attachments/wti/product.print.jpg',
      'attachments/wto/vehicle.print.jpg',
    ], 3600)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
    const references = [
      ...result.imageNames,
      ...result.vehicleImageNames,
      ...result.lines.flatMap((line) => line.imageNames),
    ].map((value) => JSON.parse(value))
    expect(references).toHaveLength(4)
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'wti-product.jpg',
        printStatus: 'ready',
        printStorageKey: 'attachments/wti/product.print.jpg',
        printUrl: 'https://signed.example/attachments/wti/product.print.jpg?token=short-lived',
      }),
      expect.objectContaining({
        fileName: 'wto-vehicle.jpg',
        printStatus: 'ready',
        printStorageKey: 'attachments/wto/vehicle.print.jpg',
        printUrl: 'https://signed.example/attachments/wto/vehicle.print.jpg?token=short-lived',
      }),
    ]))
    expect(references.every((reference) => !reference.url)).toBe(true)
  })

  it('fails closed for queued, missing and broken print derivatives without signing the original', async () => {
    const queued = storedReference({
      printStorageKey: 'attachments/pending/evidence.print.jpg',
      printStatus: 'queued',
    })
    mocks.findAssets.mockResolvedValue([{
      original_storage_key: 'attachments/pending/evidence.jpg',
      print_status: 'queued',
      print_storage_key: 'attachments/pending/evidence.print.jpg',
      thumbnail_status: 'ready',
      thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
    }])

    await expect(attachWeightTicketImagePrintUrls({
      imageNames: [queued],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toMatchObject({
      code: 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY',
      status: 409,
    })
    await expect(attachWeightTicketImagePrintUrls({
      imageNames: [queued],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toThrow('ยังสร้างรูปสำหรับพิมพ์ไม่เสร็จ')
    expect(mocks.createSignedUrls).not.toHaveBeenCalled()

    mocks.findAssets.mockResolvedValue([])
    await expect(attachWeightTicketImagePrintUrls({
      imageNames: [storedReference()],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toThrow('ไม่พบทะเบียน print derivative')
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
    expect(mocks.createSignedUrls).not.toHaveBeenCalled()

    await expect(attachWeightTicketImagePrintUrls({
      imageNames: [JSON.stringify({
        bucket: 'weight-ticket-images',
        fileName: 'broken.jpg',
        storageKey: 'attachments/../broken.jpg',
    })],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toThrow('storage key')
  })

  it('rejects a ready print derivative whose stored dimensions exceed the hard 400px bound', async () => {
    mocks.findAssets.mockResolvedValue([{
      original_storage_key: 'attachments/pending/evidence.jpg',
      print_height: 300,
      print_status: 'ready',
      print_storage_key: 'attachments/pending/evidence.print.jpg',
      print_width: 401,
      thumbnail_status: 'ready',
      thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
    }])

    await expect(attachWeightTicketImagePrintUrls({
      imageNames: [storedReference({
        printStatus: 'ready',
        printStorageKey: 'attachments/pending/evidence.print.jpg',
      })],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')).rejects.toThrow('400 x 400')
    expect(mocks.createSignedUrls).not.toHaveBeenCalled()
  })

  it('returns the durable original byte size for existing image references', async () => {
    mocks.findAssets.mockResolvedValue([{
      byte_size: 345678n,
      original_storage_key: 'attachments/pending/evidence.jpg',
      thumbnail_status: 'queued',
      thumbnail_storage_key: 'attachments/pending/evidence.thumb.webp',
    }])

    const result = await attachWeightTicketImagePreviewUrls({
      imageNames: [storedReference()],
      lines: [],
      vehicleImageNames: [],
    }, 'weight-ticket-images')

    expect(JSON.parse(result.imageNames[0] ?? '{}')).toEqual(expect.objectContaining({ byteSize: 345678 }))
  })

  it('accepts a pending upload only for the user who uploaded it', async () => {
    mocks.findAssets.mockResolvedValue([{
      attached_ticket_id: null,
      original_storage_key: 'attachments/pending/evidence.jpg',
      uploaded_by: 'auth-user-1',
    }])

    await expect(assertWeightTicketImageAssetOwnership({
      authUserId: 'auth-user-1',
      bucket: 'weight-ticket-images',
      record: { lines: [], vehicleImageNames: [storedReference()] },
    })).resolves.toEqual(['attachments/pending/evidence.jpg'])
  })

  it('rejects a pending upload owned by another user', async () => {
    mocks.findAssets.mockResolvedValue([{
      attached_ticket_id: null,
      original_storage_key: 'attachments/pending/evidence.jpg',
      uploaded_by: 'auth-user-2',
    }])

    await expect(assertWeightTicketImageAssetOwnership({
      authUserId: 'auth-user-1',
      bucket: 'weight-ticket-images',
      record: { lines: [], vehicleImageNames: [storedReference()] },
    })).rejects.toThrow('ไม่มีสิทธิ์')
  })

  it('accepts an existing image only when it belongs to the ticket being edited', async () => {
    mocks.findAssets.mockResolvedValue([{
      attached_ticket_id: 42n,
      original_storage_key: 'attachments/pending/evidence.jpg',
      uploaded_by: null,
    }])

    await expect(assertWeightTicketImageAssetOwnership({
      authUserId: 'auth-user-1',
      bucket: 'weight-ticket-images',
      record: { lines: [], vehicleImageNames: [storedReference()] },
      ticketId: 42n,
    })).resolves.toEqual(['attachments/pending/evidence.jpg'])
    await expect(assertWeightTicketImageAssetOwnership({
      authUserId: 'auth-user-1',
      bucket: 'weight-ticket-images',
      record: { lines: [], vehicleImageNames: [storedReference()] },
      ticketId: 43n,
    })).rejects.toThrow('ไม่มีสิทธิ์')
  })
})
