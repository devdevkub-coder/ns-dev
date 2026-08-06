import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketDetailModal.tsx'),
  'utf8',
).replaceAll('\r\n', '\n')

describe('weight ticket detail modal action layout', () => {
  it('keeps draft confirmation actions visible on mobile without a horizontal scroller', () => {
    expect(source).toContain('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between')
    expect(source).toContain('flex flex-wrap items-center justify-end gap-2')
    expect(source).not.toContain('max-w-[min(58vw,15rem)]')
    expect(source).not.toContain('overflow-x-auto pb-0.5')
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
})
