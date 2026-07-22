import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { Dialog, DialogDescription, DialogHeader, DialogTitle } from './Dialog'
import { TableHeader } from './Table'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const globalsCssPath = fileURLToPath(new URL('../../app/globals.css', import.meta.url))
const darkHeaderClassPattern = /(?:^|[\s'"`])(?:bg-slate-(?:800|900|950)|bg-\[#0f172a\])(?=$|[\s'"`])/
const paddingClassPattern = /(?:^|[\s'"`])(?:p|px|py|pt|pb|pl|pr)-\S+/

type JsxOpening = ts.JsxOpeningElement | ts.JsxSelfClosingElement

async function tsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && entry.name.endsWith('.tsx') && !/\.(?:test|spec)\.tsx$/.test(entry.name) ? [path] : []
  }))
  return files.flat().sort()
}

function openingElement(node: ts.Node): JsxOpening | null {
  if (ts.isJsxElement(node)) return node.openingElement
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) return node
  return null
}

function tagName(node: JsxOpening) {
  return node.tagName.getText()
}

function hasAttribute(node: JsxOpening, name: string) {
  return node.attributes.properties.some((property) => (
    ts.isJsxAttribute(property)
    && ts.isIdentifier(property.name)
    && property.name.text === name
  ))
}

function staticAttribute(node: JsxOpening, name: string): string | true | null {
  const attribute = node.attributes.properties.find((property) => (
    ts.isJsxAttribute(property)
    && ts.isIdentifier(property.name)
    && property.name.text === name
  ))
  if (!attribute || !ts.isJsxAttribute(attribute)) return null
  if (!attribute.initializer) return true
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    const expression = attribute.initializer.expression
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  }
  return null
}

function nearestJsxParent(node: ts.Node): JsxOpening | null {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const opening = openingElement(parent)
    if (opening) return opening
  }
  return null
}

function hasHeading(node: ts.JsxElement) {
  let found = false
  const visit = (child: ts.Node) => {
    const opening = openingElement(child)
    if (opening && /^(?:h[1-6]|DialogTitle)$/.test(tagName(opening))) found = true
    if (!found) ts.forEachChild(child, visit)
  }
  ts.forEachChild(node, visit)
  return found
}

function hasClassToken(node: JsxOpening, pattern: RegExp) {
  return pattern.test(node.getText())
}

function isModalPanel(node: JsxOpening) {
  if (tagName(node) === 'DialogContent') return true
  if (staticAttribute(node, 'role') === 'dialog') return true
  if (staticAttribute(node, 'aria-modal') === true || staticAttribute(node, 'aria-modal') === 'true') return true
  if (staticAttribute(node, 'data-ns-modal-shell') === 'dialog') return true

  const source = node.getText()
  return /(?:^|[\s'"`])overflow-hidden(?=$|[\s'"`])/.test(source)
    && /(?:^|[\s'"`])(?:rounded(?:-md|-none)?|shadow-(?:xl|2xl))(?=$|[\s'"`])/.test(source)
}

function isModalHeaderSlot(node: ts.JsxElement) {
  const parent = nearestJsxParent(node)
  if (!parent) return false
  if (isModalPanel(parent)) return true

  if (tagName(parent) === 'form') {
    const panel = nearestJsxParent(parent)
    return panel ? isModalPanel(panel) : false
  }

  return false
}

function cssRule(source: string, selector: string) {
  const normalizedSource = source.replace(/\r\n/g, '\n')
  const normalizedSelector = selector.replace(/\r\n/g, '\n')
  const start = normalizedSource.indexOf(`${normalizedSelector} {`)
  if (start < 0) return ''
  return normalizedSource.slice(start, normalizedSource.indexOf('}', start) + 1)
}

describe('Dialog header palette', () => {
  it('shares the table-header palette in light and dark themes', async () => {
    const dialogHtml = renderToStaticMarkup(
      <Dialog open>
        <DialogHeader>
          <DialogTitle>รายละเอียดเอกสาร</DialogTitle>
          <DialogDescription>คู่ค้า</DialogDescription>
        </DialogHeader>
      </Dialog>,
    )
    const tableHtml = renderToStaticMarkup(
      <table>
        <TableHeader><tr><th>เอกสาร</th></tr></TableHeader>
      </table>,
    )
    const css = await readFile(globalsCssPath, 'utf8')
    const dialogRule = cssRule(css, '[data-ns-dialog-header]')
    const darkDialogRule = cssRule(css, '.dark [data-ns-dialog-header]')
    const legacyDarkDialogRule = cssRule(css, [
      '.dark [data-ns-dialog-header].bg-slate-800.text-white,',
      '.dark [data-ns-dialog-header].bg-slate-900.text-white,',
      '.dark [data-ns-dialog-header].bg-slate-950.text-white',
    ].join('\n'))
    const tableRule = cssRule(css, 'table.ns-table :where(thead)')
    const darkTableRule = cssRule(css, '.dark table.ns-table :where(thead)')

    expect(dialogHtml).toContain('data-ns-dialog-header="true"')
    expect(dialogHtml).toContain('!border-slate-200')
    expect(dialogHtml).toContain('!bg-slate-100')
    expect(dialogHtml).toContain('!text-slate-700')
    expect(dialogHtml).toContain('dark:![background-color:var(--ns-dark-table-header)]')
    expect(dialogHtml).toContain('dark:![color:var(--ns-dark-text)]')
    expect(dialogHtml).toContain('dark:![color:var(--ns-dark-muted)]')
    expect(tableHtml).toContain('border-slate-200 bg-slate-100')
    expect(tableHtml).toContain('text-slate-700')
    expect(dialogRule).toContain('background-color: var(--color-slate-100) !important')
    expect(tableRule).toContain('background: var(--color-slate-100) !important')
    expect(darkDialogRule).toContain('background-color: var(--ns-dark-table-header) !important')
    expect(legacyDarkDialogRule).toContain('background-color: var(--ns-dark-table-header) !important')
    expect(darkTableRule).toContain('background-color: var(--ns-dark-table-header) !important')
  })

  it('marks every custom dark modal header with the shared dialog-header contract', async () => {
    const violations: string[] = []

    for (const file of await tsxFiles(sourceRoot)) {
      const source = await readFile(file, 'utf8')
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node)) {
          const opening = node.openingElement
          const nativeHeader = /^(?:div|header|section)$/.test(tagName(opening))
          const isCustomDarkHeader = nativeHeader
            && hasClassToken(opening, darkHeaderClassPattern)
            && hasClassToken(opening, paddingClassPattern)
            && hasHeading(node)
            && isModalHeaderSlot(node)

          if (isCustomDarkHeader && !hasAttribute(opening, 'data-ns-dialog-header')) {
            const line = sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile)).line + 1
            violations.push(`${relative(sourceRoot, file).split(sep).join('/')}:${line}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
    }

    expect(violations).toEqual([])
  }, 15_000)
})
