export const CORPORATE_PRINT_MAX_ROWS_PER_PAGE = 15

export type MeasuredCorporatePage<T> = {
  isFinalPage: boolean
  items: T[]
  pageNo: number
}

/**
 * Build a page plan from the actual page fitter instead of assuming that every
 * row has the same height. The fitter is kept outside this function so the
 * pagination contract remains deterministic and unit-testable without a DOM.
 */
export function paginateMeasuredCorporateRows<T>(
  rows: readonly T[],
  fitsContinuationPage: (candidateRows: readonly T[]) => boolean,
  fitsFinalPage: (candidateRows: readonly T[]) => boolean,
  maxRowsPerPage = CORPORATE_PRINT_MAX_ROWS_PER_PAGE,
): MeasuredCorporatePage<T>[] {
  if (maxRowsPerPage < 1 || !Number.isInteger(maxRowsPerPage)) {
    throw new Error('maxRowsPerPage must be a positive integer')
  }

  if (rows.length === 0) return [{ isFinalPage: true, items: [], pageNo: 1 }]

  // Reserve a fitting suffix for the final page first. This prevents a
  // continuation page from accidentally becoming the last page when the
  // final-page cards/signatures need more space than the table alone.
  let finalCount = Math.min(rows.length, maxRowsPerPage)
  while (finalCount > 0 && !fitsFinalPage(rows.slice(rows.length - finalCount))) {
    finalCount -= 1
  }
  if (finalCount === 0) {
    throw new Error(`Corporate print row ${rows.length} is taller than the available A4 page area`)
  }

  const pages: MeasuredCorporatePage<T>[] = []
  const continuationRows = rows.slice(0, rows.length - finalCount)
  let cursor = 0
  while (cursor < continuationRows.length) {
    let continuationCount = Math.min(continuationRows.length - cursor, maxRowsPerPage)
    while (
      continuationCount > 0
      && !fitsContinuationPage(continuationRows.slice(cursor, cursor + continuationCount))
    ) {
      continuationCount -= 1
    }
    if (continuationCount === 0) {
      throw new Error(`Corporate print row ${cursor + 1} is taller than the available A4 page area`)
    }
    pages.push({
      isFinalPage: false,
      items: [...continuationRows.slice(cursor, cursor + continuationCount)],
      pageNo: pages.length + 1,
    })
    cursor += continuationCount
  }

  pages.push({
    isFinalPage: true,
    items: [...rows.slice(rows.length - finalCount)],
    pageNo: pages.length + 1,
  })
  return pages
}

type CorporatePrintLayoutOptions = {
  maxRowsPerPage?: number
  orientation?: 'landscape' | 'portrait'
  timeoutMs?: number
  /**
   * Keep independently-rendered documents separate (for example a batch of
   * receipt vouchers). The attribute is internal to the print HTML contract.
   */
  groupAttribute?: string
  /** Dedicated builders (WTI/WTO) already own their row capacities. */
  reflowRows?: boolean
}

type PrintPageElement = HTMLElement & {
  dataset: DOMStringMap & {
    finalPage?: string
    printPage?: string
  }
}

function hasDom(document: Document): document is Document & {
  querySelectorAll: Document['querySelectorAll']
} {
  return typeof document?.querySelectorAll === 'function'
}

function isRealRow(row: HTMLTableRowElement) {
  const slot = row.dataset.rowSlot ?? ''
  return Boolean(slot) && !slot.startsWith('empty-') && !slot.startsWith('empty-runtime-')
}

function pageRows(page: PrintPageElement) {
  const body = page.querySelector('tbody')
  if (!body) return []
  return Array.from(body.querySelectorAll<HTMLTableRowElement>('tr[data-row-slot]')).filter(isRealRow)
}

function pageBody(page: PrintPageElement) {
  return page.querySelector<HTMLTableSectionElement>('tbody')
}

function pageEmptyPrototype(page: PrintPageElement) {
  const body = pageBody(page)
  return body?.querySelector<HTMLTableRowElement>('tr[data-row-slot^="empty-"], tr.empty-row, tr.empty') ?? null
}

function synthesizeEmptyPrototype(page: PrintPageElement) {
  const source = pageRows(page)[0]
  if (!source) return null

  const prototype = source.cloneNode(true) as HTMLTableRowElement
  prototype.classList.add('empty', 'empty-row')
  prototype.dataset.rowSlot = 'empty-prototype'
  prototype.removeAttribute('data-source-index')
  prototype.removeAttribute('data-measure-row')
  prototype.querySelectorAll<HTMLElement>('[data-source-index], [data-measure-row]').forEach((element) => {
    element.removeAttribute('data-source-index')
    element.removeAttribute('data-measure-row')
  })
  prototype.querySelectorAll<HTMLTableCellElement>('th, td').forEach((cell) => {
    cell.innerHTML = '&nbsp;'
  })
  return prototype
}

function pageGroups(pages: readonly PrintPageElement[], groupAttribute?: string) {
  if (!groupAttribute) return [Array.from(pages)]

  const groups = new Map<string, PrintPageElement[]>()
  pages.forEach((page, index) => {
    // Missing group metadata must never merge unrelated pages by accident.
    const key = page.getAttribute(groupAttribute) ?? `__page-${index}`
    const group = groups.get(key) ?? []
    group.push(page)
    groups.set(key, group)
  })
  return Array.from(groups.values())
}

function clearPageRows(page: PrintPageElement) {
  pageBody(page)?.replaceChildren()
}

function cloneRows(rows: readonly HTMLTableRowElement[]) {
  return rows.map((row) => row.cloneNode(true) as HTMLTableRowElement)
}

function setPageMetadata(page: PrintPageElement, pageNo: number, totalPages: number, isFinalPage: boolean) {
  page.dataset.printPage = String(pageNo)
  page.dataset.finalPage = String(isFinalPage)
  page.classList.toggle('page-break-before', pageNo > 1)
  page.classList.toggle('final-page', isFinalPage)

  page.querySelectorAll<HTMLElement>('.page-label, .print-footer, .kv .value, .footer > span:last-child').forEach((label) => {
    label.textContent = label.textContent
      ?.replace(/หน้า\s*\d+\s*\/\s*\d+/g, `หน้า ${pageNo} / ${totalPages}`)
      .replace(/Page\s*\d+\s*\/\s*\d+/gi, `Page ${pageNo} / ${totalPages}`) ?? `หน้า ${pageNo} / ${totalPages}`
  })

  const continuedText = `( มีต่อหน้า ${pageNo + 1} / Continued on Page ${pageNo + 1} ➔ )`
  page.querySelectorAll<HTMLElement>('[data-continuation-signature="true"], .continued, .continuation-signature').forEach((element) => {
    if (isFinalPage) {
      element.remove()
      return
    }
    element.textContent = continuedText
  })
}

function overflows(page: PrintPageElement) {
  return page.clientHeight > 0 && (
    page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1
  )
}

function measureCandidate(
  document: Document,
  template: PrintPageElement,
  rows: readonly HTMLTableRowElement[],
  isFinalPage: boolean,
) {
  const candidate = template.cloneNode(true) as PrintPageElement
  candidate.style.position = 'absolute'
  candidate.style.left = '-12000px'
  candidate.style.top = '0'
  candidate.style.visibility = 'hidden'
  candidate.style.margin = '0'
  candidate.dataset.corporatePrintPage = 'true'
  setPageMetadata(candidate, 1, 1, isFinalPage)
  clearPageRows(candidate)
  pageBody(candidate)?.append(...cloneRows(rows))
  document.body.appendChild(candidate)
  const canMeasure = candidate.clientHeight > 0
  const fits = canMeasure && !overflows(candidate)
  candidate.remove()
  return fits
}

function itemTable(page: PrintPageElement) {
  return Array.from(page.querySelectorAll<HTMLTableElement>('table')).find((table) => (
    table.querySelector('tbody tr[data-row-slot]') !== null
  )) ?? page.querySelector<HTMLTableElement>('table')
}

function continuationPanelTitle(document: Document, title: string) {
  const panel = document.createElement('div')
  panel.className = 'continuation-summary-panel'
  const heading = document.createElement('div')
  heading.className = 'continuation-panel-title'
  heading.textContent = title
  const placeholder = document.createElement('div')
  placeholder.className = 'continuation-placeholder'
  placeholder.textContent = '-'
  panel.append(heading, placeholder)
  return panel
}

/**
 * A builder normally emits a real continuation template. If the first render
 * produced only one final page, derive a safe continuation template instead of
 * cloning real totals/signatures onto an intermediate page.
 */
function createContinuationTemplate(finalTemplate: PrintPageElement) {
  const template = finalTemplate.cloneNode(true) as PrintPageElement
  const finalTable = itemTable(finalTemplate)
  const table = itemTable(template)
  if (!finalTable || !table?.parentElement) return null

  template.querySelectorAll<HTMLElement>('[data-signatures="final"]').forEach((element) => element.remove())
  template.querySelectorAll<HTMLElement>(
    '[data-page-totals="final"]',
  ).forEach((footer) => {
    const sourceRow = footer.querySelector('tr')
    const columnCount = sourceRow
      ? Array.from(sourceRow.children).reduce((count, cell) => count + Number(cell.getAttribute('colspan') || '1'), 0)
      : 1
    const placeholderFooter = footer.ownerDocument.createElement('tfoot')
    const footerClasses = new Set(footer.className.split(/\s+/).filter(Boolean))
    footerClasses.add('placeholder-total')
    placeholderFooter.className = Array.from(footerClasses).join(' ')
    placeholderFooter.dataset.pageTotals = 'placeholder'
    const row = footer.ownerDocument.createElement('tr')
    const cell = footer.ownerDocument.createElement('td')
    cell.colSpan = columnCount
    cell.innerHTML = '&nbsp;'
    row.appendChild(cell)
    placeholderFooter.appendChild(row)
    footer.replaceWith(placeholderFooter)
  })

  const tableHost = table.parentElement?.matches('.items-frame') ? table.parentElement : table
  const parent = tableHost.parentElement
  if (!parent) return null
  const tableHostIndex = Array.from(parent.children).indexOf(tableHost)
  if (tableHostIndex < 0) return null

  const continuationWrapper = ['.bottom-grid', '.summary-grid', '.continuation-summary']
    .map((selector) => Array.from(parent.children).find((child) => child.matches(selector)))
    .find((child): child is Element => Boolean(child))
  const continuationClasses = new Set(continuationWrapper?.className.split(/\s+/).filter(Boolean) ?? [])
  continuationClasses.add('continuation-summary')

  const preservedFooter: Element[] = []
  Array.from(parent.children).slice(tableHostIndex + 1).forEach((child) => {
    if (child.matches('.footer')) {
      preservedFooter.push(child.cloneNode(true) as Element)
    } else {
      const legalNote = child.matches('.legal-note, .footer')
        ? child
        : child.querySelector<HTMLElement>('.legal-note, .footer')
      if (legalNote) preservedFooter.push(legalNote.cloneNode(true) as Element)
    }
    child.remove()
  })

  const continuation = parent.ownerDocument.createElement('section')
  continuation.className = Array.from(continuationClasses).join(' ')
  continuation.dataset.continuationSummary = 'placeholder'
  continuation.setAttribute('aria-label', 'Continuation page summary placeholders')
  const documentType = finalTemplate.dataset.documentType
  const documentTitle = finalTemplate.querySelector<HTMLElement>('.doc-title, h1')?.textContent?.trim().toLowerCase() ?? ''
  const title = /อนุมัติ|approval|cashier/.test(documentTitle)
    ? 'สรุปการอนุมัติจ่าย'
    : /ล่วงหน้า|มัดจำ|advance/.test(documentTitle)
      ? 'สรุปการจัดสรร'
      : documentType === 'RCP' || documentType === 'RV' || /รับเงิน|receipt/.test(documentTitle)
        ? 'รายละเอียดการรับเงิน'
        : documentType === 'PMT' || /จ่ายเงิน|payment/.test(documentTitle)
          ? 'รายละเอียดการจ่ายเงิน'
          : /ค่าใช้จ่าย|expense/.test(documentTitle)
            ? 'สรุปค่าใช้จ่าย'
            : 'สรุปตามหมวดสินค้า'
  continuation.append(
    continuationPanelTitle(parent.ownerDocument, title),
    continuationPanelTitle(parent.ownerDocument, 'หมายเหตุ'),
  )

  const marker = parent.ownerDocument.createElement('div')
  marker.className = 'continuation-signature continued'
  marker.dataset.continuationSignature = 'true'
  marker.textContent = '( มีต่อหน้า 2 / Continued on Page 2 ➔ )'
  parent.append(continuation, marker, ...preservedFooter)
  return template
}

function normalizePrintPages(document: Document, pages: readonly PrintPageElement[], orientation: 'landscape' | 'portrait') {
  const style = document.createElement('style')
  style.dataset.corporatePrintLayout = 'true'
  const pageSelector = '[data-corporate-print-page="true"]'
  const isLandscape = orientation === 'landscape'
  style.textContent = `
    ${pageSelector} {
      box-sizing: border-box !important;
      width: ${isLandscape ? '297mm' : '210mm'} !important;
      height: ${isLandscape ? '210mm' : '297mm'} !important;
      min-height: ${isLandscape ? '210mm' : '297mm'} !important;
      max-height: ${isLandscape ? '210mm' : '297mm'} !important;
      padding: 8mm !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
      break-after: page !important;
      page-break-after: always !important;
    }
    ${pageSelector}:last-of-type { break-after: auto !important; page-break-after: auto !important; }
    @page { size: A4 ${orientation}; margin: 8mm; }
    @media print {
      ${pageSelector} {
        width: ${isLandscape ? '281mm' : '194mm'} !important;
        height: ${isLandscape ? '194mm' : '281mm'} !important;
        min-height: ${isLandscape ? '194mm' : '281mm'} !important;
        max-height: ${isLandscape ? '194mm' : '281mm'} !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
    }
  `
  document.head.appendChild(style)
  pages.forEach((page) => page.setAttribute('data-corporate-print-page', 'true'))
}

function ensurePrintStatus(document: Document) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[onclick*="window.print"], button[data-print-action="true"]'))
  buttons.forEach((button) => {
    button.disabled = true
    button.dataset.corporatePrintPending = 'true'
    if (!button.nextElementSibling?.matches('[data-corporate-print-status]')) {
      const status = document.createElement('span')
      status.dataset.corporatePrintStatus = 'true'
      status.textContent = 'กำลังจัดหน้าเอกสาร...'
      status.style.cssText = 'display:inline-block;min-width:178px;color:#cbd5e1;font-size:12px'
      button.insertAdjacentElement('afterend', status)
    }
  })
  return buttons
}

function setPrintStatus(buttons: readonly HTMLButtonElement[], message: string, isError = false) {
  buttons.forEach((button) => {
    button.disabled = isError
    button.dataset.corporatePrintReady = String(!isError)
    const status = button.nextElementSibling?.matches('[data-corporate-print-status]')
      ? button.nextElementSibling as HTMLElement
      : null
    if (status) {
      status.textContent = message
      status.style.color = isError ? '#fecaca' : '#cbd5e1'
      status.style.fontWeight = isError ? '700' : '400'
    }
  })
}

async function waitForPrintAssets(document: Document, timeoutMs: number) {
  const imagePromises = Array.from(document.images).map((image) => {
    if (image.complete) {
      return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error('โหลดโลโก้หรือรูปภาพเอกสารไม่สำเร็จ'))
    }
    return new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error('โหลดโลโก้หรือรูปภาพเอกสารไม่สำเร็จ')), { once: true })
    })
  })
  const fonts = document.fonts
  if (!fonts || typeof fonts.load !== 'function' || !fonts.ready) {
    throw new Error('Browser ไม่รองรับการตรวจสอบฟอนต์ Noto Sans Thai')
  }
  imagePromises.push(
    Promise.all([
      fonts.load("400 12px 'Noto Sans Thai'", 'กข123'),
      fonts.load("700 12px 'Noto Sans Thai'", 'กข123'),
    ]).then((loadedFaces) => {
      if (loadedFaces.some((faces) => faces.length === 0 || faces.some((face) => face.status !== 'loaded'))) {
        throw new Error('โหลดฟอนต์ Noto Sans Thai ไม่สำเร็จ')
      }
    }),
    fonts.ready.then(() => undefined),
  )
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error('รอฟอนต์หรือรูปภาพนานเกินกำหนด')), timeoutMs)
  })
  try {
    await Promise.race([Promise.all(imagePromises), timeout])
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
  }
}

function appendEmptyRows(
  page: PrintPageElement,
  maxRowsPerPage: number,
  prototypeOverride?: HTMLTableRowElement | null,
) {
  const body = pageBody(page)
  const prototype = prototypeOverride ?? pageEmptyPrototype(page)
  if (!body || !prototype) return
  const currentRows = pageRows(page).length
  let added = 0
  while (currentRows + added < maxRowsPerPage) {
    const empty = prototype.cloneNode(true) as HTMLTableRowElement
    empty.dataset.rowSlot = `empty-runtime-${added + 1}`
    body.appendChild(empty)
    if (overflows(page)) {
      empty.remove()
      break
    }
    added += 1
  }
}

function copyPageRows(page: PrintPageElement, rows: readonly HTMLTableRowElement[]) {
  const emptyPrototype = (pageEmptyPrototype(page) ?? synthesizeEmptyPrototype(page))?.cloneNode(true) as HTMLTableRowElement | null
  clearPageRows(page)
  pageBody(page)?.append(...cloneRows(rows))
  return emptyPrototype
}

function markLayoutError(document: Document, buttons: readonly HTMLButtonElement[], message: string) {
  document.body.dataset.corporatePrintLayout = 'error'
  setPrintStatus(buttons, message, true)
}

/**
 * Apply the shared measured A4 contract to an existing browser-print document.
 * Builders keep their domain-specific markup; this layer only redistributes
 * complete table rows and preserves final-page totals/signatures.
 */
export async function prepareCorporatePrintLayout(
  document: Document,
  options: CorporatePrintLayoutOptions = {},
) {
  if (!hasDom(document)) return
  const pages = Array.from(document.querySelectorAll<PrintPageElement>('[data-print-page]'))
  const formPages = pages.filter((page) => pageRows(page).length > 0 || pageEmptyPrototype(page))
  if (formPages.length === 0) return

  const buttons = ensurePrintStatus(document)
  const maxRowsPerPage = options.maxRowsPerPage ?? CORPORATE_PRINT_MAX_ROWS_PER_PAGE
  const orientation = options.orientation ?? 'portrait'
  let layoutAnchor: Comment | null = null
  let layoutParent: HTMLElement | null = null
  const generatedPages: PrintPageElement[] = []

  try {
    normalizePrintPages(document, formPages, orientation)
    await waitForPrintAssets(document, options.timeoutMs ?? 8_000)

    if (options.reflowRows === false) {
      const overflowPages = formPages.filter(overflows).map((page) => page.dataset.printPage ?? '?')
      if (overflowPages.length > 0) {
        throw new Error(`หน้ ${overflowPages.join(', ')} มีเนื้อหาล้นกรอบ A4`)
      }
      setPrintStatus(buttons, 'พร้อมพิมพ์ · A4')
      document.body.dataset.corporatePrintLayout = 'ready'
      return
    }

    const groups = pageGroups(formPages, options.groupAttribute)
    const groupPlans = groups.map((group) => {
      const allRows = group.flatMap((page) => pageRows(page).map((row) => row.cloneNode(true) as HTMLTableRowElement))
      const finalTemplate = group.find((page) => page.dataset.finalPage === 'true') ?? group.at(-1)
      if (!finalTemplate) throw new Error('ไม่พบหน้าสุดท้ายของเอกสารสำหรับจัดหน้า')
      if (allRows.length === 0) {
        return { group, allRows, plans: null as ReturnType<typeof paginateMeasuredCorporateRows<HTMLTableRowElement>> | null }
      }
      const continuationTemplate = group.find((page) => page.dataset.finalPage !== 'true')
        ?? createContinuationTemplate(finalTemplate)
      if (!continuationTemplate && allRows.length > maxRowsPerPage) {
        throw new Error('เอกสารมีรายการเกินพื้นที่หน้าแรก แต่ไม่มี template หน้าต่อเนื่อง')
      }

      const continuation = continuationTemplate ?? finalTemplate
      const plans = paginateMeasuredCorporateRows(
        allRows,
        (candidateRows) => measureCandidate(document, continuation, candidateRows, false),
        (candidateRows) => measureCandidate(document, finalTemplate, candidateRows, true),
        maxRowsPerPage,
      )
      return { group, allRows, plans }
    })
    if (groupPlans.every(({ allRows }) => allRows.length === 0)) {
      const overflowPages = formPages.filter(overflows).map((page) => page.dataset.printPage ?? '?')
      if (overflowPages.length > 0) {
        throw new Error(`หน้ ${overflowPages.join(', ')} มีเนื้อหาล้นกรอบ A4`)
      }
      setPrintStatus(buttons, 'พร้อมพิมพ์ · A4')
      document.body.dataset.corporatePrintLayout = 'ready'
      return
    }

    const firstPage = formPages[0]
    const parent = firstPage?.parentElement
    if (!parent) throw new Error('ไม่พบพื้นที่แทรกหน้าพิมพ์')
    layoutParent = parent
    layoutAnchor = document.createComment('corporate-print-layout-anchor')
    parent.insertBefore(layoutAnchor, firstPage)
    formPages.forEach((page) => page.remove())

    groupPlans.forEach(({ group, plans }) => {
      if (!plans) {
        group.forEach((page) => parent.insertBefore(page, layoutAnchor))
        return
      }

      const finalTemplate = group.find((page) => page.dataset.finalPage === 'true') ?? group.at(-1)
      if (!finalTemplate) throw new Error('ไม่พบ template หน้าสุดท้ายของเอกสารสำหรับจัดหน้า')
      const continuation = group.find((page) => page.dataset.finalPage !== 'true')
        ?? createContinuationTemplate(finalTemplate)
        ?? finalTemplate
      plans.forEach((plan) => {
        const template = (plan.isFinalPage ? finalTemplate : continuation).cloneNode(true) as PrintPageElement
        setPageMetadata(template, plan.pageNo, plans.length, plan.isFinalPage)
        const emptyPrototype = copyPageRows(template, plan.items)
        parent.insertBefore(template, layoutAnchor)
        appendEmptyRows(template, maxRowsPerPage, emptyPrototype)
        template.dataset.corporatePrintPage = 'true'
        generatedPages.push(template)
      })
    })

    const outputPages = Array.from(document.querySelectorAll<PrintPageElement>('[data-corporate-print-page="true"]'))
      .filter((page) => page.querySelector('tbody'))
    const overflowPages = outputPages.filter(overflows).map((page) => page.dataset.printPage ?? '?')
    if (overflowPages.length > 0) throw new Error(`หน้า ${overflowPages.join(', ')} มีเนื้อหาล้นกรอบ A4`)

    layoutAnchor.remove()
    layoutAnchor = null
    setPrintStatus(buttons, 'พร้อมพิมพ์ · A4')
    document.body.dataset.corporatePrintLayout = 'ready'
  } catch (error) {
    generatedPages.forEach((page) => page.remove())
    const restoreAnchor = layoutAnchor
    const restoreParent = layoutParent
    if (restoreAnchor?.parentNode && restoreParent) {
      formPages.forEach((page) => restoreParent.insertBefore(page, restoreAnchor))
      restoreAnchor.remove()
    }
    formPages.forEach((page) => page.removeAttribute('data-corporate-print-page'))
    markLayoutError(document, buttons, error instanceof Error ? error.message : 'จัดหน้าเอกสารไม่สำเร็จ')
  }
}
