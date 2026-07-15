import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  findRules: vi.fn(),
  findSetting: vi.fn(),
  findTargets: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    line_notification_rules: { findMany: db.findRules },
    line_targets: { findMany: db.findTargets },
    system_settings: { findUnique: db.findSetting },
  },
}))

import {
  lineRuleConditionsValidationError,
  matchesLineNotificationRule,
  resolveLineTargetsForDocument,
  ruleExplicitlyIncludesDocumentType,
} from './line-notification-routing'

describe('financial LINE document routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.findSetting.mockResolvedValue(null)
  })

  it('requires an explicit PB, SB, PMT, or RCP document type on a financial rule', () => {
    const purchaseBill = { type: 'PB' }
    const purchasePayment = { type: 'PMT' }
    const customerReceipt = { type: 'RCP' }
    const genericRule = { conditions: {} }
    const purchaseRule = { conditions: { documentTypes: ['PB'] } }
    const paymentRule = { conditions: { documentTypes: ['PMT'] } }
    const receiptRule = { conditions: { documentTypes: ['RCP'] } }
    const salesRule = { conditions: { documentTypes: ['SB'] } }

    expect(matchesLineNotificationRule(purchaseBill, genericRule)).toBe(true)
    expect(ruleExplicitlyIncludesDocumentType(genericRule, purchaseBill.type)).toBe(false)
    expect(ruleExplicitlyIncludesDocumentType(purchaseRule, purchaseBill.type)).toBe(true)
    expect(ruleExplicitlyIncludesDocumentType(salesRule, purchaseBill.type)).toBe(false)
    expect(ruleExplicitlyIncludesDocumentType(paymentRule, purchasePayment.type)).toBe(true)
    expect(ruleExplicitlyIncludesDocumentType(purchaseRule, purchasePayment.type)).toBe(false)
    expect(ruleExplicitlyIncludesDocumentType(receiptRule, customerReceipt.type)).toBe(true)
    expect(ruleExplicitlyIncludesDocumentType(paymentRule, customerReceipt.type)).toBe(false)
  })

  it('rejects mixed document categories and weight-only conditions on financial rules', () => {
    expect(lineRuleConditionsValidationError({ documentTypes: ['WTI', 'PMT'] }))
      .toContain('แยกใบรับ-ส่งของกับเอกสารการเงิน')
    expect(lineRuleConditionsValidationError({ documentTypes: ['PMT'], minNetWeight: 1 }))
      .toContain('ใช้ได้เฉพาะใบรับ-ส่งของ')
    expect(lineRuleConditionsValidationError({ documentTypes: ['WTI', 'RCP'] }))
      .toContain('แยกใบรับ-ส่งของกับเอกสารการเงิน')
    expect(lineRuleConditionsValidationError({ documentTypes: ['RCP'], requiresImages: true }))
      .toContain('ใช้ได้เฉพาะใบรับ-ส่งของ')
    expect(lineRuleConditionsValidationError({ documentTypes: ['PMT'] })).toBeNull()
    expect(lineRuleConditionsValidationError({ documentTypes: ['RCP'] })).toBeNull()
    expect(lineRuleConditionsValidationError({ documentTypes: ['WTI'], minNetWeight: 1 })).toBeNull()
  })

  it('does not use a generic rule or default target for PB', async () => {
    db.findRules.mockResolvedValue([{
      conditions: {},
      id: 1n,
      name: 'generic rule',
      priority: 1,
      stop_after_match: false,
      target_id: 'C-GENERIC',
    }])
    db.findTargets.mockResolvedValue([{
      display_name: 'generic group',
      is_active: true,
      is_default: true,
      target_id: 'C-GENERIC',
      target_type: 'group',
    }])

    await expect(resolveLineTargetsForDocument({ type: 'PB' }, { allowFallback: false })).resolves.toEqual([])
    expect(db.findSetting).not.toHaveBeenCalled()
  })

  it('routes PB only to its explicit target', async () => {
    db.findRules.mockResolvedValue([{
      conditions: { documentTypes: ['PB'] },
      id: 2n,
      name: 'purchase bills',
      priority: 1,
      stop_after_match: true,
      target_id: 'C-PB',
    }])
    db.findTargets.mockResolvedValue([{
      display_name: 'purchase bill group',
      is_active: true,
      is_default: false,
      target_id: 'C-PB',
      target_type: 'group',
    }])

    const decisions = await resolveLineTargetsForDocument({ type: 'PB' }, { allowFallback: false })

    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.targetId).toBe('C-PB')
  })

  it('does not use a generic rule or default target for PMT', async () => {
    db.findRules.mockResolvedValue([{
      conditions: {},
      id: 3n,
      name: 'generic rule',
      priority: 1,
      stop_after_match: false,
      target_id: 'C-GENERIC',
    }])
    db.findTargets.mockResolvedValue([{
      display_name: 'generic group',
      is_active: true,
      is_default: true,
      target_id: 'C-GENERIC',
      target_type: 'group',
    }])

    await expect(resolveLineTargetsForDocument({ type: 'PMT' }, { allowFallback: false })).resolves.toEqual([])
    expect(db.findSetting).not.toHaveBeenCalled()
  })

  it('does not use a generic rule or default target for RCP', async () => {
    db.findRules.mockResolvedValue([{
      conditions: {},
      id: 4n,
      name: 'generic rule',
      priority: 1,
      stop_after_match: false,
      target_id: 'C-GENERIC',
    }])
    db.findTargets.mockResolvedValue([{
      display_name: 'generic group',
      is_active: true,
      is_default: true,
      target_id: 'C-GENERIC',
      target_type: 'group',
    }])

    await expect(resolveLineTargetsForDocument({ type: 'RCP' }, { allowFallback: false })).resolves.toEqual([])
    expect(db.findSetting).not.toHaveBeenCalled()
  })

  it('routes RCP only to its explicit target', async () => {
    db.findRules.mockResolvedValue([{
      conditions: { documentTypes: ['RCP'] },
      id: 5n,
      name: 'customer receipts',
      priority: 1,
      stop_after_match: true,
      target_id: 'C-RCP',
    }])
    db.findTargets.mockResolvedValue([{
      display_name: 'customer receipt group',
      is_active: true,
      is_default: false,
      target_id: 'C-RCP',
      target_type: 'group',
    }])

    const decisions = await resolveLineTargetsForDocument({ type: 'RCP' }, { allowFallback: false })

    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.targetId).toBe('C-RCP')
  })
})
