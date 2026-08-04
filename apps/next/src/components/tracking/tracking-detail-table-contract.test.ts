import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string) {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url))
  const source = readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n')
  return { filePath, source, sourceFile: ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) }
}

const trackingSources = [
  readSource('./CustomerTrackingPageClient.tsx'),
  readSource('./ProductTrackingPageClient.tsx'),
  readSource('../purchase-flow/SupplierTrackingPageClient.tsx'),
]

function detailTableColumnBody(entry: (typeof trackingSources)[number]) {
  let body: ts.Block | undefined
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'detailTableColumn') body = node.body
    ts.forEachChild(node, visit)
  }
  visit(entry.sourceFile)
  expect(body, `${entry.filePath} must define detailTableColumn`).toBeDefined()
  return body!.getText(entry.sourceFile)
}

function hasStructuralColumnMapping(entry: (typeof trackingSources)[number]) {
  let found = false
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'columns' && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer
      found = ts.isPropertyAccessExpression(call.expression)
        && call.expression.name.text === 'map'
        && call.expression.expression.getText(entry.sourceFile) === 'headers'
        && call.arguments.length === 1
        && call.arguments[0]?.getText(entry.sourceFile) === 'detailTableColumn'
    }
    ts.forEachChild(node, visit)
  }
  visit(entry.sourceFile)
  return found
}

function simpleTableHeaders(entry: (typeof trackingSources)[number]) {
  const tables: string[][] = []
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(entry.sourceFile) === 'SimpleTable') {
      const headers = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((attribute) => attribute.name.getText(entry.sourceFile) === 'headers')
      const expression = headers?.initializer && ts.isJsxExpression(headers.initializer) ? headers.initializer.expression : undefined
      if (expression && ts.isArrayLiteralExpression(expression)) {
        tables.push(expression.elements.filter(ts.isStringLiteral).map((element) => element.text))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(entry.sourceFile)
  return tables
}

describe('Tracking 360 detail-table contract', () => {
  it('uses structural semantic column metadata instead of index-based alignment', () => {
    for (const entry of trackingSources) {
      const columnBody = detailTableColumnBody(entry)

      expect(hasStructuralColumnMapping(entry)).toBe(true)
      expect(entry.sourceFile.getText()).not.toMatch(/\brightAlignedColumns\b/)
      expect(columnBody).toMatch(/cellClassName:\s*(?:'text-center whitespace-nowrap min-w-\[7\.5rem\]'|`text-center \$\{compact\}`)/)
      expect(columnBody).toContain("cellClassName: 'text-center whitespace-nowrap min-w-[8rem] font-mono'")
      expect(columnBody).toContain("cellClassName: 'text-right tabular-nums whitespace-nowrap min-w-[6.5rem]'")
    }
  })

  it('keeps Product Tracking sales dates and document numbers contextual and on one line', () => {
    const product = trackingSources[1]
    const columnBody = detailTableColumnBody(product)

    expect(simpleTableHeaders(product)).toContainEqual(['วันที่บิลขาย', 'เลขที่ SB', 'ลูกค้า', 'น้ำหนัก', 'ยอดขาย', 'ขายเฉลี่ย', 'COGS', 'GP', 'สถานะ'])
    expect(columnBody).toContain("['วันที่', 'วันที่บิลขาย', 'ครบกำหนด', 'เดือน'].includes(label)")
    expect(columnBody).toContain("['เอกสาร', 'เลขที่ SB', 'การจัดสรร', 'ใบสั่งผลิต', 'ต้นทาง', 'เอกสารขาย'].includes(label)")
  })

  it('wraps descriptive mobile detail values without weakening document and date nowrap', () => {
    for (const entry of trackingSources) {
      expect(entry.source).not.toContain('font-mono text-right truncate max-w-[180px]')
      expect(entry.source).toContain("column?.cellClassName.includes('font-mono') ? 'font-mono' : ''")
      expect(entry.source).toContain("column?.cellClassName.includes('whitespace-nowrap') ? 'whitespace-nowrap' : 'break-words'")
    }
  })
})
