import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  MAX_WEIGHT_TICKET_IMAGE_BYTES,
  buildWeightTicketImageStorageKey,
  encodeStoredWeightTicketImageReference,
  identifySupabaseProjectRef,
  isKnownWeightTicketImageMockReference,
  parseWeightTicketImageReference,
  writeRollbackManifest,
} from './weight-ticket-image-assets.mjs'

const dataUrl = (mimeType, bytes) => `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00])
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary')

describe('weight-ticket image reference parser', () => {
  it('classifies raw, pipe, and JSON data URLs without exposing the payload', () => {
    const raw = parseWeightTicketImageReference(dataUrl('image/jpeg', jpeg))
    const uppercaseRaw = parseWeightTicketImageReference(dataUrl('image/jpeg', jpeg).replace(/^data:/, 'DATA:'))
    const pipe = parseWeightTicketImageReference(`scale.png|${dataUrl('image/png', png)}`)
    const json = parseWeightTicketImageReference(JSON.stringify({
      dataUrl: dataUrl('image/webp', webp),
      fileName: 'ticket.webp',
    }))

    assert.deepEqual(
      [raw.kind, raw.source, raw.fileName, raw.mimeType],
      ['dataUrl', 'raw', null, 'image/jpeg'],
    )
    assert.equal(uppercaseRaw.kind, 'dataUrl')
    assert.deepEqual(
      [pipe.kind, pipe.source, pipe.fileName, pipe.mimeType],
      ['dataUrl', 'pipe', 'scale.png', 'image/png'],
    )
    assert.deepEqual(
      [json.kind, json.source, json.fileName, json.mimeType],
      ['dataUrl', 'json', 'ticket.webp', 'image/webp'],
    )
    assert.equal(Object.hasOwn(raw, 'dataUrl'), false)
  })

  it('keeps canonical storage references distinct from legacy URLs', () => {
    const stored = parseWeightTicketImageReference(JSON.stringify({
      fileName: 'ticket.jpg',
      storageKey: 'attachments/pending/2026-07-19/example.jpg',
      url: 'https://example.supabase.co/storage/v1/object/public/bucket/example.jpg',
    }))
    const legacy = parseWeightTicketImageReference('ticket.jpg|https://example.com/ticket.jpg')

    assert.equal(stored.kind, 'storageKey')
    assert.equal(stored.storageKey, 'attachments/pending/2026-07-19/example.jpg')
    assert.equal(legacy.kind, 'legacyUrl')
    assert.equal(parseWeightTicketImageReference(JSON.stringify({
      dataUrl: dataUrl('image/jpeg', jpeg),
      storageKey: 'attachments/example.jpg',
    })).reason, 'hybridReference')
  })

  it('rejects unsupported, malformed, spoofed, and oversized data URLs', () => {
    const unsupported = parseWeightTicketImageReference(dataUrl('image/gif', Buffer.from('GIF89a')))
    const malformed = parseWeightTicketImageReference('data:image/jpeg;base64,%%%')
    const spoofed = parseWeightTicketImageReference(dataUrl('image/png', jpeg))
    const oversized = parseWeightTicketImageReference(dataUrl('image/jpeg', jpeg), { maxBytes: 4 })

    assert.deepEqual(
      [unsupported.reason, malformed.reason, spoofed.reason, oversized.reason],
      ['unsupportedMimeType', 'invalidBase64', 'signatureMismatch', 'tooLarge'],
    )
    assert.equal(MAX_WEIGHT_TICKET_IMAGE_BYTES, 10 * 1024 * 1024)
  })

  it('recognizes only the exact audited JSON PNG mock payload for opt-in removal', () => {
    const exact = JSON.stringify({
      dataUrl: dataUrl('image/png', Buffer.from('mock image data')),
      fileName: 'mock.png',
    })
    const wrongBytes = JSON.stringify({
      dataUrl: dataUrl('image/png', Buffer.from('mock image data!')),
      fileName: 'mock.png',
    })
    const wrongMime = JSON.stringify({
      dataUrl: dataUrl('image/jpeg', Buffer.from('mock image data')),
      fileName: 'mock.jpg',
    })

    assert.equal(isKnownWeightTicketImageMockReference(exact), true)
    assert.equal(isKnownWeightTicketImageMockReference(wrongBytes), false)
    assert.equal(isKnownWeightTicketImageMockReference(wrongMime), false)
    assert.equal(isKnownWeightTicketImageMockReference(dataUrl('image/png', Buffer.from('mock image data'))), false)
  })
})

describe('weight-ticket image migration helpers', () => {
  it('builds deterministic immutable keys and canonical JSON references', () => {
    const first = buildWeightTicketImageStorageKey({
      bytes: jpeg,
      documentNo: 'WTI012607-0012',
      extension: 'jpg',
      imageIndex: 0,
      owner: 'vehicle',
    })
    const second = buildWeightTicketImageStorageKey({
      bytes: jpeg,
      documentNo: 'WTI012607-0012',
      extension: 'jpg',
      imageIndex: 0,
      owner: 'vehicle',
    })

    assert.equal(first, second)
    assert.match(first, /^attachments\/migrated\/[a-f0-9]{16}\/vehicle\/001-[a-f0-9]{64}\.jpg$/)
    assert.equal(first.includes('wti012607-0012'), false)
    assert.equal(
      encodeStoredWeightTicketImageReference('ticket.jpg', first, undefined, 'weight-ticket-images'),
      JSON.stringify({ bucket: 'weight-ticket-images', fileName: 'ticket.jpg', storageKey: first }),
    )
  })

  it('requires the database and Supabase URLs to identify the same project', () => {
    assert.equal(identifySupabaseProjectRef(
      'https://abc123.supabase.co',
      'postgresql://postgres.abc123:secret@pooler.example.com:5432/postgres',
    ), 'abc123')
    assert.throws(() => identifySupabaseProjectRef(
      'https://abc123.supabase.co',
      'postgresql://postgres.other:secret@pooler.example.com:5432/postgres',
    ), /project refs do not match/i)
  })

  it('refuses to overwrite an existing rollback manifest before any apply work', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'weight-ticket-manifest-test-'))
    const existingPath = path.join(directory, 'existing.json')
    const newPath = path.join(directory, 'new.json')
    try {
      await writeFile(existingPath, 'keep-me', 'utf8')
      await assert.rejects(
        writeRollbackManifest(existingPath, { entries: [] }, { initial: true }),
        (error) => error?.code === 'EEXIST',
      )
      assert.equal(await readFile(existingPath, 'utf8'), 'keep-me')

      await writeRollbackManifest(newPath, { status: 'planned' }, { initial: true })
      await writeRollbackManifest(newPath, { status: 'migrated' })
      assert.equal(JSON.parse(await readFile(newPath, 'utf8')).status, 'migrated')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
