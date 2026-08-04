// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const router = {
  push: vi.fn(),
  replace: vi.fn(),
}

function MockNextLink({ children, replace: _replace, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { replace?: boolean }) {
  return <a {...props}>{children}</a>
}

vi.mock('next/link', () => ({
  default: MockNextLink,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/current',
  useRouter: () => router,
}))

import { FormSafetyProvider, useUnsavedChangesGuard } from './FormSafetyProvider'
import { GuardedLink } from './GuardedLink'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('GuardedLink', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    router.push.mockReset()
    router.replace.mockReset()
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

  it('waits for discard confirmation before navigating from a dirty form', async () => {
    function Harness() {
      useUnsavedChangesGuard(true)
      return <GuardedLink href="/target">ไปหน้าถัดไป</GuardedLink>
    }

    act(() => root.render(<FormSafetyProvider><Harness /></FormSafetyProvider>))
    const link = Array.from(container.querySelectorAll('a')).find((candidate) => candidate.textContent === 'ไปหน้าถัดไป')
    if (!link) throw new Error('Expected guarded link')

    await act(async () => link.click())
    expect(router.push).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('ละทิ้งการแก้ไขหรือไม่?')

    await act(async () => button('แก้ไขต่อ').click())
    expect(router.push).not.toHaveBeenCalled()

    await act(async () => link.click())
    await act(async () => button('ละทิ้งการแก้ไข').click())
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/target')
  })
})
