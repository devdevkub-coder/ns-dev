import { describe, expect, it } from 'vitest'
import { duplicateUserMessage, findExistingUserByEmail } from './AdminUsersPageClient'

describe('AdminUsersPageClient duplicate user handling', () => {
  it('finds an existing pending user by normalized email before POST', () => {
    const existing = findExistingUserByEmail([
      { accountStatus: 'active', displayName: 'Active User', email: 'active@example.com' },
      { accountStatus: 'pending', displayName: 'Pending User', email: 'person@nsscrap.com' },
    ], ' PERSON@NSSCRAP.COM ')

    expect(existing).toEqual({
      accountStatus: 'pending',
      displayName: 'Pending User',
      email: 'person@nsscrap.com',
    })
  })

  it('explains that the duplicate may be hidden by the active filter', () => {
    expect(duplicateUserMessage({
      accountStatus: 'pending',
      displayName: 'Pending User',
      email: 'person@nsscrap.com',
    })).toContain('รอเปิดใช้งาน')
  })
})
