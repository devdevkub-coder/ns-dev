import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const sources = [
  fileURLToPath(new URL('./FcdConversionPageClient.tsx', import.meta.url)),
  fileURLToPath(new URL('./FcdRevaluationPageClient.tsx', import.meta.url)),
].map((filePath) => {
  const source = readFileSync(filePath, 'utf8')
  return { filePath, source, sourceFile: ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) }
})

function nodes<T extends ts.Node>(sourceFile: ts.SourceFile, predicate: (node: ts.Node) => node is T) {
  const matches: T[] = []
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return matches
}

function hasNamedImport(sourceFile: ts.SourceFile, moduleName: string, importedName: string) {
  return sourceFile.statements.some((statement) => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === moduleName
    && statement.importClause?.namedBindings
    && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some((element) => element.name.text === importedName))
}

function jsxTagText(sourceFile: ts.SourceFile, tagName: string) {
  return nodes(sourceFile, (node): node is ts.JsxOpeningLikeElement => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sourceFile) === tagName)
    .map((node) => node.getText(sourceFile))
}

function identifiers(sourceFile: ts.SourceFile) {
  return new Set(nodes(sourceFile, ts.isIdentifier).map((identifier) => identifier.text))
}

describe('FCD runtime table contract', () => {
  it('uses the shared resizable and sortable runtime-table mechanics', () => {
    for (const entry of sources) {
      const names = identifiers(entry.sourceFile)
      const tables = jsxTagText(entry.sourceFile, 'table')
      const resizableHeads = jsxTagText(entry.sourceFile, 'ResizableTableHead')
      const actionButtons = jsxTagText(entry.sourceFile, 'TableActionButton')
      const actionItems = jsxTagText(entry.sourceFile, 'TableActionMenuItem')
      const divs = jsxTagText(entry.sourceFile, 'div')
      const cells = [...jsxTagText(entry.sourceFile, 'td'), ...jsxTagText(entry.sourceFile, 'TableCell')]
      const calls = nodes(entry.sourceFile, ts.isCallExpression).map((call) => call.getText(entry.sourceFile))

      expect(hasNamedImport(entry.sourceFile, '@/components/ui/ResizableTableHead', 'ResizableTableHead')).toBe(true)
      expect(hasNamedImport(entry.sourceFile, '@/components/ui/TableActionButton', 'TableActionButton')).toBe(true)
      expect(hasNamedImport(entry.sourceFile, '@/components/ui/useResizableColumns', 'useResizableColumns')).toBe(true)
      expect(calls.some((call) => call.startsWith('useResizableColumns('))).toBe(true)
      expect(tables.some((table) => table.includes('ns-table') && table.includes("tableLayout: 'fixed'"))).toBe(true)
      expect(nodes(entry.sourceFile, ts.isJsxElement).some((node) => node.openingElement.tagName.getText(entry.sourceFile) === 'colgroup')).toBe(true)
      expect(resizableHeads.some((head) => head.includes('align="right"'))).toBe(true)
      expect(resizableHeads.some((head) => head.includes('align="center"'))).toBe(true)
      expect(resizableHeads.some((head) => head.includes('align="center"') && head.includes('label="จัดการ"'))).toBe(true)
      expect(actionButtons.some((button) => button.includes('busy={saving}') && button.includes('disabled={saving}'))).toBe(true)
      expect(actionItems.some((item) => item.includes('disabled={saving}'))).toBe(true)
      expect(actionButtons.some((button) => button.includes('mobileLabel={mobileLabel}'))).toBe(true)
      expect(calls.some((call) => call === 'renderRowAction(row, true)')).toBe(true)
      expect(divs.some((div) => div.includes('hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block'))).toBe(true)
      expect(divs.some((div) => div.includes('space-y-3 lg:hidden'))).toBe(true)
      expect(cells.some((cell) => cell.includes('className="p-8 text-center text-slate-500"'))).toBe(true)
      for (const name of ['getResizeHandleProps', 'isLoading', 'resetColumnWidths', 'setIsLoading', 'sortedRows']) expect(names.has(name), `${entry.filePath} must use ${name}`).toBe(true)
      expect(entry.source).toContain("defaultWidth: 72, minWidth: 64, maxWidth: 88")
      expect(entry.source).toContain('if (!sortKey) return rows')
    }
  })
})
