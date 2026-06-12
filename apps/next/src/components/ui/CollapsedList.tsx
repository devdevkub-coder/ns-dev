import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'

export interface CollapsedListProps {
  /** The list of items to display */
  items?: string[]
  /** Number of items to show before truncating. Default is 2. */
  visibleLimit?: number
  /** Text to show when the list is empty. Default is "-" */
  fallbackText?: React.ReactNode
  /** If true, splits string items by space or comma. Useful for defensive parsing. */
  splitItems?: boolean
  /** If true, renders the items inline on a single line instead of a block list. */
  inline?: boolean
}

export function CollapsedList({ fallbackText = '-', items, splitItems = false, visibleLimit = 2, inline = false }: CollapsedListProps) {
  if (!items || items.length === 0) return <span className="text-slate-400">{fallbackText}</span>

  let normalizedItems = items.filter(Boolean)
  if (splitItems) {
    // Defensive split: API might return a single string with spaces or commas like ["DOC1 DOC2"] or ["DOC1, DOC2"]
    normalizedItems = normalizedItems.flatMap(d => (d || '').split(/[\s,]+/).filter(Boolean))
  }

  if (normalizedItems.length === 0) return <span className="text-slate-400">{fallbackText}</span>

  const visibleItems = normalizedItems.slice(0, visibleLimit)
  const hiddenCount = Math.max(0, normalizedItems.length - visibleItems.length)
  const fullText = normalizedItems.join('\n')

  if (inline) {
    const visibleText = visibleItems.join(', ')
    const displayText = hiddenCount > 0 ? `${visibleText} และอีก ${hiddenCount} รายการ` : visibleText

    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="min-w-0 truncate text-slate-700 cursor-help" tabIndex={0}>
              {displayText}
            </div>
          </TooltipTrigger>
          <TooltipContent align="start" className="max-h-80 w-auto max-w-sm overflow-y-auto whitespace-pre-wrap p-3 leading-relaxed">
            {fullText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0 space-y-0.5 text-xs leading-5" tabIndex={0}>
            {visibleItems.map((item, index) => (
              <div key={`${item}-${index}`} className="truncate text-slate-700">
                {item}
              </div>
            ))}
            {hiddenCount > 0 ? (
              <div className="truncate font-semibold text-slate-500">
                และอีก {hiddenCount} รายการ
              </div>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent align="start" className="max-h-80 w-auto max-w-sm overflow-y-auto whitespace-pre-wrap p-3 leading-relaxed">
          {fullText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
