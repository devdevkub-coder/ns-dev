import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { sendLinePush } from './weight-ticket-line-notification'

describe('LINE Push API transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies a default timeout when the caller does not provide a signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      headers: new Headers({ 'x-line-request-id': 'line-request' }),
      ok: true,
      status: 200,
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/push',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('rejects a 200 response without a LINE request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: new Headers(),
      ok: true,
      status: 200,
    }))

    await expect(sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token'))
      .rejects.toThrow('LINE Push Message ไม่คืน x-line-request-id')
  })

  it('rejects a retry conflict without an accepted LINE request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: new Headers(),
      ok: false,
      status: 409,
    }))

    await expect(sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token', 'retry-key'))
      .rejects.toThrow('LINE Push Message ตอบกลับ 409 แต่ไม่คืน accepted request id')
  })

  it('accepts a retry conflict only when LINE confirms the original request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: new Headers({ 'x-line-accepted-request-id': 'accepted-request' }),
      ok: false,
      status: 409,
    }))

    await expect(sendLinePush('C-LINE', [{ type: 'text', text: 'test' }], 'token', 'retry-key'))
      .resolves.toEqual({ isConflict: true, lineRequestId: 'accepted-request' })
  })
})
