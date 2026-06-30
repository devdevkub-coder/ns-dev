import { z } from 'zod'

type ApiErrorPayload = {
  code?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

export class ApiError extends Error {
  code: string
  fieldErrors: Record<string, string[] | undefined>
  status: number

  constructor(message: string, options: { code?: string; fieldErrors?: Record<string, string[] | undefined>; status: number }) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? 'API_ERROR'
    this.fieldErrors = options.fieldErrors ?? {}
    this.status = options.status
  }
}

async function readPayload(response: Response): Promise<ApiErrorPayload | null> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null

  return response.json().catch(() => null)
}

function fallbackMessage(status: number, fallback: string) {
  if (status === 401) return 'กรุณาเข้าสู่ระบบใหม่'
  if (status === 403) return 'ไม่มีสิทธิ์ใช้งานส่วนนี้'
  if (status === 404) return 'ไม่พบข้อมูลที่ต้องการ'
  if (status === 409) return 'ข้อมูลซ้ำหรือขัดแย้งกับข้อมูลเดิม'
  if (status >= 500) return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง'
  return fallback
}

export function getErrorMessage(caught: unknown, fallback: string) {
  if (caught instanceof ApiError) return caught.message
  if (caught instanceof z.ZodError) return 'รูปแบบข้อมูลจาก server ไม่ถูกต้อง'
  if (caught instanceof TypeError) return 'เชื่อมต่อ server ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่'
  if (caught instanceof Error) return caught.message
  return fallback
}

export async function readJsonResponse<TSchema extends z.ZodTypeAny>(response: Response, schema: TSchema, fallback = 'Request failed'): Promise<z.output<TSchema>> {
  const payload = await readPayload(response)

  if (!response.ok) {
    throw new ApiError(payload?.error ?? fallbackMessage(response.status, fallback), {
      code: payload?.code,
      fieldErrors: payload?.fieldErrors,
      status: response.status,
    })
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    console.error('API Response Schema Validation Error:', JSON.stringify(parsed.error.flatten(), null, 2))
    throw new ApiError('รูปแบบข้อมูลจาก server ไม่ถูกต้อง', {
      code: 'INVALID_RESPONSE',
      fieldErrors: parsed.error.flatten().fieldErrors,
      status: 0,
    })
  }

  return parsed.data
}

export async function readBlobResponse(response: Response, fallback = 'ดาวน์โหลดไฟล์ไม่สำเร็จ') {
  if (!response.ok) {
    const payload = await readPayload(response)
    throw new ApiError(payload?.error ?? fallbackMessage(response.status, fallback), {
      code: payload?.code,
      fieldErrors: payload?.fieldErrors,
      status: response.status,
    })
  }

  return response.blob()
}
