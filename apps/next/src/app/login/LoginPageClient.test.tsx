// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  completeBrowserLoginSession: vi.fn(),
  getSessionSafely: vi.fn(),
  getSupabaseClient: vi.fn(),
}))

vi.mock('next/link', () => ({ default: ({ children }: { children: unknown }) => children }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/auth-client-contract', () => ({ completeBrowserLoginSession: mocks.completeBrowserLoginSession }))
vi.mock('@/lib/supabase', () => ({
  getSessionSafely: mocks.getSessionSafely,
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { LoginPageClient } from './LoginPageClient'

describe('LoginPageClient existing session', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.getSupabaseClient.mockReturnValue({
      auth: {
        refreshSession: vi.fn().mockResolvedValue({}),
        signOut: vi.fn().mockResolvedValue({}),
      },
    })
    mocks.getSessionSafely.mockResolvedValue({ access_token: 'existing-session' })
    mocks.completeBrowserLoginSession.mockResolvedValue({
      ok: false,
      message: 'ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่',
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('keeps a stale existing session on login and displays the contract error', async () => {
    await act(async () => {
      root.render(<LoginPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.completeBrowserLoginSession).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่')
  })
})
