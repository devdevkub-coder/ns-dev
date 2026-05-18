import { NextResponse } from 'next/server'
import { z } from 'zod'
import { masterDataFormSchema, masterDataRecordSchema } from '@/lib/master-data'
import { apiErrorResponse } from '@/lib/server/api-error'

export const updateMasterDataStatusSchema = z.object({
  active: z.boolean(),
})

export type MasterDataRouteProps = {
  params: Promise<{
    id: string
  }>
}

export function toNumber(value: { toNumber: () => number } | number | null | undefined) {
  if (value === null || value === undefined) return null
  return typeof value === 'number' ? value : value.toNumber()
}

export function toIso(value: Date | null | undefined) {
  return value?.toISOString() ?? null
}

export function parseMasterDataForm(body: unknown) {
  return masterDataFormSchema.parse(body)
}

export function masterDataJson(row: Record<string, unknown>) {
  return NextResponse.json(masterDataRecordSchema.parse(row))
}

export function masterDataListJson(rows: Array<Record<string, unknown>>) {
  return NextResponse.json(rows.map((row) => masterDataRecordSchema.parse(row)))
}

export function errorJson(caught: unknown, fallback: string, status = 400) {
  return apiErrorResponse(caught, fallback, status)
}

export function normalizeCode(value: string | null | undefined, fallback: string) {
  return (value?.trim() || fallback).toUpperCase()
}

export function nextSequentialCode(lastCode: string | null | undefined, prefix: string, width = 3) {
  const lastNumber = Number(String(lastCode ?? '').replace(new RegExp(`^${prefix}`, 'i'), ''))
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `${prefix}${String(nextNumber).padStart(width, '0')}`
}
