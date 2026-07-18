import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

describe('required manual-entry field highlighting contract', () => {
  it('keeps required manual fields yellow while excluding automatic, readonly, disabled, and invalid fields', () => {
    const css = source('../../app/globals.css')

    expect(css).toContain('--ns-manual-required-bg: #fff7cc')
    expect(css).toContain('[data-manual-required="true"]')
    expect(css).toContain(':required:not(:disabled):not([readonly])')
    expect(css).toContain(':not([aria-invalid="true"])')
    expect(css).toContain(':not([data-auto-filled="true"])')
    expect(css).toContain('Required manual fields must stay yellow while focused')
    expect(css).not.toContain(':where([data-manual-required="true"]):not([data-field-invalid="true"])')
  })

  it('marks the shared searchable, branch, and select field families from their required labels', () => {
    expect(source('./SearchCombobox.tsx')).toContain("data-manual-required={hasInlineRequired ? 'true' : undefined}")
    expect(source('./BranchSelectCombobox.tsx')).toContain("data-manual-required={hasInlineRequired ? 'true' : undefined}")
    expect(source('./FormSelectField.tsx')).toContain("data-manual-required={required || hasInlineRequired ? 'true' : undefined}")
  })
})
