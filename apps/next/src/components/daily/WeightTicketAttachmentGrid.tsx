'use client'

import { useEffect, useRef } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { recordImageDelivery } from '@/lib/client-image-delivery-telemetry'

export type WeightTicketAttachmentPreview = {
  fileName: string
  id: string
  rawValue: string
  url: string
}

function AttachmentImage({ file }: { file: WeightTicketAttachmentPreview }) {
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = performance.now()
  }, [])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={file.fileName}
      className="h-full w-full object-cover"
      src={file.url}
      onError={() => recordImageDelivery({ outcome: 'error', startedAt: startedAt.current, url: file.url })}
      onLoad={() => recordImageDelivery({ outcome: 'loaded', startedAt: startedAt.current, url: file.url })}
    />
  )
}

export function WeightTicketAttachmentGrid({
  id,
  addLabel,
  disabled = false,
  emptyLabel,
  files,
  onAppend,
  onPreview,
  onRemove,
  noWrapper = false,
}: {
  id?: string
  addLabel: string
  disabled?: boolean
  emptyLabel: string
  files: WeightTicketAttachmentPreview[]
  onAppend: (files: FileList | null) => void
  onPreview: (file: WeightTicketAttachmentPreview) => void
  onRemove: (fileId: string) => void
  noWrapper?: boolean
}) {
  const content = (
    <div className="flex flex-wrap gap-3" id={id}>
      {files.map((file) => (
        <div className="w-28 min-w-0" key={file.id}>
          <button
            className="group relative block h-28 w-28 overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 hover:border-slate-400"
            disabled={!file.url}
            title={file.fileName}
            type="button"
            onClick={() => file.url ? onPreview(file) : undefined}
          >
            {file.url ? (
              <>
                <AttachmentImage file={file} />
                <span className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-2 py-1.5 text-center text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                  เปิดรูปภาพ
                </span>
              </>
            ) : (
              <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-400">รูปเดิม</span>
            )}
          </button>
          <div className="mt-2 truncate text-xs text-slate-600" title={file.fileName}>{file.fileName}</div>
          <button className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline" disabled={disabled} type="button" onClick={() => onRemove(file.id)}>
            <Trash2 className="h-3 w-3" />
            ลบ
          </button>
        </div>
      ))}
      <label className={cn(
        'flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center text-xs font-medium text-slate-500 shadow-sm hover:border-slate-400 hover:bg-slate-50',
        disabled ? 'cursor-not-allowed opacity-60 hover:border-slate-300 hover:bg-white' : 'cursor-pointer',
      )}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          <ImagePlus className="h-5 w-5" />
        </span>
        {files.length === 0 ? emptyLabel : addLabel}
        <input
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={disabled}
          multiple
          type="file"
          onChange={(event) => {
            onAppend(event.target.files)
            event.target.value = ''
          }}
        />
      </label>
    </div>
  )

  return noWrapper ? content : (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
      {content}
    </div>
  )
}
