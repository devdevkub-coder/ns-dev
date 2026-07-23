import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const actionHeaderPattern = /label=["'](?:การ)?จัดการ["']|>\s*(?:การ)?จัดการ\s*<\/th>|label:\s*["'](?:การ)?จัดการ["']/
const actionColumnDefinitionPattern = /\{[^{}]*key:\s*["'](?:__)?actions?["'][^{}]*defaultWidth:\s*\d+[^{}]*\}/g

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listTsxFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [entryPath] : []
  })
}

function getTableActionSurfaceViolations(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: string[] = []

  function visit(node: ts.Node) {
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(sourceFile)
      if ((tagName === 'table' || tagName === 'Table') && actionHeaderPattern.test(node.getText(sourceFile))) {
        const surfaceText = node.getText(sourceFile)
        const surfaceLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
        if (!surfaceText.includes('<TableActionButton') && /<button\b/.test(surfaceText)) {
          violations.push(`${path.relative(path.resolve(process.cwd(), 'src'), file)}:${surfaceLine}: missing TableActionButton`)
        }

        function inspectSurface(child: ts.Node) {
          if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && child.tagName.getText(sourceFile) === 'TableActionButton') {
            const hasMenu = child.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'menu')
            let parent: ts.Node | undefined = child.parent
            let wrappedByMenuTrigger = false
            while (parent && parent !== node) {
              if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(sourceFile) === 'DropdownMenuTrigger') {
                wrappedByMenuTrigger = true
                break
              }
              parent = parent.parent
            }
            if (!hasMenu && !wrappedByMenuTrigger) {
              const line = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile)).line + 1
              violations.push(`${path.relative(path.resolve(process.cwd(), 'src'), file)}:${line}: action trigger does not open a menu`)
            }
          }
          ts.forEachChild(child, inspectSurface)
        }

        inspectSurface(node)
        return
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function countMobileActionTriggers(file: string): number {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let count = 0

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const mobileLabel = node.attributes.properties.find((attribute): attribute is ts.JsxAttribute => (
        ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'mobileLabel'
      ))
      if (mobileLabel && mobileLabel.initializer === undefined) count += 1
    }

    if (
      ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === 'renderUserActions'
      && node.arguments[1]?.kind === ts.SyntaxKind.TrueKeyword
    ) {
      count += 1
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return count
}

describe('table row action design contract', () => {
  it('routes every visible จัดการ column through the shared ellipsis trigger', () => {
    const sourceRoot = path.resolve(process.cwd(), 'src')
    const violations = listTsxFiles(sourceRoot).flatMap(getTableActionSurfaceViolations)

    expect(violations).toEqual([])
  })

  it('keeps visible จัดการ columns compact', () => {
    const sourceRoot = path.resolve(process.cwd(), 'src')
    const violations = listTsxFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      if (!actionHeaderPattern.test(source)) return []
      return [...source.matchAll(actionColumnDefinitionPattern)]
        .filter(([definition]) => !definition.includes('defaultWidth: 72') || !definition.includes('minWidth: 64') || !definition.includes('maxWidth: 88'))
        .map(() => path.relative(sourceRoot, file))
    })

    expect(violations).toEqual([])
  })

  it('uses the labelled shared trigger on mobile management cards', () => {
    const sourceRoot = path.resolve(process.cwd(), 'src')
    const mobileActionSurfaces: Array<[string, number]> = [
      ['app/admin/line-settings/LineSettingsPageClient.tsx', 3],
      ['app/admin/users-permissions/AdminUsersPageClient.tsx', 2],
      ['components/daily/DailyExpensePageClient.tsx', 1],
      ['components/daily/DailyPettyAdvancePageClient.tsx', 1],
      ['components/daily/DailyTransferPageClient.tsx', 1],
      ['components/daily/MoneyMovementPageClient.tsx', 3],
      ['components/daily/ReceiptVouchersPageClient.tsx', 1],
      ['components/daily/StockTransferPageClient.tsx', 1],
      ['components/daily/TransactionBillsPageClient.tsx', 1],
      ['components/daily/WeightTicketListPageClient.tsx', 1],
      ['components/finance/foreign/FxRatePageClient.tsx', 1],
      ['components/finance/CustomerAdvancePageClient.tsx', 1],
      ['components/finance-accounting/FixedAssetsPageClients.tsx', 1],
      ['components/dual-costing/CostPoolPageClient.tsx', 1],
      ['components/dual-costing/DualCostingManagementPageClient.tsx', 1],
      ['components/master-data/customers/CustomersPageClient.tsx', 1],
      ['components/master-data/impurities/ImpuritiesPageClient.tsx', 1],
      ['components/master-data/impurity-products/ImpurityProductsPageClient.tsx', 1],
      ['components/master-data/products/ProductsPageClient.tsx', 1],
      ['components/master-data/shared/MasterDataPageClient.tsx', 1],
      ['components/master-data/suppliers/SuppliersPageClient.tsx', 1],
      ['components/production/ProductionOrdersPageClient.tsx', 1],
      ['components/purchase-flow/AdvancePaymentsPageClient.tsx', 1],
      ['components/purchase-flow/PoBuyPageClient.tsx', 1],
      ['components/purchase-flow/TradingMatchingPageClient.tsx', 1],
      ['components/sales/PoSellPageClient.tsx', 1],
      ['components/stock/StockOperationPageClient.tsx', 3],
    ]

    const violations = mobileActionSurfaces.flatMap(([file, expectedCount]) => {
      const count = countMobileActionTriggers(path.join(sourceRoot, file))
      return count < expectedCount ? [`${file}: expected ${expectedCount}, found ${count}`] : []
    })

    expect(violations).toEqual([])
  })
})
