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

type Warehouse = {
  id: number
  code: string
  name: string
  active: boolean
}

type Evaluation = {
  warehouse_id: number
  warehouse_code: string
  warehouse_name: string
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

const WH_THEMES: Record<string, { badgeBg: string; badgeText: string; gradient: string; border: string }> = {
  'WH-01': { badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800', gradient: 'from-emerald-600 to-teal-700', border: 'border-emerald-200' },
  'WH-02': { badgeBg: 'bg-sky-100', badgeText: 'text-sky-800', gradient: 'from-sky-600 to-blue-700', border: 'border-sky-200' },
  'WH-03': { badgeBg: 'bg-purple-100', badgeText: 'text-purple-800', gradient: 'from-purple-600 to-indigo-700', border: 'border-purple-200' },
  'WH-04': { badgeBg: 'bg-amber-100', badgeText: 'text-amber-800', gradient: 'from-amber-600 to-orange-700', border: 'border-amber-200' },
  'WH-05': { badgeBg: 'bg-rose-100', badgeText: 'text-rose-800', gradient: 'from-rose-600 to-red-700', border: 'border-rose-200' },
}

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
    <div className="flex items-center gap-1">
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
              className={`size-6 transition-colors ${
                isFilled
                  ? 'fill-amber-400 text-amber-400 drop-shadow-xs'
                  : 'fill-slate-100 text-slate-300 group-hover:text-amber-200 dark:fill-slate-800 dark:text-slate-600'
              }`}
            />
          </button>
        )
      })}
      <span className="ml-2 font-mono text-sm font-bold text-slate-700 dark:text-slate-200">{value}/5</span>
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
  const theme = WH_THEMES[ev.warehouse_code] ?? {
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    gradient: 'from-slate-700 to-slate-900',
    border: 'border-slate-200',
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      {/* Card Header */}
      <div className={`bg-gradient-to-r ${theme.gradient} px-5 py-4 text-white shadow-xs`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-white/20 text-xs font-black backdrop-blur-xs">
              {ev.warehouse_code.replace('WH-', '')}
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight">{ev.warehouse_name}</h2>
              <p className="text-[11px] font-medium text-white/80">{ev.warehouse_code} · สายงานคลังและคัดแยก</p>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1 rounded-xl bg-white/20 px-2.5 py-1 backdrop-blur-xs">
              <Star className="size-3.5 fill-amber-300 text-amber-300" />
              <span className="font-mono text-base font-black">{avgScore.toFixed(1)}</span>
              <span className="text-[10px] text-white/80">/5</span>
            </div>
          </div>
        </div>
      </div>

      {/* Criteria Rating Controls */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-3">
          {CRITERIA_CONFIG.map((crit) => {
            const Icon = crit.icon
            const val = ev[crit.key]

            return (
              <div
                key={crit.key}
                className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${crit.bg}`}>
                    <Icon className={`size-4 ${crit.color}`} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{crit.label}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">{crit.sub}</div>
                  </div>
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
        <div className="mt-2 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <AlertTriangle className="size-3.5 text-amber-500" />
              ปัญหาที่เจอวันนี้ (Issues Encountered)
            </label>
            <textarea
              value={ev.problems}
              onChange={(e) => onUpdate(ev.warehouse_id, 'problems', e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="ระบุปัญหาที่พบ (เช่น ลูกค้าปฏิเสธเกรด, น้ำยาเทสไม่พอ)..."
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Wrench className="size-3.5 text-sky-500" />
              วิธีแก้ไข / แนวทางปรับปรุง (Solutions)
            </label>
            <textarea
              value={ev.solutions}
              onChange={(e) => onUpdate(ev.warehouse_id, 'solutions', e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="ระบุแนวทางแก้ไขหรือข้อแนะนำ..."
            />
          </div>

          {/* Clean compact evaluator footer badge */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <User className="size-3 text-slate-400" />
              <span>ผู้ประเมิน:</span>
              <strong className="font-bold text-slate-700 dark:text-slate-200">{ev.evaluated_by || 'MAY'}</strong>
            </span>
            <span className="text-[10px] text-slate-400">กำหนดจากส่วนกลาง</span>
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-indigo-200/90 bg-white shadow-xs transition-all duration-200 hover:shadow-md dark:border-indigo-900/50 dark:bg-slate-900">
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 px-5 py-4 text-white shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-white/20 text-xs font-black backdrop-blur-xs">
              <Trophy className="size-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">สรุปอันดับผลงานวันนี้</h2>
              <p className="text-[11px] font-medium text-white/80">ตารางจัดอันดับโกดังประจำวัน (Leaderboard)</p>
            </div>
          </div>
          <span className="rounded-full bg-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold text-indigo-200">
            REALTIME
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div className="space-y-2.5">
          {ranked.map((wh, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
            const pct = Math.min(100, Math.round((wh.score / 5) * 100))

            return (
              <div
                key={wh.warehouse_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-colors hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center text-xs font-black">
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

        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-950 dark:bg-indigo-950/30">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-indigo-900 dark:text-indigo-200">ประเมินแล้ว:</span>
            <span className="font-bold text-indigo-700 dark:text-indigo-300">{evaluations.length} / 5 โกดัง</span>
          </div>
          <div className="mt-1 text-[11px] text-indigo-700/80 dark:text-indigo-400">
            💡 คลิกปุ่ม <strong>"ทดสอบยิง"</strong> ด้านล่างเพื่อส่งผลอันดับเข้า LINE Group ทันที
          </div>
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

      {/* Page Header (Design System Compliant) */}
      <div className="border-b border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                PRODUCTION KPI
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ประเมินผลการปฏิบัติงานโกดัง</span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              <Building2 className="size-6 text-emerald-600" />
              ประเมิน KPI โกดังรายวัน
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Global Evaluator (Default: MAY) */}
            <div className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 shadow-xs dark:border-slate-700 dark:bg-slate-800">
              <User className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ผู้ประเมิน:</span>
              <input
                type="text"
                value={globalEvaluator}
                onChange={(e) => handleGlobalEvaluatorChange(e.target.value)}
                className="w-16 bg-transparent text-xs font-bold text-slate-800 focus:outline-none dark:text-slate-100"
                placeholder="MAY"
                title="แก้ไขชื่อผู้ประเมินส่วนกลาง (มีผลกับทุกโกดัง)"
              />
            </div>

            <DatePickerInput
              value={date}
              onChange={(newDate) => setDate(newDate || new Date().toISOString().split('T')[0])}
              className="w-36 sm:w-40"
              placeholder="วว/ดด/ปปปป"
              showTodayButton
            />

            <button
              onClick={() => void loadData()}
              disabled={isLoading}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="รีเฟรชข้อมูล"
              type="button"
            >
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="hidden sm:inline">รีเฟรช</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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

        {/* Sticky Action Footer (Inside page flow: Never overlaps Sidebar or Mobile Nav) */}
        <div className="sticky bottom-0 z-20 -mx-4 -mb-6 mt-8 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between sm:justify-start sm:gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>วันที่:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{date}</span>
              </div>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>เฉลี่ยรวม:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">{stats.overallAvg} / 5.0</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
              <button
                onClick={() => void handleTestSend()}
                disabled={isSending || isLoading}
                className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                type="button"
              >
                <Send className={`size-4 ${isSending ? 'animate-bounce' : ''}`} />
                <span>{isSending ? 'กำลังส่ง...' : 'ทดสอบยิง'}</span>
              </button>

              <button
                onClick={() => void handleSave()}
                disabled={isSaving || isLoading}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                type="button"
              >
                <Save className={`size-4 ${isSaving ? 'animate-spin' : ''}`} />
                <span>{isSaving ? 'กำลังบันทึก...' : '💾 บันทึก'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

