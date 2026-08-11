// @ts-expect-error jsdom is available as a workspace test dependency but does not ship declarations here.
import { JSDOM } from 'jsdom'

import { describe, expect, it } from 'vitest'

import { paginateMeasuredCorporateRows, prepareCorporatePrintLayout } from './corporate-print-layout'

describe('paginateMeasuredCorporateRows', () => {
  it('keeps an empty document on one final page', () => {
    expect(paginateMeasuredCorporateRows([], () => true, () => true)).toEqual([
      { isFinalPage: true, items: [], pageNo: 1 },
    ])
  })

  it('keeps 15 short rows on one final page', () => {
    const rows = Array.from({ length: 15 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(
      rows,
      (candidate) => candidate.length <= 15,
      (candidate) => candidate.length <= 15,
    )

    expect(pages).toEqual([{ isFinalPage: true, items: rows, pageNo: 1 }])
  })

  it('reserves a final page when the final layout has less capacity', () => {
    const rows = Array.from({ length: 16 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(
      rows,
      (candidate) => candidate.length <= 15,
      (candidate) => candidate.length <= 4,
    )

    expect(pages.map((page) => ({ final: page.isFinalPage, count: page.items.length }))).toEqual([
      { final: false, count: 12 },
      { final: true, count: 4 },
    ])
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
  })

  it('creates an empty final page when a row fits only the continuation template', () => {
    const pages = paginateMeasuredCorporateRows(
      [1],
      (candidate) => candidate.length <= 1,
      (candidate) => candidate.length === 0,
      20,
    )

    expect(pages).toEqual([
      { isFinalPage: false, items: [1], pageNo: 1 },
      { isFinalPage: true, items: [], pageNo: 2 },
    ])
  })

  it('moves a long row as a whole to the next page', () => {
    const rows = [
      { id: 1, height: 20 },
      { id: 2, height: 80 },
      { id: 3, height: 20 },
    ]
    const fits = (candidate: readonly typeof rows[number][]) => candidate.reduce((sum, row) => sum + row.height, 0) <= 80
    const pages = paginateMeasuredCorporateRows(rows, fits, fits, 2)

    expect(pages.map((page) => page.items.map((row) => row.id))).toEqual([[1], [2], [3]])
    expect(pages.at(-1)?.isFinalPage).toBe(true)
  })

  it('fails closed when one row cannot fit either page', () => {
    expect(() => paginateMeasuredCorporateRows([1], () => false, () => false)).toThrow(/taller than the available A4 page area/)
  })

  it('never places more than the configured maximum rows on a page', () => {
    const rows = Array.from({ length: 31 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(rows, (candidate) => candidate.length <= 15, (candidate) => candidate.length <= 15)

    expect(Math.max(...pages.map((page) => page.items.length))).toBeLessThanOrEqual(15)
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
  })

  it('derives a safe continuation template when the builder emitted only a final page', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
      <div class="toolbar"><button onclick="window.print()">Print</button></div>
      <main class="page" data-print-page="1" data-final-page="true">
        <div class="header"><h1 class="doc-title">ใบสำคัญการจ่ายเงินล่วงหน้า / มัดจำ</h1><div class="page-label">หน้า 1 / 1</div></div>
        <table>
          <tbody>
            <tr data-row-slot="1"><td>one</td></tr>
            <tr data-row-slot="2"><td>two</td></tr>
          </tbody>
          <tfoot data-page-totals="final"><tr><td colspan="1">100</td></tr></tfoot>
        </table>
        <section class="summary-grid"><div class="value">100</div></section>
        <section class="signatures" data-signatures="final"><div>Sign</div></section>
        <div class="footer"><span>Footer</span><span>หน้า 1 / 1</span></div>
      </main>
    </body></html>`)
    const document = dom.window.document
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: async () => [{ status: 'loaded' }],
        ready: Promise.resolve(),
      },
    })
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      clientHeight: { configurable: true, get: () => 150 },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: {
        configurable: true,
        get(this: HTMLElement) { return this.querySelectorAll('tr[data-row-slot]').length > 1 ? 200 : 100 },
      },
      scrollWidth: { configurable: true, get: () => 800 },
    })

    await prepareCorporatePrintLayout(document)

    const pages = [...document.querySelectorAll<HTMLElement>('[data-corporate-print-page="true"]')]
    expect(document.head.querySelector('style[data-corporate-print-layout]')?.textContent).toContain('print-color-adjust: exact')
    expect(pages).toHaveLength(2)
    expect(pages[0]?.querySelector('[data-page-totals="final"]')).toBeNull()
    expect(pages[0]?.querySelector('[data-page-totals="placeholder"]')).not.toBeNull()
    expect(pages[0]?.querySelector('tfoot.placeholder-total')).not.toBeNull()
    expect(pages[0]?.querySelector('[data-signatures="final"]')).toBeNull()
    expect(pages[0]?.querySelector('section.summary-grid.continuation-summary[data-continuation-summary="placeholder"]')).not.toBeNull()
    expect(pages[0]?.querySelector('.continuation-panel-title')?.textContent).toBe('สรุปการจัดสรร')
    expect(pages[0]?.querySelector('.continuation-signature.continued[data-continuation-signature="true"]')).not.toBeNull()
    expect(pages[0]?.querySelector('.footer')?.textContent).toContain('Footer')
    expect(pages[1]?.querySelector('[data-page-totals="final"]')).not.toBeNull()
    expect(pages[1]?.querySelector('[data-signatures="final"]')).not.toBeNull()
  })

  it('fails closed when an empty template itself overflows A4', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
      <button onclick="window.print()">Print</button>
      <main class="page" data-print-page="1" data-final-page="true">
        <table><tbody><tr class="empty-row" data-row-slot="empty-1"><td>empty</td></tr></tbody></table>
      </main>
    </body></html>`)
    const document = dom.window.document
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: async () => [{ status: 'loaded' }],
        ready: Promise.resolve(),
      },
    })
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      clientHeight: { configurable: true, get: () => 100 },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: { configurable: true, get: () => 120 },
      scrollWidth: { configurable: true, get: () => 800 },
    })

    await prepareCorporatePrintLayout(document)

    expect(document.body.dataset.corporatePrintLayout).toBe('error')
    expect(document.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true)
  })

  it('keeps the builder empty-row prototype when redistributing rows', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
      <main class="page" data-print-page="1" data-final-page="true">
        <table>
          <tbody>
            <tr data-row-slot="1"><td>one</td></tr>
            <tr class="empty-row" data-row-slot="empty-1"><td>&nbsp;</td></tr>
          </tbody>
          <tfoot data-page-totals="final"><tr><td>100</td></tr></tfoot>
        </table>
        <section class="summary-grid"><div>summary</div></section>
        <section class="signatures" data-signatures="final"><div>Sign</div></section>
      </main>
    </body></html>`)
    const document = dom.window.document
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: async () => [{ status: 'loaded' }],
        ready: Promise.resolve(),
      },
    })
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      clientHeight: { configurable: true, get: () => 150 },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: { configurable: true, get: () => 100 },
      scrollWidth: { configurable: true, get: () => 800 },
    })

    await prepareCorporatePrintLayout(document)

    const page = document.querySelector<HTMLElement>('[data-corporate-print-page="true"]')
    expect(page?.querySelectorAll('tbody tr[data-row-slot^="empty-"]').length).toBe(14)
  })

  it('synthesizes an empty-row prototype when a full source page has no filler row', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
      <main class="page" data-print-page="1" data-final-page="true">
        <table>
          <tbody>
            ${Array.from({ length: 15 }, (_, index) => `<tr data-row-slot="${index + 1}" data-source-index="${index}" data-measure-row="row-${index}"><td>row ${index + 1}</td></tr>`).join('')}
          </tbody>
          <tfoot data-page-totals="final"><tr><td>100</td></tr></tfoot>
        </table>
        <section class="summary-grid"><div>summary</div></section>
        <section class="signatures" data-signatures="final"><div>Sign</div></section>
      </main>
    </body></html>`)
    const document = dom.window.document
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: async () => [{ status: 'loaded' }],
        ready: Promise.resolve(),
      },
    })
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      clientHeight: { configurable: true, get: () => 150 },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: {
        configurable: true,
        get() {
          const rows = this.querySelectorAll?.('tbody tr[data-row-slot]').length ?? 0
          return rows > 8 ? 200 : 100
        },
      },
      scrollWidth: { configurable: true, get: () => 800 },
    })

    await prepareCorporatePrintLayout(document)

    const pages = [...document.querySelectorAll<HTMLElement>('[data-corporate-print-page="true"]')]
    expect(pages).toHaveLength(2)
    expect(pages[0]?.querySelector('tr.empty-row')).not.toBeNull()
    expect(pages[0]?.querySelector('tr.empty-row td')?.textContent).toBe('\u00a0')
    expect(pages[0]?.querySelector('tr.empty-row')?.hasAttribute('data-source-index')).toBe(false)
    expect(pages[0]?.querySelector('tr.empty-row')?.hasAttribute('data-measure-row')).toBe(false)
  })
})
