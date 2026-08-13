import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  appUsersFindMany: vi.fn(),
  publicUsersFindMany: vi.fn(),
  userProfilesFindMany: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    app_users: { findMany: mocks.appUsersFindMany },
    public_users: { findMany: mocks.publicUsersFindMany },
    user_profiles: { findMany: mocks.userProfilesFindMany },
  },
}))

import { actorDisplayName, deriveActorDisplayName, resolveActorDisplayNames } from './actor-display-names'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.appUsersFindMany.mockResolvedValue([])
  mocks.publicUsersFindMany.mockResolvedValue([])
  mocks.userProfilesFindMany.mockResolvedValue([])
})

describe('deriveActorDisplayName', () => {
  it('prefers the structured Thai name over display_name and email', () => {
    expect(deriveActorDisplayName({
      display_name: 'คุณกัญญาภัค อุ่งช้าง',
      email: 'kayyaphakhxungchang@gmail.com',
      first_name: 'กัญญาภัค',
      last_name: 'อุ่งช้าง',
    })).toBe('กัญญาภัค อุ่งช้าง')
  })

  it('falls back to display_name when there is no structured name', () => {
    expect(deriveActorDisplayName({
      display_name: 'Chayanit Pangtip',
      email: 'cpangtip@gmail.com',
      first_name: null,
      last_name: null,
    })).toBe('Chayanit Pangtip')
  })

  it('falls back to the email prefix when nothing else exists', () => {
    expect(deriveActorDisplayName({
      display_name: null,
      email: 'watcharathat@gmail.com',
      first_name: null,
      last_name: null,
    })).toBe('watcharathat')
  })

  it('returns null when the user has no usable name fields', () => {
    expect(deriveActorDisplayName({ display_name: null, email: null, first_name: null, last_name: null })).toBeNull()
  })
})

describe('resolveActorDisplayNames', () => {
  it('resolves emails to the same Thai name shown on the stock ledger', async () => {
    mocks.appUsersFindMany.mockResolvedValue([{
      display_name: 'คุณกัญญาภัค อุ่งช้าง',
      email: 'kayyaphakhxungchang@gmail.com',
      first_name: 'กัญญาภัค',
      last_name: 'อุ่งช้าง',
    }])

    const map = await resolveActorDisplayNames(['kayyaphakhxungchang@gmail.com'])
    expect(map.get('kayyaphakhxungchang@gmail.com')).toBe('กัญญาภัค อุ่งช้าง')
  })

  it('falls back to the email local part for unknown emails', async () => {
    const map = await resolveActorDisplayNames(['someone.unknown@example.com'])
    expect(map.get('someone.unknown@example.com')).toBe('someone.unknown')
  })

  it('resolves legacy usernames through the current app user when the legacy row links to an email', async () => {
    mocks.userProfilesFindMany.mockResolvedValue([{
      display_name: 'กัญญาภัค อุ่งช้าง',
      email: 'kayyaphakhxungchang@gmail.com',
      username: 'kayyaphakhxungchan',
    }])
    mocks.appUsersFindMany.mockResolvedValue([{
      display_name: 'คุณกัญญาภัค อุ่งช้าง',
      email: 'kayyaphakhxungchang@gmail.com',
      first_name: 'กัญญาภัค',
      last_name: 'อุ่งช้าง',
    }])

    const map = await resolveActorDisplayNames(['kayyaphakhxungchan'])
    expect(map.get('kayyaphakhxungchan')).toBe('กัญญาภัค อุ่งช้าง')
  })

  it('uses the legacy display name when the legacy username has no current email link', async () => {
    mocks.userProfilesFindMany.mockResolvedValue([{
      display_name: 'กัญญาภัค อุ่งช้าง',
      email: null,
      username: 'legacy.kayyaphakhxungchan',
    }])

    const map = await resolveActorDisplayNames(['legacy.kayyaphakhxungchan'])
    expect(map.get('legacy.kayyaphakhxungchan')).toBe('กัญญาภัค อุ่งช้าง')
  })

  it('resolves legacy usernames from the retired users table by name', async () => {
    mocks.publicUsersFindMany.mockResolvedValue([{
      email: null,
      name: 'นายเกียรติศักดิ์ ปลั่งกลาง',
      username: 'jajassm2549',
    }])

    const map = await resolveActorDisplayNames(['jajassm2549'])
    expect(map.get('jajassm2549')).toBe('นายเกียรติศักดิ์ ปลั่งกลาง')
  })

  it('matches case-insensitively and ignores empty values', async () => {
    mocks.appUsersFindMany.mockResolvedValue([{
      display_name: null,
      email: 'CHAYANIT@example.com',
      first_name: 'Chayanit',
      last_name: 'Pangtip',
    }])

    const map = await resolveActorDisplayNames(['  chayanit@EXAMPLE.com  ', '   ', null, undefined])
    expect(map.get('chayanit@example.com')).toBe('Chayanit Pangtip')
  })
})

describe('actorDisplayName', () => {
  it('returns the mapped name for a known actor', () => {
    const map = new Map([['kayyaphakhxungchang@gmail.com', 'กัญญาภัค อุ่งช้าง']])
    expect(actorDisplayName('kayyaphakhxungchang@gmail.com', map)).toBe('กัญญาภัค อุ่งช้าง')
  })

  it('keeps unknown actors readable instead of throwing', () => {
    expect(actorDisplayName('legacy.unknown-user', new Map())).toBe('legacy.unknown-user')
  })
})
