const defaultAuthResponseHeaders = {
  'cache-control': 'private, no-store',
  expires: '0',
  pragma: 'no-cache',
} as const

export function preserveAuthResponseHeaders(source: Headers, target: Headers) {
  const sourceHeaders = source as Headers & { getSetCookie?: () => string[] }
  const setCookies = sourceHeaders.getSetCookie?.() ?? []

  if (setCookies.length > 0) {
    setCookies.forEach((value) => target.append('set-cookie', value))
  } else {
    const setCookie = source.get('set-cookie')
    if (setCookie) target.set('set-cookie', setCookie)
  }

  Object.entries(defaultAuthResponseHeaders).forEach(([name, defaultValue]) => {
    target.set(name, source.get(name) ?? defaultValue)
  })

  return target
}
