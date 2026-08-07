export type WeightTicketSectionLine = {
  id: string
  parentId?: string
}

/** Returns the parent product section and all of its descendant lines. */
export function getWeightTicketSectionLineIds(lines: WeightTicketSectionLine[], sectionId: string) {
  const lineById = new Map(lines.map((line) => [line.id, line] as const))
  const rootIdById = new Map<string, string>()

  function rootId(lineId: string, visiting = new Set<string>()): string {
    const cached = rootIdById.get(lineId)
    if (cached) return cached
    const line = lineById.get(lineId)
    if (!line?.parentId || !lineById.has(line.parentId) || visiting.has(lineId)) {
      rootIdById.set(lineId, lineId)
      return lineId
    }
    const nextVisiting = new Set(visiting)
    nextVisiting.add(lineId)
    const root = rootId(line.parentId, nextVisiting)
    rootIdById.set(lineId, root)
    return root
  }

  const root = rootId(sectionId)
  return lines.filter((line) => rootId(line.id) === root).map((line) => line.id)
}

/** Returns one lot and only the impurity/purchase lines below that lot. */
export function getWeightTicketLotLineIds(lines: WeightTicketSectionLine[], lotId: string) {
  const ids = new Set<string>()
  const visit = (lineId: string) => {
    if (ids.has(lineId)) return
    ids.add(lineId)
    lines.filter((line) => line.parentId === lineId).forEach((line) => visit(line.id))
  }
  visit(lotId)
  return lines.filter((line) => ids.has(line.id)).map((line) => line.id)
}
