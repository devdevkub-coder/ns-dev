import type { MasterDataPageConfig } from '@/lib/master-data'

export type MasterDataAction = 'create' | 'status' | 'update'

export function canUseMasterDataAction(config: MasterDataPageConfig, permissions: string[], action: MasterDataAction) {
  const requiredPermission = config.actionPermissions?.[action]
  return requiredPermission == null || permissions.includes(requiredPermission)
}
