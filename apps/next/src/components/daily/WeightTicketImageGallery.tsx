'use client'

import Image from 'next/image'
import { Download } from 'lucide-react'
import { useState } from 'react'

import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { decodeStoredImageAsset, isThumbnailPreviewableStoredImageAsset } from '@/lib/weight-tickets'

export const WEIGHT_TICKET_IMAGE_PREVIEW_LIMIT = 3

export type WeightTicketGalleryImage = {
  fileName: string
  originalStorageKey: string
  bucket: string
  url: string
}

export type WeightTicketGalleryOpenPayload = {
  activeIndex: number
  images: WeightTicketGalleryImage[]
  title: string
}

type DownloadArchive = {
  fileName: string
  url: string
}

export function WeightTicketImageGallery({
  downloadUrl,
  downloadFileName,
  downloadImageNames,
  imageNames,
  isLoadingPreview = false,
  onOpen,
  previewError = '',
}: {
  downloadUrl?: string
  downloadFileName?: string
  downloadImageNames?: string[]
  imageNames: string[]
  isLoadingPreview?: boolean
  onOpen: (payload: WeightTicketGalleryOpenPayload) => void
  previewError?: string
}) {
  const [downloadError, setDownloadError] = useState('')
  const [downloadArchives, setDownloadArchives] = useState<DownloadArchive[]>([])
  const [isDownloading, setIsDownloading] = useState(false)
  const decodedImages = imageNames.map(decodeStoredImageAsset)
  const decodedDownloadImages = (downloadImageNames ?? imageNames).map(decodeStoredImageAsset)
  const images = decodedImages
    .filter(isThumbnailPreviewableStoredImageAsset)
    .map(({ bucket, fileName, storageKey, thumbnailUrl }) => ({ bucket, fileName, originalStorageKey: storageKey, url: thumbnailUrl }))
  const previewImages = images.slice(0, WEIGHT_TICKET_IMAGE_PREVIEW_LIMIT)
  const remainingPreviewCount = images.length - previewImages.length
  const downloadableImages = decodedDownloadImages.filter((image) => Boolean(
    image.bucket && image.storageKey,
  ))
  const processingImageCount = decodedImages.filter((image) => image.thumbnailStatus === 'queued' || image.thumbnailStatus === 'processing').length
  const failedImageCount = decodedImages.filter((image) => image.thumbnailStatus === 'failed').length
  const legacyImageCount = isLoadingPreview || previewError ? 0 : decodedImages.filter((image) => (
    !isThumbnailPreviewableStoredImageAsset(image) && !image.thumbnailStatus
  )).length

  async function downloadArchive(file: DownloadArchive) {
    const archiveResponse = await fetch(file.url)
    if (!archiveResponse.ok) throw new Error('ดาวน์โหลดไฟล์ ZIP ไม่สำเร็จ')
    const objectUrl = URL.createObjectURL(await archiveResponse.blob())
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = file.fileName || downloadFileName || 'weight-ticket-images.zip'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  }

  async function handleDownloadAll() {
    if (!downloadUrl || downloadableImages.length === 0 || isDownloading) return
    setIsDownloading(true)
    setDownloadError('')
    try {
      const response = await fetch(downloadUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('ดาวน์โหลดรูปภาพไม่สำเร็จ')
      }
      const payload = await response.json() as { files?: Array<{ fileName: string; url: string }> }
      if (!payload.files?.length) throw new Error('ไม่พบไฟล์ ZIP สำหรับดาวน์โหลด')
      if (payload.files.length > 1) {
        setDownloadArchives(payload.files)
        return
      }
      await downloadArchive(payload.files[0])
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'ดาวน์โหลดรูปภาพไม่สำเร็จ')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDownloadArchive(file: DownloadArchive) {
    setIsDownloading(true)
    setDownloadError('')
    try {
      await downloadArchive(file)
      setDownloadArchives([])
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'ดาวน์โหลดไฟล์ ZIP ไม่สำเร็จ')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDownloadAllArchives() {
    if (downloadArchives.length === 0 || isDownloading) return
    setIsDownloading(true)
    setDownloadError('')
    try {
      for (const file of downloadArchives) {
        await downloadArchive(file)
      }
      setDownloadArchives([])
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'ดาวน์โหลดไฟล์ ZIP ไม่สำเร็จ')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Card aria-labelledby="weight-ticket-image-gallery-title" className="min-w-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg" id="weight-ticket-image-gallery-title">
          รูปภาพประกอบ
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {downloadUrl ? (
            <button
              aria-label="ดาวน์โหลดรูปภาพประกอบทั้งหมด"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={downloadableImages.length === 0 || isDownloading}
              type="button"
              onClick={() => void handleDownloadAll()}
            >
              <Download className="size-4" />
              {isDownloading ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลดรูปทั้งหมด'}
            </button>
          ) : null}
          <span className="text-sm text-slate-500">{downloadImageNames ? `${downloadableImages.length} รูปทั้งหมด` : `${imageNames.length} รูป`}</span>
        </div>
      </div>
      <Dialog open={downloadArchives.length > 0} onOpenChange={(open) => { if (!open && !isDownloading) setDownloadArchives([]) }}>
        <DialogContent className="max-w-lg" fallbackTitle="เลือกไฟล์ ZIP สำหรับดาวน์โหลด">
          <DialogHeader>
            <DialogTitle>เลือกไฟล์ ZIP สำหรับดาวน์โหลด</DialogTitle>
            <DialogDescription>รูปภาพมีหลายไฟล์ ZIP เลือกดาวน์โหลดรายไฟล์ หรือดาวน์โหลดทั้งหมดตามลำดับ</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto p-5">
            {downloadError ? <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{downloadError}</div> : null}
            <button
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDownloading}
              type="button"
              onClick={() => void handleDownloadAllArchives()}
            >
              <Download className="size-4" />
              {isDownloading ? 'กำลังดาวน์โหลดทุกไฟล์...' : 'ดาวน์โหลดทุกไฟล์'}
            </button>
            {downloadArchives.map((file, index) => (
              <button
                className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDownloading}
                key={file.fileName}
                type="button"
                onClick={() => void handleDownloadArchive(file)}
              >
                <span className="truncate">{file.fileName}</span>
                <span className="shrink-0 text-xs text-slate-500">ส่วนที่ {index + 1}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => setDownloadArchives([])}>ปิด</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="space-y-3 p-4 sm:p-5">
        {downloadError ? <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{downloadError}</div> : null}
        {previewError ? <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{previewError}</div> : null}
        {isLoadingPreview && imageNames.length > 0 ? (
          <div className="text-sm text-slate-400" role="status">กำลังเตรียม preview รูปภาพ...</div>
        ) : images.length > 0 ? (
          <div className="grid min-w-0 grid-cols-3 gap-3 md:grid-cols-4">
            {previewImages.map((image, index) => (
              <button
                aria-label={`เปิดรูปภาพประกอบ ${index + 1} จาก ${images.length}`}
                className="min-w-0 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left transition hover:border-slate-300 hover:bg-slate-100"
                key={`${image.url}-${index}`}
                type="button"
                onClick={() => onOpen({ activeIndex: index, images, title: 'รูปภาพประกอบ' })}
              >
                <div className="relative aspect-[4/3] bg-slate-200">
                  <Image
                    alt={image.fileName}
                    className="object-cover"
                    fill
                    sizes="(min-width: 768px) 25vw, 33vw"
                    src={image.url}
                    unoptimized
                  />
                </div>
                <div className="truncate px-3 py-2 text-xs text-slate-600">{image.fileName}</div>
              </button>
            ))}
            {remainingPreviewCount > 0 ? (
              <button
                aria-label={`เปิดรูปภาพประกอบอีก ${remainingPreviewCount} รูป`}
                className="flex min-h-24 w-full min-w-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-200"
                type="button"
                onClick={() => onOpen({ activeIndex: WEIGHT_TICKET_IMAGE_PREVIEW_LIMIT, images, title: 'รูปภาพประกอบ' })}
              >
                +อีก {remainingPreviewCount} รูป
              </button>
            ) : null}
          </div>
        ) : imageNames.length === 0 ? (
          <div className="text-sm text-slate-400">ยังไม่มีรูปภาพประกอบ</div>
        ) : null}
        {processingImageCount > 0 ? (
          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700" role="status">
            กำลังสร้างภาพตัวอย่าง {processingImageCount} รูป รูปที่เสร็จแล้วจะแสดงอัตโนมัติ
          </div>
        ) : null}
        {failedImageCount > 0 ? (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
            สร้างภาพตัวอย่างไม่สำเร็จ {failedImageCount} รูป โดยรูปต้นฉบับยังถูกเก็บไว้
          </div>
        ) : null}
        {!isLoadingPreview && !previewError && legacyImageCount > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            มีรูปเดิม {legacyImageCount} รูปที่ยังไม่มี preview ในระบบปัจจุบัน
          </div>
        ) : null}
      </div>
    </Card>
  )
}
