import { describe, expect, it } from 'vitest'

import {
  LINE_CONNECTION_PROFILES,
  resolveLineConnectionProfile,
} from './line-connection-profile'

describe('resolveLineConnectionProfile', () => {
  it('publishes only the two known public connection profiles', () => {
    expect(LINE_CONNECTION_PROFILES).toEqual({
      'sit-a': {
        id: 'sit-a',
        label: 'OA A · SIT',
        appHost: 'ns-erp-sit.vercel.app',
        supabaseProjectRef: 'vbjlkxbytccklhqvxjuu',
      },
      'production-b': {
        id: 'production-b',
        label: 'OA B · Production',
        appHost: 'ns-erp.vercel.app',
        supabaseProjectRef: 'fhglqymcdmrgbsbadnwr',
      },
    })
  })

  it.each([
    ['sit-a', 'https://ns-erp-sit.vercel.app/', 'https://vbjlkxbytccklhqvxjuu.supabase.co/'],
    ['production-b', 'https://ns-erp.vercel.app', 'https://fhglqymcdmrgbsbadnwr.supabase.co'],
  ] as const)('aligns the known %s pair', (id, appUrl, supabaseUrl) => {
    expect(resolveLineConnectionProfile({ appUrl, supabaseUrl })).toMatchObject({
      id,
      aligned: true,
      dataProfileId: id,
      targetProfileId: id,
    })
  })

  it.each([
    ['https://ns-erp.vercel.app', 'https://vbjlkxbytccklhqvxjuu.supabase.co', 'sit-a', 'production-b'],
    ['https://ns-erp-sit.vercel.app', 'https://fhglqymcdmrgbsbadnwr.supabase.co', 'production-b', 'sit-a'],
  ] as const)('fails closed for known cross-profile configuration', (appUrl, supabaseUrl, dataProfileId, targetProfileId) => {
    expect(resolveLineConnectionProfile({ appUrl, supabaseUrl })).toMatchObject({
      aligned: false,
      dataProfileId,
      targetProfileId,
    })
  })

  it('does not guess an environment for custom or malformed sources', () => {
    const profile = resolveLineConnectionProfile({
      appUrl: 'https://custom.example.com',
      supabaseUrl: 'not a URL',
    })

    expect(profile).toMatchObject({
      id: 'custom',
      label: 'Custom/Unknown',
      aligned: false,
      dataProfileId: 'custom',
      targetProfileId: 'custom',
    })
    expect(profile.reason).toContain('ไม่สามารถยืนยัน')
  })
})
