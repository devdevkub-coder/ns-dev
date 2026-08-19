/* eslint-disable @next/next/no-img-element */
'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/api-client'
import { formatThaiDateCE } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { KpiCard } from '@/components/ui/KpiCard'
import { Bot, CheckCircle2, ChevronDown, CircleAlert, Clipboard, Clock3, Eye, EyeOff, ExternalLink, LockKeyhole, RefreshCw, Send, Users, XCircle } from 'lucide-react'
import { useActionConfirmation, useUnsavedChangesGuard } from '@/components/ui/FormSafetyProvider'
import { resolveLineConnectionProfile } from '@/lib/line-connection-profile'

export const MASKED_CREDENTIAL = '••••••••••••••••'

export function isProtectedCredential(value: string | null | undefined) {
  return Boolean(value?.includes('••'))
}

export function buildLineWebhookUrl(appUrl: string) {
  if (!appUrl.trim()) return ''
  try {
    return new URL('/api/line/webhook', appUrl.trim()).toString()
  } catch {
    return ''
  }
}

type CredentialEditMode = 'empty' | 'protected' | 'editing'
type CheckState = 'idle' | 'testing' | 'passed' | 'failed'

// Validation Schema for credentials and basic configs
const credentialsSchema = z.object({
  lineChannelAccessToken: z.string().trim().nullable().or(z.literal('')),
  lineChannelSecret: z.string().trim().nullable().or(z.literal('')),
  googleSheetsWebhookUrl: z.string().trim().url('รูปแบบ URL Google Sheets ไม่ถูกต้อง').or(z.literal('')),
  lineDefaultTargetId: z.string().trim().nullable().or(z.literal('')),
  pdfBucket: z.string().trim().min(1, 'กรุณาระบุชื่อ Storage Bucket'),
  appUrl: z.string().trim().url('รูปแบบ URL ไม่ถูกต้อง').or(z.literal('')),
  lineAutoSendWti: z.boolean().default(false),
  lineAutoSendWto: z.boolean().default(false),
  dailyReportAutoSend: z.boolean().default(true),
  dailyReportScheduleTime: z.string().trim().default('18:00'),
  monthlyReportAutoSend: z.boolean().default(true),
  monthlyReportScheduleTime: z.string().trim().default('08:00'),
  monthlyReportDay: z.string().trim().default('1'),
})

type CredentialsFormValues = z.infer<typeof credentialsSchema>

type Target = {
  id: string
  target_id: string
  target_type: 'group' | 'room' | 'user'
  display_name: string
  picture_url: string | null
  branch_code: string | null
  is_default: boolean
  is_active: boolean
  notify_wti: boolean
  notify_wto: boolean
  last_seen_at: string | null
  last_event_type: string | null
}

type LineDocumentType = 'WTI' | 'WTO' | 'PB' | 'SB' | 'PMT' | 'RCP' | 'DAILY' | 'MONTHLY'

type RoutingRuleConditions = {
  documentTypes?: LineDocumentType[]
  branchCodes?: string[]
  warehouseIds?: string[]
  productIds?: string[]
  partyIds?: string[]
  minNetWeight?: number | null
  maxNetWeight?: number | null
  minImpurityWeight?: number | null
  requiresImages?: boolean
  requiresScalePhoto?: boolean
  scheduleTime?: string
  monthlyScheduleTime?: string
  timeWindows?: unknown[]
}

type RoutingRule = {
  id: string
  name: string
  description: string | null
  priority: number
  is_active: boolean
  target_id: string
  template_id: string | null
  stop_after_match: boolean
  conditions: RoutingRuleConditions
}

const lineDocumentTypeOptions: Array<{ type: LineDocumentType; label: string }> = [
  { type: 'WTI', label: 'ใบรับของ' },
  { type: 'WTO', label: 'ใบส่งของ' },
  { type: 'PB', label: 'บิลซื้อ' },
  { type: 'SB', label: 'บิลขาย' },
  { type: 'PMT', label: 'ใบจ่ายเงิน Supplier' },
  { type: 'RCP', label: 'ใบรับเงิน Customer' },
  { type: 'DAILY', label: '📊 สรุปประจำวัน (Daily Report)' },
  { type: 'MONTHLY', label: '🗓️ สรุปประจำเดือน (Monthly Report)' },
]

type MessageTemplate = {
  id: string
  name: string
  template_type: string
  is_default_wti: boolean
  is_default_wto: boolean
  is_active: boolean
  config: any
}

type TemplateFieldConfig = {
  key: string
  label: string
  enabled: boolean
}

type TemplateConfig = {
  layout: string
  title: string
  subtitle: string
  theme: {
    headerColorWti: string
    headerColorWto: string
  }
  fields: TemplateFieldConfig[]
  buttons: {
    pdf: boolean
    detail: boolean
  }
}

const templateFieldOptions: Array<{ key: string; defaultLabel: string }> = [
  { key: 'partyName', defaultLabel: 'ผู้ขาย/ลูกค้า' },
  { key: 'branchName', defaultLabel: 'สาขา' },
  { key: 'godownName', defaultLabel: 'โกดัง' },
  { key: 'grossWeight', defaultLabel: 'น้ำหนักรวม' },
  { key: 'containerDeductionWeight', defaultLabel: 'หักภาชนะ' },
  { key: 'deductionWeight', defaultLabel: 'หักสิ่งเจือปน' },
  { key: 'netWeight', defaultLabel: 'น้ำหนักสุทธิ' },
  { key: 'enteredBy', defaultLabel: 'ผู้บันทึก' },
]

const createDefaultTemplateConfig = (): TemplateConfig => ({
  layout: 'flex_card_pdf',
  title: 'ใบรับของ WTI {{documentNo}}',
  subtitle: '{{partyName}} · {{netWeight}} กก.',
  theme: { headerColorWti: '#047857', headerColorWto: '#1d4ed8' },
  fields: templateFieldOptions.map((field) => ({
    key: field.key,
    label: field.defaultLabel,
    enabled: ['partyName', 'branchName', 'godownName', 'grossWeight', 'containerDeductionWeight', 'deductionWeight', 'netWeight'].includes(field.key),
  })),
  buttons: { pdf: true, detail: true },
})

type NotificationJob = {
  id: string
  source_type: string
  source_id: string
  document_no: string
  document_type: string
  target_id: string
  target_type: string
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'processing'
  priority: number
  attempt_count: number
  max_attempts: number
  pdf_url: string | null
  last_error_message: string | null
  created_at: string
  updated_at: string
  line_notification_attempts: Array<{
    id: string
    attempt_no: number
    status: string
    error_message: string | null
    duration_ms: number | null
    created_at: string
  }>
}

type AnalyticsSummary = {
  today: {
    total: number
    sent: number
    failed: number
    pending: number
    successRate: number
  }
  last30Days: {
    total: number
    sent: number
    failed: number
    pending: number
    successRate: number
    avgDurationMs: number
  }
  topTargets: Array<{ targetId: string; displayName: string; count: number }>
  topErrors: Array<{ message: string; count: number }>
  docTypes: Array<{ type: string; count: number }>
}

type BranchOption = {
  id: string
  name: string
  code: string | null
}

type BotInfo = {
  botName: string
  basicId: string
  pictureUrl: string | null
}

type WeightTicketOption = {
  id: string
  docNo: string
  docType: string
  supplierName?: string
  customerName?: string
  netWeight: number
}

// Columns definition for Resizable tables
type TargetColKey = 'targetInfo' | 'branch' | 'notifyWti' | 'notifyWto' | 'status' | 'actions'
type RuleColKey = 'priority' | 'name' | 'target' | 'stopAfter' | 'isActive' | 'actions'
type JobColKey = 'createdAt' | 'document' | 'target' | 'status' | 'attempts' | 'actions'
type SortDirection = 'asc' | 'desc'
type SortValue = boolean | number | string | null | undefined

const targetCols: Array<ResizableColumnDefinition<TargetColKey>> = [
  { key: 'targetInfo', defaultWidth: 260, minWidth: 180 },
  { key: 'branch', defaultWidth: 130, minWidth: 100 },
  { key: 'notifyWti', defaultWidth: 90, minWidth: 80 },
  { key: 'notifyWto', defaultWidth: 90, minWidth: 80 },
  { key: 'status', defaultWidth: 110, minWidth: 90 },
  { key: 'actions', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const ruleCols: Array<ResizableColumnDefinition<RuleColKey>> = [
  { key: 'priority', defaultWidth: 90, minWidth: 70 },
  { key: 'name', defaultWidth: 220, minWidth: 150 },
  { key: 'target', defaultWidth: 180, minWidth: 130 },
  { key: 'stopAfter', defaultWidth: 110, minWidth: 90 },
  { key: 'isActive', defaultWidth: 90, minWidth: 80 },
  { key: 'actions', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const jobCols: Array<ResizableColumnDefinition<JobColKey>> = [
  { key: 'createdAt', defaultWidth: 140, minWidth: 120 },
  { key: 'document', defaultWidth: 140, minWidth: 110 },
  { key: 'target', defaultWidth: 180, minWidth: 130 },
  { key: 'status', defaultWidth: 100, minWidth: 95 },
  { key: 'attempts', defaultWidth: 90, minWidth: 80 },
  { key: 'actions', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

function compareSortValues(left: SortValue, right: SortValue) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
  return String(left ?? '').localeCompare(String(right ?? ''), 'th', { numeric: true, sensitivity: 'base' })
}

function sortRows<T, K extends string>(
  rows: T[],
  sortKey: K | null,
  direction: SortDirection,
  getValue: (row: T, key: K) => SortValue,
) {
  if (!sortKey) return rows

  return [...rows].sort((left, right) => {
    const result = compareSortValues(getValue(left, sortKey), getValue(right, sortKey))
    return direction === 'asc' ? result : -result
  })
}

function targetStatusSortValue(target: Target) {
  if (!target.is_active && target.last_event_type === 'not_found') return 'บอทออกจากกลุ่ม'
  return target.is_active ? 'อยู่ในกลุ่ม' : 'ปิดใช้งาน'
}

function TargetAvatar({ size = 'sm', target }: { size?: 'sm' | 'md'; target: Target }) {
  const fallback = target.target_type === 'group' ? 'G' : target.target_type === 'room' ? 'R' : 'U'
  const sizeClass = size === 'md' ? 'size-10 text-sm' : 'size-8 text-xs'

  return (
    <div aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 font-bold text-slate-500 ${sizeClass}`}>
      <span>{fallback}</span>
      {target.picture_url ? (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          src={target.picture_url}
          onError={(event) => { event.currentTarget.style.display = 'none' }}
          onLoad={(event) => { event.currentTarget.style.display = 'block' }}
        />
      ) : null}
    </div>
  )
}

function getTargetSortValue(target: Target, key: TargetColKey): SortValue {
  switch (key) {
    case 'targetInfo':
      return `${target.display_name} ${target.target_type} ${target.target_id}`
    case 'branch':
      return target.branch_code ?? 'ทุกสาขา'
    case 'notifyWti':
      return target.notify_wti
    case 'notifyWto':
      return target.notify_wto
    case 'status':
      return targetStatusSortValue(target)
    case 'actions':
      return ''
  }
}

function getRuleSortValue(rule: RoutingRule, key: RuleColKey, targetNameById: Map<string, string>): SortValue {
  switch (key) {
    case 'priority':
      return rule.priority
    case 'name':
      return `${rule.name} ${rule.description ?? ''}`
    case 'target':
      return `${targetNameById.get(rule.target_id) ?? ''} ${rule.target_id}`
    case 'stopAfter':
      return rule.stop_after_match
    case 'isActive':
      return rule.is_active
    case 'actions':
      return ''
  }
}

function getJobSortValue(job: NotificationJob, key: JobColKey, targetNameById: Map<string, string>): SortValue {
  switch (key) {
    case 'createdAt':
      return Date.parse(job.created_at) || 0
    case 'document':
      return `${job.document_no} ${job.document_type}`
    case 'target':
      return `${targetNameById.get(job.target_id) ?? ''} ${job.target_id}`
    case 'status':
      return job.status
    case 'attempts':
      return job.attempt_count
    case 'actions':
      return ''
  }
}

export function LineSettingsPageClient() {
  const { requestConfirmation } = useActionConfirmation()
  const [activeTab, setActiveTab] = useState<'overview' | 'credentials' | 'targets' | 'rules' | 'templates' | 'outbox' | 'analytics'>('overview')

  // Lists & data states
  const [form, setForm] = useState<CredentialsFormValues>({
    lineChannelAccessToken: '',
    lineChannelSecret: '',
    googleSheetsWebhookUrl: '',
    lineDefaultTargetId: '',
    pdfBucket: '',
    appUrl: '',
    lineAutoSendWti: false,
    lineAutoSendWto: false,
    dailyReportAutoSend: true,
    dailyReportScheduleTime: '18:00',
    monthlyReportAutoSend: true,
    monthlyReportScheduleTime: '08:00',
    monthlyReportDay: '1',
  })
  const [credentialsBaseline, setCredentialsBaseline] = useState<string | null>(null)

  const [targets, setTargets] = useState<Target[]>([])
  const [rules, setRules] = useState<RoutingRule[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [jobs, setJobs] = useState<NotificationJob[]>([])
  const [recentTickets, setRecentTickets] = useState<WeightTicketOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null)
  const [tokenMode, setTokenMode] = useState<CredentialEditMode>('empty')
  const [secretMode, setSecretMode] = useState<CredentialEditMode>('empty')
  const [tokenCheck, setTokenCheck] = useState<CheckState>('idle')
  const [webhookCheck, setWebhookCheck] = useState<CheckState>('idle')
  const [selectedTestTargetId, setSelectedTestTargetId] = useState('')
  const [browserHost, setBrowserHost] = useState('')
  const [hasAcknowledgedLocalhost, setHasAcknowledgedLocalhost] = useState(false)

  // Loading & Action states
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTestingOA, setIsTestingOA] = useState(false)
  const [isTestingWebhook, setIsTestingWebhook] = useState(false)
  const [isProcessingJobs, setIsProcessingJobs] = useState(false)
  const [isSyncingTargets, setIsSyncingTargets] = useState(false)
  const [simulatedDecisions, setSimulatedDecisions] = useState<any[] | null>(null)
  const [simulatingDocNo, setSimulatingDocNo] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)

  // Feedback messages
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CredentialsFormValues, string>>>({})

  // Password masking
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [showGoogleSheetsWebhook, setShowGoogleSheetsWebhook] = useState(false)

  // Target Modals / Forms state
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false)
  const [editingTarget, setEditingTarget] = useState<Partial<Target> | null>(null)
  const [targetFormBaseline, setTargetFormBaseline] = useState<string | null>(null)

  // Rule Modals / Forms state
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<Partial<RoutingRule> | null>(null)
  const [ruleFieldErrors, setRuleFieldErrors] = useState<{ documentTypes?: string; targetId?: string }>({})
  const [ruleFormBaseline, setRuleFormBaseline] = useState<string | null>(null)

  // Manual Send Modal / Form state
  const [isManualSendModalOpen, setIsManualSendModalOpen] = useState(false)
  const [manualSendType, setManualSendType] = useState<LineDocumentType>('DAILY')
  const [manualSendDocumentNo, setManualSendDocumentNo] = useState('')
  const [manualSendDate, setManualSendDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [manualSendTargetId, setManualSendTargetId] = useState('')
  const [isManualSending, setIsManualSending] = useState(false)
  const [manualSendError, setManualSendError] = useState<string | null>(null)
  const [manualSendMessage, setManualSendMessage] = useState<string | null>(null)

  const openManualSendModal = useCallback(() => {
    setManualSendType('DAILY')
    setManualSendDocumentNo('')
    setManualSendDate(new Date().toISOString().slice(0, 10))
    setManualSendTargetId('')
    setManualSendError(null)
    setManualSendMessage(null)
    setIsManualSendModalOpen(true)
  }, [])
  const closeManualSendModal = useCallback(() => {
    setIsManualSendModalOpen(false)
    setManualSendError(null)
    setManualSendMessage(null)
  }, [])

  // Template Modals / Forms state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Partial<MessageTemplate> | null>(null)
  const [templatePreviewJson, setTemplatePreviewJson] = useState<any | null>(null)
  const [previewDocNo, setPreviewDocNo] = useState('')
  const [templateFormBaseline, setTemplateFormBaseline] = useState<string | null>(null)

  const savedCredentials = useMemo<Partial<CredentialsFormValues> | null>(() => {
    if (!credentialsBaseline) return null
    try {
      return JSON.parse(credentialsBaseline) as CredentialsFormValues
    } catch {
      return null
    }
  }, [credentialsBaseline])
  const hasUnsavedWebhookConfig = !savedCredentials
    || form.lineChannelSecret !== savedCredentials.lineChannelSecret
    || form.appUrl !== savedCredentials.appUrl
  const activeTargets = useMemo(() => targets.filter((target) => target.is_active), [targets])
  const selectedTestTarget = useMemo(
    () => activeTargets.find((target) => target.id === selectedTestTargetId) ?? null,
    [activeTargets, selectedTestTargetId],
  )
  const lineProfile = useMemo(() => resolveLineConnectionProfile({
    appUrl: form.appUrl,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }), [form.appUrl])
  const isLocalhost = browserHost === 'localhost' || browserHost === '127.0.0.1'
  const hasKnownProfileMismatch = lineProfile.dataProfileId !== 'custom'
    && lineProfile.targetProfileId !== 'custom'
    && !lineProfile.aligned
  const hasDeployedHostMismatch = Boolean(
    browserHost
    && !isLocalhost
    && lineProfile.appHost
    && browserHost !== lineProfile.appHost,
  )
  const webhookUrl = buildLineWebhookUrl(form.appUrl)
  const hasTokenForTest = Boolean(form.lineChannelAccessToken)
  const canSaveCredentials = credentialsSchema.safeParse(form).success
    && !isSaving
    && (tokenMode !== 'editing' || tokenCheck === 'passed')
  const canTestWebhook = Boolean(form.lineChannelSecret && webhookUrl)
    && tokenCheck === 'passed'
    && !hasUnsavedWebhookConfig
    && !hasKnownProfileMismatch
    && !hasDeployedHostMismatch
    && !isTestingWebhook
  const canSendTestMessage = Boolean(selectedTestTarget)
    && tokenCheck === 'passed'
    && !hasKnownProfileMismatch
    && !hasDeployedHostMismatch

  const getTemplateConfig = useCallback((template?: Partial<MessageTemplate> | null): TemplateConfig => {
    const defaults = createDefaultTemplateConfig()
    const config = template?.config || {}
    const configFields = Array.isArray(config.fields) ? config.fields : defaults.fields

    return {
      ...defaults,
      ...config,
      theme: {
        ...defaults.theme,
        ...(config.theme || {}),
      },
      fields: templateFieldOptions.map((option) => {
        const existing = configFields.find((field: TemplateFieldConfig) => field.key === option.key)
        return {
          key: option.key,
          label: existing?.label || option.defaultLabel,
          enabled: existing?.enabled ?? defaults.fields.find((field) => field.key === option.key)?.enabled ?? false,
        }
      }),
      buttons: {
        ...defaults.buttons,
        ...(config.buttons || {}),
      },
    }
  }, [])

  const updateEditingTemplateConfig = useCallback((updater: (config: TemplateConfig) => TemplateConfig) => {
    setEditingTemplate((current) => {
      if (!current) return current
      return { ...current, config: updater(getTemplateConfig(current)) }
    })
  }, [getTemplateConfig])

  const openTargetForm = useCallback((target: Partial<Target>) => {
    setTargetFormBaseline(JSON.stringify(target))
    setEditingTarget(target)
    setIsTargetModalOpen(true)
  }, [])
  const closeTargetForm = useCallback(() => {
    setIsTargetModalOpen(false)
    setEditingTarget(null)
    setTargetFormBaseline(null)
  }, [])
  const openRuleForm = useCallback((rule: Partial<RoutingRule>) => {
    if (rule.conditions?.scheduleTime) {
      setForm((current) => ({ ...current, dailyReportScheduleTime: rule.conditions?.scheduleTime || current.dailyReportScheduleTime }))
    }
    if (rule.conditions?.monthlyScheduleTime) {
      setForm((current) => ({ ...current, monthlyReportScheduleTime: rule.conditions?.monthlyScheduleTime || current.monthlyReportScheduleTime }))
    } else if (rule.conditions?.scheduleTime && rule.conditions.documentTypes?.includes('MONTHLY') && !rule.conditions.documentTypes?.includes('DAILY')) {
      setForm((current) => ({ ...current, monthlyReportScheduleTime: rule.conditions?.scheduleTime || current.monthlyReportScheduleTime }))
    }
    setRuleFormBaseline(JSON.stringify(rule))
    setEditingRule(rule)
    setIsRuleModalOpen(true)
  }, [])
  const closeRuleForm = useCallback(() => {
    setIsRuleModalOpen(false)
    setEditingRule(null)
    setRuleFieldErrors({})
    setRuleFormBaseline(null)
  }, [])
  const openTemplateForm = useCallback((template: Partial<MessageTemplate>) => {
    setTemplateFormBaseline(JSON.stringify(template))
    setEditingTemplate(template)
    setIsTemplateModalOpen(true)
  }, [])
  const closeTemplateForm = useCallback(() => {
    setIsTemplateModalOpen(false)
    setEditingTemplate(null)
    setTemplatePreviewJson(null)
    setTemplateFormBaseline(null)
  }, [])

  const hasUnsavedCredentials = credentialsBaseline !== null && JSON.stringify(form) !== credentialsBaseline
  const hasUnsavedTargetForm = Boolean(isTargetModalOpen && editingTarget && targetFormBaseline !== null && JSON.stringify(editingTarget) !== targetFormBaseline)
  const hasUnsavedRuleForm = Boolean(isRuleModalOpen && editingRule && ruleFormBaseline !== null && JSON.stringify(editingRule) !== ruleFormBaseline)
  const hasUnsavedTemplateForm = Boolean(isTemplateModalOpen && editingTemplate && templateFormBaseline !== null && JSON.stringify(editingTemplate) !== templateFormBaseline)
  useUnsavedChangesGuard(hasUnsavedCredentials)
  const { requestDiscard: requestDiscardTargetForm } = useUnsavedChangesGuard(hasUnsavedTargetForm)
  const { requestDiscard: requestDiscardRuleForm } = useUnsavedChangesGuard(hasUnsavedRuleForm)
  const { requestDiscard: requestDiscardTemplateForm } = useUnsavedChangesGuard(hasUnsavedTemplateForm)

  useEffect(() => {
    setBrowserHost(window.location.hostname)
  }, [])

  useEffect(() => {
    setSelectedTestTargetId((current) => {
      if (activeTargets.some((target) => target.id === current)) return current
      const defaultTarget = activeTargets.find((target) => target.is_default)
      return defaultTarget?.id ?? (activeTargets.length === 1 ? activeTargets[0].id : '')
    })
  }, [activeTargets])

  const requestCloseTargetForm = useCallback(() => requestDiscardTargetForm(closeTargetForm), [closeTargetForm, requestDiscardTargetForm])
  const requestCloseRuleForm = useCallback(() => requestDiscardRuleForm(closeRuleForm), [closeRuleForm, requestDiscardRuleForm])
  const requestCloseTemplateForm = useCallback(() => requestDiscardTemplateForm(closeTemplateForm), [closeTemplateForm, requestDiscardTemplateForm])

  useEffect(() => {
    if (!isTargetModalOpen && !isTemplateModalOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      if (isTargetModalOpen) requestCloseTargetForm()
      if (isTemplateModalOpen) requestCloseTemplateForm()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isTargetModalOpen, isTemplateModalOpen, requestCloseTargetForm, requestCloseTemplateForm])

  // Outbox job details modal
  const [selectedJob, setSelectedJob] = useState<NotificationJob | null>(null)

  // Pagination for Jobs
  const [jobPage, setJobPage] = useState(1)
  const [jobTotalPages, setJobTotalPages] = useState(1)
  const [jobStatusFilter, setJobStatusFilter] = useState('')
  const [jobSearch, setJobSearch] = useState('')
  const [targetSortKey, setTargetSortKey] = useState<TargetColKey | null>(null)
  const [targetSortDirection, setTargetSortDirection] = useState<SortDirection>('asc')
  const [ruleSortKey, setRuleSortKey] = useState<RuleColKey | null>(null)
  const [ruleSortDirection, setRuleSortDirection] = useState<SortDirection>('asc')
  const [jobSortKey, setJobSortKey] = useState<JobColKey | null>(null)
  const [jobSortDirection, setJobSortDirection] = useState<SortDirection>('asc')

  // Loaders
  const loadCredentials = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/line-settings', { cache: 'no-store' })
      const data = await response.json()
      const nextForm = {
        ...data,
        googleSheetsWebhookUrl: data.googleSheetsWebhookUrl || '',
      } as CredentialsFormValues
      setForm(nextForm)
      setCredentialsBaseline(JSON.stringify(nextForm))
      setTokenMode(isProtectedCredential(nextForm.lineChannelAccessToken) ? 'protected' : 'empty')
      setSecretMode(isProtectedCredential(nextForm.lineChannelSecret) ? 'protected' : 'empty')
      setWebhookCheck('idle')
    } catch (err) {
      console.error('Failed to load line credentials settings', err)
    }
  }, [])

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/branches', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setBranches(data.branches || [])
      }
    } catch (err) {
      console.error('Failed to load branches', err)
    }
  }, [])

  const loadTargets = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/line-targets', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setTargets(data)
      }
    } catch (err) {
      console.error('Failed to load line targets', err)
    }
  }, [])

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/line-rules', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setRules(data)
      }
    } catch (err) {
      console.error('Failed to load rules', err)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/line-templates', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch (err) {
      console.error('Failed to load message templates', err)
    }
  }, [])

  const loadJobs = useCallback(async () => {
    try {
      const statusParam = jobStatusFilter ? `&status=${jobStatusFilter}` : ''
      const searchParam = jobSearch ? `&search=${encodeURIComponent(jobSearch)}` : ''
      const res = await fetch(`/api/admin/line-jobs?page=${jobPage}&pageSize=15${statusParam}${searchParam}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs || [])
        setJobTotalPages(data.pagination?.totalPages || 1)
      }
    } catch (err) {
      console.error('Failed to load outbox jobs', err)
    }
  }, [jobPage, jobStatusFilter, jobSearch])

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/line-analytics/summary', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch (err) {
      console.error('Failed to load analytics', err)
    }
  }, [])

  const loadRecentTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/daily/weight-tickets?limit=8', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (data && data.rows) {
          setRecentTickets(
            data.rows.map((t: any) => ({
              id: t.id,
              docNo: t.docNo,
              docType: t.docType,
              supplierName: t.supplierName,
              customerName: t.customerName,
              netWeight: t.netWeight || 0,
            }))
          )
        }
      }
    } catch (err) {
      console.error('Failed to load recent weight tickets', err)
    }
  }, [])

  const loadBotInfo = useCallback(async () => {
    setTokenCheck('testing')
    try {
      const res = await fetch('/api/admin/line-settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.ok) {
          setBotInfo({
            botName: data.botName,
            basicId: data.basicId,
            pictureUrl: data.pictureUrl || null,
          })
          setTokenCheck('passed')
          return
        }
      }
      setTokenCheck('failed')
    } catch (err) {
      console.error('Failed to load bot info', err)
      setTokenCheck('failed')
    }
  }, [])

  const handleSyncTargets = async () => {
    setError(null)
    setMessage(null)
    setIsSyncingTargets(true)
    try {
      const res = await fetch('/api/admin/line-targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'ซิงค์กลุ่ม LINE ไม่สำเร็จ')

      // อัปเดต bot info + target list
      if (body.bot) {
        setBotInfo({
          botName: body.bot.botName,
          basicId: body.bot.basicId,
          pictureUrl: body.bot.pictureUrl || null,
        })
      }
      void loadTargets()

      const refreshed = body.refreshed ?? 0
      const notFound = body.notFound ?? 0
      const failed = body.failed ?? 0
      const total = body.total ?? 0
      const parts: string[] = [`รีเฟรช ${refreshed}/${total} รายการ`]
      if (notFound > 0) parts.push(`${notFound} รายการบอทออกแล้ว`)
      if (failed > 0) parts.push(`${failed} รายการผิดพลาด`)
      setMessage(`🔄 ซิงค์กลุ่ม LINE สำเร็จ — ${parts.join(' · ')}`)
    } catch (caught) {
      setError(getErrorMessage(caught, 'ซิงค์กลุ่ม LINE ขัดข้อง'))
    } finally {
      setIsSyncingTargets(false)
    }
  }

  const initData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await Promise.all([
        loadCredentials(),
        loadBranches(),
        loadTargets(),
        loadRules(),
        loadTemplates(),
        loadJobs(),
        loadRecentTickets(),
        loadAnalytics(),
        loadBotInfo()
      ])
    } catch (err) {
      setError('ไม่สามารถโหลดข้อมูลระบบแจ้งเตือน LINE ได้ครบถ้วน')
    } finally {
      setIsLoading(false)
    }
  }, [loadCredentials, loadBranches, loadTargets, loadRules, loadTemplates, loadJobs, loadRecentTickets, loadAnalytics, loadBotInfo])

  useEffect(() => {
    void initData()
  }, [initData])

  const clearConnectionFeedback = () => {
    setConnectionError(null)
    setConnectionMessage(null)
  }

  const saveCredentials = async (confirmBotChange = false) => {
    clearConnectionFeedback()
    setFieldErrors({})

    const parsed = credentialsSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as any)
      setConnectionError('กรุณากรอกข้อมูลให้ถูกต้อง')
      return
    }
    if (tokenMode === 'editing' && tokenCheck !== 'passed') {
      setFieldErrors({ lineChannelAccessToken: 'ทดสอบ Access Token ที่พิมพ์ใหม่ให้ผ่านก่อนบันทึก' })
      setConnectionError('กรุณาทดสอบ Access Token ก่อนบันทึก')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/line-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, confirmBotChange }),
      })
      const responseBody = await res.json().catch(() => ({}))
      if (res.status === 409 && responseBody.code === 'LINE_BOT_CHANGE_CONFIRMATION_REQUIRED') {
        requestConfirmation({
          title: 'ยืนยันการเปลี่ยน LINE OA',
          description: `การยืนยันจะปิดใช้งานกลุ่มและกฎการส่งเดิมทั้งหมด แต่เก็บประวัติไว้ (${responseBody.previousBot?.name || responseBody.previousBot?.basicId || 'OA เดิม'} → ${responseBody.nextBot?.name || responseBody.nextBot?.basicId || 'OA ใหม่'})`,
          confirmLabel: 'ยืนยันเปลี่ยน OA',
          destructive: true,
          onConfirm: () => saveCredentials(true),
        })
        return
      }
      if (!res.ok) {
        throw new Error(responseBody.error || 'บันทึกข้อมูลการตั้งค่าล้มเหลว')
      }
      if (responseBody.requiresTargetRegistration) {
        setConnectionMessage('บันทึก OA ใหม่แล้ว: โปรดตั้ง Webhook และให้ OA ใหม่ส่ง event จริงก่อนเลือกกลุ่มรับแจ้งเตือน')
      } else if (responseBody.syncWarning) {
        setConnectionMessage(`บันทึกการเชื่อมต่อสำเร็จ แต่ซิงค์กลุ่มล้มเหลว: ${responseBody.syncWarning}`)
      } else {
        setConnectionMessage('บันทึกข้อมูลการเชื่อมต่อสำเร็จ')
      }
      setCredentialsBaseline(JSON.stringify(parsed.data))
      void loadCredentials()
      void loadBotInfo()
      void loadTargets()
    } catch (caught) {
      setConnectionError(getErrorMessage(caught, 'บันทึกข้อมูลไม่สำเร็จ'))
    } finally {
      setIsSaving(false)
    }
  }

  const testOAConnection = async () => {
    clearConnectionFeedback()
    if (!form.lineChannelAccessToken) {
      setConnectionError('กรุณากรอก LINE Channel Access Token ก่อนทดสอบ')
      return
    }
    setIsTestingOA(true)
    setTokenCheck('testing')
    try {
      const res = await fetch('/api/admin/line-settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: form.lineChannelAccessToken }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'การเชื่อมต่อผิดพลาด')
      setBotInfo({ botName: body.botName, basicId: body.basicId, pictureUrl: body.pictureUrl || null })
      setTokenCheck('passed')
      setConnectionMessage(`เชื่อมต่อ LINE OA สำเร็จ: ${body.botName} (${body.basicId})`)
    } catch (caught) {
      setTokenCheck('failed')
      setConnectionError(getErrorMessage(caught, 'ตรวจสอบการเชื่อมต่อล้มเหลว'))
    } finally {
      setIsTestingOA(false)
    }
  }

  const testWebhookSignature = async () => {
    clearConnectionFeedback()
    if (hasUnsavedWebhookConfig) {
      setConnectionError('บันทึก Channel Secret และ Public App URL ก่อนทดสอบ Webhook')
      return
    }
    if (tokenCheck !== 'passed') {
      setConnectionError('ทดสอบ Access Token ให้ผ่านก่อนทดสอบ Webhook ภายใน')
      return
    }
    if (hasKnownProfileMismatch || hasDeployedHostMismatch) {
      setConnectionError('Environment ของฐานข้อมูล, Webhook URL และหน้าเว็บไม่ตรงกัน')
      return
    }
    setIsTestingWebhook(true)
    setWebhookCheck('testing')
    try {
      const res = await fetch('/api/admin/line-settings/test-webhook', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || body.ok === false) {
        const remedies: Record<string, string> = {
          LINE_SECRET_NOT_SAVED: 'บันทึก Channel Secret ก่อนทดสอบ',
          LINE_APP_URL_INVALID: 'ตรวจสอบ Public App URL แล้วบันทึกใหม่',
          LINE_ENVIRONMENT_MISMATCH: 'ตรวจสอบให้ฐานข้อมูลและ Webhook URL เป็น OA environment เดียวกัน',
          LINE_WEBHOOK_SIGNATURE_REJECTED: 'Secret ที่บันทึกไม่ตรงกับ Channel Secret ของ OA เป้าหมาย',
          LINE_WEBHOOK_TIMEOUT: 'Webhook ตอบกลับช้าเกินกำหนด โปรดลองอีกครั้งหลังตรวจสอบปลายทาง',
          LINE_WEBHOOK_UNREACHABLE: 'ไม่สามารถติดต่อ Webhook URL ได้ โปรดตรวจสอบ URL และสถานะระบบ',
        }
        throw new Error(remedies[body.code] || body.error || 'ทดสอบ Webhook ภายในไม่สำเร็จ')
      }
      setWebhookCheck('passed')
      setConnectionMessage('Webhook ภายในยืนยันลายเซ็นสำเร็จ')
    } catch (caught) {
      setWebhookCheck('failed')
      setConnectionError(getErrorMessage(caught, 'ทดสอบ Webhook ล้มเหลว'))
    } finally {
      setIsTestingWebhook(false)
    }
  }

  const runExternalAction = (action: () => Promise<void>) => {
    if (isLocalhost && !hasAcknowledgedLocalhost) {
      requestConfirmation({
        title: `Localhost กำลังจัดการ ${lineProfile.label}`,
        description: 'การทดสอบนี้จะติดต่อบริการภายนอกตามค่าที่บันทึกไว้ โปรดยืนยันว่า environment ถูกต้องก่อนดำเนินการ',
        confirmLabel: 'ยืนยันและดำเนินการ',
        onConfirm: async () => {
          setHasAcknowledgedLocalhost(true)
          await action()
        },
      })
      return
    }
    void action()
  }

  const copyWebhookUrl = async () => {
    if (!webhookUrl) return
    clearConnectionFeedback()
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setConnectionMessage('คัดลอก Webhook URL แล้ว')
    } catch {
      setConnectionError('ไม่สามารถคัดลอก Webhook URL ได้ โปรดคัดลอกจากช่องด้านบน')
    }
  }

  // Trigger Outbox Processing
  const runOutboxWorker = async () => {
    setError(null)
    setMessage(null)
    setIsProcessingJobs(true)
    try {
      const res = await fetch('/api/admin/line-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process' })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'ประมวลผลล้มเหลว')
      setMessage(`⚙️ ส่งข้อมูล pending สำเร็จ! ดำเนินการไป ${body.processedCount} รายการ`)
      void loadJobs()
      void loadAnalytics()
    } catch (caught) {
      setError(getErrorMessage(caught, 'เรียกใช้งาน Worker ล้มเหลว'))
    } finally {
      setIsProcessingJobs(false)
    }
  }

  // TARGET CRUD Handlers
  const handleSaveTarget = async (e: React.FormEvent, confirmed = false) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!editingTarget?.target_id || !editingTarget?.target_type || !editingTarget?.display_name) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน')
      return
    }
    const currentTarget = targets.find((target) => target.id === editingTarget.id)
    if (!confirmed && currentTarget?.is_active && editingTarget.is_active === false) {
      requestConfirmation({
        title: 'ยืนยันการปิดใช้งานเป้าหมายผู้รับ',
        description: 'การปิดใช้งานจะหยุดส่งการแจ้งเตือนไปยังเป้าหมายนี้',
        confirmLabel: 'ยืนยันปิดใช้งาน',
        destructive: true,
        onConfirm: () => handleSaveTarget(e, true),
      })
      return
    }

    try {
      const isEdit = !!editingTarget.id
      const url = '/api/admin/line-targets'
      const method = isEdit ? 'PATCH' : 'POST'
      const payload = isEdit
        ? { id: editingTarget.id, targetId: editingTarget.target_id, targetType: editingTarget.target_type, displayName: editingTarget.display_name, branchCode: editingTarget.branch_code, notifyWti: editingTarget.notify_wti, notifyWto: editingTarget.notify_wto, isActive: editingTarget.is_active }
        : { targetId: editingTarget.target_id, targetType: editingTarget.target_type, displayName: editingTarget.display_name, branchCode: editingTarget.branch_code, notifyWti: editingTarget.notify_wti, notifyWto: editingTarget.notify_wto, isActive: editingTarget.is_active }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'บันทึกเป้าหมายไม่สำเร็จ')

      setMessage(isEdit ? 'แก้ไขเป้าหมายผู้รับสำเร็จ' : 'เพิ่มเป้าหมายผู้รับสำเร็จ')
      closeTargetForm()
      void loadTargets()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกเป้าหมายขัดข้อง'))
      if (confirmed) throw caught
    }
  }

  const handleTestTarget = async (targetId: string, id: string) => {
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/line-targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'test' })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'ส่งทดสอบไม่สำเร็จ')
      setMessage(`🚀 ส่งข้อความทดสอบไปยังเป้าหมายสำเร็จ! Request ID: ${body.lineRequestId}`)
    } catch (caught) {
      setError(getErrorMessage(caught, 'ส่งข้อความทดสอบขัดข้อง'))
    }
  }

  const handleSetDefaultTarget = async (id: string) => {
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/line-targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'set-default' })
      })
      if (!res.ok) throw new Error('ตั้งค่าไม่สำเร็จ')
      setMessage('ตั้งค่าเป้าหมายดีฟอลต์สำเร็จ')
      void loadTargets()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ตั้งค่าดีฟอลต์ขัดข้อง'))
    }
  }

  const handleDeleteTarget = (id: string) => {
    requestConfirmation({ title: 'ยืนยันการลบเป้าหมายผู้รับ', description: 'ต้องการลบเป้าหมายการรับข่าวสารนี้หรือไม่?', confirmLabel: 'ยืนยันลบ', destructive: true, onConfirm: async () => {
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/line-targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'delete' })
      })
      if (!res.ok) throw new Error('ลบไม่สำเร็จ')
      setMessage('ลบเป้าหมายผู้รับสำเร็จ')
      void loadTargets()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ลบเป้าหมายขัดข้อง'))
      throw caught
    }
      },
    })
  }

  // RULE CRUD Handlers
  const handleSaveRule = async (e: React.FormEvent, confirmed = false) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    const documentTypes = editingRule?.conditions?.documentTypes ?? []
    const mixesDocumentCategories = documentTypes.some((type) => type === 'WTI' || type === 'WTO')
      && documentTypes.some((type) => type === 'PB' || type === 'SB' || type === 'PMT' || type === 'RCP')
    const hasActiveGroupTarget = targets.some((target) => (
      target.target_id === editingRule?.target_id
      && target.target_type === 'group'
      && target.is_active
    ))
    const nextFieldErrors = {
      documentTypes: documentTypes.length === 0
        ? 'เลือกเอกสารอย่างน้อย 1 ประเภท'
        : (mixesDocumentCategories ? 'กรุณาแยกใบรับ-ส่งของกับเอกสารการเงินเป็นคนละกฎ' : undefined),
      targetId: hasActiveGroupTarget ? undefined : 'เลือกกลุ่ม LINE ที่เปิดใช้งานอยู่',
    }
    setRuleFieldErrors(nextFieldErrors)
    if (nextFieldErrors.documentTypes || nextFieldErrors.targetId || !editingRule) {
      setError('กรุณาเลือกประเภทเอกสารและกลุ่ม LINE ให้ครบ')
      requestAnimationFrame(() => {
        const fieldId = nextFieldErrors.documentTypes ? 'line-rule-document-types' : 'line-rule-target'
        document.getElementById(fieldId)?.focus()
      })
      return
    }
    const currentRule = rules.find((rule) => rule.id === editingRule.id)
    if (!confirmed && currentRule?.is_active && editingRule.is_active === false) {
      requestConfirmation({
        title: 'ยืนยันการปิดใช้งานกฎส่งข่าวสาร',
        description: 'การปิดใช้งานจะหยุดใช้กฎนี้สำหรับการส่งแจ้งเตือนใหม่',
        confirmLabel: 'ยืนยันปิดใช้งาน',
        destructive: true,
        onConfirm: () => handleSaveRule(e, true),
      })
      return
    }

    try {
      const isEdit = !!editingRule.id
      const url = '/api/admin/line-rules'
      const method = isEdit ? 'PATCH' : 'POST'
      const targetName = targets.find((target) => target.target_id === editingRule.target_id)?.display_name || 'LINE'
      const documentNames = documentTypes.map((type) => lineDocumentTypeOptions.find((option) => option.type === type)?.label || type)
      const selectedDailyTime = editingRule.conditions?.scheduleTime || form.dailyReportScheduleTime || '18:00'
      const selectedMonthlyTime = editingRule.conditions?.monthlyScheduleTime || form.monthlyReportScheduleTime || '08:00'
      const conditions: RoutingRuleConditions = {
        ...editingRule.conditions,
        documentTypes,
        ...(documentTypes.includes('DAILY') ? { scheduleTime: selectedDailyTime } : {}),
        ...(documentTypes.includes('MONTHLY') ? { monthlyScheduleTime: selectedMonthlyTime } : {}),
      }
      if (!documentTypes.some((type) => type === 'WTI' || type === 'WTO')) {
        delete conditions.minNetWeight
        delete conditions.maxNetWeight
        delete conditions.minImpurityWeight
        delete conditions.requiresImages
        delete conditions.requiresScalePhoto
      }
      const payload = {
        id: editingRule.id,
        name: editingRule.id && editingRule.name ? editingRule.name : `${documentNames.join(', ')} → ${targetName}`,
        description: editingRule.description,
        priority: Number(editingRule.priority ?? 100),
        isActive: editingRule.is_active,
        targetId: editingRule.target_id,
        templateId: editingRule.template_id ? Number(editingRule.template_id) : null,
        stopAfterMatch: editingRule.stop_after_match,
        conditions,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const body = await res.json()
      if (documentTypes.includes('DAILY')) {
        // Sync schedule time to system_settings in background
        void fetch('/api/admin/line-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            dailyReportAutoSend: true,
            dailyReportScheduleTime: form.dailyReportScheduleTime || '18:00',
          }),
        }).catch(() => undefined)
      }
      if (documentTypes.includes('MONTHLY')) {
        // Sync monthly schedule time to system_settings in background
        void fetch('/api/admin/line-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            monthlyReportAutoSend: true,
            monthlyReportScheduleTime: form.monthlyReportScheduleTime || '08:00',
            monthlyReportDay: form.monthlyReportDay || '1',
          }),
        }).catch(() => undefined)
      }

      setMessage(isEdit ? 'แก้ไขกฎกระจายการแจ้งเตือนสำเร็จ' : 'เพิ่มกฎกระจายการแจ้งเตือนสำเร็จ')
      closeRuleForm()
      void loadRules()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกกฎขัดข้อง'))
      if (confirmed) throw caught
    }
  }

  const handleDeleteRule = (id: string) => {
    requestConfirmation({ title: 'ยืนยันการลบกฎส่งข่าวสาร', description: 'ต้องการลบกฎส่งข่าวสารนี้หรือไม่?', confirmLabel: 'ยืนยันลบ', destructive: true, onConfirm: async () => {
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/line-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'delete' })
      })
      if (!res.ok) throw new Error('ลบไม่สำเร็จ')
      setMessage('ลบกฎสำเร็จ')
      void loadRules()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ลบกฎขัดข้อง'))
      throw caught
    }
      },
    })
  }

  const handleSimulateRule = async () => {
    setError(null)
    setSimulatedDecisions(null)
    if (!simulatingDocNo) {
      setError('กรุณากรอกหรือเลือกเลขที่ใบชั่งสำหรับทดสอบจำลอง')
      return
    }

    setIsSimulating(true)
    try {
      const res = await fetch('/api/admin/line-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate', documentNo: simulatingDocNo })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'จำลองกฎล้มเหลว')
      setSimulatedDecisions(body)
    } catch (caught) {
      setError(getErrorMessage(caught, 'จำลองกฎขัดข้อง'))
    } finally {
      setIsSimulating(false)
    }
  }

  // MANUAL SEND Handler (ส่งเอกสาร/สรุปประจำวันเข้า LINE ทันที)
  const handleManualSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setManualSendError(null)
    setManualSendMessage(null)
    if (manualSendType !== 'DAILY' && manualSendType !== 'MONTHLY' && !manualSendDocumentNo.trim()) {
      setManualSendError('กรุณาระบุเลขที่เอกสารที่ต้องการส่ง')
      return
    }

    setIsManualSending(true)
    try {
      const res = await fetch('/api/line/manual-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: manualSendType,
          documentNo: (manualSendType === 'DAILY' || manualSendType === 'MONTHLY') ? undefined : manualSendDocumentNo.trim(),
          date: manualSendType === 'DAILY' ? manualSendDate : undefined,
          month: manualSendType === 'MONTHLY' ? manualSendDate.slice(0, 7) : undefined,
          targetId: manualSendTargetId || undefined,
        })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'ส่ง LINE ไม่สำเร็จ')
      setManualSendMessage(body.message || 'ส่ง LINE เรียบร้อย')
    } catch (caught) {
      setManualSendError(getErrorMessage(caught, 'ส่ง LINE ขัดข้อง'))
    } finally {
      setIsManualSending(false)
    }
  }

  // TEMPLATE CRUD Handlers
  const handleSaveTemplate = async (e: React.FormEvent, confirmed = false) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!editingTemplate?.name) {
      setError('กรุณากรอกข้อมูลให้จำเป็นให้ครบถ้วน')
      return
    }
    const currentTemplate = templates.find((template) => template.id === editingTemplate.id)
    if (!confirmed && currentTemplate?.is_active && editingTemplate.is_active === false) {
      requestConfirmation({
        title: 'ยืนยันการปิดใช้งานเทมเพลต',
        description: 'การปิดใช้งานจะทำให้เทมเพลตนี้ไม่พร้อมใช้งานสำหรับการส่งแจ้งเตือนใหม่',
        confirmLabel: 'ยืนยันปิดใช้งาน',
        destructive: true,
        onConfirm: () => handleSaveTemplate(e, true),
      })
      return
    }

    try {
      const isEdit = !!editingTemplate.id
      const url = '/api/admin/line-templates'
      const method = isEdit ? 'PATCH' : 'POST'
      const payload = {
        id: editingTemplate.id,
        name: editingTemplate.name,
        templateType: editingTemplate.template_type || 'weight_ticket',
        isDefaultWti: editingTemplate.is_default_wti,
        isDefaultWto: editingTemplate.is_default_wto,
        isActive: editingTemplate.is_active,
        config: getTemplateConfig(editingTemplate)
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'บันทึกเทมเพลตไม่สำเร็จ')

      setMessage(isEdit ? 'แก้ไขเทมเพลตสำเร็จ' : 'เพิ่มเทมเพลตสำเร็จ')
      closeTemplateForm()
      void loadTemplates()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกเทมเพลตขัดข้อง'))
      if (confirmed) throw caught
    }
  }

  const handleDeleteTemplate = (id: string) => {
    requestConfirmation({ title: 'ยืนยันการลบเทมเพลต', description: 'ต้องการลบเทมเพลตนี้หรือไม่?', confirmLabel: 'ยืนยันลบ', destructive: true, onConfirm: async () => {
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/line-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'delete' })
      })
      if (!res.ok) throw new Error('ลบไม่สำเร็จ')
      setMessage('ลบเทมเพลตสำเร็จ')
      void loadTemplates()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ลบเทมเพลตขัดข้อง'))
      throw caught
    }
      },
    })
  }

  const handlePreviewTemplate = async () => {
    setError(null)
    setTemplatePreviewJson(null)
    if (!previewDocNo) {
      setError('กรุณากรอกหรือเลือกเลขใบชั่งสำหรับพรีวิวข้อความ')
      return
    }
    try {
      const res = await fetch('/api/admin/line-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', config: getTemplateConfig(editingTemplate), documentNo: previewDocNo })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'พรีวิวเทมเพลตล้มเหลว')
      setTemplatePreviewJson(body.flexMsg)
    } catch (caught) {
      setError(getErrorMessage(caught, 'จำลองพรีวิวขัดข้อง'))
    }
  }

  // JOB Action Handlers
  const handleRetryJob = async (id: string, documentNo: string) => {
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/line-jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'retry' })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'ส่งแจ้งเตือนซ้ำล้มเหลว')
      }
      setMessage(`🚀 บังคับส่งเอกสาร ${documentNo} ในคิวสำเร็จแล้ว!`)
      void loadJobs()
      void loadAnalytics()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ส่งแจ้งเตือนซ้ำขัดข้อง'))
    }
  }

  const handleCancelJob = (id: string) => {
    requestConfirmation({ title: 'ยืนยันการยกเลิกคิวแจ้งเตือน', description: 'ต้องการยกเลิกและหยุดการส่งแจ้งเตือนคิวนี้หรือไม่?', confirmLabel: 'ยืนยันยกเลิก', destructive: true, onConfirm: async () => {
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/line-jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'cancel' })
      })
      if (!res.ok) throw new Error('ยกเลิกล้มเหลว')
      setMessage('ยกเลิกคิวแจ้งเตือนสำเร็จ')
      void loadJobs()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ยกเลิกคิวงานขัดข้อง'))
      throw caught
    }
      },
    })
  }

  // Column Resizer
  const targetResize = useResizableColumns('admin.line-settings.targets-table', targetCols)
  const ruleResize = useResizableColumns('admin.line-settings.rules-table', ruleCols)
  const jobResize = useResizableColumns('admin.line-settings.jobs-table', jobCols)
  const targetNameById = useMemo(() => new Map(targets.map((target) => [target.target_id, target.display_name])), [targets])
  const sortedTargets = useMemo(() => sortRows(targets, targetSortKey, targetSortDirection, getTargetSortValue), [targets, targetSortDirection, targetSortKey])
  const sortedRules = useMemo(
    () => sortRows(rules, ruleSortKey, ruleSortDirection, (rule, key) => getRuleSortValue(rule, key, targetNameById)),
    [rules, ruleSortDirection, ruleSortKey, targetNameById],
  )
  const sortedJobs = useMemo(
    () => sortRows(jobs, jobSortKey, jobSortDirection, (job, key) => getJobSortValue(job, key, targetNameById)),
    [jobs, jobSortDirection, jobSortKey, targetNameById],
  )

  function handleTargetSort(nextKey: TargetColKey) {
    if (targetSortKey === nextKey) {
      setTargetSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setTargetSortKey(nextKey)
    setTargetSortDirection('asc')
  }

  function handleRuleSort(nextKey: RuleColKey) {
    if (ruleSortKey === nextKey) {
      setRuleSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setRuleSortKey(nextKey)
    setRuleSortDirection('asc')
  }

  function handleJobSort(nextKey: JobColKey) {
    if (jobSortKey === nextKey) {
      setJobSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setJobSortKey(nextKey)
    setJobSortDirection('asc')
  }

  // Warnings check for targets Manual input
  const targetWarning = useMemo(() => {
    if (!editingTarget?.target_id) return null
    const id = editingTarget.target_id.trim()
    const type = editingTarget.target_type

    if (type === 'group' && id.startsWith('U')) {
      return '⚠️ คำเตือน: รหัสที่ขึ้นต้นด้วย U มักจะเป็น User ID (รายบุคคล) ไม่ใช่ Group ID หากต้องการส่งเข้ากลุ่มแชทกรุณาใช้รหัส C...'
    }
    if (type === 'user' && id.startsWith('C')) {
      return '⚠️ คำเตือน: รหัสที่ขึ้นต้นด้วย C มักจะเป็น Group ID (กลุ่มไลน์) ไม่ใช่ User ID ข้อมูลนี้อาจจัดส่งไม่ตรงตัวผู้ใช้'
    }
    return null
  }, [editingTarget])

  const templateFormConfig = editingTemplate ? getTemplateConfig(editingTemplate) : createDefaultTemplateConfig()
  const activeGroupCount = targets.filter((target) => target.target_type === 'group' && target.is_active).length
  const overviewWarnings = [
    !form.lineChannelAccessToken ? 'ยังไม่ได้ตั้งค่า LINE Channel Access Token' : null,
    !form.lineChannelSecret ? 'ยังไม่ได้ตั้งค่า LINE Channel Secret' : null,
    activeGroupCount === 0 ? 'ยังไม่มีกลุ่ม LINE ที่เปิดใช้งานสำหรับรับแจ้งเตือน' : null,
    analytics?.today.failed ? `มีรายการส่งไม่สำเร็จ ${analytics.today.failed} รายการในวันนี้` : null,
  ].filter((warning): warning is string => Boolean(warning))

  return (
    <section className="line-settings-page w-full max-w-none space-y-6 px-6 py-5 font-normal text-slate-800 animate-fade-in lg:px-10 lg:py-8 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-blue-500 [&_button:focus-visible]:ring-offset-2 [&_input:focus-visible]:ring-2 [&_input:focus-visible]:ring-blue-500 [&_input:focus-visible]:ring-offset-2 [&_select:focus-visible]:ring-2 [&_select:focus-visible]:ring-blue-500 [&_select:focus-visible]:ring-offset-2 [&_textarea:focus-visible]:ring-2 [&_textarea:focus-visible]:ring-blue-500 [&_textarea:focus-visible]:ring-offset-2">
      <div className="flex justify-end">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          onClick={() => void initData()}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          รีเฟรชข้อมูล
        </button>
      </div>

      {activeTab !== 'credentials' && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 animate-fade-in flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      ) : null}

      {activeTab !== 'credentials' && message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 animate-fade-in flex items-center gap-2">
          <span>✅</span>
          <span>{message}</span>
        </div>
      ) : null}

      {/* Tabs Menu Switcher */}
      <div
        data-line-mobile-tabs
        className="sticky top-0 z-20 -mx-6 bg-slate-50/95 px-6 py-2 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
      >
        <Tabs
          className="gap-0"
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as typeof activeTab)
            setError(null)
            setMessage(null)
            if (value === 'outbox') void loadJobs()
            if (value === 'analytics') void loadAnalytics()
          }}
        >
          <TabsList className="grid w-full grid-cols-3 gap-y-1 sm:grid-cols-6" variant="line">
        {[
          { key: 'overview', label: 'ภาพรวม' },
          { key: 'credentials', label: 'การเชื่อมต่อ' },
          { key: 'targets', label: 'กลุ่มแจ้งเตือน' },
          { key: 'rules', label: 'กฎการส่ง' },
          // { key: 'templates', label: '📝 Templates' }, // ซ่อนชั่วคราว: template config ยังไม่ถูกเชื่อมกับ flow ส่งแจ้งเตือนจริง (buildFlexMessageFromTemplate ใช้แค่ใน Preview)
          { key: 'outbox', label: 'คิวข้อความ' },
          { key: 'analytics', label: 'สถิติ' }
        ].map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            variant="line"
            className="min-h-11 min-w-0 px-1 text-sm focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:border-slate-400 lg:min-h-10 lg:px-3"
          >
            {tab.label}
          </TabsTrigger>
        ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Tab Render Area */}
      <div className="grid grid-cols-1 gap-6">

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5">
              <div className="flex min-w-0 items-center gap-3">
                {botInfo?.pictureUrl ? (
                  <img src={botInfo.pictureUrl} alt={botInfo.botName} className="size-12 shrink-0 rounded-full border border-slate-200 object-cover" />
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Bot aria-hidden="true" className="size-6" /></div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">บัญชี LINE ที่เชื่อมต่อ</p>
                  <p className="truncate text-base font-bold text-slate-900">{botInfo?.botName || 'ยังไม่พบบัญชี LINE'}</p>
                  {botInfo?.basicId ? <p className="truncate font-mono text-xs text-slate-500">{botInfo.basicId}</p> : null}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-100 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <Users aria-hidden="true" className="size-4 text-slate-500" />
                <span className="text-sm text-slate-600">กลุ่มที่เปิดใช้งาน</span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-900">{activeGroupCount}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <KpiCard icon={<Clock3 aria-hidden="true" className="size-5" />} label="คิวรอส่ง" note="รายการที่รอระบบประมวลผล" tone="amber" value={`${analytics?.today?.pending ?? 0} รายการ`} />
              <KpiCard icon={<XCircle aria-hidden="true" className="size-5" />} label="ส่งไม่สำเร็จวันนี้" note="ตรวจสอบและส่งใหม่ได้จากคิวส่งข้อความ" tone="red" value={`${analytics?.today?.failed ?? 0} รายการ`} />
            </div>

            {overviewWarnings.length > 0 ? (
              <div role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
                <div>
                  <h3 className="font-semibold">รายการที่ต้องตรวจสอบ</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-800">
                    {overviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Tab 2: Channel Credentials */}
        {activeTab === 'credentials' && (
          <div className="space-y-4 animate-fade-in" data-ns-field-scope="entry">
            <div data-line-connection-summary className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200/80 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">สถานะการเชื่อมต่อ</h3>
                  <p className="mt-1 text-xs text-slate-500">ตรวจสอบสถานะหลักให้ครบก่อนบันทึกและเปิดใช้งาน Webhook</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                  <Bot aria-hidden="true" className="size-4 text-slate-500" />
                  LINE OA
                </span>
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="grid grid-cols-2 xl:grid-cols-4">
                  <div data-line-connection-status className="min-w-0 border-r border-b border-slate-200 px-4 py-3 xl:border-b-0">
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${lineProfile.aligned ? 'bg-emerald-500' : hasKnownProfileMismatch ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">สภาพแวดล้อม</p>
                        <p className="mt-0.5 truncate font-semibold text-slate-900">{lineProfile.label}</p>
                        <p className="mt-1 hidden truncate text-xs text-slate-500 sm:block" title={lineProfile.reason}>{lineProfile.reason}</p>
                      </div>
                    </div>
                  </div>

                  <div data-line-connection-status className="min-w-0 border-b border-slate-200 px-4 py-3 xl:border-r xl:border-b-0">
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${tokenCheck === 'passed' ? 'bg-emerald-500' : tokenCheck === 'failed' ? 'bg-red-500' : 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">Access Token</p>
                        <p className="mt-0.5 truncate font-semibold text-slate-900">{tokenCheck === 'passed' ? 'ทดสอบผ่าน' : tokenCheck === 'testing' ? 'กำลังทดสอบ' : tokenCheck === 'failed' ? 'ทดสอบไม่ผ่าน' : tokenMode === 'protected' ? 'บันทึกแล้ว' : 'ยังไม่ได้ทดสอบ'}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{tokenMode === 'protected' ? 'ค่าถูกปกป้องและไม่แสดงบนหน้า' : 'ทดสอบค่าที่พิมพ์ก่อนบันทึก'}</p>
                      </div>
                    </div>
                  </div>

                  <div data-line-connection-status className="min-w-0 border-r border-slate-200 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${secretMode === 'protected' ? 'bg-emerald-500' : secretMode === 'editing' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">Channel Secret</p>
                        <p className="mt-0.5 truncate font-semibold text-slate-900">{secretMode === 'protected' ? 'บันทึกแล้ว' : secretMode === 'editing' ? 'มีค่ารอการบันทึก' : 'ยังไม่ได้ตั้งค่า'}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">บันทึกก่อนจึงทดสอบ Webhook ได้</p>
                      </div>
                    </div>
                  </div>

                  <div data-line-connection-status className="min-w-0 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${webhookCheck === 'passed' ? 'bg-emerald-500' : webhookCheck === 'failed' ? 'bg-red-500' : 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">Webhook ภายใน</p>
                        <p className="mt-0.5 truncate font-semibold text-slate-900">{webhookCheck === 'passed' ? 'ทดสอบผ่าน' : webhookCheck === 'testing' ? 'กำลังทดสอบ' : webhookCheck === 'failed' ? 'ทดสอบไม่ผ่าน' : webhookUrl ? 'พร้อมทดสอบ' : 'ยังไม่มี URL'}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">ตรวจลายเซ็นโดยไม่สร้างข้อมูลธุรกิจ</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {hasDeployedHostMismatch || hasKnownProfileMismatch ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Environment ไม่ตรงกัน: ตรวจสอบ URL ของหน้าเว็บ, ฐานข้อมูล และ Public App URL ก่อนทดสอบหรือส่งข้อความจริง
              </div>
            ) : null}
            {isLocalhost ? (
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Localhost กำลังจัดการ {lineProfile.label}; ระบบจะขอให้ยืนยันก่อนทดสอบ Webhook หรือส่งข้อความจริง
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-12">
              <section className="space-y-4 lg:col-span-8">
                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:space-y-6 lg:p-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">การเชื่อมต่อ LINE</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              {/* Channel Access Token */}
              <div className="space-y-1.5">
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="line-channel-access-token">LINE Channel Access Token</label>
                {tokenMode === 'protected' ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <input id="line-channel-access-token" aria-readonly="true" className="h-11 w-full rounded-md border border-slate-300 !bg-slate-100 py-2 pl-9 pr-3 text-sm text-slate-700 lg:h-10" readOnly type="password" value={MASKED_CREDENTIAL} />
                    </div>
                    <button type="button" className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:h-10" onClick={() => {
                      setForm((current) => ({ ...current, lineChannelAccessToken: '' }))
                      setShowToken(false)
                      setTokenCheck('idle')
                      setTokenMode('editing')
                    }}>เปลี่ยนค่า</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <input
                        id="line-channel-access-token"
                        type={showToken ? 'text' : 'password'}
                        autoComplete="new-password"
                        spellCheck={false}
                        aria-invalid={Boolean(fieldErrors.lineChannelAccessToken)}
                        className="h-11 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-2 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:bg-amber-200/15 lg:h-10"
                        placeholder="ป้อน Channel Access Token"
                        value={form.lineChannelAccessToken || ''}
                        onChange={(e) => {
                          setForm({ ...form, lineChannelAccessToken: e.target.value })
                          setTokenCheck('idle')
                        }}
                      />
                      <button type="button" aria-label={showToken ? 'ซ่อน Access Token ที่กำลังพิมพ์' : 'แสดง Access Token ที่กำลังพิมพ์'} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800" onClick={() => setShowToken((current) => !current)}>
                        {showToken ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                      </button>
                    </div>
                    {tokenMode === 'editing' ? <button type="button" className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:h-10" onClick={() => {
                      setForm((current) => ({ ...current, lineChannelAccessToken: MASKED_CREDENTIAL }))
                      setShowToken(false)
                      setTokenCheck('idle')
                      setTokenMode('protected')
                    }}>ยกเลิกการเปลี่ยนค่า</button> : null}
                  </div>
                )}
                <p className="text-xs text-slate-500">{tokenMode === 'protected' ? 'บันทึกแล้ว — Protected: ระบบจะไม่ส่งค่าจริงกลับมาแสดง' : 'ทดสอบค่าที่กำลังพิมพ์ได้ก่อนบันทึก'}</p>
                {fieldErrors.lineChannelAccessToken && (
                  <p className="text-xs text-red-600">{fieldErrors.lineChannelAccessToken}</p>
                )}
              </div>

              {/* Channel Secret */}
              <div className="space-y-1.5">
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="line-channel-secret">LINE Channel Secret</label>
                {secretMode === 'protected' ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <input id="line-channel-secret" aria-readonly="true" className="h-11 w-full rounded-md border border-slate-300 !bg-slate-100 py-2 pl-9 pr-3 text-sm text-slate-700 lg:h-10" readOnly type="password" value={MASKED_CREDENTIAL} />
                    </div>
                    <button type="button" className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:h-10" onClick={() => {
                      setForm((current) => ({ ...current, lineChannelSecret: '' }))
                      setShowSecret(false)
                      setWebhookCheck('idle')
                      setSecretMode('editing')
                    }}>เปลี่ยนค่า</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <input
                        id="line-channel-secret"
                        type={showSecret ? 'text' : 'password'}
                        autoComplete="new-password"
                        spellCheck={false}
                        aria-invalid={Boolean(fieldErrors.lineChannelSecret)}
                        className="h-11 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-2 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:bg-amber-200/15 lg:h-10"
                        placeholder="ป้อน Channel Secret สำหรับตรวจสอบลายเซ็น"
                        value={form.lineChannelSecret || ''}
                        onChange={(e) => {
                          setForm({ ...form, lineChannelSecret: e.target.value })
                          setWebhookCheck('idle')
                        }}
                      />
                      <button type="button" aria-label={showSecret ? 'ซ่อน Channel Secret ที่กำลังพิมพ์' : 'แสดง Channel Secret ที่กำลังพิมพ์'} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800" onClick={() => setShowSecret((current) => !current)}>
                        {showSecret ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                      </button>
                    </div>
                    {secretMode === 'editing' ? <button type="button" className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:h-10" onClick={() => {
                      setForm((current) => ({ ...current, lineChannelSecret: MASKED_CREDENTIAL }))
                      setShowSecret(false)
                      setWebhookCheck('idle')
                      setSecretMode('protected')
                    }}>ยกเลิกการเปลี่ยนค่า</button> : null}
                  </div>
                )}
                <p className="text-xs text-slate-500">{secretMode === 'protected' ? 'บันทึกแล้ว — Protected: ระบบจะไม่ส่งค่าจริงกลับมาแสดง' : 'ต้องบันทึกก่อนจึงทดสอบ Webhook ภายในได้'}</p>
                {fieldErrors.lineChannelSecret && (
                  <p className="text-xs text-red-600">{fieldErrors.lineChannelSecret}</p>
                )}
              </div>

              {/* Storage Bucket */}
              <div className="space-y-1.5">
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="line-pdf-bucket">Storage Bucket เก็บเอกสาร PDF <span className="text-red-600">*</span></label>
                <input
                  id="line-pdf-bucket"
                  type="text"
                  aria-invalid={Boolean(fieldErrors.pdfBucket)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:bg-amber-200/15 lg:h-10"
                  required
                  value={form.pdfBucket}
                  onChange={(e) => setForm({ ...form, pdfBucket: e.target.value })}
                />
                {fieldErrors.pdfBucket && (
                  <p className="text-xs text-red-600">{fieldErrors.pdfBucket}</p>
                )}
              </div>

              {/* Public App URL */}
              <div className="space-y-1.5">
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="line-public-app-url">Public App URL (ต้นทางระบบเว็บ)</label>
                <input
                  id="line-public-app-url"
                  type="url"
                  aria-invalid={Boolean(fieldErrors.appUrl)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:bg-amber-200/15 lg:h-10"
                  placeholder="เช่น https://ns-dev.devkub.com"
                  value={form.appUrl}
                  onChange={(e) => {
                    setForm({ ...form, appUrl: e.target.value })
                    setWebhookCheck('idle')
                  }}
                />
                {fieldErrors.appUrl && (
                  <p className="text-xs text-red-600">{fieldErrors.appUrl}</p>
                )}
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="line-webhook-url">Webhook URL สำหรับ LINE Developers</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="line-webhook-url"
                    aria-readonly="true"
                    className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 !bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700 dark:!bg-slate-800 lg:h-10"
                    readOnly
                    type="text"
                    value={webhookUrl}
                    placeholder="กรอก Public App URL เพื่อสร้าง Webhook URL"
                  />
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 lg:h-10"
                    disabled={!webhookUrl}
                    onClick={() => void copyWebhookUrl()}
                  >
                    <Clipboard aria-hidden="true" className="size-4" />
                    คัดลอก Webhook URL
                  </button>
                  <a
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 lg:h-10 ${webhookUrl ? '' : 'pointer-events-none opacity-60'}`}
                    href="https://developers.line.biz/console/"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                    เปิด LINE Developers
                  </a>
                </div>
                <p className="text-xs text-slate-500">คัดลอก URL นี้ไปวางใน Messaging API &gt; Webhook settings แล้วกด Update, Verify และเปิด Use webhook ใน LINE Developers</p>
              </div>

              {/* Auto Send Options */}
              <div className="md:col-span-2 flex flex-col gap-2 pt-2 select-none md:flex-row md:gap-6">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-0 focus:outline-none"
                    checked={form.lineAutoSendWti}
                    onChange={(e) => setForm({ ...form, lineAutoSendWti: e.target.checked })}
                  />
                  <span>ส่งข้อความแจ้งเตือน WTI (บิลรับสินค้า) ไปไลน์กลุ่มอัตโนมัติเมื่อสร้างบิล</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-0 focus:outline-none"
                    checked={form.lineAutoSendWto}
                    onChange={(e) => setForm({ ...form, lineAutoSendWto: e.target.checked })}
                  />
                  <span>ส่งข้อความแจ้งเตือน WTO (บิลส่งสินค้า) ไปไลน์กลุ่มอัตโนมัติเมื่อสร้างบิล</span>
                </label>
              </div>

              {/* Daily Report Auto-Schedule Card */}
              <div data-line-daily-schedule className="md:col-span-2 rounded-lg border border-emerald-200/90 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-emerald-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                      <Clock3 className="size-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">ตั้งเวลาส่งสรุปรายงานการผลิตประจำวัน (Daily Report Schedule)</h4>
                      <p className="text-xs text-slate-500">
                        ระบบจะรวบรวมยอดใบชั่งและผลผลิตทุกโกดัง (WH-01 ถึง WH-05) ส่งเป็นการ์ด Carousel อัตโนมัติ
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs transition hover:bg-emerald-50"
                    onClick={() => {
                      setManualSendType('DAILY')
                      setManualSendDate(new Date().toISOString().slice(0, 10))
                      setIsManualSendModalOpen(true)
                    }}
                  >
                    <Send className="size-3.5 text-emerald-600" />
                    📤 ส่งทดสอบตอนนี้
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3.5">
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-2xs transition hover:border-slate-300">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-0 focus:outline-none"
                        checked={form.dailyReportAutoSend}
                        onChange={(e) => setForm({ ...form, dailyReportAutoSend: e.target.checked })}
                      />
                      <div>
                        <span className="text-sm font-bold text-slate-900">เปิดใช้งานการส่งรายงานประจำวันอัตโนมัติ</span>
                        <p className="text-xs text-slate-500 mt-0.5">เมื่อถึงเวลาที่กำหนด ระบบจะยิงสรุปยอดเข้ากลุ่ม LINE ตามกฎ DAILY ทันที</p>
                      </div>
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700" htmlFor="daily-report-schedule-time">
                      เวลาที่ต้องการให้ส่งอัตโนมัติ (เวลาไทย GMT+7)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="daily-report-schedule-time"
                        type="time"
                        className="h-10 w-32 rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-1.5 font-mono text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none dark:bg-amber-200/15"
                        value={form.dailyReportScheduleTime || '18:00'}
                        onChange={(e) => setForm({ ...form, dailyReportScheduleTime: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-1">
                        {['17:30', '18:00', '18:30', '19:00', '20:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`rounded border px-2 py-1 text-xs font-mono transition ${
                              form.dailyReportScheduleTime === preset
                                ? 'border-emerald-600 bg-emerald-600 text-white font-bold'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            onClick={() => setForm({ ...form, dailyReportScheduleTime: preset })}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      กลุ่มเป้าหมาย: กำหนดได้ที่แท็บ <strong>"กฎการส่งแจ้งเตือน"</strong> (เลือกประเภท <strong>DAILY</strong>)
                    </p>
                  </div>
                </div>
              </div>

              {/* Monthly Report Auto-Schedule Card */}
              <div data-line-monthly-schedule className="md:col-span-2 rounded-lg border border-blue-200/90 bg-gradient-to-br from-blue-50/70 to-white p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                      <Clock3 className="size-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">ตั้งเวลาส่งสรุปรายงานประจำเดือน (Monthly Executive Report)</h4>
                      <p className="text-xs text-slate-500">
                        ระบบจะรวบรวมยอดใบชั่ง, ผลผลิต, การเงิน, และยอดรายโกดังทั้งเดือน ส่งเป็นการ์ด Carousel อัตโนมัติ
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-xs transition hover:bg-blue-50"
                    onClick={() => {
                      setManualSendType('MONTHLY')
                      setManualSendDate(new Date().toISOString().slice(0, 10))
                      setIsManualSendModalOpen(true)
                    }}
                  >
                    <Send className="size-3.5 text-blue-600" />
                    📤 ส่งทดสอบสรุปเดือนนี้
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3.5">
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-2xs transition hover:border-slate-300">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-0 focus:outline-none"
                        checked={form.monthlyReportAutoSend}
                        onChange={(e) => setForm({ ...form, monthlyReportAutoSend: e.target.checked })}
                      />
                      <div>
                        <span className="text-sm font-bold text-slate-900">เปิดใช้งานการส่งรายงานประจำเดือนอัตโนมัติ</span>
                        <p className="text-xs text-slate-500 mt-0.5">ระบบจะสรุปผลการดำเนินงานของเดือนที่เพิ่งจบไป ส่งเข้า LINE ทุกวันที่ 1 ของเดือน</p>
                      </div>
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700" htmlFor="monthly-report-schedule-time">
                      เวลาที่ต้องการให้ส่งอัตโนมัติ (ทุกวันที่ 1 เวลาไทย GMT+7)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="monthly-report-schedule-time"
                        type="time"
                        className="h-10 w-32 rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-1.5 font-mono text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:bg-amber-200/15"
                        value={form.monthlyReportScheduleTime || '08:00'}
                        onChange={(e) => setForm({ ...form, monthlyReportScheduleTime: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-1">
                        {['07:30', '08:00', '08:30', '09:00', '18:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`rounded border px-2 py-1 text-xs font-mono transition ${
                              form.monthlyReportScheduleTime === preset
                                ? 'border-blue-600 bg-blue-600 text-white font-bold'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            onClick={() => setForm({ ...form, monthlyReportScheduleTime: preset })}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      กลุ่มเป้าหมาย: กำหนดได้ที่แท็บ <strong>"กฎการส่งแจ้งเตือน"</strong> (เลือกประเภท <strong>MONTHLY</strong> หรือใช้กลุ่ม DAILY)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div data-line-google-sheets-disclosure className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-900">เชื่อมต่อ Google Sheets (ไม่บังคับ)</h4>
                <p className="mt-1 text-xs text-slate-500">
                  ส่งข้อมูลใบรับ-ส่งของ WTI/WTO ไปยัง Google Apps Script เมื่อสร้าง แก้ไข ยืนยัน ยกเลิก หรือส่ง LINE สำเร็จ
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="google-sheets-webhook-url">
                  Google Sheets Webhook URL
                </label>
                <div className="relative">
                  <input
                    id="google-sheets-webhook-url"
                    type={showGoogleSheetsWebhook ? 'url' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(fieldErrors.googleSheetsWebhookUrl)}
                    className="h-11 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-2 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:bg-amber-200/15 lg:h-10"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={form.googleSheetsWebhookUrl || ''}
                    onChange={(e) => setForm({ ...form, googleSheetsWebhookUrl: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={showGoogleSheetsWebhook ? 'ซ่อน Google Sheets Webhook URL' : 'แสดง Google Sheets Webhook URL'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[0px] text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                    onClick={() => setShowGoogleSheetsWebhook((current) => !current)}
                  >
                    {showGoogleSheetsWebhook ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                    {showGoogleSheetsWebhook ? 'ซ่อน' : 'แสดง'}
                  </button>
                </div>
                {fieldErrors.googleSheetsWebhookUrl && (
                  <p className="text-xs text-red-600">{fieldErrors.googleSheetsWebhookUrl}</p>
                )}
                <p className="text-xs text-slate-500">เว้นว่างแล้วกดบันทึกเพื่อปิดการเชื่อมต่อ โดยไม่กระทบการส่ง LINE</p>
              </div>
            </div>

            {connectionError || connectionMessage ? (
              <div data-line-connection-feedback className="space-y-2" aria-live="polite">
                {connectionError ? (
                  <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 animate-fade-in">
                    <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-red-700" />
                    <span>{connectionError}</span>
                  </div>
                ) : null}
                {connectionMessage ? (
                  <div role="status" className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 animate-fade-in">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                    <span>{connectionMessage}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div data-line-connection-actions className="space-y-3 border-t border-slate-100 pt-4">
              <div>
                <p className="text-sm font-medium text-slate-700">ทำตามลำดับเพื่อเชื่อมต่ออย่างปลอดภัย</p>
                <p className="text-xs text-slate-500">Token ที่พิมพ์ใหม่ต้องผ่านการทดสอบก่อนบันทึก และ Webhook ภายในใช้เฉพาะค่าที่บันทึกแล้ว</p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  className="relative inline-flex h-11 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 lg:h-10"
                  onClick={() => runExternalAction(testOAConnection)}
                  disabled={!hasTokenForTest || isTestingOA}
                  aria-busy={isTestingOA}
                >
                  <RefreshCw aria-hidden="true" className={`pointer-events-none absolute left-3 size-4 ${isTestingOA ? 'animate-spin' : 'opacity-0'}`} />
                  <span className="whitespace-nowrap">ทดสอบ Access Token</span>
                </button>
                <button
                  type="button"
                  className="relative inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 lg:h-10"
                  onClick={() => void saveCredentials()}
                  disabled={!canSaveCredentials}
                  aria-busy={isSaving}
                >
                  <RefreshCw aria-hidden="true" className={`pointer-events-none absolute left-3 size-4 ${isSaving ? 'animate-spin' : 'opacity-0'}`} />
                  <span className="whitespace-nowrap">บันทึกการตั้งค่า</span>
                </button>
                <button
                  type="button"
                  className="relative inline-flex h-11 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 lg:h-10"
                  onClick={() => runExternalAction(testWebhookSignature)}
                  disabled={!canTestWebhook}
                  aria-busy={isTestingWebhook}
                >
                  <RefreshCw aria-hidden="true" className={`pointer-events-none absolute left-3 size-4 ${isTestingWebhook ? 'animate-spin' : 'opacity-0'}`} />
                  <span className="whitespace-nowrap">ทดสอบ Webhook ภายใน</span>
                </button>
              </div>
            </div>
                </div>
              </section>

              <aside className="space-y-4 lg:col-span-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-base font-bold text-slate-900">ลำดับการเชื่อมต่อ</h3>
                    <p className="mt-1 text-xs text-slate-500">ระบบตรวจสอบเฉพาะขั้นที่ทำได้จาก ERP ส่วน Verify ต้องทำใน LINE Developers</p>
                  </div>
                  <details open data-line-mobile-guide className="group mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200 lg:hidden">
                      <span>ขั้นตอนการเชื่อมต่อ</span>
                      <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-slate-200 p-4 lg:border-0 lg:p-0">
                  <ol className="space-y-3 text-sm lg:mt-4">
                    <li className="flex gap-3">
                      <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${lineProfile.aligned ? 'text-emerald-600' : 'text-amber-600'}`} />
                      <div><p className="font-medium text-slate-800">1. Environment</p><p className="text-xs text-slate-500">{lineProfile.dataProfileLabel} → {lineProfile.targetProfileLabel}</p></div>
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tokenCheck === 'passed' ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div><p className="font-medium text-slate-800">2. Credentials</p><p className="text-xs text-slate-500">กรอกหรือใช้ค่าที่บันทึกแล้ว แล้วทดสอบ Access Token</p></div>
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${!hasUnsavedWebhookConfig ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div><p className="font-medium text-slate-800">3. Save</p><p className="text-xs text-slate-500">บันทึก Secret และ Public App URL ก่อนทดสอบ Webhook</p></div>
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle2 aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${webhookCheck === 'passed' ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div><p className="font-medium text-slate-800">4. Internal Webhook</p><p className="text-xs text-slate-500">ทดสอบลายเซ็นกับ URL ที่บันทึกไว้ โดยไม่สร้างข้อมูลธุรกิจ</p></div>
                    </li>
                    <li className="flex gap-3">
                      <ExternalLink aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      <div><p className="font-medium text-slate-800">5. LINE Developers</p><p className="text-xs text-slate-500">วาง URL, กด Verify และเปิด Use webhook ด้วยตนเอง</p></div>
                    </li>
                    <li className="flex gap-3">
                      <Send aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      <div><p className="font-medium text-slate-800">6. Target / ส่งจริง</p><p className="text-xs text-slate-500">ให้ OA ได้รับ event จริงก่อนเลือกปลายทางและส่งข้อความทดสอบ</p></div>
                    </li>
                  </ol>
                    </div>
                  </details>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-semibold text-slate-800">ส่งข้อความทดสอบจริง</h4>
                    {activeTargets.length === 0 ? (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p>ยังไม่พบกลุ่มรับแจ้งเตือน: เชิญ OA เข้ากลุ่ม ส่งข้อความ 1 ครั้ง แล้วกดซิงค์กลุ่ม</p>
                        <button type="button" className="mt-2 text-sm font-medium text-blue-700 hover:underline" onClick={() => setActiveTab('targets')}>ไปที่กลุ่มแจ้งเตือน</button>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="line-test-target">ปลายทางที่ต้องการทดสอบ</label>
                        <Select
                          id="line-test-target"
                          value={selectedTestTargetId}
                          onChange={(event) => setSelectedTestTargetId(event.currentTarget.value)}
                          className="h-11 bg-[#FFF7CC] text-sm dark:bg-amber-200/15 lg:h-10"
                        >
                          <option value="">เลือกกลุ่มรับข้อความทดสอบ</option>
                          {activeTargets.map((target) => <option key={target.id} value={target.id}>{target.display_name}{target.is_default ? ' (Default)' : ''}</option>)}
                        </Select>
                        {activeTargets.length > 1 && !activeTargets.some((target) => target.is_default) ? <p className="text-xs text-amber-700">มีหลายปลายทางและยังไม่มี Default โปรดเลือกปลายทางก่อนส่ง</p> : null}
                        <button
                          type="button"
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 lg:h-10"
                          disabled={!canSendTestMessage}
                          onClick={() => {
                            if (!selectedTestTarget) return
                            runExternalAction(() => handleTestTarget(selectedTestTarget.target_id, selectedTestTarget.id))
                          }}
                        >
                          <Send aria-hidden="true" className="size-4" />
                          ส่งข้อความทดสอบจริง
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* Tab 3: Targets / Groups */}
        {activeTab === 'targets' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">กลุ่มรับแจ้งเตือน</h3>
                  <p className="mt-1 text-sm text-slate-500">กำหนดกลุ่มหรือผู้รับที่ต้องการให้ระบบส่งแจ้งเตือน</p>
                </div>
                <div className="flex gap-2.5">
                  {targetResize.hasCustomWidths && (
                    <button
                      className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none flex items-center gap-1 h-8"
                      onClick={targetResize.resetColumnWidths}
                    >
                      🔄 คืนค่าตาราง
                    </button>
                  )}
                  <button
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0284c7] hover:bg-[#0369a1] rounded-md transition focus:outline-none h-8 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
                    onClick={() => void handleSyncTargets()}
                    disabled={isSyncingTargets || !form.lineChannelAccessToken}
                    title={!form.lineChannelAccessToken ? 'กรุณาตั้งค่า LINE Channel Access Token ก่อน' : ''}
                  >
                    {isSyncingTargets ? 'กำลังซิงค์...' : '🔄 ซิงค์กลุ่มจาก LINE'}
                  </button>
                  <button
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none h-8"
                    onClick={() => {
                    openTargetForm({
                        target_type: 'group',
                        display_name: '',
                        target_id: '',
                        is_active: true,
                        is_default: false,
                        notify_wti: true,
                        notify_wto: true
                    })
                    }}
                  >
                    ➕ เพิ่มกลุ่มแชทด้วยตนเอง
                  </button>
                </div>
              </div>

              {targets.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-medium">ยังไม่มีกลุ่มรับแจ้งเตือน</p>
                  <p className="mt-1 text-slate-500">เชิญ LINE OA เข้ากลุ่ม แล้วพิมพ์ <code className="rounded bg-white px-1 py-0.5 font-mono text-xs text-slate-700">/register สาขา=[code]</code> หรือเพิ่มกลุ่มด้วยตนเอง</p>
                </div>
              ) : null}

              <div className="rounded-md border border-blue-200 bg-blue-50/60 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">📖 วิธีเพิ่มกลุ่มใหม่ (สำหรับมือใหม่)</p>
                <p className="mt-1.5 text-slate-600">LINE Messaging API ไม่มี endpoint ลิสต์ทุกกลุ่มที่บอทอยู่ — กลุ่มใหม่จะเข้าสู่ระบบได้<span className="font-medium text-slate-800">ทางเดียวคือผ่าน webhook event</span> กด &quot;ซิงค์กลุ่มจาก LINE&quot; จะดึงกลุ่มใหม่มาไม่ได้</p>
                <ol className="mt-2.5 space-y-1.5 text-slate-600">
                  <li className="flex gap-2"><span className="font-bold text-slate-800">1.</span><span>เชิญ LINE OA (บอท) เข้ากลุ่ม LINE ปลายทาง</span></li>
                  <li className="flex gap-2"><span className="font-bold text-slate-800">2.</span><span>ในกลุ่มนั้น พิมพ์ข้อความใด ๆ 1 ครั้ง (แนะนำ <code className="rounded bg-white px-1 py-0.5 font-mono text-xs text-slate-700">/register สาขา=[รหัสสาขา]</code> เพื่อผูกสาขาให้เลย)</span></li>
                  <li className="flex gap-2"><span className="font-bold text-slate-800">3.</span><span>กลับมาหน้านี้ → รีเฟรชหน้า (หรือรอสักครู่) → กลุ่มใหม่จะ<span className="font-medium text-slate-800">ขึ้นในตารางเองอัตโนมัติ</span></span></li>
                  <li className="flex gap-2"><span className="font-bold text-slate-800">4.</span><span>เปิดใช้งานกลุ่ม + เลือกสาขา + ติ๊ก WTI/WTO แล้วไปสร้างกฎที่แท็บ &quot;การกำหนดเส้นทาง&quot;</span></li>
                </ol>
                <p className="mt-2.5 text-xs text-slate-500">ปุ่ม &quot;ซิงค์กลุ่มจาก LINE&quot; ใช้<span className="font-medium"> refresh ชื่อ/รูปของกลุ่มที่มีอยู่แล้ว</span> ไม่ใช่ดึงกลุ่มใหม่ — ถ้าเชิญบอทเข้ากลุ่มใหม่แล้วไม่ขึ้น ให้กลับไปทำขั้นตอนที่ 2 อีกครั้ง แล้วรอรีเฟรช</p>
              </div>


              {/* Lined table view with resize headers */}
              <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="ns-table min-w-full divide-y divide-slate-100 text-sm" style={{ minWidth: targetResize.tableMinWidth, tableLayout: 'fixed' }}>
                    <colgroup>
                      {targetCols.map((col) => (
                        <col key={col.key} style={targetResize.getColumnStyle(col.key)} />
                      ))}
                    </colgroup>
                    <thead className="bg-slate-100 text-xs font-semibold text-slate-600 select-none">
                      <tr>
                        <ResizableTableHead
                          label="ข้อมูลผู้รับ / Target Info"
                          activeSortKey={targetSortKey ?? undefined}
                          direction={targetSortDirection}
                          sortKey="targetInfo"
                          onSort={handleTargetSort}
                          resizeProps={targetResize.getResizeHandleProps('targetInfo', 'ข้อมูลผู้รับ / Target Info')}
                        />
                        <ResizableTableHead
                          label="สาขาเชื่อมโยง"
                          activeSortKey={targetSortKey ?? undefined}
                          direction={targetSortDirection}
                          sortKey="branch"
                          onSort={handleTargetSort}
                          resizeProps={targetResize.getResizeHandleProps('branch', 'สาขาเชื่อมโยง')}
                        />
                        <ResizableTableHead
                          label="แจ้งเตือน WTI"
                          activeSortKey={targetSortKey ?? undefined}
                          direction={targetSortDirection}
                          sortKey="notifyWti"
                          onSort={handleTargetSort}
                          resizeProps={targetResize.getResizeHandleProps('notifyWti', 'แจ้งเตือน WTI')}
                        />
                        <ResizableTableHead
                          label="แจ้งเตือน WTO"
                          activeSortKey={targetSortKey ?? undefined}
                          direction={targetSortDirection}
                          sortKey="notifyWto"
                          onSort={handleTargetSort}
                          resizeProps={targetResize.getResizeHandleProps('notifyWto', 'แจ้งเตือน WTO')}
                        />
                        <ResizableTableHead
                          align="center"
                          label="สถานะ"
                          activeSortKey={targetSortKey ?? undefined}
                          direction={targetSortDirection}
                          sortKey="status"
                          onSort={handleTargetSort}
                          resizeProps={targetResize.getResizeHandleProps('status', 'สถานะ')}
                        />
                        <ResizableTableHead align="center" label="จัดการ" resizeProps={targetResize.getResizeHandleProps('actions', 'จัดการ')} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedTargets.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              <TargetAvatar target={t} />
                              <div className="truncate">
                                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                  <span className="truncate">{t.display_name}</span>
                                  {t.is_default && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-bold uppercase select-none tracking-wider">Default</span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400 font-mono mt-0.5 select-all truncate">{t.target_id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {t.branch_code ? `สาขา ${t.branch_code}` : 'ทุกสาขา'}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${t.notify_wti ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                              {t.notify_wti ? 'รับข่าวสาร' : 'ข้าม'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${t.notify_wto ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                              {t.notify_wto ? 'รับข่าวสาร' : 'ข้าม'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center">
                            {(() => {
                              const isLeft = !t.is_active && t.last_event_type === 'not_found'
                              const isDisabled = !t.is_active && !isLeft
                              const cls = isLeft
                                ? 'bg-slate-100 text-slate-500'
                                : isDisabled
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              const label = isLeft ? 'บอทออกจากกลุ่ม' : isDisabled ? 'ปิดใช้งาน' : 'อยู่ในกลุ่ม'
                              return (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>
                                  {label}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center">
                            <TableActionButton menu={(
                              <>
                                <TableActionMenuItem onSelect={() => void handleTestTarget(t.target_id, t.id)}>ทดสอบส่ง</TableActionMenuItem>
                                <TableActionMenuItem disabled={t.is_default} onSelect={() => void handleSetDefaultTarget(t.id)}>ตั้งดีฟอลต์</TableActionMenuItem>
                                <TableActionMenuItem onSelect={() => openTargetForm(t)}>แก้ไข</TableActionMenuItem>
                                <TableActionMenuItem onSelect={() => void handleDeleteTarget(t.id)}>ลบ</TableActionMenuItem>
                              </>
                            )} />
                          </td>
                        </tr>
                      ))}
                      {targets.length === 0 && (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-400 font-medium" colSpan={6}>ไม่พบช่องทางการรับแจ้งเตือนที่ลงทะเบียนไว้</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View for Targets */}
              <div className="block lg:hidden space-y-3">
                {targets.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm font-bold">
                    ไม่พบช่องทางการรับแจ้งเตือนที่ลงทะเบียนไว้
                  </div>
                ) : (
                  sortedTargets.map((t) => (
                    <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                      <div className="flex items-center gap-3">
                        <TargetAvatar size="md" target={t} />
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {t.display_name}
                            {t.is_default && (
                              <span className="px-1.5 py-0.5 text-xs bg-slate-900 text-white rounded font-bold uppercase tracking-wider">Default</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-[200px]">{t.target_id}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-slate-100 py-2.5">
                        <div>
                          <span className="text-slate-400">ประเภท:</span> <span className="font-bold text-slate-800">{t.target_type.toUpperCase()}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">สาขา:</span> <span className="font-bold text-slate-800">{t.branch_code || 'ทุกสาขา'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">ส่ง WTI:</span> <span className="font-bold text-slate-800">{t.notify_wti ? 'เปิด' : 'ปิด'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">ส่ง WTO:</span> <span className="font-bold text-slate-800">{t.notify_wto ? 'เปิด' : 'ปิด'}</span>
                        </div>
                      </div>
                      <div className="space-y-2 border-t border-slate-100 pt-2">
                        {(() => {
                          const isLeft = !t.is_active && t.last_event_type === 'not_found'
                          const isDisabled = !t.is_active && !isLeft
                          const cls = isLeft
                            ? 'bg-slate-100 text-slate-500'
                            : isDisabled
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-emerald-50 text-emerald-700'
                          const label = isLeft ? 'บอทออกจากกลุ่ม' : isDisabled ? 'ปิดใช้งาน' : 'อยู่ในกลุ่ม'
                          return (
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
                              {label}
                            </span>
                          )
                        })()}
                        <TableActionButton mobileLabel menu={(
                          <>
                            <TableActionMenuItem onSelect={() => void handleTestTarget(t.target_id, t.id)}>ทดสอบ</TableActionMenuItem>
                            <TableActionMenuItem disabled={t.is_default} onSelect={() => void handleSetDefaultTarget(t.id)}>ตั้งดีฟอลต์</TableActionMenuItem>
                            <TableActionMenuItem onSelect={() => openTargetForm(t)}>แก้ไข</TableActionMenuItem>
                            <TableActionMenuItem onSelect={() => void handleDeleteTarget(t.id)}>ลบ</TableActionMenuItem>
                          </>
                        )} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Routing Rules */}
        {activeTab === 'rules' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">กฎการส่งแจ้งเตือน</h3>
                  <p className="mt-1 text-sm text-slate-500">กำหนดเงื่อนไขเพื่อส่งเอกสารไปยังกลุ่มที่ต้องการ</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition focus:outline-none h-8"
                    onClick={openManualSendModal}
                  >
                    📤 ส่งแจ้งเตือนด้วยตนเอง
                  </button>
                  <button
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none h-8"
                    onClick={() => {
                      setRuleFieldErrors({})
                      openRuleForm({
                        name: '',
                        priority: 100,
                        is_active: true,
                        target_id: '',
                        template_id: null,
                        stop_after_match: true,
                        conditions: { documentTypes: [] }
                      })
                    }}
                  >
                    ➕ เพิ่มกฎใหม่
                  </button>
                </div>
              </div>

              {/* Lined table view with resize headers (Desktop) */}
              <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="ns-table min-w-full divide-y divide-slate-100 text-sm" style={{ minWidth: ruleResize.tableMinWidth, tableLayout: 'fixed' }}>
                    <colgroup>
                      {ruleCols.map((col) => (
                        <col key={col.key} style={ruleResize.getColumnStyle(col.key)} />
                      ))}
                    </colgroup>
                    <thead className="bg-slate-100 text-xs font-semibold text-slate-600 select-none">
                      <tr>
                        <ResizableTableHead
                          label="ลำดับกฎ"
                          activeSortKey={ruleSortKey ?? undefined}
                          direction={ruleSortDirection}
                          sortKey="priority"
                          onSort={handleRuleSort}
                          resizeProps={ruleResize.getResizeHandleProps('priority', 'ลำดับกฎ')}
                        />
                        <ResizableTableHead
                          label="ชื่อกฎ / รายละเอียด"
                          activeSortKey={ruleSortKey ?? undefined}
                          direction={ruleSortDirection}
                          sortKey="name"
                          onSort={handleRuleSort}
                          resizeProps={ruleResize.getResizeHandleProps('name', 'ชื่อกฎ / รายละเอียด')}
                        />
                        <ResizableTableHead
                          label="ผู้รับปลายทาง"
                          activeSortKey={ruleSortKey ?? undefined}
                          direction={ruleSortDirection}
                          sortKey="target"
                          onSort={handleRuleSort}
                          resizeProps={ruleResize.getResizeHandleProps('target', 'ผู้รับปลายทาง')}
                        />
                        <ResizableTableHead
                          label="หยุดเช็คเมื่อตรง"
                          activeSortKey={ruleSortKey ?? undefined}
                          direction={ruleSortDirection}
                          sortKey="stopAfter"
                          onSort={handleRuleSort}
                          resizeProps={ruleResize.getResizeHandleProps('stopAfter', 'หยุดเช็คเมื่อตรง')}
                        />
                        <ResizableTableHead
                          align="center"
                          label="สถานะ"
                          activeSortKey={ruleSortKey ?? undefined}
                          direction={ruleSortDirection}
                          sortKey="isActive"
                          onSort={handleRuleSort}
                          resizeProps={ruleResize.getResizeHandleProps('isActive', 'สถานะ')}
                        />
                        <ResizableTableHead align="center" label="จัดการ" resizeProps={ruleResize.getResizeHandleProps('actions', 'จัดการ')} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedRules.map((r) => {
                        const boundTarget = targets.find(t => t.target_id === r.target_id)
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                            <td className="px-3 py-3 font-semibold text-slate-600">
                              # {r.priority}
                            </td>
                            <td className="px-3 py-3">
                              <div>
                                <span className="font-bold text-slate-800">{r.name}</span>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  {r.conditions?.documentTypes?.includes('DAILY') && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                      ⏰ สรุปวัน {r.conditions?.scheduleTime || form.dailyReportScheduleTime || '18:00'} น.
                                    </span>
                                  )}
                                  {r.conditions?.documentTypes?.includes('MONTHLY') && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                                      🗓️ สรุปเดือน ทุกวันที่ 1 เวลา {r.conditions?.monthlyScheduleTime || r.conditions?.scheduleTime || form.monthlyReportScheduleTime || '08:00'} น.
                                    </span>
                                  )}
                                  {r.description && <span className="text-xs text-slate-400">{r.description}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <div className="font-semibold text-slate-800">{boundTarget?.display_name || 'ไม่พบลายเชื่อมโยง'}</div>
                              <div className="text-xs font-mono text-slate-400 mt-0.5 truncate">{r.target_id}</div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`px-1.5 py-0.5 rounded font-semibold text-xs ${r.stop_after_match ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {r.stop_after_match ? 'หยุดตรวจต่อ' : 'ตรวจต่อ'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                {r.is_active ? 'เปิดใช้งาน' : 'ปิด'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              <TableActionButton menu={(
                                <>
                                  <TableActionMenuItem onSelect={() => { setRuleFieldErrors({}); openRuleForm(r) }}>แก้ไข</TableActionMenuItem>
                                  <TableActionMenuItem onSelect={() => void handleDeleteRule(r.id)}>ลบ</TableActionMenuItem>
                                </>
                              )} />
                            </td>
                          </tr>
                        )
                      })}
                      {rules.length === 0 && (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-400 font-medium font-bold" colSpan={6}>ยังไม่มีกฎกระจายข้อมูลแจ้งเตือน (บิลทั้งหมดจะผ่านไปสู่เป้าหมายดีฟอลต์)</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View for Rules */}
              <div className="block lg:hidden space-y-3">
                {rules.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm font-bold">
                    ยังไม่มีกฎกระจายข้อมูลแจ้งเตือน (บิลทั้งหมดจะผ่านไปสู่เป้าหมายดีฟอลต์)
                  </div>
                ) : (
                  sortedRules.map((r) => {
                    const boundTarget = targets.find(t => t.target_id === r.target_id)
                    return (
                      <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono font-bold">Priority # {r.priority}</span>
                            <h4 className="font-bold text-slate-900 mt-1.5">{r.name}</h4>
                            {r.description && <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>}
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {r.is_active ? 'เปิดใช้งาน' : 'ปิด'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-slate-100 py-2.5">
                          <div className="col-span-2">
                            <span className="text-slate-400">ปลายทาง:</span> <span className="font-bold text-slate-800">{boundTarget?.display_name || 'ไม่พบลายเชื่อมโยง'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400">เป้าหมาย ID:</span> <span className="font-mono text-slate-800 break-all select-all block mt-0.5">{r.target_id}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400">เมื่อตรงเงื่อนไข:</span>{' '}
                            <span className={`px-1.5 py-0.5 rounded font-bold text-xs ${r.stop_after_match ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                              {r.stop_after_match ? 'หยุดตรวจต่อ' : 'ตรวจต่อ'}
                            </span>
                          </div>
                        </div>
                        <div className="pt-1.5">
                          <TableActionButton mobileLabel menu={(
                            <>
                              <TableActionMenuItem onSelect={() => {
                                setRuleFieldErrors({})
                                openRuleForm(r)
                              }}>แก้ไข</TableActionMenuItem>
                              <TableActionMenuItem onSelect={() => void handleDeleteRule(r.id)}>ลบ</TableActionMenuItem>
                            </>
                          )} />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Message Templates
            ซ่อนชั่วคราว (2026-06-26): template config ในหน้านี้ยังไม่ถูกเชื่อมกับ flow ส่งแจ้งเตือนจริง
            (buildFlexMessageFromTemplate ถูกเรียกแค่ใน Preview) ทำให้ผู้ใช้ตั้งค่าแล้วไม่มีผลตอนส่งจริง
            เมื่อเชื่อม backend ส่งแจ้งเตือนให้ดึง default template จาก line_message_templates แล้ว ให้เปลี่ยน `false &&` กลับเป็นเงื่อนไขเดิม
        */}
        {false && activeTab === 'templates' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">📝 ปรับแต่งรูปแบบ Flex Message (Message Templates)</h3>
                </div>
                <button
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none h-8"
                  onClick={() => {
                    openTemplateForm({
                      name: '',
                      template_type: 'weight_ticket',
                      is_default_wti: false,
                      is_default_wto: false,
                      is_active: true,
                      config: createDefaultTemplateConfig()
                    })
                  }}
                >
                  ➕ เพิ่มเทมเพลตใหม่
                </button>
              </div>

              {/* Grid Templates */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{t.name}</h4>
                          <span className="text-xs text-slate-400 font-mono mt-0.5">ID: {t.id}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {t.is_active ? 'ทำงานอยู่' : 'ปิด'}
                        </span>
                      </div>

                      <div className="flex gap-1.5 mt-3">
                        {t.is_default_wti && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold">ดีฟอลต์ WTI</span>
                        )}
                        {t.is_default_wto && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-semibold">ดีฟอลต์ WTO</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 text-xs">
                      <button
                        type="button"
                        className="px-2.5 py-1 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-md transition focus:outline-none h-7 flex items-center"
                        onClick={() => {
                          openTemplateForm(t)
                          setTemplatePreviewJson(null)
                        }}
                      >
                        📝 แก้ไข / พรีวิว
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1 text-red-600 hover:bg-slate-50 border border-slate-200 rounded-md transition focus:outline-none h-7 flex items-center"
                        onClick={() => void handleDeleteTemplate(t.id)}
                      >
                        ❌ ลบ
                      </button>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="md:col-span-3 text-center py-12 text-slate-400 font-medium">ยังไม่มีการเพิ่มเทมเพลตสำหรับส่งข้อความ การแจ้งเตือนจะใช้เลย์เอาต์การ์ดดีฟอลต์ของระบบ</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Outbox / Retry Queue */}
        {activeTab === 'outbox' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">คิวส่งข้อความ</h3>
                  <p className="mt-1 text-sm text-slate-500">ติดตามรายการที่รอส่ง ส่งแล้ว หรือส่งไม่สำเร็จ</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void runOutboxWorker()}
                    disabled={isProcessingJobs}
                  >
                    {isProcessingJobs ? 'กำลังประมวลผล...' : 'ประมวลผลคิว'}
                  </button>
                  {/* Status filter buttons */}
                  {['', 'pending', 'sent', 'failed', 'processing'].map((status) => (
                    <button
                      key={status}
                      className={`rounded-md border px-3 py-1 text-xs font-medium transition focus:outline-none ${jobStatusFilter === status
                          ? 'border-slate-700 bg-slate-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      type="button"
                      onClick={() => {
                        setJobStatusFilter(status)
                        setJobPage(1)
                      }}
                    >
                      {status === '' ? 'ทั้งหมด' : status.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search filter bar */}
              <div className="flex gap-2 text-xs">
                <input
                  type="text"
                  className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-500 h-9"
                  placeholder="ค้นหาเลขบิล, กลุ่มแชท..."
                  value={jobSearch}
                  onChange={(e) => setSearchVal(e.target.value)}
                />
                {jobResize.hasCustomWidths && (
                  <button
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none flex items-center gap-1 h-9"
                    onClick={jobResize.resetColumnWidths}
                  >
                    🔄 คืนค่าตาราง
                  </button>
                )}
              </div>

              {/* Lined table view with resize headers (Desktop) */}
              <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="ns-table min-w-full divide-y divide-slate-100 text-sm" style={{ minWidth: jobResize.tableMinWidth, tableLayout: 'fixed' }}>
                    <colgroup>
                      {jobCols.map((col) => (
                        <col key={col.key} style={jobResize.getColumnStyle(col.key)} />
                      ))}
                    </colgroup>
                    <thead className="bg-slate-100 text-xs font-semibold text-slate-600 select-none">
                      <tr>
                        <ResizableTableHead
                          align="center"
                          label="เวลาสร้างคิว"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="createdAt"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('createdAt', 'เวลาสร้างคิว')}
                        />
                        <ResizableTableHead
                          align="center"
                          label="เลขที่เอกสาร"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="document"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('document', 'เลขที่เอกสาร')}
                        />
                        <ResizableTableHead
                          label="กลุ่มไลน์ผู้รับ"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="target"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('target', 'กลุ่มไลน์ผู้รับ')}
                        />
                        <ResizableTableHead
                          align="center"
                          label="สถานะคิว"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="status"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('status', 'สถานะคิว')}
                        />
                        <ResizableTableHead
                          align="right"
                          label="จำนวนพยายาม"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="attempts"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('attempts', 'จำนวนพยายาม')}
                        />
                        <ResizableTableHead align="center" label="จัดการ" resizeProps={jobResize.getResizeHandleProps('actions', 'จัดการ')} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedJobs.map((job) => {
                        const dateStr = formatThaiDateCE(job.created_at)
                        const boundTarget = targets.find(t => t.target_id === job.target_id)
                        return (
                          <tr key={job.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                            <td className="whitespace-nowrap px-3 py-3 text-center text-slate-500">
                              {dateStr}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center font-mono font-semibold text-slate-900">
                              <div className="flex flex-col">
                                <span>{job.document_no}</span>
                                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">{job.document_type}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <div className="font-semibold text-slate-800">{boundTarget?.display_name || 'ไม่ระบุกลุ่ม'}</div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">{job.target_id}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded font-semibold text-xs ${job.status === 'sent' ? 'bg-emerald-50 text-emerald-700' :
                                  job.status === 'failed' ? 'bg-rose-50 text-rose-700' :
                                    job.status === 'processing' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                {job.status.toUpperCase()}
                              </span>
                              {job.last_error_message && (
                                <p className="text-xs text-rose-600 block mt-1 truncate max-w-[150px]" title={job.last_error_message}>
                                  {job.last_error_message}
                                </p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-slate-600">
                              {job.attempt_count} / {job.max_attempts}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              <TableActionButton menu={(
                                <>
                                  <TableActionMenuItem onSelect={() => setSelectedJob(job)}>ดูประวัติยิง</TableActionMenuItem>
                                  <TableActionMenuItem disabled={job.status === 'processing'} onSelect={() => void handleRetryJob(job.id, job.document_no)}>ยิงใหม่</TableActionMenuItem>
                                  {job.status === 'pending' ? <TableActionMenuItem onSelect={() => void handleCancelJob(job.id)}>ยกเลิก</TableActionMenuItem> : null}
                                </>
                              )} />
                            </td>
                          </tr>
                        )
                      })}
                      {jobs.length === 0 && (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-400 font-medium font-bold" colSpan={6}>ไม่พบรายการคิวรอส่งแจ้งเตือนในระบบ</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View for Outbox */}
              <div className="block lg:hidden space-y-3">
                {jobs.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm font-bold">
                    ไม่พบรายการคิวรอส่งแจ้งเตือนในระบบ
                  </div>
                ) : (
                  sortedJobs.map((job) => {
                    const dateStr = formatThaiDateCE(job.created_at)
                    const boundTarget = targets.find(t => t.target_id === job.target_id)
                    return (
                      <div key={job.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="block text-center text-xs text-slate-400 whitespace-nowrap">{dateStr}</span>
                            <h4 className="mt-1 text-center font-mono font-bold text-slate-900 whitespace-nowrap">{job.document_no}</h4>
                            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">{job.document_type}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded font-semibold text-xs ${job.status === 'sent' ? 'bg-emerald-50 text-emerald-700' :
                              job.status === 'failed' ? 'bg-rose-50 text-rose-700' :
                                job.status === 'processing' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                            {job.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-slate-100 py-2.5">
                          <div className="col-span-2">
                            <span className="text-slate-400">ผู้รับ:</span> <span className="font-bold text-slate-800">{boundTarget?.display_name || 'ไม่ระบุกลุ่ม'}</span>
                            <span className="text-xs text-slate-400 font-mono block select-all mt-0.5">{job.target_id}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">จำนวนพยายาม:</span> <span className="font-bold text-slate-800">{job.attempt_count} / {job.max_attempts}</span>
                          </div>
                        </div>
                        {job.last_error_message && (
                          <p className="text-xs text-rose-600 font-semibold bg-rose-50/50 p-2 rounded border border-rose-100/50 break-words select-all">
                            ⚠️ {job.last_error_message}
                          </p>
                        )}
                        <div className="pt-1.5">
                          <TableActionButton mobileLabel menu={(
                            <>
                              <TableActionMenuItem onSelect={() => setSelectedJob(job)}>ดูประวัติยิง</TableActionMenuItem>
                              <TableActionMenuItem disabled={job.status === 'processing'} onSelect={() => void handleRetryJob(job.id, job.document_no)}>ยิงใหม่</TableActionMenuItem>
                              {job.status === 'pending' ? <TableActionMenuItem onSelect={() => void handleCancelJob(job.id)}>ยกเลิก</TableActionMenuItem> : null}
                            </>
                          )} />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Pagination controls */}
              {jobTotalPages > 1 && (
                <div className="flex items-center justify-between pt-4 text-xs select-none">
                  <span className="text-slate-500">หน้า {jobPage} จากทั้งหมด {jobTotalPages} หน้า</span>
                  <div className="flex gap-1">
                    <button
                      className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700 disabled:opacity-50"
                      disabled={jobPage === 1}
                      onClick={() => setJobPage(jobPage - 1)}
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700 disabled:opacity-50"
                      disabled={jobPage === jobTotalPages}
                      onClick={() => setJobPage(jobPage + 1)}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 7: Analytics */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="อัตราส่งสำเร็จ 30 วัน" tone="emerald" value={`${analytics?.last30Days?.successRate ?? 0}%`} />
              <KpiCard label="จำนวนที่ส่ง 30 วัน" tone="blue" value={`${analytics?.last30Days?.total ?? 0} รายการ`} />
              <KpiCard label="เวลาประมวลผลเฉลี่ย" tone="slate" value={analytics?.last30Days?.avgDurationMs ? `${(analytics.last30Days.avgDurationMs / 1000).toFixed(2)} วินาที` : '-'} />
              <KpiCard label="ส่งไม่สำเร็จ 30 วัน" tone="red" value={`${analytics?.last30Days?.failed ?? 0} รายการ`} />
            </div>

            {/* Top error messages and targets reports */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Targets */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2 text-sm flex items-center gap-1.5">
                  <span>👥</span> กลุ่ม LINE ที่ได้รับแจ้งเตือนมากที่สุด
                </h4>
                <div className="space-y-3">
                  {analytics?.topTargets?.map((t, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs text-slate-700 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="font-bold text-slate-800 block">{t.displayName}</span>
                        <span className="text-xs font-mono text-slate-400 mt-0.5 truncate block max-w-[200px] select-all">{t.targetId}</span>
                      </div>
                      <span className="font-bold text-slate-900 font-mono bg-slate-100 px-2 py-1 rounded">{t.count} ครั้ง</span>
                    </div>
                  ))}
                  {(!analytics?.topTargets || analytics.topTargets.length === 0) && (
                    <p className="text-xs text-slate-400 text-center py-6">ไม่พบสถิติการส่งเป้าหมาย</p>
                  )}
                </div>
              </div>

              {/* Top Errors */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2 text-sm flex items-center gap-1.5">
                  <span>⚠️</span> สาเหตุการส่งไม่สำเร็จที่พบบ่อย
                </h4>
                <div className="space-y-3">
                  {analytics?.topErrors?.map((err, idx) => (
                    <div key={idx} className="flex justify-between items-start text-xs text-slate-700 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                      <span className="font-medium text-rose-800 break-words max-w-[320px]">{err.message}</span>
                      <span className="font-bold text-rose-900 font-mono bg-rose-50 px-2 py-1 rounded flex-shrink-0 ml-2">{err.count} ครั้ง</span>
                    </div>
                  ))}
                  {(!analytics?.topErrors || analytics.topErrors.length === 0) && (
                    <p className="text-xs text-slate-400 text-center py-6">สะอาดหมดจด! ไม่มีสถิติข้อมูลแจ้งเตือนล้มเหลว</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ================= MODAL DIALOGS ================= */}

      {/* Target Add/Edit Modal */}
      {isTargetModalOpen && editingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-fade-in" onMouseDown={(event) => { if (event.target === event.currentTarget) requestCloseTargetForm() }}>
          <div className="relative w-full max-w-md overflow-hidden rounded-md bg-slate-900 shadow-2xl animate-zoom-in">
            {/* Modal Header */}
            <div data-ns-dialog-header className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <h3 className="text-base font-bold">
                {editingTarget.id ? '📝 แก้ไขรายละเอียดผู้รับ' : '👥 เพิ่มเป้าหมายรับแจ้งเตือนใหม่'}
              </h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white transition hover:border-rose-700 hover:bg-rose-700 focus:outline-none"
                  onClick={requestCloseTargetForm}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  form="line-target-form"
                  className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none"
                >
                  บันทึกข้อมูล
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form id="line-target-form" onSubmit={handleSaveTarget} className="space-y-4 bg-slate-50 p-5 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700" htmlFor="line-target-display-name">ชื่อเป้าหมาย / Display Name <span className="text-red-600">*</span></label>
                <input
                  id="line-target-display-name"
                  type="text"
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                  placeholder="เช่น กลุ่มแชทหน้าเตาหลอม, บัญชีรับซื้อ"
                  value={editingTarget.display_name || ''}
                  onChange={(e) => setEditingTarget({ ...editingTarget, display_name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700" htmlFor="line-target-type">ประเภทช่องทางแชท</label>
                <Select
                  id="line-target-type"
                  className="h-10 w-full px-3 py-2 text-sm text-slate-900"
                  value={editingTarget.target_type}
                  onChange={(e) => setEditingTarget({ ...editingTarget, target_type: e.target.value as any })}
                >
                  <option value="group">Group (กลุ่มไลน์)</option>
                  <option value="room">Room (ห้องไลน์แชท)</option>
                  <option value="user">User ID (รายบุคคล)</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700" htmlFor="line-target-id">LINE ID ของเป้าหมาย <span className="text-red-600">*</span></label>
                <input
                  id="line-target-id"
                  type="text"
                  required
                  disabled={!!editingTarget.id}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10 disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="เช่น C12345abcd..."
                  value={editingTarget.target_id || ''}
                  onChange={(e) => setEditingTarget({ ...editingTarget, target_id: e.target.value })}
                />
                {targetWarning && <p className="text-xs text-amber-600 mt-1">{targetWarning}</p>}
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">ผูกเชื่อมโยงรหัสสาขา (ระบุสาขา)</label>
                <Select
                  className="h-10 w-full px-3 py-2 text-sm text-slate-900"
                  value={editingTarget.branch_code || ''}
                  onChange={(e) => setEditingTarget({ ...editingTarget, branch_code: e.target.value || null })}
                >
                  <option value="">ทุกสาขา</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.code || ''}>{b.name} ({b.code || '-'})</option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-wrap gap-4 pt-2 select-none font-semibold text-slate-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingTarget.notify_wti}
                    onChange={(e) => setEditingTarget({ ...editingTarget, notify_wti: e.target.checked })}
                  />
                  <span>แจ้งเตือน WTI</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingTarget.notify_wto}
                    onChange={(e) => setEditingTarget({ ...editingTarget, notify_wto: e.target.checked })}
                  />
                  <span>แจ้งเตือน WTO</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingTarget.is_active}
                    onChange={(e) => setEditingTarget({ ...editingTarget, is_active: e.target.checked })}
                  />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Rule Add/Edit Modal */}
      {isRuleModalOpen && editingRule && (
        <Dialog
          open={isRuleModalOpen}
          onOpenChange={(open) => {
            if (!open) requestCloseRuleForm()
          }}
        >
          <DialogContent
            className="max-h-[90vh] max-w-2xl [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-blue-500 [&_button:focus-visible]:ring-offset-2 [&_input:focus-visible]:ring-2 [&_input:focus-visible]:ring-blue-500 [&_input:focus-visible]:ring-offset-2 [&_select:focus-visible]:ring-2 [&_select:focus-visible]:ring-blue-500 [&_select:focus-visible]:ring-offset-2 [&_textarea:focus-visible]:ring-2 [&_textarea:focus-visible]:ring-blue-500 [&_textarea:focus-visible]:ring-offset-2"
            fallbackTitle={editingRule.id ? 'แก้ไขการส่งแจ้งเตือน LINE' : 'เพิ่มการส่งแจ้งเตือน LINE'}
            hideClose
            mobileAppShell={false}
          >
            <form id="line-rule-form" className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSaveRule}>
              <DialogHeader className="shrink-0 px-5 py-4">
                <h3 className="text-base font-bold text-white">
                  {editingRule.id ? 'แก้ไขการส่งแจ้งเตือน LINE' : 'เพิ่มการส่งแจ้งเตือน LINE'}
                </h3>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 text-sm">
              <section id="line-rule-document-types" tabIndex={-1} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 outline-none">
                <div>
                  <h4 id="line-rule-document-types-label" className="font-bold text-slate-800">1. เลือกเอกสารที่ต้องการส่ง <span className="text-rose-600">*</span></h4>
                  <p className="mt-1 text-xs text-slate-500">เลือก WTI/WTO คู่กันได้ หรือเลือก PB/SB/PMT/RCP คู่กันได้ หากส่งเข้ากลุ่มเดียวกัน</p>
                </div>
                <div
                  aria-labelledby="line-rule-document-types-label"
                  className={`grid grid-cols-2 gap-2 rounded-md p-2 sm:grid-cols-3 ${ruleFieldErrors.documentTypes ? 'bg-rose-50 ring-1 ring-rose-400' : ''}`}
                  data-field-invalid={ruleFieldErrors.documentTypes ? 'true' : undefined}
                  data-manual-required="true"
                  data-required-group="true"
                  role="group"
                >
                  {lineDocumentTypeOptions.map((option) => {
                    const selected = editingRule.conditions?.documentTypes?.includes(option.type) ?? false
                    return (
                      <button
                        key={option.type}
                        aria-pressed={selected}
                        className={`min-h-12 rounded-md border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                          }`}
                        type="button"
                        onClick={() => {
                          const current = new Set<LineDocumentType>(editingRule.conditions?.documentTypes ?? [])
                          if (selected) {
                            current.delete(option.type)
                          } else {
                            if (option.type === 'DAILY' || option.type === 'MONTHLY') {
                              current.delete('PB')
                              current.delete('SB')
                              current.delete('PMT')
                              current.delete('RCP')
                              current.delete('WTI')
                              current.delete('WTO')
                            } else if (option.type === 'WTI' || option.type === 'WTO') {
                              current.delete('PB')
                              current.delete('SB')
                              current.delete('PMT')
                              current.delete('RCP')
                              current.delete('DAILY')
                              current.delete('MONTHLY')
                            } else {
                              current.delete('WTI')
                              current.delete('WTO')
                              current.delete('DAILY')
                              current.delete('MONTHLY')
                            }
                            current.add(option.type)
                          }
                          const documentTypes = lineDocumentTypeOptions.map((item) => item.type).filter((type) => current.has(type))
                          const conditions = { ...editingRule.conditions, documentTypes }
                          if (!documentTypes.some((type) => type === 'WTI' || type === 'WTO')) {
                            delete conditions.minNetWeight
                            delete conditions.maxNetWeight
                            delete conditions.minImpurityWeight
                            delete conditions.requiresImages
                            delete conditions.requiresScalePhoto
                          }
                          setEditingRule({ ...editingRule, conditions })
                          setRuleFieldErrors((currentErrors) => ({ ...currentErrors, documentTypes: undefined }))
                        }}
                      >
                        <span className="block font-bold">{option.label}</span>
                        <span className="text-xs opacity-70">{option.type}</span>
                      </button>
                    )
                  })}
                </div>
                {ruleFieldErrors.documentTypes ? <p className="text-xs font-medium text-rose-600">{ruleFieldErrors.documentTypes}</p> : null}
              </section>

              {/* Daily Report Scheduled Time Configuration inside Modal */}
              {editingRule.conditions?.documentTypes?.includes('DAILY') && (
                <section className="space-y-3 rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-white p-4 shadow-2xs animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-md bg-emerald-600 text-white">
                        <Clock3 className="size-4" />
                      </div>
                      <h4 className="font-bold text-slate-900">⏰ ตั้งเวลาส่งรายงานอัตโนมัติประจำวัน</h4>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      Auto Daily Cron
                    </span>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      เลือกเวลาที่ต้องการส่งสรุปยอดเข้ากลุ่มนี้ (เวลาไทย GMT+7):
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        className="h-10 w-32 rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-1.5 font-mono text-sm font-bold text-slate-900 focus:border-emerald-500 focus:outline-none dark:bg-amber-200/15"
                        value={editingRule.conditions?.scheduleTime || form.dailyReportScheduleTime || '18:00'}
                        onChange={(e) => {
                          const val = e.target.value
                          setForm((prev) => ({ ...prev, dailyReportScheduleTime: val }))
                          setEditingRule((prev) => prev ? ({
                            ...prev,
                            conditions: { ...prev.conditions, scheduleTime: val },
                          }) : null)
                        }}
                      />
                      <div className="flex flex-wrap gap-1">
                        {['17:00', '17:30', '18:00', '18:30', '19:00', '20:00'].map((preset) => {
                          const currentVal = editingRule.conditions?.scheduleTime || form.dailyReportScheduleTime || '18:00'
                          return (
                            <button
                              key={preset}
                              type="button"
                              className={`rounded border px-2.5 py-1 text-xs font-mono transition ${
                                currentVal === preset
                                  ? 'border-emerald-600 bg-emerald-600 text-white font-bold shadow-xs'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, dailyReportScheduleTime: preset }))
                                setEditingRule((prev) => prev ? ({
                                  ...prev,
                                  conditions: { ...prev.conditions, scheduleTime: preset },
                                }) : null)
                              }}
                            >
                              {preset}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      ระบบจะรวบรวมยอดชั่งและผลผลิตของทุกโกดัง (WH-01 ถึง WH-05) ส่งเป็นการ์ด Carousel เข้ากลุ่มที่เลือกตามเวลานี้ทุกวัน
                    </p>
                  </div>
                </section>
              )}

              {/* Monthly Report Scheduled Time Configuration inside Modal */}
              {editingRule.conditions?.documentTypes?.includes('MONTHLY') && (
                <section className="space-y-3 rounded-xl border border-blue-300 bg-gradient-to-br from-blue-50/90 to-white p-4 shadow-2xs animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-md bg-blue-600 text-white">
                        <Clock3 className="size-4" />
                      </div>
                      <h4 className="font-bold text-slate-900">🗓️ ตั้งเวลาส่งรายงานสรุปยอดประจำเดือน</h4>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                      Auto Monthly Cron
                    </span>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      เลือกเวลาที่ต้องการส่งสรุปยอดเข้ากลุ่มนี้ (ทุกวันที่ 1 ของเดือน เวลาไทย GMT+7):
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        className="h-10 w-32 rounded-md border border-slate-300 bg-[#FFF7CC] px-3 py-1.5 font-mono text-sm font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:bg-amber-200/15"
                        value={editingRule.conditions?.monthlyScheduleTime || form.monthlyReportScheduleTime || '08:00'}
                        onChange={(e) => {
                          const val = e.target.value
                          setForm((prev) => ({ ...prev, monthlyReportScheduleTime: val }))
                          setEditingRule((prev) => prev ? ({
                            ...prev,
                            conditions: { ...prev.conditions, monthlyScheduleTime: val },
                          }) : null)
                        }}
                      />
                      <div className="flex flex-wrap gap-1">
                        {['07:30', '08:00', '08:30', '09:00', '18:00'].map((preset) => {
                          const currentVal = editingRule.conditions?.monthlyScheduleTime || form.monthlyReportScheduleTime || '08:00'
                          return (
                            <button
                              key={preset}
                              type="button"
                              className={`rounded border px-2.5 py-1 text-xs font-mono transition ${
                                currentVal === preset
                                  ? 'border-blue-600 bg-blue-600 text-white font-bold shadow-xs'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, monthlyReportScheduleTime: preset }))
                                setEditingRule((prev) => prev ? ({
                                  ...prev,
                                  conditions: { ...prev.conditions, monthlyScheduleTime: preset },
                                }) : null)
                              }}
                            >
                              {preset}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      ระบบจะรวบรวมยอดใบชั่ง, ผลผลิต, ยอดซื้อ-ขาย, และการเคลื่อนไหวของทั้งเดือน ส่งเป็นการ์ด Carousel เข้ากลุ่มนี้อัตโนมัติ
                    </p>
                  </div>
                </section>
              )}

              <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                <label className="block font-bold text-slate-800" htmlFor="line-rule-target">2. เลือกกลุ่ม LINE ที่จะส่ง <span className="text-rose-600">*</span></label>
                <Select
                  id="line-rule-target"
                  aria-invalid={Boolean(ruleFieldErrors.targetId)}
                  className={`h-10 w-full px-3 text-sm ${ruleFieldErrors.targetId ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                  required
                  value={editingRule.target_id || ''}
                  onChange={(event) => {
                    setEditingRule({ ...editingRule, target_id: event.target.value })
                    setRuleFieldErrors((currentErrors) => ({ ...currentErrors, targetId: undefined }))
                  }}
                >
                  <option disabled value="">เลือกกลุ่ม LINE</option>
                  {targets.filter((target) => target.is_active && target.target_type === 'group').map((target) => (
                    <option key={target.id} value={target.target_id}>{target.display_name}</option>
                  ))}
                </Select>
                {ruleFieldErrors.targetId ? <p className="text-xs font-medium text-rose-600">{ruleFieldErrors.targetId}</p> : null}
              </section>

              <details className="rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-slate-700">
                  ตั้งค่าเพิ่มเติม (ไม่จำเป็น)
                  {Boolean(
                    editingRule.description
                    || (editingRule.priority ?? 100) !== 100
                    || editingRule.stop_after_match === false
                    || editingRule.conditions?.branchCodes?.length
                    || editingRule.conditions?.minNetWeight != null
                    || editingRule.conditions?.minImpurityWeight != null
                    || editingRule.conditions?.requiresImages
                    || editingRule.conditions?.requiresScalePhoto
                    || editingRule.conditions?.warehouseIds?.length
                    || editingRule.conditions?.productIds?.length
                    || editingRule.conditions?.partyIds?.length
                    || editingRule.conditions?.maxNetWeight != null
                    || editingRule.conditions?.timeWindows?.length
                  ) ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">ตั้งค่าไว้แล้ว</span> : null}
                </summary>
                <div className="space-y-4 border-t border-slate-200 p-4">
                  {editingRule.conditions?.warehouseIds?.length
                    || editingRule.conditions?.productIds?.length
                    || editingRule.conditions?.partyIds?.length
                    || editingRule.conditions?.maxNetWeight != null
                    || editingRule.conditions?.timeWindows?.length ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      กฎนี้มีเงื่อนไขขั้นสูงเดิม เช่น คลัง สินค้า คู่ค้า น้ำหนักสูงสุด หรือช่วงเวลา ระบบจะคงเงื่อนไขเหล่านี้ไว้เมื่อบันทึก
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 sm:col-span-2">
                      <span className="block font-medium text-slate-700">คำอธิบายเพิ่มเติม</span>
                      <textarea
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                        placeholder="เว้นว่างได้"
                        rows={2}
                        value={editingRule.description || ''}
                        onChange={(event) => setEditingRule({ ...editingRule, description: event.target.value })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block font-medium text-slate-700">ลำดับกฎ</span>
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        min="0"
                        step="1"
                        type="number"
                        value={editingRule.priority ?? 100}
                        onChange={(event) => setEditingRule({ ...editingRule, priority: Number(event.target.value) })}
                      />
                    </label>
                    <div className="flex items-end pb-2">
                      <ActiveToggle
                        checked={editingRule.stop_after_match ?? true}
                        label="ส่งเข้ากลุ่มนี้กลุ่มเดียว"
                        onChange={(checked) => setEditingRule({ ...editingRule, stop_after_match: checked })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <h5 className="font-medium text-slate-700">จำกัดเฉพาะสาขา</h5>
                      <p className="text-xs text-slate-500">ไม่เลือกสาขา หมายถึงส่งจากทุกสาขา</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        aria-pressed={(editingRule.conditions?.branchCodes?.length ?? 0) === 0}
                        className={`h-9 rounded-md border px-3 text-sm ${((editingRule.conditions?.branchCodes?.length ?? 0) === 0)
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 bg-white text-slate-600'
                          }`}
                        type="button"
                        onClick={() => setEditingRule({
                          ...editingRule,
                          conditions: { ...editingRule.conditions, branchCodes: [] }
                        })}
                      >
                        ทุกสาขา
                      </button>
                      {branches.filter((branch) => branch.code).map((branch) => {
                        const code = branch.code as string
                        const selected = editingRule.conditions?.branchCodes?.includes(code) ?? false
                        return (
                          <button
                            key={branch.id}
                            aria-pressed={selected}
                            className={`h-9 rounded-md border px-3 text-sm ${selected
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                              }`}
                            type="button"
                            onClick={() => {
                              const current = new Set(editingRule.conditions?.branchCodes ?? [])
                              if (selected) current.delete(code)
                              else current.add(code)
                              setEditingRule({
                                ...editingRule,
                                conditions: { ...editingRule.conditions, branchCodes: [...current] }
                              })
                            }}
                          >
                            {branch.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {editingRule.conditions?.documentTypes?.some((type) => type === 'WTI' || type === 'WTO') ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <h5 className="font-medium text-slate-700">เงื่อนไขเฉพาะใบรับ-ส่งของ</h5>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="block text-slate-600">น้ำหนักสุทธิต่ำสุด (กก.)</span>
                          <input
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            min="0"
                            placeholder="ไม่กำหนด"
                            step="0.01"
                            type="number"
                            value={editingRule.conditions?.minNetWeight ?? ''}
                            onChange={(event) => setEditingRule({
                              ...editingRule,
                              conditions: { ...editingRule.conditions, minNetWeight: event.target.value ? Number(event.target.value) : null }
                            })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="block text-slate-600">สิ่งเจือปนต่ำสุด (กก.)</span>
                          <input
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            min="0"
                            placeholder="ไม่กำหนด"
                            step="0.01"
                            type="number"
                            value={editingRule.conditions?.minImpurityWeight ?? ''}
                            onChange={(event) => setEditingRule({
                              ...editingRule,
                              conditions: { ...editingRule.conditions, minImpurityWeight: event.target.value ? Number(event.target.value) : null }
                            })}
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-5">
                        <ActiveToggle
                          checked={editingRule.conditions?.requiresImages === true}
                          label="ต้องมีรูปหน้างาน"
                          onChange={(checked) => setEditingRule({
                            ...editingRule,
                            conditions: { ...editingRule.conditions, requiresImages: checked }
                          })}
                        />
                        <ActiveToggle
                          checked={editingRule.conditions?.requiresScalePhoto === true}
                          label="ต้องมีรูปตาชั่ง"
                          onChange={(checked) => setEditingRule({
                            ...editingRule,
                            conditions: { ...editingRule.conditions, requiresScalePhoto: checked }
                          })}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
              </div>

              <DialogFooter className="shrink-0 flex-col items-stretch gap-3 border-slate-200 sm:flex-row sm:items-center sm:justify-between">
                <ActiveToggle
                  checked={editingRule.is_active ?? true}
                  label="เปิดใช้งานกฎนี้"
                  onChange={(checked) => setEditingRule({ ...editingRule, is_active: checked })}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-normal text-slate-700 transition hover:bg-slate-50 focus:outline-none"
                    onClick={requestCloseRuleForm}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="h-9 rounded-md bg-slate-900 px-5 text-sm font-normal text-white transition hover:bg-slate-800 focus:outline-none"
                  >
                    บันทึก
                  </button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Manual Send Modal (ส่งเอกสาร/สรุปประจำวันเข้า LINE ทันที) */}
      {isManualSendModalOpen && (
        <Dialog
          open={isManualSendModalOpen}
          onOpenChange={(open) => {
            if (!open) closeManualSendModal()
          }}
        >
          <DialogContent
            className="max-h-[90vh] max-w-xl [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-blue-500 [&_button:focus-visible]:ring-offset-2 [&_input:focus-visible]:ring-2 [&_input:focus-visible]:ring-blue-500 [&_input:focus-visible]:ring-offset-2 [&_select:focus-visible]:ring-2 [&_select:focus-visible]:ring-blue-500 [&_select:focus-visible]:ring-offset-2"
            fallbackTitle="📤 ส่งแจ้งเตือนด้วยตนเอง"
            hideClose
            mobileAppShell={false}
          >
            <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleManualSend}>
              <DialogHeader className="shrink-0 px-5 py-4">
                <h3 className="text-base font-bold text-white">📤 ส่งแจ้งเตือน LINE ด้วยตนเอง</h3>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 text-sm">
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <label className="block font-bold text-slate-800" htmlFor="manual-send-type">1. เลือกประเภทที่ต้องการส่ง <span className="text-rose-600">*</span></label>
                  <Select
                    id="manual-send-type"
                    className="h-10 w-full px-3 text-sm border-slate-300"
                    value={manualSendType}
                    onChange={(event) => {
                      const next = event.target.value as LineDocumentType
                      setManualSendType(next)
                      setManualSendError(null)
                      if (next !== 'DAILY') setManualSendDocumentNo('')
                    }}
                  >
                    {lineDocumentTypeOptions.map((option) => (
                      <option key={option.type} value={option.type}>{option.label}</option>
                    ))}
                  </Select>
                </div>

                {manualSendType === 'DAILY' ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                    <label className="block font-bold text-slate-800" htmlFor="manual-send-date">2. เลือกวันที่สรุปประจำวัน</label>
                    <input
                      id="manual-send-date"
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none"
                      max={new Date().toISOString().slice(0, 10)}
                      type="date"
                      value={manualSendDate}
                      onChange={(event) => setManualSendDate(event.target.value)}
                    />
                    <p className="text-xs text-slate-500">สรุปจะแสดงเฉพาะการ์ดโกดังที่มีงานในวันนั้น (โกดังที่ไม่มีงานจะไม่ถูกส่ง)</p>
                  </div>
                ) : manualSendType === 'MONTHLY' ? (
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                    <label className="block font-bold text-slate-800" htmlFor="manual-send-month">2. เลือกเดือนที่ต้องการสรุปรายงาน</label>
                    <input
                      id="manual-send-month"
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none"
                      type="month"
                      value={manualSendDate.slice(0, 7)}
                      onChange={(event) => setManualSendDate(`${event.target.value}-01`)}
                    />
                    <p className="text-xs text-slate-500">ระบบจะประมวลผลยอดใบชั่ง, ผลผลิต, บิลซื้อ-ขาย, และยอดรายโกดังของเดือนที่เลือก ส่งเข้า LINE ทันที</p>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                    <label className="block font-bold text-slate-800" htmlFor="manual-send-docno">2. เลขที่เอกสาร <span className="text-rose-600">*</span></label>
                    {manualSendType === 'WTI' || manualSendType === 'WTO' ? (
                      <>
                        <Select
                          className="h-10 w-full px-3 text-sm border-slate-300"
                          value={manualSendDocumentNo}
                          onChange={(event) => setManualSendDocumentNo(event.target.value)}
                        >
                          <option value="">— เลือกจากใบชั่งล่าสุด —</option>
                          {recentTickets
                            .filter((ticket) => ticket.docType === manualSendType)
                            .map((ticket) => (
                              <option key={ticket.id} value={ticket.docNo}>
                                {ticket.docNo} · {ticket.supplierName || ticket.customerName || '-'} · {ticket.netWeight.toLocaleString('th-TH')} กก.
                              </option>
                            ))}
                        </Select>
                        <p className="text-xs text-slate-500">หรือพิมพ์เลขที่ใบชั่งเองด้านล่าง</p>
                      </>
                    ) : null}
                    <input
                      id="manual-send-docno"
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none"
                      placeholder={manualSendType === 'WTI' || manualSendType === 'WTO' ? 'เช่น WT-2026-08-001' : 'พิมพ์เลขที่เอกสาร'}
                      value={manualSendDocumentNo}
                      onChange={(event) => setManualSendDocumentNo(event.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <label className="block font-bold text-slate-800" htmlFor="manual-send-target">3. กลุ่ม LINE ปลายทาง <span className="text-xs font-medium text-slate-400">(ไม่เลือก = ใช้กฎการส่ง / กลุ่มดีฟอลต์)</span></label>
                  <Select
                    id="manual-send-target"
                    className="h-10 w-full px-3 text-sm border-slate-300"
                    value={manualSendTargetId}
                    onChange={(event) => setManualSendTargetId(event.target.value)}
                  >
                    <option value="">ใช้กฎการส่งอัตโนมัติ</option>
                    {targets.filter((target) => target.is_active && target.target_type === 'group').map((target) => (
                      <option key={target.id} value={target.target_id}>{target.display_name}</option>
                    ))}
                  </Select>
                </div>

                {manualSendError ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{manualSendError}</div>
                ) : null}
                {manualSendMessage ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{manualSendMessage}</div>
                ) : null}
              </div>

              <DialogFooter className="shrink-0 flex-col items-stretch gap-3 border-slate-200 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-slate-500">การส่งนี้จะไม่สร้างคิว (ส่งทันที)</span>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-normal text-slate-700 transition hover:bg-slate-50 focus:outline-none"
                    onClick={closeManualSendModal}
                  >
                    ปิด
                  </button>
                  <button
                    disabled={isManualSending}
                    type="submit"
                    className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isManualSending ? 'กำลังส่ง...' : '📤 ส่งเลย'}
                  </button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Template Add/Edit Modal & Live Preview */}
      {isTemplateModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-fade-in" onMouseDown={(event) => { if (event.target === event.currentTarget) requestCloseTemplateForm() }}>
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border-0 bg-slate-900 shadow-2xl animate-zoom-in">
            <div data-ns-dialog-header className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <h3 className="text-base font-bold">
                {editingTemplate.id ? '📝 แก้ไขเทมเพลตและ Preview' : '➕ เพิ่มเทมเพลตการ์ดใหม่'}
              </h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white transition hover:border-rose-700 hover:bg-rose-700 focus:outline-none"
                  onClick={requestCloseTemplateForm}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  form="line-template-form"
                  className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none"
                >
                  บันทึกเทมเพลต
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {/* Settings Forms Left */}
              <div className="w-full md:w-1/2 p-5 overflow-y-auto space-y-4 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50">

                <form id="line-template-form" onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700" htmlFor="line-template-name">ชื่อเทมเพลต <span className="text-red-600">*</span></label>
                  <input
                    id="line-template-name"
                    type="text"
                    required
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                    placeholder="เช่น เทมเพลตมาตรฐาน, ธีมสีส้มบิลส่งทองแดง"
                    value={editingTemplate.name || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 select-none font-semibold text-slate-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingTemplate.is_default_wti}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, is_default_wti: e.target.checked })}
                    />
                    <span>ดีฟอลต์ WTI</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingTemplate.is_default_wto}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, is_default_wto: e.target.checked })}
                    />
                    <span>ดีฟอลต์ WTO</span>
                  </label>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h4 className="font-bold text-slate-900">ข้อความบนการ์ด LINE</h4>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-700">หัวข้อหลัก</label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                      value={templateFormConfig.title}
                      onChange={(e) => updateEditingTemplateConfig((config) => ({ ...config, title: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-700">ข้อความรอง</label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                      value={templateFormConfig.subtitle}
                      onChange={(e) => updateEditingTemplateConfig((config) => ({ ...config, subtitle: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">สีหัวการ์ด</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="block font-bold text-slate-700">ใบรับของ WTI</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1 focus:outline-none"
                          value={templateFormConfig.theme.headerColorWti}
                          onChange={(e) => updateEditingTemplateConfig((config) => ({
                            ...config,
                            theme: { ...config.theme, headerColorWti: e.target.value },
                          }))}
                        />
                        <input
                          type="text"
                          className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                          value={templateFormConfig.theme.headerColorWti}
                          onChange={(e) => updateEditingTemplateConfig((config) => ({
                            ...config,
                            theme: { ...config.theme, headerColorWti: e.target.value },
                          }))}
                        />
                      </div>
                    </label>
                    <label className="space-y-1">
                      <span className="block font-bold text-slate-700">ใบส่งของ WTO</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1 focus:outline-none"
                          value={templateFormConfig.theme.headerColorWto}
                          onChange={(e) => updateEditingTemplateConfig((config) => ({
                            ...config,
                            theme: { ...config.theme, headerColorWto: e.target.value },
                          }))}
                        />
                        <input
                          type="text"
                          className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                          value={templateFormConfig.theme.headerColorWto}
                          onChange={(e) => updateEditingTemplateConfig((config) => ({
                            ...config,
                            theme: { ...config.theme, headerColorWto: e.target.value },
                          }))}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">ข้อมูลที่จะแสดงในการ์ด</h4>
                  <div className="space-y-2">
                    {templateFormConfig.fields.map((field) => (
                      <div key={field.key} className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={field.enabled}
                          onChange={(e) => updateEditingTemplateConfig((config) => ({
                            ...config,
                            fields: config.fields.map((current) => current.key === field.key ? { ...current, enabled: e.target.checked } : current),
                          }))}
                        />
                        <input
                          type="text"
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                          value={field.label}
                          disabled={!field.enabled}
                          onChange={(e) => updateEditingTemplateConfig((config) => ({
                            ...config,
                            fields: config.fields.map((current) => current.key === field.key ? { ...current, label: e.target.value } : current),
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">ปุ่มท้ายการ์ด</h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={templateFormConfig.buttons.pdf}
                        onChange={(e) => updateEditingTemplateConfig((config) => ({
                          ...config,
                          buttons: { ...config.buttons, pdf: e.target.checked },
                        }))}
                      />
                      <span>แสดงปุ่มเปิด PDF</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={templateFormConfig.buttons.detail}
                        onChange={(e) => updateEditingTemplateConfig((config) => ({
                          ...config,
                          buttons: { ...config.buttons, detail: e.target.checked },
                        }))}
                      />
                      <span>แสดงปุ่มเปิดในระบบ</span>
                    </label>
                  </div>
                </div>

              </form>
            </div>

            {/* Live Flex Message Preview Right */}
            <div className="w-full md:w-1/2 p-5 bg-slate-900 text-white overflow-y-auto space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-slate-200">📱 จำลองหน้าจอการแสดงผลบนแอป LINE (Flex Preview)</h4>

                <div className="space-y-1.5 text-xs">
                  <label className="block text-slate-400">เลือกเลขใบชั่งสำหรับดึงข้อมูลพรีวิว:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="h-10 w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                      placeholder="เช่น WTI012606-0023"
                      value={previewDocNo}
                      onChange={(e) => setPreviewDocNo(e.target.value)}
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-[#0284c7] hover:bg-sky-600 rounded text-xs font-bold text-white transition focus:outline-none"
                      onClick={() => void handlePreviewTemplate()}
                    >
                      เรียกพรีวิว
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {recentTickets.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="px-2 py-0.5 border border-slate-700 rounded text-[9.5px] hover:bg-slate-800 text-slate-300"
                        onClick={() => setPreviewDocNo(t.docNo)}
                      >
                        {t.docNo}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Flex Message Simulation Frame */}
              <div className="flex-1 flex items-center justify-center p-4">
                {templatePreviewJson ? (
                  <div className="w-full max-w-[270px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col font-sans select-none">
                    {/* Alt Header text from LINE */}
                    <div className="bg-[#242424] text-slate-400 py-1.5 px-3 text-xs truncate border-b border-slate-900">
                      💬 LINE Flex Message Preview
                    </div>
                    {/* The Rendered card */}
                    <div className="p-3 bg-[#8c9bab] flex justify-center">
                      <div className="w-full bg-white rounded-xl shadow overflow-hidden text-[#111827] text-xs">
                        {/* Header Color */}
                        <div
                          className="p-3 text-white"
                          style={{ backgroundColor: templatePreviewJson.contents?.header?.backgroundColor || '#064e3b' }}
                        >
                          <h5 className="font-bold text-[13px]">{templatePreviewJson.contents?.header?.contents?.[0]?.text || 'ใบชั่งน้ำหนัก'}</h5>
                          <span className="text-xs opacity-75">{templatePreviewJson.contents?.header?.contents?.[1]?.text || '-'}</span>
                        </div>
                        {/* Body fields */}
                        <div className="p-3 space-y-1.5">
                          {templatePreviewJson.contents?.body?.contents?.map((c: any, i: number) => (
                            <div key={i} className="flex leading-tight text-xs">
                              <span className="text-slate-400 w-20 flex-shrink-0">{c.contents?.[0]?.text || ''}</span>
                              <span className="text-slate-900 font-bold break-words">{c.contents?.[1]?.text || ''}</span>
                            </div>
                          ))}
                        </div>
                        {/* Footer buttons */}
                        <div className="p-2 border-t border-slate-100 bg-slate-50 flex flex-col gap-1">
                          {templatePreviewJson.contents?.footer?.contents?.map((btn: any, idx: number) => (
                            <a
                              key={idx}
                              href="#"
                              onClick={(e) => e.preventDefault()}
                              className={`w-full text-center py-1 rounded text-[10.5px] font-bold block ${btn.style === 'primary'
                                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                                  : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                              {btn.action?.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-center py-8 text-xs">ป้อนเลขใบชั่งแล้วกด &quot;เรียกพรีวิว&quot; เพื่อจำลองการ์ดที่ส่งเข้าไลน์แชท</div>
                )}
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outbox Job Attempts Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-fade-in">
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md bg-slate-900 shadow-2xl animate-zoom-in">
            {/* Header */}
            <div data-ns-dialog-header className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <h3 className="text-base font-bold">📋 ประวัติการยิงและการส่งของบิล {selectedJob.document_no}</h3>
              <button
                type="button"
                className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white transition hover:border-rose-700 hover:bg-rose-700 focus:outline-none"
                onClick={() => setSelectedJob(null)}
              >
                ปิด
              </button>
            </div>

            {/* Content */}
            <div className="space-y-4 overflow-y-auto bg-slate-50 p-5 text-xs">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block">รหัสคิวงาน:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedJob.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">ประเภทบิล:</span>
                  <span className="font-bold text-slate-800 uppercase">{selectedJob.document_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">เป้าหมายรับข่าวสาร:</span>
                  <span className="font-bold text-slate-800">{selectedJob.target_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">สถานะปัจจุบัน:</span>
                  <span className={`px-2 py-0.5 rounded font-bold text-xs ${selectedJob.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>{selectedJob.status.toUpperCase()}</span>
                </div>
              </div>

              {/* Attempts list */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800">📊 บันทึกพยายามส่งข้อมูลในคิว (Attempts Trail):</h4>
                <div className="space-y-2">
                  {selectedJob.line_notification_attempts.map((attempt) => (
                    <div key={attempt.id} className="bg-white rounded-xl border border-slate-200 p-3 leading-relaxed">
                      <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                        <span className="font-bold text-slate-700">พยายามส่งครั้งที่ #{attempt.attempt_no}</span>
                        <span className="text-xs text-slate-400">{formatThaiDateCE(attempt.created_at)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-600">
                        <div>
                          <span>สถานะผลลัพธ์: </span>
                          <span className={`font-semibold ${attempt.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {attempt.status.toUpperCase()}
                          </span>
                        </div>
                        {attempt.duration_ms && (
                          <div>
                            <span>ดีเลย์ส่งจริง: </span>
                            <span className="font-bold">{attempt.duration_ms} ms</span>
                          </div>
                        )}
                        {attempt.error_message && (
                          <div className="col-span-2 text-rose-600 font-semibold mt-1">
                            ⚠️ ปัญหา: {attempt.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedJob.line_notification_attempts.length === 0 && (
                    <p className="text-slate-400 text-center py-4">ไม่พบบันทึกการยิงส่งแจ้งเตือนในคิว</p>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </section>
  )

  // Local helper state wrapper to bypass inline search issues
  function setSearchVal(val: string) {
    setJobSearch(val)
    setJobPage(1)
  }
}
