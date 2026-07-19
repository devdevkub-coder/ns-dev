import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  consumeForgotPasswordRateLimit: vi.fn(),
  findFirst: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/server/auth-rate-limit', () => ({
  consumeForgotPasswordRateLimit: mocks.consumeForgotPasswordRateLimit,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
    app_users: { findFirst: mocks.findFirst },
  },
}))

vi.mock('@/lib/server/supabase-admin', () => ({
  getSupabasePublicServerClient: vi.fn(() => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  })),
}))

import { POST } from './route'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/forgot-password', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    method: 'POST',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.consumeForgotPasswordRateLimit.mockResolvedValue({ outcome: 'allowed' })
  mocks.executeRaw.mockResolvedValue(undefined)
  mocks.transaction.mockResolvedValue([])
  mocks.findFirst.mockResolvedValue(null)
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null })
})

describe('POST /api/auth/forgot-password', () => {
  it('returns an indistinguishable accepted response for an unknown active-app-user lookup', async () => {
    const response = await POST(request({
      email: 'nobody@example.com',
      redirectTo: 'http://localhost/reset-password',
    }))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ accepted: true })
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.executeRaw.mock.calls)).not.toContain('nobody@example.com')
  })

  it('suppresses a throttled request before application-user lookup or delivery', async () => {
    mocks.consumeForgotPasswordRateLimit.mockResolvedValue({ outcome: 'throttled' })

    const response = await POST(request({
      email: 'user@example.com',
      redirectTo: 'http://localhost/reset-password',
    }))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ accepted: true })
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('fails closed before lookup and delivery when Redis protection is unavailable', async () => {
    mocks.consumeForgotPasswordRateLimit.mockResolvedValue({ outcome: 'unavailable' })

    const response = await POST(request({
      email: 'user@example.com',
      redirectTo: 'http://localhost/reset-password',
    }))

    expect(response.status).toBe(503)
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('keeps provider delivery failures private and generic', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.findFirst.mockResolvedValue({ active: true, email: 'user@example.com', id: 12n })
    mocks.resetPasswordForEmail.mockResolvedValue({ error: new Error('provider secret detail') })

    const response = await POST(request({
      email: 'user@example.com',
      redirectTo: 'http://localhost/reset-password',
    }))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ accepted: true })
    expect(warn).toHaveBeenCalledWith('Password reset delivery failed', { category: 'supabase_reset_password_failed' })
    warn.mockRestore()
  })

  it('rejects a redirect outside the same-origin reset-password route', async () => {
    const response = await POST(request({
      email: 'user@example.com',
      redirectTo: 'https://example.com/reset-password',
    }))

    expect(response.status).toBe(400)
    expect(mocks.consumeForgotPasswordRateLimit).not.toHaveBeenCalled()
  })
})
