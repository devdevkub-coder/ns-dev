import { prisma } from '@/lib/server/prisma'

/**
 * Single source of truth for how a user is shown across every page.
 *
 * Order of preference:
 *   1. Structured Thai name (first_name + last_name)
 *   2. display_name (derived English/legacy name)
 *   3. email (prefix when it looks like an email address)
 */
export function deriveActorDisplayName(user: {
  display_name?: string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
}) {
  const personalName = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(' ')
  if (personalName) return personalName

  const displayName = user.display_name?.trim()
  if (displayName) return displayName

  const email = user.email?.trim()
  if (!email) return null
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

type ActorDisplayNameSource = Parameters<typeof deriveActorDisplayName>[0]

/**
 * Resolve a batch of stored actor values (emails or legacy usernames written
 * before the email-only contract) to the presentation display name.
 *
 * - Emails resolve against `app_users` (case-insensitive); unknown emails fall
 *   back to their local part so long addresses never leak into table cells.
 * - Non-email values are treated as legacy usernames and resolved through the
 *   retained legacy `user_profiles` / `users` tables. When a legacy row links
 *   to an email that now resolves in `app_users`, the current name wins.
 */
export async function resolveActorDisplayNames(actorValues: Array<string | null | undefined>) {
  const values = [...new Set(actorValues
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim()))]
  const displayNames = new Map<string, string>()
  if (values.length === 0) return displayNames

  const emails = values.filter((value) => value.includes('@'))
  const usernames = values.filter((value) => !value.includes('@'))

  if (emails.length > 0) {
    const users = await prisma.app_users.findMany({
      select: { display_name: true, email: true, first_name: true, last_name: true },
      where: { email: { in: emails, mode: 'insensitive' } },
    })
    for (const user of users) {
      const email = user.email?.trim().toLowerCase()
      if (!email) continue
      const name = deriveActorDisplayName(user)
      if (name) displayNames.set(email, name)
    }
    // Unresolved emails still need a compact label so the column does not break.
    for (const email of emails) {
      const key = email.toLowerCase()
      if (!displayNames.has(key)) {
        displayNames.set(key, email.includes('@') ? email.split('@')[0] || email : email)
      }
    }
  }

  if (usernames.length > 0) {
    const [legacyProfiles, legacyUsers] = await Promise.all([
      prisma.user_profiles.findMany({
        select: { display_name: true, email: true, username: true },
        where: { username: { in: usernames, mode: 'insensitive' } },
      }),
      prisma.public_users.findMany({
        select: { email: true, name: true, username: true },
        where: { username: { in: usernames, mode: 'insensitive' } },
      }),
    ])
    const rows: Array<{ key: string; source: ActorDisplayNameSource }> = [
      ...legacyProfiles.map((row) => ({
        key: row.username.trim(),
        source: { display_name: row.display_name, email: row.email },
      })),
      ...legacyUsers.flatMap((row) => {
        const key = row.username?.trim()
        return key ? [{ key, source: { display_name: row.name, email: row.email } as ActorDisplayNameSource }] : []
      }),
    ]
    for (const { key, source } of rows) {
      if (displayNames.has(key)) continue
      const linkedEmail = source.email?.trim().toLowerCase()
      const currentName = linkedEmail ? displayNames.get(linkedEmail) : undefined
      const name = currentName ?? deriveActorDisplayName(source)
      if (name) displayNames.set(key, name)
    }
  }

  return displayNames
}

/**
 * Look up a single stored actor value in a display-name map produced by
 * `resolveActorDisplayNames`. Never throws: unmatched values are returned as-is
 * so a legacy snapshot that cannot be traced keeps the document readable.
 */
export function actorDisplayName(value: string, displayNames: Map<string, string>) {
  const actor = value.trim()
  if (!actor) return actor
  return displayNames.get(actor.toLowerCase()) ?? actor
}
