import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/daily/WeightTicketDetailModal.tsx'),
  'utf8',
).replaceAll('\r\n', '\n')

describe('weight ticket detail modal action layout', () => {
  it('keeps the detail header readable and actions reachable on mobile', () => {
    expect(source).toContain('flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between')
    expect(source).toContain('break-words text-base leading-6 text-white sm:truncate sm:text-lg')
    expect(source).toContain('sticky top-0 z-20 shrink-0')
    expect(source).toContain('flex min-w-0 w-full items-center justify-end gap-2 overflow-x-auto')
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
})
