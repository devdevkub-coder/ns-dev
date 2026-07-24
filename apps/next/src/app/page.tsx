import { redirect } from 'next/navigation'
import { defaultLandingPath, preferredLandingPathForRoles } from '@/lib/default-landing'
import { getCurrentAuthContext } from '@/lib/server/auth-context'

export default async function HomePage() {
  const context = await getCurrentAuthContext()
  redirect(defaultLandingPath({
    isAdmin: context.isAdmin,
    permissions: [...context.permissionCodes],
    preferredPath: preferredLandingPathForRoles(context.roles),
  }))
}
