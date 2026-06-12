'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'

export function TableNumberCell({
  strong,
  tone,
  value,
  widthClass = 'max-w-full',
}: {
  strong?: boolean
  tone?: 'amber'
  value: string
  widthClass?: string
}) {
  const colorClass = tone === 'amber' ? 'text-amber-700' : strong ? 'text-slate-900' : 'text-slate-700'

  return (
    <td className={`p-2 pr-4 text-right font-semibold tabular-nums ${colorClass}`}>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`ml-auto block truncate text-right ${widthClass}`} tabIndex={0}>{value}</span>
          </TooltipTrigger>
          <TooltipContent className="whitespace-nowrap p-2 leading-relaxed">
            {value}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  )
}
