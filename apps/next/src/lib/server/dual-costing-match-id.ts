type DealRef = {
  created_at?: Date | null
  date?: Date | null
  deal_no?: string | null
  id: bigint
}

const MATCH_ID_PREFIX = 'ML'
const MATCH_ID_PATTERN = /^ML\d{4}-\d{4}$/
const BANGKOK_TIME_ZONE = 'Asia/Bangkok'

function bangkokParts(value: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
  })
  const parts = formatter.formatToParts(value)
  const read = (type: 'day' | 'month' | 'year') => parts.find((part) => part.type === type)?.value ?? ''
  return {
    day: read('day'),
    month: read('month'),
    year: Number(read('year') || 0),
  }
}

export function getDualCostingMatchIdPrefix(value: Date) {
  const parts = bangkokParts(value)
  return `${MATCH_ID_PREFIX}${String(parts.year % 100).padStart(2, '0')}${parts.month}`
}

export function isDualCostingMatchId(value: string | null | undefined) {
  return MATCH_ID_PATTERN.test(value ?? '')
}

export function formatDualCostingMatchId(value: Date, sequence: number) {
  return `${getDualCostingMatchIdPrefix(value)}-${String(sequence).padStart(4, '0')}`
}

export function buildDualCostingMatchIdMap<T extends DealRef>(deals: T[]) {
  const orderedDeals = [...deals].sort((left, right) => {
    const leftTime = (left.created_at ?? left.date ?? new Date(0)).getTime()
    const rightTime = (right.created_at ?? right.date ?? new Date(0)).getTime()
    if (leftTime !== rightTime) return leftTime - rightTime
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })

  const counters = new Map<string, number>()
  const matchIdByDealId = new Map<string, string>()

  orderedDeals.forEach((deal) => {
    const storedMatchId = deal.deal_no?.trim() ?? ''
    if (isDualCostingMatchId(storedMatchId)) {
      matchIdByDealId.set(String(deal.id), storedMatchId)
      return
    }

    const referenceDate = deal.created_at ?? deal.date ?? new Date()
    const prefix = getDualCostingMatchIdPrefix(referenceDate)
    const nextSequence = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, nextSequence)
    matchIdByDealId.set(String(deal.id), formatDualCostingMatchId(referenceDate, nextSequence))
  })

  return matchIdByDealId
}
