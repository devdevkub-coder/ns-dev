import { describe, expect, it } from 'vitest'
import { createAuthOperationQueue } from './auth-operation-queue'

describe('auth operation queue', () => {
  it('does not overlap auth operations and preserves FIFO order', async () => {
    const enqueue = createAuthOperationQueue()
    const events: string[] = []
    let releaseFirst!: () => void
    const firstReady = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = enqueue(async () => {
      events.push('first:start')
      await firstReady
      events.push('first:end')
    })
    const second = enqueue(async () => {
      events.push('second:start')
      events.push('second:end')
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('continues with the next operation after a failed operation', async () => {
    const enqueue = createAuthOperationQueue()
    const events: string[] = []

    const failed = enqueue(async () => {
      events.push('failed')
      throw new Error('expected failure')
    })
    const recovered = enqueue(async () => {
      events.push('recovered')
    })

    await expect(failed).rejects.toThrow('expected failure')
    await recovered
    expect(events).toEqual(['failed', 'recovered'])
  })
})
