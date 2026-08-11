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

import { assertWeightTicketImageAssetOwnership, attachWeightTicketImagePreviewUrls, normalizeWeightTicketImageReferences, resolveWeightTicketImageProcessingConfig } from './weight-ticket-storage'

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
      original_storage_key: storageKey,
      thumbnail_status: 'ready',
      thumbnail_storage_key: storageKey.replace(/\.(jpg|png|webp)$/i, '.thumb.webp'),
    }))
  ))
  mocks.findSettings.mockResolvedValue([
    { key: 'WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES', value: '10485760' },
    { key: 'WEIGHT_TICKET_IMAGE_UPLOAD_CONCURRENCY', value: '6' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_MAX_DIMENSION', value: '960' },
    { key: 'WEIGHT_TICKET_THUMBNAIL_WEBP_QUALITY', value: '90' },
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
  it('requires explicit processing settings instead of using runtime fallbacks', async () => {
    mocks.findSettings.mockResolvedValue([])

    await expect(resolveWeightTicketImageProcessingConfig()).rejects.toThrow('WEIGHT_TICKET_THUMBNAIL_LOCK_TIMEOUT_SECONDS')
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
