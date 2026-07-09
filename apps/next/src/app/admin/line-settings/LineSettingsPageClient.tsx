/* eslint-disable @next/next/no-img-element */
'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/api-client'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Validation Schema for credentials and basic configs
const credentialsSchema = z.object({
  lineChannelAccessToken: z.string().trim().nullable().or(z.literal('')),
  lineChannelSecret: z.string().trim().nullable().or(z.literal('')),
  lineDefaultTargetId: z.string().trim().nullable().or(z.literal('')),
  pdfBucket: z.string().trim().min(1, 'กรุณาระบุชื่อ Storage Bucket'),
  appUrl: z.string().trim().url('รูปแบบ URL ไม่ถูกต้อง').or(z.literal('')),
  lineAutoSendWti: z.boolean().default(false),
  lineAutoSendWto: z.boolean().default(false),
  googleSheetsWebhookUrl: z.string().trim().url('รูปแบบ URL ไม่ถูกต้อง').or(z.literal('')).nullable().or(z.literal('')),
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

type RoutingRule = {
  id: string
  name: string
  description: string | null
  priority: number
  is_active: boolean
  target_id: string
  template_id: string | null
  stop_after_match: boolean
  conditions: any
}

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
  { key: 'warehouseName', defaultLabel: 'โกดัง' },
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
    enabled: ['partyName', 'branchName', 'warehouseName', 'grossWeight', 'containerDeductionWeight', 'deductionWeight', 'netWeight'].includes(field.key),
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
  { key: 'actions', defaultWidth: 230, minWidth: 180 },
]

const ruleCols: Array<ResizableColumnDefinition<RuleColKey>> = [
  { key: 'priority', defaultWidth: 90, minWidth: 70 },
  { key: 'name', defaultWidth: 220, minWidth: 150 },
  { key: 'target', defaultWidth: 180, minWidth: 130 },
  { key: 'stopAfter', defaultWidth: 110, minWidth: 90 },
  { key: 'isActive', defaultWidth: 90, minWidth: 80 },
  { key: 'actions', defaultWidth: 150, minWidth: 120 },
]

const jobCols: Array<ResizableColumnDefinition<JobColKey>> = [
  { key: 'createdAt', defaultWidth: 140, minWidth: 120 },
  { key: 'document', defaultWidth: 140, minWidth: 110 },
  { key: 'target', defaultWidth: 180, minWidth: 130 },
  { key: 'status', defaultWidth: 100, minWidth: 95 },
  { key: 'attempts', defaultWidth: 90, minWidth: 80 },
  { key: 'actions', defaultWidth: 200, minWidth: 160 },
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
  const [activeTab, setActiveTab] = useState<'overview' | 'credentials' | 'targets' | 'rules' | 'templates' | 'outbox' | 'analytics'>('overview')

  // Lists & data states
  const [form, setForm] = useState<CredentialsFormValues>({
    lineChannelAccessToken: '',
    lineChannelSecret: '',
    lineDefaultTargetId: '',
    pdfBucket: 'weight-ticket-pdfs',
    appUrl: '',
    lineAutoSendWti: false,
    lineAutoSendWto: false,
    googleSheetsWebhookUrl: '',
  })

  const [targets, setTargets] = useState<Target[]>([])
  const [rules, setRules] = useState<RoutingRule[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [jobs, setJobs] = useState<NotificationJob[]>([])
  const [recentTickets, setRecentTickets] = useState<WeightTicketOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null)

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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CredentialsFormValues, string>>>({})

  // Password masking
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Target Modals / Forms state
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false)
  const [editingTarget, setEditingTarget] = useState<Partial<Target> | null>(null)

  // Rule Modals / Forms state
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<Partial<RoutingRule> | null>(null)

  // Template Modals / Forms state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Partial<MessageTemplate> | null>(null)
  const [templatePreviewJson, setTemplatePreviewJson] = useState<any | null>(null)
  const [previewDocNo, setPreviewDocNo] = useState('')

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
      setForm(data)
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
    // ดึงข้อมูลบอทผ่าน test-connection route เดิม (reuse ไม่สร้างใหม่)
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
        }
      }
    } catch (err) {
      console.error('Failed to load bot info', err)
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

  // Save Channel Credentials
  const saveCredentials = async () => {
    setError(null)
    setMessage(null)
    setFieldErrors({})

    const parsed = credentialsSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as any)
      setError('กรุณากรอกข้อมูลให้ถูกต้อง')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/line-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'บันทึกข้อมูลการตั้งค่าล้มเหลว')
      }
      const responseBody = await res.json().catch(() => ({}))
      // sync อัตโนมัติเมื่อเปลี่ยน token: ถ้า sync ล้มเหลวจะคืน warning (แต่ token ยังบันทึกสำเร็จ)
      if (responseBody.syncWarning) {
        setMessage(`บันทึกการเชื่อมต่อสำเร็จ แต่ซิงค์กลุ่มล้มเหลว: ${responseBody.syncWarning}`)
      } else {
        setMessage('บันทึกข้อมูลการเชื่อมต่อสำเร็จ')
      }
      void loadCredentials()
      void loadBotInfo()
      void loadTargets()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกข้อมูลไม่สำเร็จ'))
    } finally {
      setIsSaving(false)
    }
  }

  // Quick Action Connection tests
  const testOAConnection = async () => {
    setError(null)
    setMessage(null)
    if (!form.lineChannelAccessToken) {
      setError('กรุณากรอก LINE Channel Access Token ก่อนทดสอบ')
      return
    }
    setIsTestingOA(true)
    try {
      const res = await fetch('/api/admin/line-settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: form.lineChannelAccessToken }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'การเชื่อมต่อผิดพลาด')
      setMessage(`🔌 เชื่อมต่อ LINE OA สำเร็จ! บอทชื่่อ "${body.botName}" (${body.basicId})`)
    } catch (caught) {
      setError(getErrorMessage(caught, 'ตรวจสอบการเชื่อมต่อล้มเหลว'))
    } finally {
      setIsTestingOA(false)
    }
  }

  const testWebhookSignature = async () => {
    setError(null)
    setMessage(null)
    if (!form.lineChannelSecret) {
      setError('กรุณากรอก LINE Channel Secret ก่อนทดสอบ')
      return
    }
    setIsTestingWebhook(true)
    try {
      const res = await fetch('/api/admin/line-settings/test-webhook', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || body.ok === false) throw new Error(body.message || 'ลายเซ็นไม่ถูกต้อง')
      setMessage(`✅ ตรวจสอบความถูกต้องของ Webhook ลายเซ็นสำเร็จ: ${body.message}`)
    } catch (caught) {
      setError(getErrorMessage(caught, 'ทดสอบ Webhook ล้มเหลว'))
    } finally {
      setIsTestingWebhook(false)
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
  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!editingTarget?.target_id || !editingTarget?.target_type || !editingTarget?.display_name) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน')
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
      setIsTargetModalOpen(false)
      setEditingTarget(null)
      void loadTargets()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกเป้าหมายขัดข้อง'))
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

  const handleDeleteTarget = async (id: string) => {
    if (!confirm('ยืนยันลบเป้าหมายการรับข่าวสารนี้?')) return
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
    }
  }

  // RULE CRUD Handlers
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!editingRule?.name || !editingRule?.target_id) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน')
      return
    }

    try {
      const isEdit = !!editingRule.id
      const url = '/api/admin/line-rules'
      const method = isEdit ? 'PATCH' : 'POST'
      const payload = {
        id: editingRule.id,
        name: editingRule.name,
        description: editingRule.description,
        priority: Number(editingRule.priority ?? 100),
        isActive: editingRule.is_active,
        targetId: editingRule.target_id,
        templateId: editingRule.template_id ? Number(editingRule.template_id) : null,
        stopAfterMatch: editingRule.stop_after_match,
        conditions: editingRule.conditions || {},
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'บันทึกกฎแจ้งเตือนไม่สำเร็จ')

      setMessage(isEdit ? 'แก้ไขกฎกระจายการแจ้งเตือนสำเร็จ' : 'เพิ่มกฎกระจายการแจ้งเตือนสำเร็จ')
      setIsRuleModalOpen(false)
      setEditingRule(null)
      void loadRules()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกกฎขัดข้อง'))
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (!confirm('ยืนยันลบกฎส่งข่าวสารนี้?')) return
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
    }
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

  // TEMPLATE CRUD Handlers
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!editingTemplate?.name) {
      setError('กรุณากรอกข้อมูลให้จำเป็นให้ครบถ้วน')
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
      setIsTemplateModalOpen(false)
      setEditingTemplate(null)
      void loadTemplates()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกเทมเพลตขัดข้อง'))
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('ยืนยันลบเทมเพลตนี้?')) return
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
    }
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
      setMessage(`🚀 บังคับส่งใบชั่ง ${documentNo} ในคิวสำเร็จแล้ว!`)
      void loadJobs()
      void loadAnalytics()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ส่งแจ้งเตือนซ้ำขัดข้อง'))
    }
  }

  const handleCancelJob = async (id: string) => {
    if (!confirm('ยืนยันยกเลิกและหยุดการส่งแจ้งเตือนคิวนี้?')) return
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
    }
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

  return (
    <section className="line-settings-page w-full max-w-none space-y-6 px-6 py-5 lg:px-10 lg:py-8 animate-fade-in font-normal text-slate-800">
      {/* Page Title & Environment Details */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/60 bg-white px-6 py-5 text-slate-900 shadow-sm">
        <div>
          <h1 className="text-xl font-bold">🛠️ LINE Notification Control Center</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-700 select-none">
            {process.env.NODE_ENV === 'development' ? 'Development' : 'Production'}
          </span>
          <span
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs tracking-wider text-slate-500 select-none"
            title={`Build: ${process.env.NEXT_PUBLIC_BUILD_TIME || '-'}`}
          >
            v{process.env.NEXT_PUBLIC_BUILD_VERSION || '0.0.0'} · {process.env.NEXT_PUBLIC_BUILD_COMMIT || 'unknown'}
          </span>
          <button
            type="button"
            className="h-8 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50 focus:outline-none select-none"
            onClick={() => void initData()}
          >
            🔄 รีเฟรชหน้าจอนี้
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 animate-fade-in flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 animate-fade-in flex items-center gap-2">
          <span>✅</span>
          <span>{message}</span>
        </div>
      ) : null}

      {/* Tabs Menu Switcher */}
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
        <TabsList className="w-full flex-nowrap overflow-x-auto scrollbar-hide" variant="line">
        {[
          { key: 'overview', label: '📊 Overview' },
          { key: 'credentials', label: '🔌 Credentials' },
          { key: 'targets', label: '👥 Targets / Groups' },
          { key: 'rules', label: '🛣️ Routing Rules' },
          // { key: 'templates', label: '📝 Templates' }, // ซ่อนชั่วคราว: template config ยังไม่ถูกเชื่อมกับ flow ส่งแจ้งเตือนจริง (buildFlexMessageFromTemplate ใช้แค่ใน Preview)
          { key: 'outbox', label: '📥 Outbox Queue' },
          { key: 'analytics', label: '📈 Analytics' }
        ].map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            variant="line"
          >
            {tab.label}
          </TabsTrigger>
        ))}
        </TabsList>
      </Tabs>

      {/* Tab Render Area */}
      <div className="grid grid-cols-1 gap-6">

        {/* Tab 1: Overview & Health */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* KPI Cards on pure grid - No Outer Wrapper Card, AcexPOS Parity */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg select-none">
                  🔌
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">LINE Connection</div>
                  <div className="text-sm font-bold text-slate-800 mt-1">{form.lineChannelAccessToken ? 'พร้อมเชื่อมต่อ' : 'ยังไม่ระบุ Token'}</div>
                </div>
              </div>

              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-lg select-none">
                  👥
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">LINE Targets</div>
                  <div className="text-sm font-bold text-slate-800 mt-1">{targets.length} ช่องทาง</div>
                </div>
              </div>

              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg select-none">
                  ⏳
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">Pending Jobs</div>
                  <div className="text-sm font-bold text-slate-800 mt-1">{analytics?.today?.pending || 0} งานส่งคิว</div>
                </div>
              </div>

              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg select-none">
                  ❌
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">Failed Jobs</div>
                  <div className="text-sm font-bold text-slate-800 mt-1">{analytics?.today?.failed || 0} งานส่งพลาด</div>
                </div>
              </div>
            </div>

            {/* Connected Bot Info Card - shows current LINE OA identity */}
            {botInfo && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-4 flex-wrap">
                  {botInfo.pictureUrl ? (
                    <img
                      src={botInfo.pictureUrl}
                      alt={botInfo.botName}
                      className="h-14 w-14 rounded-full border border-slate-200 object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                      🤖
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">บอทที่เชื่อมต่ออยู่</div>
                    <div className="text-base font-bold text-slate-900 mt-1 truncate">{botInfo.botName}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5 truncate select-all">{botInfo.basicId}</div>
                  </div>
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-bold uppercase select-none tracking-wider flex-shrink-0">
                    เชื่อมต่อแล้ว
                  </span>
                </div>
              </div>
            )}

            {/* Health Checklist Section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span>🏥</span> ความพร้อมของการส่งข้อความแจ้งเตือน (System Health Checklist)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-base leading-none mt-0.5">{form.lineChannelAccessToken ? '✅' : '❌'}</span>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Channel Access Token</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-base leading-none mt-0.5">{form.lineChannelSecret ? '✅' : '❌'}</span>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Channel Secret</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-base leading-none mt-0.5">{targets.some(t => t.is_default) ? '✅' : '⚠️'}</span>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Default Target (เป้าหมายดีฟอลต์)</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-base leading-none mt-0.5">✅</span>
                    <div>
                      <div className="text-sm font-bold text-slate-800">PDF Generator & Fonts Status</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-base leading-none mt-0.5">{form.pdfBucket ? '✅' : '❌'}</span>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Storage Bucket</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition focus:outline-none flex items-center gap-1.5 h-10"
                  onClick={() => void testOAConnection()}
                  disabled={isTestingOA}
                >
                  {isTestingOA ? 'กำลังทดสอบ...' : '🔌 ทดสอบสิทธิ์ Token'}
                </button>
                <button
                  type="button"
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition focus:outline-none flex items-center gap-1.5 h-10"
                  onClick={() => void testWebhookSignature()}
                  disabled={isTestingWebhook}
                >
                  {isTestingWebhook ? 'กำลังทดสอบ...' : '🔑 ทดสอบสิทธิ์ Webhook'}
                </button>
                <button
                  type="button"
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none flex items-center gap-1.5 h-10"
                  onClick={() => void runOutboxWorker()}
                  disabled={isProcessingJobs}
                >
                  ⚙️ เรียกใช้งาน Worker คิวงานด่วน
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Channel Credentials */}
        {activeTab === 'credentials' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 animate-fade-in">
            <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
              <span>🔑</span> การตั้งค่า LINE Messaging API & Credential Configuration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Channel Access Token */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700">LINE Channel Access Token *</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none pr-10 h-10"
                    placeholder="ป้อนรหัสสิทธิ์ส่งบอทไลน์ Channel Access Token"
                    value={form.lineChannelAccessToken || ''}
                    onChange={(e) => setForm({ ...form, lineChannelAccessToken: e.target.value })}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? '🐵' : '🙈'}
                  </button>
                </div>
                {fieldErrors.lineChannelAccessToken && (
                  <p className="text-xs text-red-600">{fieldErrors.lineChannelAccessToken}</p>
                )}
              </div>

              {/* Channel Secret */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700">LINE Channel Secret *</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none pr-10 h-10"
                    placeholder="ป้อน Channel Secret สำหรับตรวจสอบลายเซ็น"
                    value={form.lineChannelSecret || ''}
                    onChange={(e) => setForm({ ...form, lineChannelSecret: e.target.value })}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? '🐵' : '🙈'}
                  </button>
                </div>
                {fieldErrors.lineChannelSecret && (
                  <p className="text-xs text-red-600">{fieldErrors.lineChannelSecret}</p>
                )}
              </div>

              {/* Storage Bucket */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700">Storage Bucket เก็บเอกสาร PDF *</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none h-10"
                  value={form.pdfBucket}
                  onChange={(e) => setForm({ ...form, pdfBucket: e.target.value })}
                />
                {fieldErrors.pdfBucket && (
                  <p className="text-xs text-red-600">{fieldErrors.pdfBucket}</p>
                )}
              </div>

              {/* Public App URL */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700">Public App URL (ต้นทางระบบเว็บ) *</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none h-10"
                  placeholder="เช่น https://ns-dev.devkub.com"
                  value={form.appUrl}
                  onChange={(e) => setForm({ ...form, appUrl: e.target.value })}
                />
                {fieldErrors.appUrl && (
                  <p className="text-xs text-red-600">{fieldErrors.appUrl}</p>
                )}
              </div>

              {/* Auto Send Options */}
              <div className="md:col-span-2 flex flex-col md:flex-row gap-6 pt-2 select-none">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4.5 w-4.5 rounded border-slate-300 text-slate-900 focus:ring-0 focus:outline-none"
                    checked={form.lineAutoSendWti}
                    onChange={(e) => setForm({ ...form, lineAutoSendWti: e.target.checked })}
                  />
                  <span>ส่งข้อความแจ้งเตือน WTI (บิลรับสินค้า) ไปไลน์กลุ่มอัตโนมัติเมื่อสร้างบิล</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4.5 w-4.5 rounded border-slate-300 text-slate-900 focus:ring-0 focus:outline-none"
                    checked={form.lineAutoSendWto}
                    onChange={(e) => setForm({ ...form, lineAutoSendWto: e.target.checked })}
                  />
                  <span>ส่งข้อความแจ้งเตือน WTO (บิลส่งสินค้า) ไปไลน์กลุ่มอัตโนมัติเมื่อสร้างบิล</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                className="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none h-10"
                onClick={() => void saveCredentials()}
                disabled={isSaving}
              >
                {isSaving ? 'กำลังบันทึก...' : '💾 บันทึกข้อมูลการตั้งค่า'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Targets / Groups */}
        {activeTab === 'targets' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">👥 ช่องทางรับข่าวสาร / LINE Targets (Groups & Users)</h3>
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
                      setEditingTarget({
                        target_type: 'group',
                        display_name: '',
                        target_id: '',
                        is_active: true,
                        is_default: false,
                        notify_wti: true,
                        notify_wto: true
                      })
                      setIsTargetModalOpen(true)
                    }}
                  >
                    ➕ เพิ่มกลุ่มแชทด้วยตนเอง
                  </button>
                </div>
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
                          label="สถานะ"
                          activeSortKey={targetSortKey ?? undefined}
                          direction={targetSortDirection}
                          sortKey="status"
                          onSort={handleTargetSort}
                          resizeProps={targetResize.getResizeHandleProps('status', 'สถานะ')}
                        />
                        <ResizableTableHead align="right" label="จัดการ" resizeProps={targetResize.getResizeHandleProps('actions', 'จัดการ')} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedTargets.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              {t.picture_url ? (
                                <img src={t.picture_url} alt={t.display_name || "Profile"} className="h-8 w-8 rounded-full border border-slate-200 flex-shrink-0" />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                  {t.target_type === 'group' ? 'G' : t.target_type === 'room' ? 'R' : 'U'}
                                </div>
                              )}
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
                          <td className="px-3 py-3">
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
                          <td className="px-3 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                onClick={() => void handleTestTarget(t.target_id, t.id)}
                              >
                                🔌 ทดสอบส่ง
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                onClick={() => void handleSetDefaultTarget(t.id)}
                                disabled={t.is_default}
                              >
                                ⭐ ตั้งดีฟอลต์
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                onClick={() => {
                                  setEditingTarget(t)
                                  setIsTargetModalOpen(true)
                                }}
                              >
                                📝 แก้ไข
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs font-semibold text-red-600 hover:text-red-700 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                onClick={() => void handleDeleteTarget(t.id)}
                              >
                                ❌ ลบ
                              </button>
                            </div>
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
                        {t.picture_url ? (
                          <img src={t.picture_url} alt={t.display_name || "Profile"} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold">
                            {t.target_type === 'group' ? 'G' : t.target_type === 'room' ? 'R' : 'U'}
                          </div>
                        )}
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
                      <div className="flex items-center justify-between">
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
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-700 h-8 flex items-center"
                            onClick={() => void handleTestTarget(t.target_id, t.id)}
                          >
                            🔌 ทดสอบ
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-700 h-8 flex items-center"
                            onClick={() => void handleSetDefaultTarget(t.id)}
                            disabled={t.is_default}
                          >
                            ⭐ ดีฟอลต์
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-700 h-8 flex items-center"
                            onClick={() => {
                              setEditingTarget(t)
                              setIsTargetModalOpen(true)
                            }}
                          >
                            📝 แก้ไข
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-red-600 h-8 flex items-center"
                            onClick={() => void handleDeleteTarget(t.id)}
                          >
                            ❌ ลบ
                          </button>
                        </div>
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
                  <h3 className="text-base font-bold text-slate-900">🔀 กฎการกระจายการแจ้งเตือน (Notification Routing Rules)</h3>
                </div>
                <button
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none h-8"
                  onClick={() => {
                    setEditingRule({
                      name: '',
                      priority: 100,
                      is_active: true,
                      target_id: '',
                      template_id: null,
                      stop_after_match: false,
                      conditions: {}
                    })
                    setIsRuleModalOpen(true)
                  }}
                >
                  ➕ เพิ่มกฎใหม่
                </button>
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
                          label="สถานะ"
                          activeSortKey={ruleSortKey ?? undefined}
                          direction={ruleSortDirection}
                          sortKey="isActive"
                          onSort={handleRuleSort}
                          resizeProps={ruleResize.getResizeHandleProps('isActive', 'สถานะ')}
                        />
                        <ResizableTableHead align="right" label="จัดการ" resizeProps={ruleResize.getResizeHandleProps('actions', 'จัดการ')} />
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
                                {r.description && <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>}
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
                            <td className="px-3 py-3">
                              <span className={`px-1.5 py-0.5 rounded font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                {r.is_active ? 'เปิดใช้งาน' : 'ปิด'}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                  onClick={() => {
                                    setEditingRule(r)
                                    setIsRuleModalOpen(true)
                                  }}
                                >
                                  📝 แก้ไข
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 text-xs font-semibold text-red-600 hover:text-red-700 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                  onClick={() => void handleDeleteRule(r.id)}
                                >
                                  ❌ ลบ
                                </button>
                              </div>
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
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-700 h-8 flex items-center"
                            onClick={() => {
                              setEditingRule(r)
                              setIsRuleModalOpen(true)
                            }}
                          >
                            📝 แก้ไข
                          </button>
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-red-600 h-8 flex items-center"
                            onClick={() => void handleDeleteRule(r.id)}
                          >
                            ❌ ลบ
                          </button>
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
                    setEditingTemplate({
                      name: '',
                      template_type: 'weight_ticket',
                      is_default_wti: false,
                      is_default_wto: false,
                      is_active: true,
                      config: createDefaultTemplateConfig()
                    })
                    setIsTemplateModalOpen(true)
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
                          setEditingTemplate(t)
                          setIsTemplateModalOpen(true)
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
                  <h3 className="text-base font-bold text-slate-900">📥 คิวรอส่งแจ้งเตือนย้อนหลัง (Outbox / Retry Job Queue)</h3>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
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
                          label="เวลาสร้างคิว"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="createdAt"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('createdAt', 'เวลาสร้างคิว')}
                        />
                        <ResizableTableHead
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
                          label="สถานะคิว"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="status"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('status', 'สถานะคิว')}
                        />
                        <ResizableTableHead
                          label="จำนวนพยายาม"
                          activeSortKey={jobSortKey ?? undefined}
                          direction={jobSortDirection}
                          sortKey="attempts"
                          onSort={handleJobSort}
                          resizeProps={jobResize.getResizeHandleProps('attempts', 'จำนวนพยายาม')}
                        />
                        <ResizableTableHead align="right" label="จัดการ" resizeProps={jobResize.getResizeHandleProps('actions', 'จัดการ')} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedJobs.map((job) => {
                        const dateStr = new Date(job.created_at).toLocaleString('th-TH')
                        const boundTarget = targets.find(t => t.target_id === job.target_id)
                        return (
                          <tr key={job.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                            <td className="px-3 py-3 text-slate-500">
                              {dateStr}
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-900">
                              <div className="flex flex-col">
                                <span>{job.document_no}</span>
                                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">{job.document_type}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <div className="font-semibold text-slate-800">{boundTarget?.display_name || 'ไม่ระบุกลุ่ม'}</div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">{job.target_id}</div>
                            </td>
                            <td className="px-3 py-3">
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
                            <td className="px-3 py-3 font-bold text-slate-600">
                              {job.attempt_count} / {job.max_attempts}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                  onClick={() => setSelectedJob(job)}
                                >
                                  👁️ ดูประวัติยิง
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none h-7 flex items-center"
                                  onClick={() => void handleRetryJob(job.id, job.document_no)}
                                  disabled={job.status === 'processing'}
                                >
                                  🔄 ยิงใหม่
                                </button>
                                {job.status === 'pending' && (
                                  <button
                                    type="button"
                                    className="px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 border border-slate-200 hover:bg-slate-50 rounded-md transition focus:outline-none h-7 flex items-center"
                                    onClick={() => void handleCancelJob(job.id)}
                                  >
                                    🚫 ยกเลิก
                                  </button>
                                )}
                              </div>
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
                    const dateStr = new Date(job.created_at).toLocaleString('th-TH')
                    const boundTarget = targets.find(t => t.target_id === job.target_id)
                    return (
                      <div key={job.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs text-slate-400 block">{dateStr}</span>
                            <h4 className="font-bold text-slate-900 mt-1">{job.document_no}</h4>
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
                        <div className="flex justify-end gap-2 pt-1.5">
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-700 h-8 flex items-center"
                            onClick={() => setSelectedJob(job)}
                          >
                            👁️ ดูประวัติยิง
                          </button>
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition focus:outline-none h-8 flex items-center"
                            onClick={() => void handleRetryJob(job.id, job.document_no)}
                            disabled={job.status === 'processing'}
                          >
                            🔄 ยิงใหม่
                          </button>
                          {job.status === 'pending' && (
                            <button
                              type="button"
                              className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-rose-600 h-8 flex items-center"
                              onClick={() => void handleCancelJob(job.id)}
                            >
                              🚫 ยกเลิก
                            </button>
                          )}
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
            {/* pure layout metric cards - no outer wrapper - AcexPOS design standard */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg select-none">
                  🚀
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">ความสำเร็จสะสม (30 วัน)</div>
                  <div className="text-base font-bold text-slate-800 mt-1">{analytics?.last30Days?.successRate || 0} %</div>
                </div>
              </div>

              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-lg select-none">
                  📊
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">จำนวนจัดส่ง (30 วัน)</div>
                  <div className="text-base font-bold text-slate-800 mt-1">{analytics?.last30Days?.total || 0} รายการ</div>
                </div>
              </div>

              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg select-none">
                  🕒
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">ดีเลย์ประมวลผลเฉลี่ย</div>
                  <div className="text-base font-bold text-slate-800 mt-1">{analytics?.last30Days?.avgDurationMs ? `${(analytics.last30Days.avgDurationMs / 1000).toFixed(2)} วินาที` : '-'}</div>
                </div>
              </div>

              <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg select-none">
                  ❌
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">จัดส่งล้มเหลว (30 วัน)</div>
                  <div className="text-base font-bold text-slate-800 mt-1">{analytics?.last30Days?.failed || 0} รายการ</div>
                </div>
              </div>
            </div>

            {/* Top error messages and targets reports */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Targets */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2 text-sm flex items-center gap-1.5">
                  <span>👥</span> LINE Targets ที่ส่งแจ้งเตือนสูงสุด (สูงสุด 5 อันดับแรก)
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
                  <span>⚠️</span> ปัญหาและสาเหตุจัดส่งล้มเหลวสูงสุด (Top Error Reasons)
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

      {/* FOOTER INFO */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 space-y-1 select-none">
        <p className="font-bold">💡 ข้อแนะนำเพิ่มเติม:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>สำหรับการลงทะเบียนบอทรับสิทธิ: เชิญ LINE OA บอทเข้าร่วมกลุ่มแชท ➡️ พิมพ์คำสั่ง <code>/register สาขา=[code]</code> บอทจะทำการซิงค์โครงสร้างและอัปเดตลงตารางหน้านี้ทันที</li>
          <li>การยิงทดสอบ หรือ บังคับยิงแจ้งเตือนคิวใหม่ (Force retry) จะประมวลผล PDF rendering และสร้างอัลบั้มรูปข้าม duplicate log ทันที</li>
        </ul>
      </div>

      {/* ================= MODAL DIALOGS ================= */}

      {/* Target Add/Edit Modal */}
      {isTargetModalOpen && editingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-fade-in">
          <div className="relative w-full max-w-md overflow-hidden rounded-md bg-slate-900 shadow-2xl animate-zoom-in">
            {/* Modal Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <h3 className="text-base font-bold">
                {editingTarget.id ? '📝 แก้ไขรายละเอียดผู้รับ' : '👥 เพิ่มเป้าหมายรับแจ้งเตือนใหม่'}
              </h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white transition hover:border-rose-700 hover:bg-rose-700 focus:outline-none"
                  onClick={() => {
                    setIsTargetModalOpen(false)
                    setEditingTarget(null)
                  }}
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
                <label className="block font-bold text-slate-700">ชื่อเป้าหมาย / Display Name *</label>
                <input
                  type="text"
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                  placeholder="เช่น กลุ่มแชทหน้าเตาหลอม, บัญชีรับซื้อ"
                  value={editingTarget.display_name || ''}
                  onChange={(e) => setEditingTarget({ ...editingTarget, display_name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">ประเภทช่องทางแชท *</label>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                  value={editingTarget.target_type}
                  onChange={(e) => setEditingTarget({ ...editingTarget, target_type: e.target.value as any })}
                >
                  <option value="group">Group (กลุ่มไลน์)</option>
                  <option value="room">Room (ห้องไลน์แชท)</option>
                  <option value="user">User ID (รายบุคคล)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">LINE ID ของเป้าหมาย *</label>
                <input
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
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                  value={editingTarget.branch_code || ''}
                  onChange={(e) => setEditingTarget({ ...editingTarget, branch_code: e.target.value || null })}
                >
                  <option value="">ทุกสาขา</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.code || ''}>{b.name} ({b.code || '-'})</option>
                  ))}
                </select>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-fade-in">
          <div className="relative w-full max-w-lg overflow-hidden rounded-md bg-slate-900 shadow-2xl animate-zoom-in">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <h3 className="text-base font-bold">
                {editingRule.id ? '📝 แก้ไขกฎการกระจายข่าวสาร' : '🛣️ เพิ่มกฎส่งข้อความแจ้งเตือน'}
              </h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white transition hover:border-rose-700 hover:bg-rose-700 focus:outline-none"
                  onClick={() => {
                    setIsRuleModalOpen(false)
                    setEditingRule(null)
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  form="line-rule-form"
                  className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none"
                >
                  บันทึกกฎ
                </button>
              </div>
            </div>

            {/* Form */}
            <form id="line-rule-form" onSubmit={handleSaveRule} className="space-y-4 bg-slate-50 p-5 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className="block font-bold text-slate-700">ชื่อกฎ (ตั้งให้อ่านง่าย) *</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                    placeholder="เช่น ส่งใบรับสินค้าชั่งทองแดงน้ำหนักสูงกว่า 5 ตัน ไปหน้าเตา"
                    value={editingRule.name || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1 col-span-2">
                  <label className="block font-bold text-slate-700">คำอธิบายเพิ่มเติม</label>
                  <textarea
                    rows={2}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                    placeholder="รายละเอียดเพิ่มเติมของกฎนี้..."
                    value={editingRule.description || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">ผู้รับปลายทาง (LINE Target) *</label>
                  <select
                    required
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                    value={editingRule.target_id || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, target_id: e.target.value })}
                  >
                    <option value="">-- เลือกผู้รับ --</option>
                    {targets.map(t => (
                      <option key={t.id} value={t.target_id}>{t.display_name} ({t.target_id.slice(0, 6)}...)</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">ลำดับกฎ / Priority *</label>
                  <input
                    type="number"
                    required
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none h-10"
                    value={editingRule.priority ?? 100}
                    onChange={(e) => setEditingRule({ ...editingRule, priority: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* Conditions Builder block */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                <h4 className="font-bold text-slate-800 text-xs">🛠️ ตั้งค่าเงื่อนไขการส่งออก (Conditions JSON):</h4>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">ประเภทบิล (เช่น WTI, WTO)</label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                      placeholder="ป้อนคอมมาแยก เช่น WTI, WTO"
                      value={editingRule.conditions?.documentTypes?.join(', ') || ''}
                      onChange={(e) => {
                        const val = e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                        setEditingRule({
                          ...editingRule,
                          conditions: { ...editingRule.conditions, documentTypes: val }
                        })
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">สาขาที่เข้าเงื่อนไข (Branch Codes)</label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                      placeholder="ป้อนคอมมาแยก เช่น 01, 02"
                      value={editingRule.conditions?.branchCodes?.join(', ') || ''}
                      onChange={(e) => {
                        const val = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        setEditingRule({
                          ...editingRule,
                          conditions: { ...editingRule.conditions, branchCodes: val }
                        })
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">น้ำหนักสุทธิต่ำสุด (กก.)</label>
                    <input
                      type="number"
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                      value={editingRule.conditions?.minNetWeight || ''}
                      onChange={(e) => {
                        setEditingRule({
                          ...editingRule,
                          conditions: { ...editingRule.conditions, minNetWeight: e.target.value ? Number(e.target.value) : null }
                        })
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-600 font-medium">สิ่งเจือปนต่ำสุด (กก.)</label>
                    <input
                      type="number"
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                      value={editingRule.conditions?.minImpurityWeight || ''}
                      onChange={(e) => {
                        setEditingRule({
                          ...editingRule,
                          conditions: { ...editingRule.conditions, minImpurityWeight: e.target.value ? Number(e.target.value) : null }
                        })
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-1 font-semibold text-slate-600">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingRule.conditions?.requiresImages === true}
                      onChange={(e) => {
                        setEditingRule({
                          ...editingRule,
                          conditions: { ...editingRule.conditions, requiresImages: e.target.checked }
                        })
                      }}
                    />
                    <span>ต้องมีรูปถ่ายหน้างานแนบ</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingRule.conditions?.requiresScalePhoto === true}
                      onChange={(e) => {
                        setEditingRule({
                          ...editingRule,
                          conditions: { ...editingRule.conditions, requiresScalePhoto: e.target.checked }
                        })
                      }}
                    />
                    <span>ต้องมีรูปตาชั่ง/น้ำหนัก</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4 select-none font-semibold text-slate-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRule.stop_after_match}
                    onChange={(e) => setEditingRule({ ...editingRule, stop_after_match: e.target.checked })}
                  />
                  <span>หยุดตรวจสอบกฎต่อไปเมื่อตรงกฎข้อนี้ (Stop after match)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRule.is_active}
                    onChange={(e) => setEditingRule({ ...editingRule, is_active: e.target.checked })}
                  />
                  <span>เปิดใช้งานกฎข้อนี้</span>
                </label>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Template Add/Edit Modal & Live Preview */}
      {isTemplateModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-fade-in">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border-0 bg-slate-900 shadow-2xl animate-zoom-in">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <h3 className="text-base font-bold">
                {editingTemplate.id ? '📝 แก้ไขเทมเพลตและ Preview' : '➕ เพิ่มเทมเพลตการ์ดใหม่'}
              </h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white transition hover:border-rose-700 hover:bg-rose-700 focus:outline-none"
                  onClick={() => {
                    setIsTemplateModalOpen(false)
                    setEditingTemplate(null)
                    setTemplatePreviewJson(null)
                  }}
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
                  <label className="block font-bold text-slate-700">ชื่อเทมเพลต *</label>
                  <input
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
                          className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
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
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:outline-none"
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
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
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
                        <span className="text-xs text-slate-400">{new Date(attempt.created_at).toLocaleString('th-TH')}</span>
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
