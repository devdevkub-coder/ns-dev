import { prisma } from './prisma'
import { findScopedWeightTicket, getWeightTicketUsageCounts, mapWeightTicketRow, type WeightTicketRow } from './weight-tickets'
import { formatWeight } from '@/lib/weight-tickets'

export type RoutingDecision = {
  targetId: string
  targetType: string
  displayName: string
  ruleId: string | null
  ruleName: string | null
  reason: string
}

export function matchesLineNotificationRule(ticket: any, rule: any): boolean {
  const conds = rule.conditions as any
  if (!conds || typeof conds !== 'object') return true

  // 1. Document Types
  if (conds.documentTypes && Array.isArray(conds.documentTypes) && conds.documentTypes.length > 0) {
    if (!conds.documentTypes.includes(ticket.type)) return false
  }

  // 2. Branch Codes
  if (conds.branchCodes && Array.isArray(conds.branchCodes) && conds.branchCodes.length > 0) {
    if (!conds.branchCodes.includes(ticket.branchId)) return false
  }

  // 3. Warehouse IDs
  if (conds.warehouseIds && Array.isArray(conds.warehouseIds) && conds.warehouseIds.length > 0) {
    const ticketWarehouseIds = ticket.lines?.map((l: any) => l.warehouseId).filter(Boolean) || []
    const hasMatch = ticketWarehouseIds.some((id: string) => conds.warehouseIds.includes(id))
    if (!hasMatch) return false
  }

  // 4. Product IDs
  if (conds.productIds && Array.isArray(conds.productIds) && conds.productIds.length > 0) {
    const ticketProductIds = ticket.lines?.map((l: any) => l.productId).filter(Boolean) || []
    const hasMatch = ticketProductIds.some((id: string) => conds.productIds.includes(id))
    if (!hasMatch) return false
  }

  // 5. Party IDs (Supplier or Customer code/id)
  if (conds.partyIds && Array.isArray(conds.partyIds) && conds.partyIds.length > 0) {
    const partyId = ticket.supplierId || ticket.customerId || ticket.partyId
    if (!partyId || !conds.partyIds.includes(String(partyId))) return false
  }

  // 6. Net Weight (sum of lines or ticket net weight)
  const ticketNetWeight = Number(ticket.totals?.netWeight || ticket.netWeight || 0)
  if (conds.minNetWeight !== undefined && conds.minNetWeight !== null && conds.minNetWeight !== '') {
    if (ticketNetWeight < Number(conds.minNetWeight)) return false
  }
  if (conds.maxNetWeight !== undefined && conds.maxNetWeight !== null && conds.maxNetWeight !== '') {
    if (ticketNetWeight > Number(conds.maxNetWeight)) return false
  }

  // 7. Impurity / Deduction Weight
  if (conds.minImpurityWeight !== undefined && conds.minImpurityWeight !== null && conds.minImpurityWeight !== '') {
    const deductionWeight = Number(ticket.totals?.deductionWeight || ticket.deductionWeight || 0)
    if (deductionWeight < Number(conds.minImpurityWeight)) return false
  }

  // 8. Images checks
  const imageCount = ticket.imageNames?.length || 0
  if (conds.requiresImages === true) {
    if (imageCount === 0) return false
  }

  if (conds.requiresScalePhoto === true) {
    const hasScale = ticket.imageNames?.some((name: string) => 
      name.toLowerCase().includes('scale') || name.includes('น้ำหนัก') || name.includes('ตาชั่ง')
    )
    if (!hasScale) return false
  }

  // 9. Time Window checks
  if (conds.timeWindows && Array.isArray(conds.timeWindows) && conds.timeWindows.length > 0) {
    const docDate = ticket.createdAt ? new Date(ticket.createdAt) : new Date()
    const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const ticketDay = daysMap[docDate.getDay()]
    const ticketTime = docDate.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })

    const inWindow = conds.timeWindows.some((win: any) => {
      if (win.days && Array.isArray(win.days) && !win.days.includes(ticketDay)) return false
      if (win.from && ticketTime < win.from) return false
      if (win.to && ticketTime > win.to) return false
      return true
    })

    if (!inWindow) return false
  }

  return true
}

export async function resolveLineTargetsForWeightTicket(ticket: any): Promise<RoutingDecision[]> {
  // Query all active rules
  const rules = await prisma.line_notification_rules.findMany({
    where: { is_active: true },
    orderBy: { priority: 'asc' }
  })

  // Load active targets for mapping display name
  const targets = await prisma.line_targets.findMany({
    where: { is_active: true }
  })
  const targetMap = new Map(targets.map(t => [t.target_id, t]))

  const decisions: RoutingDecision[] = []
  const resolvedTargetIds = new Set<string>()

  for (const rule of rules) {
    if (matchesLineNotificationRule(ticket, rule)) {
      const dbTarget = targetMap.get(rule.target_id)
      if (dbTarget) {
        if (!resolvedTargetIds.has(rule.target_id)) {
          resolvedTargetIds.add(rule.target_id)
          decisions.push({
            targetId: rule.target_id,
            targetType: dbTarget.target_type,
            displayName: dbTarget.display_name,
            ruleId: String(rule.id),
            ruleName: rule.name,
            reason: `ตรงกับกฎ: "${rule.name}" (ระดับความสำคัญ ${rule.priority})`
          })
        }
        if (rule.stop_after_match) {
          break
        }
      }
    }
  }

  // Fallback to defaults
  if (decisions.length === 0) {
    const defaultTargets = targets.filter(t => t.is_default)
    for (const t of defaultTargets) {
      decisions.push({
        targetId: t.target_id,
        targetType: t.target_type,
        displayName: t.display_name,
        ruleId: null,
        ruleName: null,
        reason: 'ส่งหาผู้รับดีฟอลต์ (Default Target) เนื่องจากไม่มีกฎคัดกรองตัวกรองใดตรงบิลชั่งนี้'
      })
    }

    if (decisions.length === 0) {
      const setting = await prisma.system_settings.findUnique({
        where: { key: 'LINE_DEFAULT_TARGET_ID' }
      })
      if (setting?.value) {
        const targetId = setting.value
        const targetType = targetId.startsWith('U') 
          ? 'user' 
          : targetId.startsWith('C') 
          ? 'group' 
          : targetId.startsWith('R') 
          ? 'room' 
          : 'unknown'
        decisions.push({
          targetId: targetId,
          targetType: targetType,
          displayName: `Default Target (${targetId.slice(0, 6)}...)`,
          ruleId: null,
          ruleName: null,
          reason: 'ส่งหาผู้รับดีฟอลต์ตามค่าตั้งระบบ (LINE_DEFAULT_TARGET_ID) เนื่องจากไม่มีตาราง Target หรือค่าเริ่มต้นใดที่กำหนดไว้'
        })
      }
    }

    if (decisions.length === 0) {
      const activeTargets = targets.filter(t => t.is_active)
      for (const t of activeTargets) {
        decisions.push({
          targetId: t.target_id,
          targetType: t.target_type,
          displayName: t.display_name,
          ruleId: null,
          ruleName: null,
          reason: 'ส่งหาทุกกลุ่มแจ้งเตือนที่เปิดใช้งาน (All Active Targets) เนื่องจากไม่มีกฎคัดกรองหรือกลุ่มดีฟอลต์กำหนดไว้'
        })
      }
    }
  }

  return decisions
}

export function buildFlexMessageFromTemplate(ticket: any, templateConfig: any, pdfUrl: string, detailUrl: string) {
  const isWti = ticket.type === 'WTI'
  const headerBgColor = isWti 
    ? (templateConfig.theme?.headerColorWti || '#064e3b') 
    : (templateConfig.theme?.headerColorWto || '#0c4a6e')
  const titleText = templateConfig.title
    ? templateConfig.title
        .replace('{{documentTypeLabel}}', isWti ? 'ใบรับของ WTI' : 'ใบส่งของ WTO')
        .replace('{{documentNo}}', ticket.documentNo)
    : `${isWti ? 'ใบรับของ WTI' : 'ใบส่งของ WTO'} ${ticket.documentNo}`

  const subtitleText = templateConfig.subtitle
    ? templateConfig.subtitle
        .replace('{{partyName}}', ticket.partyName || '-')
        .replace('{{netWeight}}', formatWeight(Number(ticket.totals?.netWeight || ticket.netWeight || 0)))
    : `${ticket.partyName || '-'} · ${formatWeight(Number(ticket.totals?.netWeight || ticket.netWeight || 0))} กก.`

  const fields = templateConfig.fields || [
    { key: 'partyName', label: 'ผู้ขาย/ลูกค้า', enabled: true },
    { key: 'branchName', label: 'สาขา', enabled: true },
    { key: 'netWeight', label: 'น้ำหนักสุทธิ', enabled: true }
  ]

  const contents = []
  for (const field of fields) {
    if (!field.enabled) continue
    let value = '-'
    if (field.key === 'partyName') value = ticket.partyName || '-'
    else if (field.key === 'branchName') value = ticket.branchName || '-'
    else if (field.key === 'warehouseName') value = ticket.godownName || '-'
    else if (field.key === 'netWeight') value = `${formatWeight(Number(ticket.totals?.netWeight || ticket.netWeight || 0))} กก.`
    else if (field.key === 'grossWeight') value = `${formatWeight(Number(ticket.totals?.grossWeight || ticket.grossWeight || 0))} กก.`
    else if (field.key === 'containerDeductionWeight') value = `${formatWeight(Number(ticket.totals?.containerWeight || ticket.containerWeight || 0))} กก.`
    else if (field.key === 'deductionWeight') value = `${formatWeight(Number(ticket.totals?.deductionWeight || ticket.deductionWeight || 0))} กก.`
    else if (field.key === 'enteredBy') value = ticket.enteredBy || '-'
    else value = String(ticket[field.key] || '-')

    contents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: field.label,
          color: '#64748b',
          size: 'sm',
          flex: 2
        },
        {
          type: 'text',
          text: value,
          color: '#1e293b',
          size: 'sm',
          weight: 'bold',
          flex: 5,
          wrap: true
        }
      ]
    })
  }

  const buttons = []
  if (templateConfig.buttons?.pdf !== false) {
    buttons.push({
      type: 'button',
      style: 'primary',
      height: 'sm',
      color: '#0f172a',
      action: {
        type: 'uri',
        label: 'ดาวน์โหลด PDF',
        uri: pdfUrl
      }
    })
  }

  if (templateConfig.buttons?.detail !== false) {
    buttons.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'uri',
        label: 'เปิดในระบบ',
        uri: detailUrl
      }
    })
  }

  const flexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerBgColor,
      paddingAll: '20px',
      contents: [
        {
          type: 'text',
          text: titleText,
          color: '#ffffff',
          size: 'lg',
          weight: 'bold'
        },
        {
          type: 'text',
          text: subtitleText,
          color: '#e2e8f0',
          size: 'sm',
          margin: 'sm'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      spacing: 'md',
      contents: contents
    }
  } as any

  if (buttons.length > 0) {
    flexBubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '15px',
      contents: buttons
    }
  }

  return {
    type: 'flex',
    altText: `บิลชั่ง ${ticket.documentNo}`,
    contents: flexBubble
  }
}
