import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FCD_ACTION_PERMISSION } from './fcd-action-permissions'

const conversionRoute = readFileSync(new URL('../../app/api/finance/foreign/fcd-conversions/route.ts', import.meta.url), 'utf8')
const revaluationRoute = readFileSync(new URL('../../app/api/finance/foreign/fcd-revaluations/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../../../../supabase/migrations/20260730200000_add_fcd_action_permissions.sql', import.meta.url), 'utf8')

describe('FCD action permissions', () => {
  it('uses distinct view, post, and reverse permissions for each FCD writer route', () => {
    expect(conversionRoute).toContain('FCD_ACTION_PERMISSION.conversion.view')
    expect(conversionRoute).toContain('FCD_ACTION_PERMISSION.conversion.post')
    expect(conversionRoute).toContain('FCD_ACTION_PERMISSION.conversion.reverse')
    expect(revaluationRoute).toContain('FCD_ACTION_PERMISSION.revaluation.view')
    expect(revaluationRoute).toContain('FCD_ACTION_PERMISSION.revaluation.post')
    expect(revaluationRoute).toContain('FCD_ACTION_PERMISSION.revaluation.reverse')
    expect(conversionRoute).not.toContain("requirePermission(context, 'finance.cash.view')")
    expect(revaluationRoute).not.toContain("requirePermission(context, 'finance.cash.view')")
  })

  it('adds a durable permission catalog and preserves existing grants during rollout', () => {
    for (const permission of [
      ...Object.values(FCD_ACTION_PERMISSION.conversion),
      ...Object.values(FCD_ACTION_PERMISSION.revaluation),
    ]) {
      expect(migration).toContain(`'${permission}'`)
    }
    expect(migration).toContain('legacy_permission.code = \'finance.cash.view\'')
    expect(migration).toContain('public.app_role_permissions')
    expect(migration).toContain('public.app_user_permission_overrides')
  })
})
