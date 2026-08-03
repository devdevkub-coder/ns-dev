import { describe, expect, it } from 'vitest'
import { describeAuthEmailError } from './auth-email-errors'

describe('describeAuthEmailError', () => {
  it('describes the per-email cooldown', () => {
    expect(describeAuthEmailError({ message: 'For security purposes, you can only request this once every 60 seconds' })).toMatchObject({
      code: 'AUTH_EMAIL_USER_COOLDOWN',
      limitScope: 'user',
      retryAfterSeconds: 60,
    })
  })

  it('describes the project email quota', () => {
    expect(describeAuthEmailError({ message: 'Email rate limit exceeded' })).toMatchObject({
      code: 'AUTH_EMAIL_PROJECT_LIMIT',
      limitScope: 'project',
      retryAfterSeconds: 3600,
    })
  })

  it('does not expose a provider error as a retryable limit', () => {
    expect(describeAuthEmailError({ message: 'SMTP unavailable' })).toMatchObject({
      code: 'AUTH_EMAIL_PROVIDER_ERROR',
      limitScope: 'provider',
      retryAfterSeconds: null,
    })
  })
})
