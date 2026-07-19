import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pageSourcePath = fileURLToPath(new URL('./PoSellPageClient.tsx', import.meta.url))

function enclosingTableCell(source: string, marker: string) {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex).toBeGreaterThan(-1)

  const start = source.lastIndexOf('<TableCell', markerIndex)
  const end = source.indexOf('</TableCell>', markerIndex)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(markerIndex)

  return source.slice(start, end + '</TableCell>'.length)
}

describe('PO Sell desktop table layout', () => {
  it('reserves a non-collapsing action column for every valid row action', async () => {
    const source = await readFile(pageSourcePath, 'utf8')
    const actionCell = enclosingTableCell(source, 'title={`แก้ไข ${row.docNo}`}')

    expect(source).toContain("{ key: 'action', minWidth: 320, defaultWidth: 320 }")
    expect(source).toContain("style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}")
    expect(actionCell).toContain('className="whitespace-nowrap text-right"')
    expect(actionCell).toContain('className="flex justify-end gap-1"')
    expect(actionCell).toContain('แก้ไข')
    expect(actionCell).toContain('พิมพ์')
    expect(actionCell).toContain('ปิดส่งไม่ครบ')
    expect(actionCell).toContain('ยกเลิก')
  })

  it('contains and truncates both updated audit lines without overriding the column width', async () => {
    const source = await readFile(pageSourcePath, 'utf8')
    const updatedCell = enclosingTableCell(source, "{row.updatedBy || '-'}")
    const openingTag = updatedCell.slice(0, updatedCell.indexOf('>') + 1)

    expect(openingTag).toContain('overflow-hidden')
    expect(openingTag).not.toMatch(/\bw-\d+\b/)
    expect(updatedCell.match(/\btruncate\b/g)).toHaveLength(2)
    expect(updatedCell).toContain("title={row.updatedBy || '-'}")
    expect(updatedCell).toContain('title={formatTimestampDisplay(row.updatedAt)}')
  })
})
