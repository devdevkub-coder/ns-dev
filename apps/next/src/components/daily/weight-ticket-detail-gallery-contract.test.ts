import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const detailSources = [
  'src/components/daily/WeightTicketDetailModal.tsx',
  'src/components/daily/WeightTicketDetailPageClient.tsx',
].map((file) => ({
  file,
  source: readFileSync(resolve(process.cwd(), file), 'utf8').replaceAll('\r\n', '\n'),
}))
const productBreakdownSource = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketProductBreakdownTable.tsx'),
  'utf8',
)
const imageEntryPointSources = [
  'src/components/daily/WeightTicketImageGallery.tsx',
  'src/components/daily/WeightTicketProductBreakdownTable.tsx',
  'src/components/daily/WeightTicketDetailModal.tsx',
  'src/components/daily/WeightTicketDetailPageClient.tsx',
].map((file) => ({
  file,
  source: readFileSync(resolve(process.cwd(), file), 'utf8').replaceAll('\r\n', '\n'),
}))

describe('WTI/WTO detail gallery contract', () => {
  it('places the combined ticket album after product/status details and before usage history on both detail surfaces', () => {
    detailSources.forEach(({ file, source }) => {
      const productDetailsIndex = source.indexOf('title="รายละเอียดสินค้าและที่มา"')
      const statusIndex = source.indexOf('title="สถานะ"', productDetailsIndex)
      const galleryIndex = source.indexOf('<WeightTicketImageGallery', statusIndex)
      const usageHistoryIndex = source.indexOf('title="ประวัติการใช้งานใบรับของ"', galleryIndex)

      expect(productDetailsIndex, file).toBeGreaterThan(-1)
      expect(statusIndex, file).toBeGreaterThan(productDetailsIndex)
      expect(galleryIndex, file).toBeGreaterThan(statusIndex)
      expect(usageHistoryIndex, file).toBeGreaterThan(galleryIndex)
      expect(source, file).toContain('imageNames={ticket.imageNames}')
      expect(source, file).toContain('onOpenLineGallery=')
      expect(source, file).toContain('aria-label="รูปก่อนหน้า"')
      expect(source, file).toContain('aria-label="รูปถัดไป"')
      expect(source, file).toContain('activeIndex: current.activeIndex === 0 ? current.images.length - 1 : current.activeIndex - 1')
      expect(source, file).toContain('activeIndex: current.activeIndex === current.images.length - 1 ? 0 : current.activeIndex + 1')
    })
    expect(productBreakdownSource).toContain('ดูรูป')
  })

  it('routes every image preview entry point through the shared HTTP(S)-only predicate', () => {
    imageEntryPointSources.forEach(({ file, source }) => {
      expect(source, file).toContain('isPreviewableStoredImageAsset')
      expect(source, file).toContain('.filter(isPreviewableStoredImageAsset)')
      expect(source, file).not.toContain('Boolean(image.url)')
      expect(source, file).not.toContain('.filter((image) => image.url)')
    })
  })
})
