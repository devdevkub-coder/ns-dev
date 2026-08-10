import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeStoredImageReference } from '@/lib/weight-tickets'
import { buildWeightTicketLineGallery } from './WeightTicketProductBreakdownTable'

const detailSources = [
  'src/components/daily/WeightTicketDetailModal.tsx',
].map((file) => ({
  file,
  source: readFileSync(resolve(process.cwd(), file), 'utf8').replaceAll('\r\n', '\n'),
}))
const productBreakdownSource = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketProductBreakdownTable.tsx'),
  'utf8',
).replaceAll('\r\n', '\n')
const imageEntryPointSources = [
  'src/components/daily/WeightTicketImageGallery.tsx',
  'src/components/daily/WeightTicketProductBreakdownTable.tsx',
  'src/components/daily/WeightTicketDetailModal.tsx',
].map((file) => ({
  file,
  source: readFileSync(resolve(process.cwd(), file), 'utf8').replaceAll('\r\n', '\n'),
}))

describe('WTI/WTO detail gallery contract', () => {
  it('keeps every lot image in one sequence and starts at the selected lot', () => {
    const imageReference = (fileName: string) => encodeStoredImageReference(
      fileName,
      undefined,
      `attachments/${fileName}`,
      'weight-ticket-images',
      `attachments/thumbnails/${fileName}.webp`,
      `https://example.com/thumbnails/${fileName}.webp`,
    )
    const sources = [
      {
        id: 'lot-1',
        imageNames: [
          imageReference('lot-1-a.jpg'),
          imageReference('lot-1-b.jpg'),
        ],
        title: 'กระทะดำ · เต๋าที่ 1',
      },
      {
        id: 'lot-2',
        imageNames: [imageReference('lot-2-a.jpg')],
        title: 'กระทะดำ · เต๋าที่ 2',
      },
    ]

    const firstLotGallery = buildWeightTicketLineGallery(sources, 'lot-1')
    const secondLotGallery = buildWeightTicketLineGallery(sources, 'lot-2')

    expect(firstLotGallery?.activeIndex).toBe(0)
    expect(firstLotGallery?.images.map((image) => image.fileName)).toEqual([
      'lot-1-a.jpg',
      'lot-1-b.jpg',
      'lot-2-a.jpg',
    ])
    expect(firstLotGallery?.images[2]?.contextTitle).toBe('กระทะดำ · เต๋าที่ 2')
    expect(secondLotGallery?.activeIndex).toBe(2)
  })

  it('keeps purchased-impurity images outside the continuous lot sequence', () => {
    const gallerySourcesIndex = productBreakdownSource.indexOf('const lotGallerySources =')
    const gallerySourcesEndIndex = productBreakdownSource.indexOf('\n\n  return (', gallerySourcesIndex)
    const gallerySourcesBlock = productBreakdownSource.slice(gallerySourcesIndex, gallerySourcesEndIndex)

    expect(gallerySourcesIndex).toBeGreaterThan(-1)
    expect(gallerySourcesBlock).toContain('group.realLotLines')
    expect(gallerySourcesBlock).not.toContain('group.purchaseLines')
    expect(productBreakdownSource).toContain(
      'gallerySources={[{ id: line.id, imageNames: line.imageNames, title: line.productName }]}',
    )
  })

  it('places the combined ticket album after product/status details and before usage history on both detail surfaces', () => {
    detailSources.forEach(({ file, source }) => {
      const productDetailsIndex = source.indexOf('title="รายละเอียดสินค้าและที่มา"')
      const galleryIndex = source.indexOf('<WeightTicketImageGallery', productDetailsIndex)
      const usageHistoryIndex = source.indexOf('title="ประวัติการใช้งานใบรับของ"', galleryIndex)

      expect(productDetailsIndex, file).toBeGreaterThan(-1)
      expect(galleryIndex, file).toBeGreaterThan(productDetailsIndex)
      expect(usageHistoryIndex, file).toBeGreaterThan(galleryIndex)
      expect(source, file).toContain('imageNames={lineImageNames}')
      expect(source, file).toContain('downloadImageNames={ticket.imageNames}')
      expect(source, file).toContain('onOpenLineGallery={openImageGallery}')
      expect(source, file).toContain('activeGalleryImage.contextTitle ?? lineGallery.title')
      expect(source, file).toContain('aria-label="รูปก่อนหน้า"')
      expect(source, file).toContain('aria-label="รูปถัดไป"')
      expect(source, file).toContain('onPointerMove={(event) =>')
      expect(source, file).toContain('translate(${galleryPan.x}px, ${galleryPan.y}px) scale(${galleryZoom})')
      expect(source, file).toContain('activeIndex: current.activeIndex === 0 ? current.images.length - 1 : current.activeIndex - 1')
      expect(source, file).toContain('activeIndex: current.activeIndex === current.images.length - 1 ? 0 : current.activeIndex + 1')
    })
    expect(productBreakdownSource).toContain('ดูรูป')
  })

  it('routes every image preview entry point through the shared HTTP(S)-only predicate', () => {
    imageEntryPointSources.forEach(({ file, source }) => {
      expect(source, file).toContain('isThumbnailPreviewableStoredImageAsset')
      expect(source, file).toContain('.filter(isThumbnailPreviewableStoredImageAsset)')
      expect(source, file).not.toContain('Boolean(image.url)')
      expect(source, file).not.toContain('.filter((image) => image.url)')
    })
  })
})
