export function requireBusinessCode(code: string | null | undefined, context: string): string {
  const normalized = code?.trim()
  if (!normalized) {
    throw new Error(`${context} ไม่มี business code`)
  }
  return normalized
}

export function requireDocumentNo(docNo: string | null | undefined, context: string): string {
  const normalized = docNo?.trim()
  if (!normalized) {
    throw new Error(`${context} ไม่มีเลขเอกสาร`)
  }
  return normalized
}

export function parseInternalBigIntId(value: string | bigint | null | undefined): bigint | null {
  const normalized = String(value ?? '').trim()
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null
  }
  return BigInt(normalized)
}

export function stringifyBusinessValue(
  value: string | number | bigint | null | undefined,
  fallback = '',
): string {
  const normalized = value == null ? '' : String(value).trim()
  return normalized || fallback
}
