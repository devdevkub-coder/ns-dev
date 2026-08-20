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

  it('fills page 1 first and keeps the real summary on the last non-empty page', () => {
    // Page 1 consumes its full continuation capacity first. The last page keeps
    // at least one real row together with the real summary/signatures.
    const rows = Array.from({ length: 16 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(
      rows,
      (candidate) => candidate.length <= 15,
      (candidate) => candidate.length <= 4,
      15,
      true,
    )

    expect(pages.map((page) => ({ final: page.isFinalPage, count: page.items.length }))).toEqual([
      { final: false, count: 15 },
      { final: true, count: 1 },
    ])
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
  })

  it('never creates an empty page 2 just to hold the summary', () => {
    const rows = Array.from({ length: 11 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(
      rows,
      (candidate) => candidate.length <= 11,
      (candidate) => candidate.length <= 4,
      20,
      true,
    )

    expect(pages.map((page) => ({ final: page.isFinalPage, count: page.items.length }))).toEqual([
      { final: false, count: 10 },
      { final: true, count: 1 },
    ])
    expect(pages[1]?.items.length).toBeGreaterThan(0)
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
  })

  it('fills every earlier placeholder-summary page greedily before the real final summary', () => {
    const rows = Array.from({ length: 40 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(
      rows,
      (candidate) => candidate.length <= 15,
      (candidate) => candidate.length <= 8,
      15,
      true,
    )

    expect(pages.map((page) => ({ final: page.isFinalPage, count: page.items.length }))).toEqual([
      { final: false, count: 15 },
      { final: false, count: 15 },
      { final: false, count: 9 },
      { final: true, count: 1 },
    ])
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
  })

  it('keeps page 1 full before continuing and never emits a blank final summary page', () => {
    // Earlier pages use all available row capacity; the real summary appears
    // only on the last page and that page always contains a real item row.
    const rows = Array.from({ length: 25 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(
      rows,
      (candidate) => candidate.length <= 20,
      (candidate) => candidate.length <= 4,
      20,
      true,
    )

    expect(pages.map((page) => ({ final: page.isFinalPage, count: page.items.length }))).toEqual([
      { final: false, count: 20 },
      { final: false, count: 4 },
      { final: true, count: 1 },
    ])
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
  })

  it('handles multi-page continuation remainder when fillContinuationFirst is true without losing rows', () => {
    const rows = Array.from({ length: 30 }, (_, index) => index + 1)
    const pages = paginateMeasuredCorporateRows(
      rows,
      (candidate) => candidate.length <= 10,
      (candidate) => candidate.length <= 2,
      20,
      true,
    )

    expect(pages.map((page) => ({ final: page.isFinalPage, count: page.items.length }))).toEqual([
      { final: false, count: 10 },
      { final: false, count: 10 },
      { final: false, count: 9 },
      { final: true, count: 1 },
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

  it('rejects a summary-only final page when the caller requires a real final item row', () => {
    expect(() => paginateMeasuredCorporateRows(
      [1],
      (candidate) => candidate.length <= 1,
      (candidate) => candidate.length === 0,
      20,
      false,
      true,
    )).toThrow('หน้าสุดท้ายของใบชั่งต้องมีอย่างน้อย 1 รายการพร้อมกล่องสรุป')
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

  it('paginates form rows without waiting for album photo images', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
      <button onclick="window.print()">Print</button>
      <main class="page" data-print-page="1" data-final-page="true">
        <table>
          <tbody>
            <tr data-row-slot="1"><td>one</td></tr>
            <tr data-row-slot="2"><td>two</td></tr>
          </tbody>
          <tfoot data-page-totals="final"><tr><td>100</td></tr></tfoot>
        </table>
        <section class="summary-grid"><div>summary</div></section>
        <section class="signatures" data-signatures="final"><div>Sign</div></section>
      </main>
      <main class="page attachment-page">
        <div class="album-grid">
          <article class="album-card"><div class="album-image-wrap"><img src="https://storage.example/photo-1.jpg?token=slow"></div></article>
          <article class="album-card"><div class="album-image-wrap"><img src="https://storage.example/photo-2.jpg?token=slow"></div></article>
        </div>
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

    const albumImages = [...document.querySelectorAll<HTMLImageElement>('.attachment-page img')]
    expect(albumImages).toHaveLength(2)
    // Simulate the slowest realistic case: photos still streaming in.
    for (const image of albumImages) {
      Object.defineProperty(image, 'complete', { configurable: true, value: false })
      Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 0 })
    }

    const layoutPromise = prepareCorporatePrintLayout(document)
    // Give the fitter a tick to finish pagination; it must not wait on the
    // album photos, so the form page is laid out and the status shows the
    // photo-streaming message while the images are still pending.
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(document.querySelectorAll('[data-corporate-print-page="true"]')).toHaveLength(1)
    expect(document.querySelector<HTMLElement>('[data-corporate-print-status]')?.textContent).toBe('กำลังโหลดรูปถ่ายแนบ...')
    // The print button must stay locked while photos stream in — printing
    // half-loaded album pages is never allowed.
    expect(document.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true)

    // Now the photos resolve; the fitter releases the print button.
    for (const image of albumImages) {
      image.dispatchEvent(new dom.window.Event('load'))
    }
    await layoutPromise
    expect(document.body.dataset.corporatePrintLayout).toBe('ready')
    expect(document.querySelector<HTMLElement>('[data-corporate-print-status]')?.textContent).toBe('พร้อมพิมพ์ · A4')
    expect(document.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false)
  })

  it('keeps clipped rows out of page 1 while leaving its summary fixed in place', async () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
      <button onclick="window.print()">Print</button>
      <main class="page" data-print-page="1" data-final-page="true">
        <div class="header"><div class="page-label">หน้า 1 / 1</div></div>
        <div class="items-frame" data-print-overflow-guard="items">
          <table>
            <tbody>
              ${Array.from({ length: 11 }, (_, index) => `<tr data-row-slot="${index + 1}"><td>row ${index + 1}</td></tr>`).join('')}
              <tr class="empty" data-row-slot="empty-1"><td>&nbsp;</td></tr>
            </tbody>
            <tfoot data-page-totals="final"><tr><td>total</td></tr></tfoot>
          </table>
        </div>
        <section class="bottom-zone">
          <section class="bottom-grid"><div class="panel">summary</div></section>
          <section class="signatures" data-signatures="final"><div>Sign</div></section>
        </section>
      </main>
    </body></html>`, { url: 'https://print.test/' })
    const document = dom.window.document
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: async () => [{ status: 'loaded' }],
        ready: Promise.resolve(),
      },
    })
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      clientHeight: {
        configurable: true,
        get(this: HTMLElement) {
          if (this.classList?.contains('items-frame')) {
            return this.closest<HTMLElement>('[data-final-page]')?.dataset.finalPage === 'true' ? 80 : 140
          }
          return 300
        },
      },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: {
        configurable: true,
        get(this: HTMLElement) {
          if (this.classList?.contains('items-frame')) {
            return this.querySelectorAll('tr[data-row-slot]').length * 20
          }
          // The A4 page itself never reports overflow: this reproduces the real
          // failure where overflow:hidden on items-frame silently clips rows.
          return 250
        },
      },
      scrollWidth: { configurable: true, get: () => 800 },
    })

    await prepareCorporatePrintLayout(document, {
      maxRowsPerPage: 20,
      reflowRows: true,
      fillContinuationFirst: true,
    })

    const pages = [...document.querySelectorAll<HTMLElement>('[data-corporate-print-page="true"]')]
    const renderedSlots = pages.flatMap((page) => [...page.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-slot]')]
      .filter((row) => !row.dataset.rowSlot?.startsWith('empty-'))
      .map((row) => row.dataset.rowSlot))

    expect(document.body.dataset.corporatePrintLayout).toBe('ready')
    expect(pages).toHaveLength(2)
    expect(pages[0]?.dataset.finalPage).toBe('false')
    expect(pages[0]?.querySelectorAll('tbody tr[data-row-slot]:not([data-row-slot^="empty-"])')).toHaveLength(7)
    expect(pages[0]?.querySelector('[data-signatures="final"]')).toBeNull()
    expect(pages[0]?.querySelector('[data-continuation-panels="placeholder"]')).not.toBeNull()
    expect(pages[1]?.dataset.finalPage).toBe('true')
    expect(pages[1]?.querySelectorAll('tbody tr[data-row-slot]:not([data-row-slot^="empty-"])')).toHaveLength(4)
    expect(pages[1]?.querySelector('[data-signatures="final"]')).not.toBeNull()
    expect(renderedSlots).toEqual(Array.from({ length: 11 }, (_, index) => String(index + 1)))
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
