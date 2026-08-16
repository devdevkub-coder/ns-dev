import { cn } from '@/lib/utils'

type SkeletonProps = {
  className?: string
}

/* Shimmer loading placeholder — used instead of plain "กำลังโหลดข้อมูล" text.
   The sweep animation lives in globals.css (.skeleton) and respects reduced-motion. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />
}
