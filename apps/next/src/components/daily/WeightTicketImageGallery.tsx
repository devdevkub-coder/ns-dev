'use client'

import Image from 'next/image'
import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { decodeStoredImageAsset, isThumbnailPreviewableStoredImageAsset } from '@/lib/weight-tickets'

export const WEIGHT_TICKET_IMAGE_PREVIEW_LIMIT = 3
const DOWNLOAD_PREPARATION_CONCURRENCY = 2

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

type DownloadPart = {
  part: number
  totalParts: number
  fileName: string
  url?: string
  status: 'preparing' | 'ready' | 'failed'
  error?: string
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
  const [downloadParts, setDownloadParts] = useState<DownloadPart[]>([])
  const [downloadPartCount, setDownloadPartCount] = useState<number | null>(null)
  const [downloadPartitionSignature, setDownloadPartitionSignature] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isPreparingParts, setIsPreparingParts] = useState(false)
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
  const readyPartsCount = downloadParts.filter((part) => part.status === 'ready' && part.url).length
  const processingImageCount = decodedImages.filter((image) => image.thumbnailStatus === 'queued' || image.thumbnailStatus === 'processing').length
  const failedImageCount = decodedImages.filter((image) => image.thumbnailStatus === 'failed').length
  const legacyImageCount = isLoadingPreview || previewError ? 0 : decodedImages.filter((image) => (
    !isThumbnailPreviewableStoredImageAsset(image) && !image.thumbnailStatus
  )).length

  useEffect(() => {
    if (!downloadUrl || downloadableImages.length === 0) {
      setDownloadPartCount(null)
      setDownloadPartitionSignature(null)
      setDownloadParts([])
      setDownloadError('')
      return
    }
    setDownloadPartCount(null)
    setDownloadPartitionSignature(null)
    setDownloadParts([])
    setDownloadError('')
    const controller = new AbortController()
    void fetch(`${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}estimate=true`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null
        return await response.json() as { partCount?: number | null; partitionSignature?: string | null }
      })
      .then((payload) => {
        if (payload?.partCount && payload.partCount > 0) {
          setDownloadPartCount(payload.partCount)
          setDownloadPartitionSignature(payload.partitionSignature ?? null)
        }
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [downloadUrl, downloadableImages.length])

  async function downloadArchive(file: Pick<DownloadPart, 'fileName' | 'url'> & Partial<Pick<DownloadPart, 'part' | 'totalParts'>>) {
    if (!file.url) throw new Error('ไฟล์ ZIP ยังไม่พร้อมดาวน์โหลด')
    let archiveUrl = file.url
    if (file.part && file.totalParts && file.totalParts > 1 && downloadUrl && downloadPartitionSignature) {
      const separator = downloadUrl.includes('?') ? '&' : '?'
      const response = await fetch(`${downloadUrl}${separator}part=${file.part}&partitionSignature=${encodeURIComponent(downloadPartitionSignature)}&resign=true`, { cache: 'no-store' })
      if (!response.ok) throw new Error('สร้างลิงก์ดาวน์โหลด ZIP ใหม่ไม่สำเร็จ')
      const payload = await response.json() as { files?: Array<{ url?: string }> }
      if (!payload.files?.[0]?.url) throw new Error('ไม่พบไฟล์ ZIP สำหรับดาวน์โหลด')
      archiveUrl = payload.files[0].url
    }
    const archiveResponse = await fetch(archiveUrl)
    if (!archiveResponse.ok) throw new Error('ดาวน์โหลดไฟล์ ZIP ไม่สำเร็จ')
    const objectUrl = URL.createObjectURL(await archiveResponse.blob())
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = file.fileName || downloadFileName || 'weight-ticket-images.zip'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Keep the object URL alive long enough for Chromium/Safari to start the
    // native download. Revoking it in the same task can silently cancel a
    // larger ZIP part before the browser has consumed the blob.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  function setPartStatus(part: number, update: Partial<DownloadPart>) {
    setDownloadParts((current) => current.map((item) => item.part === part ? { ...item, ...update } : item))
  }

  async function prepareDownloadPart(part: DownloadPart) {
    if (!downloadUrl) return
    setPartStatus(part.part, { status: 'preparing', error: undefined })
    try {
      const separator = downloadUrl.includes('?') ? '&' : '?'
      const signature = downloadPartitionSignature ? `&partitionSignature=${encodeURIComponent(downloadPartitionSignature)}` : ''
      const response = await fetch(`${downloadUrl}${separator}part=${part.part}${signature}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('เตรียมไฟล์ ZIP ไม่สำเร็จ')
      const payload = await response.json() as { files?: Array<{ fileName: string; url: string }> }
      const file = payload.files?.[0]
      if (!file?.url) throw new Error('ไม่พบไฟล์ ZIP สำหรับดาวน์โหลด')
      setPartStatus(part.part, { fileName: file.fileName, url: file.url, status: 'ready' })
    } catch (caught) {
      setPartStatus(part.part, { status: 'failed', error: caught instanceof Error ? caught.message : 'เตรียมไฟล์ ZIP ไม่สำเร็จ' })
    }
  }

  async function prepareAllDownloadParts(parts: DownloadPart[]) {
    setIsPreparingParts(true)
    setDownloadError('')
    let nextIndex = 0
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_PREPARATION_CONCURRENCY, parts.length) }, async () => {
      while (nextIndex < parts.length) {
        const part = parts[nextIndex]
        nextIndex += 1
        if (part) await prepareDownloadPart(part)
      }
    }))
    setIsPreparingParts(false)
  }

  async function handleDownloadAll() {
    if (!downloadUrl || downloadableImages.length === 0 || isDownloading || isPreparingParts) return
    const totalParts = downloadPartCount ?? 1
    if (totalParts > 1) {
      const parts = Array.from({ length: totalParts }, (_, index) => ({
        part: index + 1,
        totalParts,
        fileName: `${downloadFileName ?? 'weight-ticket-images'}-part-${String(index + 1).padStart(2, '0')}.zip`,
        status: 'preparing' as const,
      }))
      setDownloadParts(parts)
      void prepareAllDownloadParts(parts)
      return
    }
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
        setDownloadParts(payload.files.map((file, index) => ({
          ...file,
          part: index + 1,
          totalParts: payload.files?.length ?? 0,
          status: 'ready' as const,
        })))
        return
      }
      await downloadArchive(payload.files[0])
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'ดาวน์โหลดรูปภาพไม่สำเร็จ')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDownloadArchive(file: DownloadPart) {
    if (file.status !== 'ready' || !file.url) return
    setIsDownloading(true)
    setDownloadError('')
    try {
      await downloadArchive(file)
      setDownloadParts([])
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'ดาวน์โหลดไฟล์ ZIP ไม่สำเร็จ')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDownloadAllArchives() {
    const readyParts = downloadParts.filter((part) => part.status === 'ready' && part.url)
    if (readyParts.length === 0 || isDownloading) return
    setIsDownloading(true)
    setDownloadError('')
    try {
      for (const file of readyParts) {
        await downloadArchive(file)
      }
      setDownloadParts([])
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
              disabled={downloadableImages.length === 0 || isDownloading || isPreparingParts}
              type="button"
              onClick={() => void handleDownloadAll()}
            >
              <Download className="size-4" />
              {isDownloading ? 'กำลังดาวน์โหลด...' : isPreparingParts ? 'กำลังเตรียม ZIP...' : `ดาวน์โหลดรูปทั้งหมด${downloadPartCount ? ` (${downloadPartCount} ไฟล์ ZIP)` : ''}`}
            </button>
          ) : null}
          <span className="text-sm text-slate-500">{downloadImageNames ? `${downloadableImages.length} รูปทั้งหมด` : `${imageNames.length} รูป`}</span>
        </div>
      </div>
      <Dialog open={downloadParts.length > 0} onOpenChange={(open) => { if (!open && !isDownloading) setDownloadParts([]) }}>
        <DialogContent className="max-w-lg" fallbackTitle="เลือกไฟล์ ZIP สำหรับดาวน์โหลด">
          <DialogHeader>
            <DialogTitle>เลือกไฟล์ ZIP สำหรับดาวน์โหลด</DialogTitle>
            <DialogDescription>รูปภาพมีหลายไฟล์ ZIP เลือกดาวน์โหลดรายไฟล์ หรือดาวน์โหลดทั้งหมดตามลำดับ</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto p-5">
            {downloadError ? <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{downloadError}</div> : null}
            <button
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDownloading || !downloadParts.some((part) => part.status === 'ready')}
              type="button"
              onClick={() => void handleDownloadAllArchives()}
            >
              <Download className="size-4" />
              {isDownloading ? 'กำลังดาวน์โหลด...' : readyPartsCount === downloadParts.length ? 'ดาวน์โหลดทุกไฟล์' : 'ดาวน์โหลดไฟล์ที่พร้อม'}
            </button>
            {downloadParts.map((file) => (
              <div className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700" key={file.part}>
                <span className="min-w-0 truncate">ส่วนที่ {file.part}: {file.fileName}</span>
                {file.status === 'ready' && file.url ? (
                  <button className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50" disabled={isDownloading} type="button" onClick={() => void handleDownloadArchive(file)}>ดาวน์โหลด</button>
                ) : file.status === 'failed' ? (
                  <button className="shrink-0 rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={isDownloading || isPreparingParts} type="button" onClick={() => void prepareDownloadPart(file)}>ลองใหม่</button>
                ) : (
                  <span className="shrink-0 text-xs text-slate-500">กำลังเตรียม...</span>
                )}
                {file.error ? <span className="basis-full text-xs text-rose-600">{file.error}</span> : null}
              </div>
            ))}
          </div>
          <DialogFooter>
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => setDownloadParts([])}>ปิด</button>
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
