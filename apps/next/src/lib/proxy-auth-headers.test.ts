import { describe, expect, it } from 'vitest'
import { preserveAuthResponseHeaders } from './proxy-auth-headers'

function getSetCookies(headers: Headers) {
  return (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
}

describe('proxy auth response headers', () => {
  it('preserves multiple auth cookies and private cache headers', () => {
    const source = new Headers({
      'cache-control': 'private, no-store',
      expires: '0',
      pragma: 'no-cache',
    })
    source.append('set-cookie', 'sb-access-token=access; Path=/; HttpOnly')
    source.append('set-cookie', 'sb-refresh-token=refresh; Path=/; HttpOnly')
    const target = new Headers({ 'content-type': 'application/json' })

    preserveAuthResponseHeaders(source, target)

    expect(getSetCookies(target)).toEqual([
      'sb-access-token=access; Path=/; HttpOnly',
      'sb-refresh-token=refresh; Path=/; HttpOnly',
    ])
    expect(target.get('cache-control')).toBe('private, no-store')
    expect(target.get('pragma')).toBe('no-cache')
    expect(target.get('expires')).toBe('0')
    expect(target.get('content-type')).toBe('application/json')
  })

  it('does not overwrite target-specific headers', () => {
    const source = new Headers({
      'cache-control': 'private, no-store',
      location: '/login?redirect=%2Fdashboard',
    })
    const target = new Headers({ location: '/login' })

    preserveAuthResponseHeaders(source, target)

    expect(target.get('location')).toBe('/login')
    expect(target.get('cache-control')).toBe('private, no-store')
  })

  it('applies private no-store defaults when the source has no cache headers', () => {
    const source = new Headers()
    const target = new Headers({ 'content-type': 'application/json' })

    preserveAuthResponseHeaders(source, target)

    expect(target.get('cache-control')).toBe('private, no-store')
    expect(target.get('pragma')).toBe('no-cache')
    expect(target.get('expires')).toBe('0')
    expect(target.get('content-type')).toBe('application/json')
  })
})
