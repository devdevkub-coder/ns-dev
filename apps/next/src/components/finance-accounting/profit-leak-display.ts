export type ProfitLeakDonutSegment = { dash: number; offset: number; value: number }

export function buildProfitLeakDonutSegments(values: number[], total?: number): ProfitLeakDonutSegment[] {
  if (total === undefined || total <= 0) return []

  return values.reduce<ProfitLeakDonutSegment[]>((segments, value) => {
    const dash = value / total * 440
    const offset = segments.reduce((sum, segment) => sum + segment.dash, 0)
    return [...segments, { dash, offset, value }]
  }, [])
}

export function formatProfitLeakCount(count: number) {
  return `${count} รายการ`
}
