type CustomerMarketScope = string | null | undefined

type SalesChannelOption = {
  code?: string | null
  id: string
  name: string
}

const marketScopeAliases: Record<string, string[]> = {
  'ในประเทศ': ['ในประเทศ', 'domestic', 'domesticsale', 'local', 'th', 'thailand', 'dom'],
  'ต่างประเทศ': ['ต่างประเทศ', 'international', 'internationalsale', 'export', 'exportsale', 'overseas', 'intl', 'inter', 'foreign'],
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function resolveSalesChannelIdForMarketScope(marketScope: CustomerMarketScope, channels: SalesChannelOption[]) {
  const scope = marketScope === 'ต่างประเทศ' ? 'ต่างประเทศ' : marketScope === 'ในประเทศ' ? 'ในประเทศ' : null
  if (!scope) return null
  const aliases = new Set(marketScopeAliases[scope].map(normalized))
  return channels.find((channel) => [channel.name, channel.code, channel.id].some((value) => {
    const candidate = normalized(value)
    return aliases.has(candidate) || [...aliases].some((alias) => alias.length >= 4 && candidate.includes(alias))
  }))?.id ?? null
}
