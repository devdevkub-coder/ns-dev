import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toNumber } from '@/lib/server/daily'
import { loadProductionMetrics } from '@/lib/server/production-reports'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.operations.view')
    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('dateFrom') || undefined
    const dateTo = url.searchParams.get('dateTo') || undefined
    const [machines, rows] = await Promise.all([
      prisma.production_machines.findMany({ include: { branches: true }, orderBy: [{ name: 'asc' }], where: { active: true } }),
      loadProductionMetrics({ dateFrom, dateTo }),
    ])
    const days = dateFrom && dateTo ? Math.max(1, (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000 + 1) : 30
    const result = machines.map((machine) => {
      const machineRows = rows.filter((row) => row.machineName === machine.name)
      const inputQty = machineRows.reduce((sum, row) => sum + row.inputQty, 0)
      const outputQty = machineRows.reduce((sum, row) => sum + row.outputQty, 0)
      const capacity = toNumber(machine.capacity_kg_per_hr)
      const estHours = capacity > 0 ? inputQty / capacity : 0
      const theoreticalHours = 8 * days
      const actualYield = inputQty > 0 ? outputQty / inputQty * 100 : 0
      const normalYield = toNumber(machine.normal_yield_pct)
      return {
        actualYield,
        branchName: machine.branches?.name ?? '-',
        capacityKgPerHr: capacity,
        estHours,
        id: machine.id,
        inputQty,
        name: machine.name,
        normalYieldPct: normalYield,
        orderCount: machineRows.length,
        outputQty,
        totalCost: machineRows.reduce((sum, row) => sum + row.totalCost, 0),
        type: machine.type ?? '-',
        utilization: theoreticalHours > 0 ? estHours / theoreticalHours * 100 : 0,
        yieldDiff: actualYield - normalYield,
      }
    })
    return NextResponse.json({ rows: result, summary: { count: result.length, inputQty: result.reduce((sum, row) => sum + row.inputQty, 0), outputQty: result.reduce((sum, row) => sum + row.outputQty, 0) } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Machine Utilization ไม่ได้', 500)
  }
}
