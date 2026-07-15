import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const globalsCssPath = fileURLToPath(new URL('../../app/globals.css', import.meta.url))
const widthExceptionPattern = /\b\w+\s*===\s*\w+\.length\s*-\s*1\b|\?\s*(?:\{\s*minWidth\b|undefined\b)|style=\{\{\s*minWidth\b/

async function tsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : []
  }))
  return files.flat()
}

describe('resizable table width contract', () => {
  it('uses visible semantic row dividers in light and dark tables', async () => {
    const css = await readFile(globalsCssPath, 'utf8')

    expect(css).toMatch(/table\.ns-table > tbody > tr \+ tr > :is\(th, td\)[\s\S]*?border-top: 1px solid var\(--color-scrap-line\)/)
    expect(css).toMatch(/@theme\s*\{[\s\S]*?--color-scrap-line: #d9e2ec/)
    expect(css).toMatch(/\.dark\s*\{[\s\S]*?--color-scrap-line: #334155/)
    expect(css).not.toMatch(/\.dark table\.ns-table :where\(th\)\s*\{[^}]*border-color:/)
  })

  it('recognizes index-based and key-based width exceptions', () => {
    expect(widthExceptionPattern.test("index === columns.length - 1 ? undefined : getColumnStyle(column.key)")).toBe(true)
    expect(widthExceptionPattern.test("column.key === '__action' ? { minWidth: column.minWidth } : getColumnStyle(column.key)")).toBe(true)
  })

  it('does not let the final column absorb all remaining table width', async () => {
    const violations: string[] = []

    for (const file of await tsxFiles(sourceRoot)) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/<colgroup\b[\s\S]*?<\/colgroup>/g)) {
        const exception = match[0].match(widthExceptionPattern)
        if (!exception || match.index === undefined || exception.index === undefined) continue
        const line = source.slice(0, match.index + exception.index).split('\n').length
        violations.push(`${relative(sourceRoot, file).split(sep).join('/')}:${line}`)
      }
    }

    expect(violations).toEqual([])
  })
})
