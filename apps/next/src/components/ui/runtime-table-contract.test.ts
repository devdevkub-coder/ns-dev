import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const sourceRoot = path.resolve(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(filePath)
    return /\.(?:tsx|jsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:tsx|jsx)$/.test(entry.name) ? [filePath] : []
  })
}

function parseSource(filePath: string) {
  const source = fs.readFileSync(filePath, 'utf8')
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function hasClass(node: ts.JsxOpeningLikeElement, sourceFile: ts.SourceFile, className: string) {
  return node.attributes.properties
    .filter(ts.isJsxAttribute)
    .some((attribute) => attribute.name.getText(sourceFile) === 'className' && attribute.initializer?.getText(sourceFile).includes(className))
}

function literalJsxAttribute(node: ts.JsxOpeningLikeElement, sourceFile: ts.SourceFile, attributeName: string) {
  const attribute = node.attributes.properties
    .filter(ts.isJsxAttribute)
    .find((candidate) => candidate.name.getText(sourceFile) === attributeName)
  const initializer = attribute?.initializer
  if (!initializer) return null
  if (ts.isStringLiteral(initializer)) return initializer.text
  if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteralLike(initializer.expression)) return initializer.expression.text
  return null
}

function semanticHeaderAlignment(label: string): 'center' | 'right' | null {
  // These are descriptive/reference labels, not identifiers or monetary measures.
  if (/(?:^แหล่งต้นทุน$|^ประเภทต้นทุน$|^(?:Cost|Ref) Type$|^Cost Pool(?:\s|$))/i.test(label)) return null
  // Identifier/status words take precedence over embedded measure words, e.g. "เลขที่เอกสารต้นทุน".
  if (/(?:วันที่|เวลา|เลขที่|เลขเอกสาร|สถานะ|จัดการ|รหัส|วันครบกำหนด|กำหนดส่ง|^ตัดต้นทุน$|^บิลซื้อ\/ต้นทุน$|^PB \/ ต้นทุนซื้อมาขายไป$|\bRef\b|\bReference\b|\bDocument\b|\bDate\b|\bTime\b|\bStatus\b|\bAction\b)/i.test(label)) return 'center'
  if (/(?:จำนวน|น้ำหนัก|ราคา|ต้นทุน|ยอด|มูลค่า|วงเงิน|คงเหลือ|ชำระ|จ่ายแล้ว|เกินกำหนด|อัตรา|เปอร์เซ็นต์|%|\bQty\b|\bAmount\b|\bCost\b|\bBalance\b|\bTotal\b|\bRevenue\b|\bCOGS\b|\bGP\b|\bWAC\b)/i.test(label)) return 'right'
  return null
}

function cellHasNoWrap(node: ts.JsxElement, sourceFile: ts.SourceFile) {
  return cellHasClass(node, sourceFile, 'whitespace-nowrap')
}

function cellHasClass(node: ts.JsxElement, sourceFile: ts.SourceFile, className: string) {
  let hasMatch = false
  const visit = (child: ts.Node) => {
    if (ts.isJsxElement(child) && hasClass(child.openingElement, sourceFile, className)) hasMatch = true
    if (ts.isJsxSelfClosingElement(child) && hasClass(child, sourceFile, className)) hasMatch = true
    ts.forEachChild(child, visit)
  }
  visit(node)
  return hasMatch
}

const directBusinessValuePattern = /^(?:date|dateStr|dateTime|timestamp|createdAt|updatedAt|issuedAt|dueAt|paidAt|postedAt|heldAt|documentNo|documentNumber|docNo|refNo|referenceNo|referenceNumber|billNo|invoiceNo|poNo|pbNo|sbNo|wtiNo|wtoNo)$/
const suffixedBusinessValuePattern = /(?:Date|DateTime|Timestamp|DocumentNo|DocumentNumber|DocNo|RefNo|ReferenceNo|ReferenceNumber|BillNo|InvoiceNo|PoNo|PbNo|SbNo|WtiNo|WtoNo)$/
const dateRenderPattern = /\b(?:format\w*Date\w*|toLocaleDateString)\s*\(/
const directNumericValuePattern = /^(?:amount|balance|bills|cogs|cost|count|gp|gpPct|oldest|price|qty|quantity|rate|revenue|total|weight)$/i
const suffixedNumericValuePattern = /(?:Amount|Balance|Bills|Cogs|Cost|Count|Gp|GpPct|Oldest|Price|Qty|Quantity|Rate|Revenue|Total|Weight)$/
const numericRenderPattern = /\b(?:formatMoney|formatNumber|formatQty|moneyOrDash)\s*\(/
const statusValuePattern = /(?:^status$|Status$)/

function renderedBusinessDateOrDocument(node: ts.JsxElement, sourceFile: ts.SourceFile) {
  const signals = new Set(directRenderedBusinessDateOrDocument(node, sourceFile))
  const visit = (child: ts.Node) => {
    if (child !== node && ts.isJsxElement(child)) {
      const tagName = child.openingElement.tagName.getText(sourceFile)
      if (tagName === 'datalist' || tagName === 'option') return
      directRenderedBusinessDateOrDocument(child, sourceFile).forEach((signal) => signals.add(signal))
    }
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node, visit)
  return [...signals]
}

function directRenderedBusinessDateOrDocument(node: ts.JsxElement, sourceFile: ts.SourceFile) {
  const signals = new Set<string>()
  const visitExpression = (child: ts.Node) => {
    if (ts.isJsxElement(child) || ts.isJsxFragment(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxAttribute(child) || ts.isJsxOpeningElement(child)) return
    if (ts.isConditionalExpression(child)) {
      visitExpression(child.whenTrue)
      visitExpression(child.whenFalse)
      return
    }
    if (ts.isBinaryExpression(child)) {
      if (child.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        visitExpression(child.right)
      } else {
        visitExpression(child.left)
        visitExpression(child.right)
      }
      return
    }
    if (ts.isParenthesizedExpression(child) || ts.isAsExpression(child) || ts.isNonNullExpression(child)) {
      visitExpression(child.expression)
      return
    }
    if (ts.isCallExpression(child)) {
      if (dateRenderPattern.test(child.expression.getText(sourceFile))) signals.add(child.expression.getText(sourceFile))
      return
    }
    if (ts.isPropertyAccessExpression(child)) {
      const name = child.name.text
      if (directBusinessValuePattern.test(name) || suffixedBusinessValuePattern.test(name)) signals.add(name)
      return
    }
    if (ts.isIdentifier(child) && (directBusinessValuePattern.test(child.text) || suffixedBusinessValuePattern.test(child.text))) {
      signals.add(child.text)
      return
    }
    if (ts.isTemplateExpression(child)) child.templateSpans.forEach((span) => visitExpression(span.expression))
  }

  node.children.forEach((child) => {
    if (ts.isJsxExpression(child) && child.expression) visitExpression(child.expression)
  })
  return [...signals]
}

function directRenderedNumeric(node: ts.JsxElement, sourceFile: ts.SourceFile) {
  const signals = new Set<string>()
  const visitExpression = (child: ts.Node) => {
    if (ts.isJsxElement(child) || ts.isJsxFragment(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxAttribute(child) || ts.isJsxOpeningElement(child)) return
    if (ts.isConditionalExpression(child)) {
      visitExpression(child.whenTrue)
      visitExpression(child.whenFalse)
      return
    }
    if (ts.isBinaryExpression(child)) {
      visitExpression(child.left)
      visitExpression(child.right)
      return
    }
    if (ts.isParenthesizedExpression(child) || ts.isAsExpression(child) || ts.isNonNullExpression(child)) {
      visitExpression(child.expression)
      return
    }
    if (ts.isCallExpression(child)) {
      const expression = child.expression.getText(sourceFile)
      if (numericRenderPattern.test(`${expression}(`) || expression.endsWith('.toFixed')) signals.add(expression)
      return
    }
    if (ts.isPropertyAccessExpression(child)) {
      const name = child.name.text
      if (directNumericValuePattern.test(name) || suffixedNumericValuePattern.test(name)) signals.add(name)
      return
    }
    if (ts.isIdentifier(child) && (directNumericValuePattern.test(child.text) || suffixedNumericValuePattern.test(child.text))) {
      signals.add(child.text)
      return
    }
    if (ts.isTemplateExpression(child)) child.templateSpans.forEach((span) => visitExpression(span.expression))
  }

  node.children.forEach((child) => {
    if (ts.isJsxExpression(child) && child.expression) visitExpression(child.expression)
  })
  return [...signals]
}

function directRenderedStatus(node: ts.JsxElement, sourceFile: ts.SourceFile) {
  const signals = new Set<string>()
  const visitExpression = (child: ts.Node) => {
    if (ts.isJsxElement(child) || ts.isJsxFragment(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxAttribute(child) || ts.isJsxOpeningElement(child)) return
    if (ts.isConditionalExpression(child)) {
      visitExpression(child.whenTrue)
      visitExpression(child.whenFalse)
      return
    }
    if (ts.isParenthesizedExpression(child) || ts.isAsExpression(child) || ts.isNonNullExpression(child)) {
      visitExpression(child.expression)
      return
    }
    if (ts.isPropertyAccessExpression(child) && statusValuePattern.test(child.name.text)) signals.add(child.name.text)
    if (ts.isIdentifier(child) && statusValuePattern.test(child.text)) signals.add(child.text)
  }

  node.children.forEach((child) => {
    if (ts.isJsxExpression(child) && child.expression) visitExpression(child.expression)
  })
  return [...signals]
}

function isInsideResponsiveMobileSurface(node: ts.Node, sourceFile: ts.SourceFile) {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (ts.isJsxElement(current)) {
      const classText = current.openingElement.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((attribute) => attribute.name.getText(sourceFile) === 'className')
        ?.initializer?.getText(sourceFile) ?? ''
      if (/(?:sm|md|lg|xl):hidden/.test(classText)) return true
    }
    current = current.parent
  }
  return false
}

function elementOrAncestorHasNoWrap(node: ts.JsxElement, sourceFile: ts.SourceFile) {
  let current: ts.Node | undefined = node
  while (current) {
    if (ts.isJsxElement(current) && hasClass(current.openingElement, sourceFile, 'whitespace-nowrap')) return true
    if (current !== node && ts.isJsxElement(current) && isInsideResponsiveMobileSurface(current, sourceFile) === false) break
    current = current.parent
  }
  return false
}

describe('active runtime table contract', () => {
  it('requires the canonical ns-table class on every active JSX table', () => {
    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
      const sourceFile = parseSource(filePath)
      const fileViolations: string[] = []

      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (node.tagName.getText(sourceFile) === 'table') {
            const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
            const className = attributes.find((attribute) => attribute.name.getText(sourceFile) === 'className')
            const explicitContract = attributes.find((attribute) => attribute.name.getText(sourceFile) === 'data-ns-table-contract')
            const hasCanonicalClass = className?.initializer?.getText(sourceFile).includes('ns-table') ?? false
            const isFinancialHierarchy = explicitContract?.initializer?.getText(sourceFile) === '"financial-hierarchy"'

            if (!hasCanonicalClass && !isFinancialHierarchy) {
              const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
              fileViolations.push(`${relativePath}:${line}`)
            }
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      return fileViolations
    })

    expect(violations).toEqual([])
  })

  it('keeps rendered date and time values on one line', () => {
    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
      const sourceFile = parseSource(filePath)
      const fileViolations: string[] = []

      function visit(node: ts.Node) {
        if (ts.isJsxElement(node)) {
          const tagName = node.openingElement.tagName.getText(sourceFile)
          const signals = (tagName === 'td' || tagName === 'TableCell') ? renderedBusinessDateOrDocument(node, sourceFile) : []
          if (signals.length > 0 && !cellHasNoWrap(node, sourceFile)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            fileViolations.push(`${relativePath}:${line} (${signals.join(', ')})`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      return fileViolations
    })

    expect(violations).toEqual([])
  })

  it('aligns literal resizable headers by business meaning', () => {
    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
      const sourceFile = parseSource(filePath)
      const fileViolations: string[] = []

      function visit(node: ts.Node) {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sourceFile) === 'ResizableTableHead') {
          const label = literalJsxAttribute(node, sourceFile, 'label')
          const expected = label ? semanticHeaderAlignment(label) : null
          const actual = literalJsxAttribute(node, sourceFile, 'align') ?? 'left'
          if (expected && actual !== expected) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            fileViolations.push(`${relativePath}:${line} (${label}: ${actual} -> ${expected})`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      return fileViolations
    })

    expect(violations).toEqual([])
  })

  it('centers rendered document, reference, date, and time table cells', () => {
    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
      const sourceFile = parseSource(filePath)
      const fileViolations: string[] = []

      function visit(node: ts.Node) {
        if (ts.isJsxElement(node)) {
          const tagName = node.openingElement.tagName.getText(sourceFile)
          const signals = (tagName === 'td' || tagName === 'TableCell') ? directRenderedBusinessDateOrDocument(node, sourceFile) : []
          if (signals.length > 0 && !cellHasClass(node, sourceFile, 'text-center')) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            fileViolations.push(`${relativePath}:${line} (${signals.join(', ')})`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      return fileViolations
    })

    expect(violations).toEqual([])
  })

  it('keeps directly rendered numeric table values right-aligned under the shared one-line numeric contract', () => {
    const globalCss = fs.readFileSync(path.join(sourceRoot, 'app/globals.css'), 'utf8')
    const selector = 'table.ns-table > :is(tbody, tfoot) > tr > :is(th, td):is(.text-right, .tabular-nums):not([colspan])'
    const selectorStart = globalCss.indexOf(selector)
    const selectorBlock = selectorStart >= 0 ? globalCss.slice(selectorStart, globalCss.indexOf('}', selectorStart)) : ''

    expect(selectorBlock).toContain('white-space: nowrap')
    expect(selectorBlock).toContain('font-variant-numeric: tabular-nums')

    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
      const sourceFile = parseSource(filePath)
      const fileViolations: string[] = []

      function visit(node: ts.Node) {
        if (ts.isJsxElement(node)) {
          const tagName = node.openingElement.tagName.getText(sourceFile)
          const signals = (tagName === 'td' || tagName === 'TableCell') ? directRenderedNumeric(node, sourceFile) : []
          const usesDynamicColumnAlignment = node.openingElement.getText(sourceFile).includes('alignClass(column.align)')
          if (signals.length > 0 && !cellHasClass(node, sourceFile, 'text-right') && !usesDynamicColumnAlignment) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            fileViolations.push(`${relativePath}:${line} (${signals.join(', ')} missing text-right)`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      return fileViolations
    })

    expect(violations).toEqual([])
  })

  it('keeps directly rendered status table values centered and on one line', () => {
    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
      const sourceFile = parseSource(filePath)
      const fileViolations: string[] = []

      function visit(node: ts.Node) {
        if (ts.isJsxElement(node)) {
          const tagName = node.openingElement.tagName.getText(sourceFile)
          const signals = (tagName === 'td' || tagName === 'TableCell') ? directRenderedStatus(node, sourceFile) : []
          const required = ['text-center', 'whitespace-nowrap'].filter((className) => !cellHasClass(node, sourceFile, className))
          if (signals.length > 0 && required.length > 0) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            fileViolations.push(`${relativePath}:${line} (${signals.join(', ')} missing ${required.join(', ')})`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      return fileViolations
    })

    expect(violations).toEqual([])
  })

  it('keeps mobile table-equivalent document, date, and time values on one line', () => {
    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
      const sourceFile = parseSource(filePath)
      const fileViolations: string[] = []

      function visit(node: ts.Node) {
        if (ts.isJsxElement(node) && isInsideResponsiveMobileSurface(node, sourceFile)) {
          const signals = directRenderedBusinessDateOrDocument(node, sourceFile)
          if (signals.length > 0 && !elementOrAncestorHasNoWrap(node, sourceFile)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            fileViolations.push(`${relativePath}:${line} (${signals.join(', ')})`)
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
      return fileViolations
    })

    expect(violations).toEqual([])
  })

  it('keeps the explicit direct-runtime document, date, and time cell inventory on one line', () => {
    const inventory = [
      { file: 'app/admin/migration-tools/MigrationToolsPageClient.tsx', value: 'row.date', classes: ['whitespace-nowrap'] },
      { file: 'components/daily/DailyPettyAdvancePageClient.tsx', value: 'entry.date', classes: ['font-mono', 'whitespace-nowrap'] },
      { file: 'components/dual-costing/MatchLogPageClient.tsx', value: 'row.target', classes: ['font-mono', 'whitespace-nowrap'] },
      { file: 'components/dual-costing/MatchLogPageClient.tsx', value: 'row.sourceNo', classes: ['font-mono', 'whitespace-nowrap'] },
      { file: 'components/daily/StockTransferPageClient.tsx', value: 'row.docNo', classes: ['font-mono', 'whitespace-nowrap'] },
      { file: 'components/daily/StockTransferPageClient.tsx', value: 'formatDateTime(row.updatedAt)', classes: ['whitespace-nowrap'] },
      { file: 'components/daily/WeightTicketProductBreakdownTable.tsx', value: 'formatDateTime(row.costSnapshotAt)', classes: ['whitespace-nowrap'] },
      { file: 'components/stock/StockPlanningPageClient.tsx', value: 'firstShortage?.docNo', classes: ['font-mono', 'whitespace-nowrap'] },
      { file: 'components/stock/StockPlanningPageClient.tsx', value: 'row.docNo', classes: ['font-mono', 'whitespace-nowrap'] },
    ]

    for (const entry of inventory) {
      const sourceFile = parseSource(path.join(sourceRoot, entry.file))
      const matches: ts.JsxElement[] = []
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && ['td', 'TableCell'].includes(node.openingElement.tagName.getText(sourceFile)) && node.getText(sourceFile).includes(entry.value)) {
          matches.push(node)
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)

      expect(matches, `${entry.file} must retain an explicit runtime-table cell for ${entry.value}`).not.toEqual([])
      expect(matches.every((cell) => cellHasNoWrap(cell, sourceFile)), `${entry.file}:${entry.value} must be non-wrapping`).toBe(true)
      for (const className of entry.classes) expect(matches.every((cell) => cellHasClass(cell, sourceFile, className)), `${entry.file}:${entry.value} must use ${className}`).toBe(true)
    }
  })

  it('keeps Product Tracking sales headings and generated detail cells contextual and non-wrapping', () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'components/tracking/ProductTrackingPageClient.tsx'), 'utf8')

    expect(source).toContain("headers={['วันที่บิลขาย', 'เลขที่ SB'")
    expect(source).toContain("['วันที่', 'วันที่บิลขาย', 'ครบกำหนด', 'เดือน']")
    expect(source).toContain("['เอกสาร', 'เลขที่ SB', 'การจัดสรร'")
    expect(source).toContain('cellClassName: `text-center ${compact}`')
    expect(source).toContain("cellClassName: 'text-center whitespace-nowrap min-w-[8rem] font-mono'")
    expect(source).toContain("columns[0]?.cellClassName.includes('whitespace-nowrap') ? 'whitespace-nowrap' : ''")
  })

  it('uses data meaning rather than column position for Production Report alignment', () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'components/production/ProductionReportPageClient.tsx'), 'utf8')

    expect(source).toContain("function productionTableColumnAlignment(column: Column): 'center' | 'left' | 'right'")
    expect(source).toContain("column.type === 'date' || column.key === 'docNo' || column.key === 'status'")
    expect(source).not.toContain("index === 0 ? 'left' : 'right'")
  })
})
