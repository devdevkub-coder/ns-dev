'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { WeightTicketType } from '@/lib/weight-tickets'

export type WeightTicketSaveStage =
  | 'idle'
  | 'auto_save'
  | 'save'
  | 'stock_check'
  | 'confirm'
  | 'rebuild'

const stageLabels: Record<Exclude<WeightTicketSaveStage, 'idle'>, string> = {
  auto_save: 'กำลังบันทึกแบบร่าง...',
  save: 'กำลังตรวจสอบและบันทึก...',
  stock_check: 'กำลังตรวจสอบ stock ทุกรายการ...',
  confirm: 'กำลังยืนยันใบรับ-ส่งของ...',
  rebuild: 'กำลัง release และสร้าง pending_out ใหม่...',
}

export function useWeightTicketSaveProgress() {
  const [stage, setStage] = useState<WeightTicketSaveStage>('idle')

  return {
    stage,
    isSaving: stage !== 'idle',
    begin: setStage,
    end: () => setStage('idle'),
  }
}

export function WeightTicketSaveProgress({
  className,
  stage,
  type,
}: {
  className?: string
  stage: WeightTicketSaveStage
  type: WeightTicketType
}) {
  if (stage === 'idle') return null

  const label = stage === 'stock_check' && type === 'WTI'
    ? 'กำลังตรวจสอบข้อมูลทั้งหมด...'
    : stageLabels[stage]

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn('flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800', className)}
      role="status"
    >
      <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
