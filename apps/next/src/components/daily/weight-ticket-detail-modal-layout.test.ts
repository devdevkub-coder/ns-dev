import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketDetailModal.tsx'),
  'utf8',
).replaceAll('\r\n', '\n')
const globalStyles = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8').replaceAll('\r\n', '\n')

describe('weight ticket detail modal action layout', () => {
  it('keeps the detail header readable and actions reachable on mobile', () => {
    expect(source).toContain('grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start')
    expect(source).toContain('break-words text-base leading-6 text-white sm:truncate sm:text-lg')
    expect(source).toContain('relative z-20 shrink-0 !space-y-0 overflow-visible')
    expect(source).toContain('relative z-30 flex min-h-10 min-w-0 w-full flex-wrap items-center justify-start gap-2 overflow-visible')
    expect(source).not.toContain('items-center justify-end gap-2 overflow-x-auto')
    expect(source).not.toContain('max-w-[min(58vw,15rem)]')
  })

  it('uses an accessible icon-only confirmation action on mobile while preserving its desktop label', () => {
    const confirmationAction = source.slice(
      source.indexOf('canConfirmWeightTicket(ticket)'),
      source.indexOf('{canReturnStock'),
    )

    expect(confirmationAction).toContain('<CheckCircle2 className="size-4" />')
    expect(confirmationAction).toContain(
      'h-10 w-10 shrink-0 gap-0 bg-emerald-600 px-0 text-white hover:bg-emerald-700 sm:h-9 sm:w-auto sm:gap-2 sm:px-4',
    )
    expect(confirmationAction).toContain('<span className="sr-only sm:not-sr-only">')
    expect(confirmationAction).toMatch(
      /aria-label=\{\s*isConfirming\s*\?\s*'กำลังยืนยัน'\s*:\s*ticket\.type === 'WTI'\s*\?\s*'ยืนยันรับของ'\s*:\s*'ยืนยันส่งของ'\s*\}/,
    )
  })

  it('uses the same blue action treatment for both detail-header edit paths', () => {
    const editAction = source.slice(
      source.indexOf('{ticket.canEdit ?'),
      source.indexOf('{canShareWeightTicket'),
    )

    expect(editAction).toContain('border-blue-600 bg-blue-600')
    expect(editAction).toContain('hover:border-blue-700 hover:bg-blue-700')
    expect(editAction).not.toContain('bg-slate-800')
  })

  it('does not apply the mobile scroll-body flex rules to dialog headers', () => {
    expect(globalStyles).toContain(
      '[data-ns-dialog-content="app"] > :where(.bg-slate-50, .bg-white, .bg-slate-900, .overflow-auto, .overflow-y-auto):not([data-ns-dialog-header])',
    )
    expect(globalStyles).not.toContain(
      '[data-ns-dialog-content="app"] > :where(.bg-slate-50, .bg-white, .bg-slate-900, .overflow-auto, .overflow-y-auto) {',
    )
  })
})
