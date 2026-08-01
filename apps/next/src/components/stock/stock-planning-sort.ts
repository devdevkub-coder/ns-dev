export type SortDirection = 'asc' | 'desc'

export type SortState<TKey extends string> = {
  direction: SortDirection
  key: TKey | null
}

type SortValue = number | string | null | undefined

export function nextSortState<TKey extends string>(
  current: SortState<TKey>,
  key: TKey,
): SortState<TKey> {
  return current.key === key
    ? { direction: current.direction === 'asc' ? 'desc' : 'asc', key }
    : { direction: 'asc', key }
}

export function sortRows<TRow, TKey extends string>(
  rows: TRow[],
  state: SortState<TKey>,
  getValue: (row: TRow, key: TKey) => SortValue,
): TRow[] {
  if (!state.key) return rows

  const direction = state.direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => {
      const leftValue = getValue(left.row, state.key!)
      const rightValue = getValue(right.row, state.key!)
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th', {
          numeric: true,
          sensitivity: 'base',
        })

      return result === 0 ? left.index - right.index : result * direction
    })
    .map(({ row }) => row)
}
