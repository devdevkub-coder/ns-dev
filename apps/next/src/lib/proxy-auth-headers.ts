const authResponseHeaders = ['cache-control', 'pragma', 'expires'] as const

export function preserveAuthResponseHeaders(source: Headers, target: Headers) {
  const sourceHeaders = source as Headers & { getSetCookie?: () => string[] }
  const setCookies = sourceHeaders.getSetCookie?.() ?? []

  if (setCookies.length > 0) {
    setCookies.forEach((value) => target.append('set-cookie', value))
  } else {
    const setCookie = source.get('set-cookie')
    if (setCookie) target.set('set-cookie', setCookie)
  }

  authResponseHeaders.forEach((name) => {
    const value = source.get(name)
    if (value) target.set(name, value)
  })

  return target
}
