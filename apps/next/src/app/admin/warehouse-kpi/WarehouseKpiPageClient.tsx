'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
  Wrench,
  Zap,
} from 'lucide-react'
import { KpiCard, KpiCardGrid } from '@/components/ui/KpiCard'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

type Warehouse = {
  id: number
  code: string
  name: string
  branch_code?: string | null
  branch_name?: string | null
  active: boolean
}

type Evaluation = {
  warehouse_id: number
  warehouse_code: string
  warehouse_name: string
  branch_name?: string | null
  accuracy: number
  speed: number
  target_hit: number
  problems: string
  solutions: string
  evaluated_by: string
}

const CRITERIA_CONFIG = [
  {
    key: 'accuracy' as const,
    label: 'ความถูกต้องของงาน',
    sub: 'คัดแยกตรงเกรด, ชั่งตรง, ไม่ปนเปื้อน',
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
  },
  {
    key: 'speed' as const,
    label: 'ความรวดเร็วในการทำงาน',
    sub: 'คิวไม่ติดขัด, ปิดงานไว, ตรงเวลา',
    icon: Zap,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/60',
  },
  {
    key: 'target_hit' as const,
    label: 'การทำงานให้ถึงเป้า',
    sub: 'บรรลุเป้าหมายยอดตันประจำวัน',
    icon: Target,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/60',
  },
] as const

const StarRatingControl = memo(function StarRatingControl({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (val: number) => void
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const activeRating = hovered ?? value

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = activeRating >= star
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className="group relative p-1 transition-transform hover:scale-125 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            title={`${star} ดาว`}
          >
            <Star
              className={`size-5 transition-colors ${
                isFilled
                  ? 'fill-amber-400 text-amber-500 drop-shadow-2xs'
                  : 'fill-slate-100 text-slate-300 group-hover:text-amber-200 dark:fill-slate-800 dark:text-slate-600'
              }`}
            />
          </button>
        )
      })}
      <span className="ml-1.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{value}/5</span>
    </div>
  )
})

const WarehouseCard = memo(function WarehouseCard({
  ev,
  onUpdate,
}: {
  ev: Evaluation
  onUpdate: (warehouseId: number, field: keyof Evaluation, value: string | number) => void
}) {
  const avgScore = Number(((ev.accuracy + ev.speed + ev.target_hit) / 3).toFixed(1))

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs transition-shadow duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      {/* Card Header (Corporate ERP Baseline) */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 items-center rounded-md bg-emerald-100 px-2 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {ev.warehouse_code}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{ev.warehouse_name}</h2>
              {ev.branch_name ? (
                <span className="inline-flex items-center rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {ev.branch_name}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
          <Star className="size-3.5 fill-amber-400 text-amber-500" />
          <span className="font-mono text-sm font-black text-slate-900 dark:text-white">{avgScore.toFixed(1)}</span>
          <span className="text-[10px] font-semibold text-slate-400">/ 5</span>
        </div>
      </div>

      {/* Criteria Rating Controls */}
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div className="space-y-2">
          {CRITERIA_CONFIG.map((crit) => {
            const val = ev[crit.key]

            return (
              <div
                key={crit.key}
                className="flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800/80 dark:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{crit.label}</div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">{crit.sub}</div>
                </div>

                <div className="flex justify-end">
                  <StarRatingControl
                    value={val}
                    onChange={(newVal) => onUpdate(ev.warehouse_id, crit.key, newVal)}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Problem & Solution Commentary Section */}
        <div className="mt-1 space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <AlertTriangle className="size-3.5 text-amber-500" />
              ปัญหาที่พบในวันนี้ (ถ้ามี)
            </label>
            <textarea
              value={ev.problems}
              onChange={(e) => onUpdate(ev.warehouse_id, 'problems', e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="ระบุปัญหาหน้างาน เช่น น้ำยาเทสไม่พอ, ลูกค้าปฏิเสธเกรด..."
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Wrench className="size-3.5 text-sky-500" />
              แนวทางแก้ไข / แนะนำ
            </label>
            <textarea
              value={ev.solutions}
              onChange={(e) => onUpdate(ev.warehouse_id, 'solutions', e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="ระบุวิธีแก้ไขหน้างาน..."
            />
          </div>
        </div>
      </div>
    </div>
  )
})

const LeaderboardCard = memo(function LeaderboardCard({
  evaluations,
}: {
  evaluations: Evaluation[]
}) {
  const ranked = useMemo(() => {
    return [...evaluations]
      .map((e) => ({
        ...e,
        score: Number(((e.accuracy + e.speed + e.target_hit) / 3).toFixed(1)),
      }))
      .sort((a, b) => b.score - a.score)
  }, [evaluations])

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs transition-shadow duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">สรุปอันดับผลงานประจำวัน</h2>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Leaderboard
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between p-4">
        <div className="space-y-2">
          {ranked.map((wh, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
            const pct = Math.min(100, Math.round((wh.score / 5) * 100))

            return (
              <div
                key={wh.warehouse_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/30"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center text-xs font-bold">
                    {medal}
                  </span>
                  <div className="min-w-0 truncate">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{wh.warehouse_name}</span>
                    <span className="ml-1 text-[10px] text-slate-400">({wh.warehouse_code})</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="hidden w-20 sm:block">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full ${
                          wh.score >= 4
                            ? 'bg-emerald-500'
                            : wh.score >= 3
                            ? 'bg-sky-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                    {wh.score.toFixed(1)} ★
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
          ประเมินแล้ว <strong className="font-mono text-slate-900 dark:text-slate-100">{evaluations.length}/5</strong> โกดัง ครบถ้วนตามมาตรฐาน
        </div>
      </div>
    </div>
  )
})

export function WarehouseKpiPageClient() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [globalEvaluator, setGlobalEvaluator] = useState('MAY')
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const showToast = useCallback((type: 'error' | 'success', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadData = useCallback(async () => {
    if (!date) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/warehouse-kpi?date=${date}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      const data = await res.json()

      const dbEvaluations: Evaluation[] = data.evaluations || []
      const activeWarehouses: Warehouse[] = data.warehouses || []

      // If existing records have evaluator name, pick the first one
      const existingEvaluator = dbEvaluations.find((e) => e.evaluated_by)?.evaluated_by
      if (existingEvaluator) {
        setGlobalEvaluator(existingEvaluator)
      }

      setWarehouses(activeWarehouses)

      const initialEvals = activeWarehouses.map((wh) => {
        const existing = dbEvaluations.find((e) => e.warehouse_id === wh.id)
        if (existing) {
          return {
            warehouse_id: existing.warehouse_id,
            warehouse_code: wh.code,
            warehouse_name: wh.name,
            branch_name: wh.branch_name ?? null,
            accuracy: Number(existing.accuracy) || 3,
            speed: Number(existing.speed) || 3,
            target_hit: Number(existing.target_hit) || 3,
            problems: existing.problems || '',
            solutions: existing.solutions || '',
            evaluated_by: existing.evaluated_by || existingEvaluator || 'MAY',
          }
        }
        return {
          warehouse_id: wh.id,
          warehouse_code: wh.code,
          warehouse_name: wh.name,
          branch_name: wh.branch_name ?? null,
          accuracy: 3,
          speed: 3,
          target_hit: 3,
          problems: '',
          solutions: '',
          evaluated_by: existingEvaluator || globalEvaluator || 'MAY',
        }
      })
      setEvaluations(initialEvals)
    } catch (err) {
      console.error('loadData error:', err)
      showToast('error', `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้'}`)
    } finally {
      setIsLoading(false)
    }
  }, [date, showToast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleGlobalEvaluatorChange = (name: string) => {
    setGlobalEvaluator(name)
    setEvaluations((prev) => prev.map((ev) => ({ ...ev, evaluated_by: name })))
  }

  const handleUpdateEval = useCallback((warehouseId: number, field: keyof Evaluation, value: string | number) => {
    setEvaluations((prev) =>
      prev.map((ev) => (ev.warehouse_id === warehouseId ? { ...ev, [field]: value } : ev)),
    )
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/warehouse-kpi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, evaluations }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      showToast('success', '✅ บันทึกคะแนน KPI ประจำวันเรียบร้อยแล้ว')
    } catch (err) {
      console.error('handleSave error:', err)
      showToast('error', `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestSend = async () => {
    setIsSending(true)
    try {
      const res = await fetch('/api/line/kpi-report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      showToast('success', `📲 ${data.message || 'ส่งสรุป KPI เข้า LINE เรียบร้อยแล้ว'}`)
    } catch (err) {
      console.error('handleTestSend error:', err)
      showToast('error', `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'ส่ง LINE ไม่สำเร็จ'}`)
    } finally {
      setIsSending(false)
    }
  }

  // Calculate live analytics
  const stats = useMemo(() => {
    if (evaluations.length === 0) {
      return { overallAvg: 0, topWh: null, problemCount: 0, ratedCount: 0 }
    }
    const withScores = evaluations.map((e) => ({
      ...e,
      avg: (e.accuracy + e.speed + e.target_hit) / 3,
    }))
    const overallAvg = withScores.reduce((sum, e) => sum + e.avg, 0) / withScores.length
    const sorted = [...withScores].sort((a, b) => b.avg - a.avg)
    const topWh = sorted[0]
    const problemCount = evaluations.filter(
      (e) => e.problems && e.problems.trim().length > 0 && e.problems !== 'ไม่มี',
    ).length
    return {
      overallAvg: Number(overallAvg.toFixed(1)),
      topWh: topWh ? { name: topWh.warehouse_name, code: topWh.warehouse_code, score: topWh.avg.toFixed(1) } : null,
      problemCount,
      ratedCount: evaluations.length,
    }
  }, [evaluations])

  return (
    <div className="min-h-full bg-slate-50/60 dark:bg-slate-950/60">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-xl transition-all duration-300 ${
            toast.type === 'success'
              ? 'border border-emerald-300 bg-emerald-900 text-white'
              : 'border border-rose-300 bg-rose-900 text-white'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="size-5 shrink-0 text-rose-400" />
          )}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Executive Page Header Card (Unified Rounded Card Design) */}
        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 shadow-2xs dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Building2 className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    PRODUCTION KPI
                  </span>
                  <span className="text-xs text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ระบบประเมินผลการปฏิบัติงานโกดังประจำวัน</span>
                </div>
                <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                  ประเมิน KPI โกดังรายวัน
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Global Evaluator Input */}
              <InputGroup className="w-36 sm:w-40">
                <InputGroupAddon align="inline-start" className="left-2.5">
                  <User className="size-4 text-emerald-600 dark:text-emerald-400" />
                </InputGroupAddon>
                <InputGroupInput
                  value={globalEvaluator}
                  onChange={(e) => handleGlobalEvaluatorChange(e.target.value)}
                  placeholder="ผู้ประเมิน"
                  title="ชื่อผู้ประเมินส่วนกลาง (มีผลกับทุกโกดัง)"
                  className="pl-9 pr-3 font-bold text-slate-800 placeholder:text-slate-400 dark:text-slate-100"
                />
              </InputGroup>

              {/* Thai Date Picker */}
              <DatePickerInput
                value={date}
                onChange={(newDate) => setDate(newDate || new Date().toISOString().split('T')[0])}
                className="w-36 sm:w-40"
                placeholder="วว/ดด/ปปปป"
                showTodayButton
              />
            </div>
          </div>
        </div>
        {/* KPI Executive Summary Grid (Stretches across all 4 columns cleanly) */}
        <KpiCardGrid className="mb-6 grid-cols-2 md:grid-cols-4 xl:grid-cols-4">
          <KpiCard
            icon={<Sparkles className="size-5" />}
            label="คะแนนเฉลี่ยรวมทุกโกดัง"
            value={`${stats.overallAvg} / 5.0`}
            tone={stats.overallAvg >= 4 ? 'emerald' : stats.overallAvg >= 3 ? 'blue' : 'amber'}
            note={
              stats.overallAvg >= 4
                ? 'ระดับ: ดีเยี่ยม 🌟'
                : stats.overallAvg >= 3
                ? 'ระดับ: พอใช้ 👍'
                : 'ระดับ: ต้องปรับปรุง ⚠️'
            }
          />
          <KpiCard
            icon={<Trophy className="size-5 text-amber-600" />}
            label="โกดังอันดับ 1 ประจำวัน"
            value={stats.topWh ? stats.topWh.name : '—'}
            tone="yellow"
            note={stats.topWh ? `คะแนนสูงสุด: ${stats.topWh.score} ดาว 🥇` : 'ยังไม่มีคะแนน'}
          />
          <KpiCard
            icon={<Building2 className="size-5" />}
            label="โกดังที่ได้รับการประเมิน"
            value={`${stats.ratedCount} โกดัง`}
            tone="slate"
            note="WH-01 ถึง WH-05 ครบถ้วน"
          />
          <KpiCard
            icon={<AlertTriangle className="size-5" />}
            label="ปัญหาที่รายงานเข้ามา"
            value={`${stats.problemCount} รายการ`}
            tone={stats.problemCount > 0 ? 'rose' : 'gain'}
            note={stats.problemCount > 0 ? 'ต้องการการแก้ไขหน้างาน' : 'ปฏิบัติงานราบรื่น ไร้ปัญหา'}
          />
        </KpiCardGrid>

        {/* Warehouse Evaluation Cards Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <RefreshCw className="size-8 animate-spin text-emerald-600" />
            <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-300">กำลังโหลดข้อมูลการประเมิน...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {evaluations.map((ev) => (
              <WarehouseCard key={ev.warehouse_id} ev={ev} onUpdate={handleUpdateEval} />
            ))}

            {/* 6th Card: Leaderboard & Summary (Fills 3x2 Grid Perfectly) */}
            <LeaderboardCard evaluations={evaluations} />
          </div>
        )}

        {/* Sticky Action Footer (Floating Rounded Island Dock) */}
        <div className="sticky bottom-4 z-20 mt-8">
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/95 sm:rounded-3xl sm:px-6 sm:py-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Left: Live Status & Executive Score Pills */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-600"></span>
                  </span>
                  <span>ประเมินแล้ว:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{stats.ratedCount}/5 โกดัง</span>
                </div>

                <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs shadow-2xs dark:border-slate-700 dark:bg-slate-800">
                  <Star className="size-3.5 fill-amber-400 text-amber-500" />
                  <span className="font-medium text-slate-600 dark:text-slate-300">เฉลี่ยรวม:</span>
                  <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                    {stats.overallAvg.toFixed(1)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">/ 5.0</span>
                </div>

                {stats.problemCount > 0 ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-800 shadow-2xs dark:border-rose-900 dark:bg-rose-950/70 dark:text-rose-200">
                    <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400" />
                    <span>{stats.problemCount} รายการปัญหา</span>
                  </div>
                ) : (
                  <div className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-2xs dark:border-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 md:flex">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>ปฏิบัติงานราบรื่น</span>
                  </div>
                )}
              </div>

              {/* Right: Primary Action Buttons */}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
                <button
                  onClick={() => void handleTestSend()}
                  disabled={isSending || isLoading}
                  className="group flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white sm:rounded-2xl"
                  type="button"
                  title="ส่งผลสรุป KPI และตารางอันดับเข้า LINE Group ประจำวัน"
                >
                  <Send className={`size-4 text-emerald-400 transition-transform group-hover:translate-x-0.5 dark:text-emerald-600 ${isSending ? 'animate-bounce' : ''}`} />
                  <span>{isSending ? 'กำลังส่งข้อมูล...' : 'ส่งสรุปเข้า LINE'}</span>
                </button>

                <button
                  onClick={() => void handleSave()}
                  disabled={isSaving || isLoading}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] disabled:opacity-50 sm:rounded-2xl"
                  type="button"
                >
                  <Save className={`size-4 ${isSaving ? 'animate-spin' : ''}`} />
                  <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกผลการประเมิน'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
