import { describe, expect, it } from 'vitest'
import { formatThaiDateCE, formatThaiMonthYearLabel } from './format'

describe('central date formatters (ค.ศ. standard)', () => {
  it('formats month + year with the CE year, not the Buddhist era year', () => {
    expect(formatThaiMonthYearLabel('2026', '08')).toBe('สิงหาคม 2026')
    // The Buddhist-era rendering would be "สิงหาคม 2569" — the gregory calendar must be enforced.
    expect(formatThaiMonthYearLabel('2026', '08')).not.toContain('2569')
  })

  it('formats date-time with the CE year', () => {
    const date = new Date('2026-08-05T14:30:00.000Z')
    const rendered = formatThaiDateCE(date, { day: '2-digit', month: '2-digit', year: 'numeric' })
    expect(rendered).toContain('2026')
    expect(rendered).not.toContain('2569')
  })

  it('keeps the Thai month names while switching only the era to CE', () => {
    expect(formatThaiMonthYearLabel('2025', '01')).toBe('มกราคม 2025')
    expect(formatThaiMonthYearLabel('2024', '12')).toBe('ธันวาคม 2024')
  })
})
