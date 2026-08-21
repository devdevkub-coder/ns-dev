import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  createAsset: vi.fn(),
  createCanvas: vi.fn(),
  createSignedUrl: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  loadImage: vi.fn(),
  processPrint: vi.fn(),
  processDownload: vi.fn(),
  processThumbnail: vi.fn(),
  resolveBucket: vi.fn(),
  resolveConfig: vi.fn(),
  resolveProcessingConfig: vi.fn(),
  sharpMetadata: vi.fn(),
  upload: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: mocks.after,
}))
vi.mock('@napi-rs/canvas', () => ({
  createCanvas: mocks.createCanvas,
  loadImage: mocks.loadImage,
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
  hasPermission: () => true,
}))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    weight_ticket_image_assets: { create: mocks.createAsset },
  },
}))
vi.mock('@/lib/server/supabase-admin', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mocks.createSignedUrl,
        upload: mocks.upload,
      }),
    },
  }),
}))
vi.mock('@/lib/server/weight-ticket-storage', () => ({
  resolveWeightTicketImageBucket: mocks.resolveBucket,
  resolveWeightTicketImageUploadConfig: mocks.resolveConfig,
  resolveWeightTicketImageProcessingConfig: mocks.resolveProcessingConfig,
  WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS: 31536000,
}))
vi.mock('sharp', () => ({ default: vi.fn(() => ({ metadata: mocks.sharpMetadata })) }))
vi.mock('@/lib/server/weight-ticket-thumbnail-jobs', () => ({
  processWeightTicketDownloadAsset: mocks.processDownload,
  processWeightTicketPrintAsset: mocks.processPrint,
  processWeightTicketThumbnailAsset: mocks.processThumbnail,
}))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({
    appUser: { id: 19n },
    authUser: { id: 'auth-user-19' },
  })
  mocks.resolveBucket.mockResolvedValue('weight-ticket-images')
  mocks.resolveConfig.mockResolvedValue({ maxUploadBytes: 10 * 1024 * 1024 })
  mocks.resolveProcessingConfig.mockResolvedValue({ maxSourcePixels: 40_000_000 })
  mocks.sharpMetadata.mockResolvedValue({ height: 1200, width: 1600 })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.createAsset.mockResolvedValue({ id: 41n, print_status: 'queued', thumbnail_status: 'queued' })
})

describe('WTI/WTO attachment upload boundary', () => {
  it('returns after the original is durable and schedules thumbnail work after the response', async () => {
    const body = new FormData()
    body.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'evidence.jpg', { type: 'image/jpeg' }))

    const response = await POST(new Request('https://sit.example/api/daily/weight-tickets/attachments', {
      body,
      method: 'POST',
    }))
    const payload = await response.json() as Record<string, unknown>

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.loadImage).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
    expect(mocks.createAsset).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        original_storage_key: expect.stringMatching(/^attachments\/pending\//),
        print_status: 'queued',
        print_storage_key: expect.stringMatching(/\.print\.jpg$/),
        thumbnail_status: 'queued',
        uploaded_by: 'auth-user-19',
      }),
    }))
    expect(payload).toEqual(expect.objectContaining({
      bucket: 'weight-ticket-images',
      fileName: 'evidence.jpg',
      storageKey: expect.stringMatching(/^attachments\/pending\//),
      thumbnailStatus: 'queued',
      thumbnailStorageKey: expect.stringMatching(/\.thumb\.webp$/),
      printStatus: 'queued',
      printStorageKey: expect.stringMatching(/\.print\.jpg$/),
    }))
    expect(payload).not.toHaveProperty('thumbnailUrl')
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })

  it('rejects corrupt image bytes before creating an attachable ledger row', async () => {
    mocks.sharpMetadata.mockRejectedValue(new Error('Input buffer contains unsupported image format'))
    const body = new FormData()
    body.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'broken.jpg', { type: 'image/jpeg' }))

    const response = await POST(new Request('https://sit.example/api/daily/weight-tickets/attachments', {
      body,
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.createAsset).not.toHaveBeenCalled()
  })
})
