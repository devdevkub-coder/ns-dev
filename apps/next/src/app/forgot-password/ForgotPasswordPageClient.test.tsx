// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: mocks.getSupabaseClient }))

import { ForgotPasswordPageClient } from './ForgotPasswordPageClient'

describe('ForgotPasswordPageClient navigation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.getSupabaseClient.mockReturnValue(null)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('renders without the form-safety provider so auth navigation is never blocked by a discard prompt', () => {
    act(() => root.render(<ForgotPasswordPageClient />))

    expect(container.querySelector('a[href="/login"]')).not.toBeNull()
    expect(container.textContent).not.toContain('ละทิ้งการแก้ไขหรือไม่?')
  })
})
