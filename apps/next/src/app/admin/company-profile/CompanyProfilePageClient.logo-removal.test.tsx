// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormSafetyProvider } from '@/components/ui/FormSafetyProvider'
import { emptyCompanyProfile } from '@/lib/company-profile'
import { CompanyProfilePageClient } from './CompanyProfilePageClient'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('CompanyProfilePageClient logo removal', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function button(label: string) {
    const element = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    )
    if (!element) throw new Error(`Expected button: ${label}`)
    return element
  }

  it('keeps the logo on cancel and clears only the local form after confirmed removal', async () => {
    const logoUrl = 'https://example.com/company-logo.png'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      branches: [],
      profile: { ...emptyCompanyProfile, logoUrl },
      profileConfigured: true,
      selectedBranchId: null,
      selectedBranchName: null,
    }), { headers: { 'Content-Type': 'application/json' } })))

    await act(async () => {
      root.render(<FormSafetyProvider><CompanyProfilePageClient /></FormSafetyProvider>)
    })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('img[alt="โลโก้บริษัท"]')).not.toBeNull()

    await act(async () => button('🗑 ลบโลโก้').click())
    expect(document.body.textContent).toContain('ยืนยันการลบโลโก้?')
    expect(container.querySelector('img[alt="โลโก้บริษัท"]')).not.toBeNull()

    await act(async () => button('ไม่ดำเนินการ').click())
    expect(container.querySelector('img[alt="โลโก้บริษัท"]')).not.toBeNull()

    await act(async () => button('🗑 ลบโลโก้').click())
    await act(async () => button('ลบโลโก้').click())

    expect(container.querySelector('img[alt="โลโก้บริษัท"]')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
