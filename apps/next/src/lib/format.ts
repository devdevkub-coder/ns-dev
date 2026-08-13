import { format, parseISO } from 'date-fns'

export function formatDateDisplay(value: string | null | undefined) {
  if (!value) return '-'

  const normalized = value.includes('T') ? value.slice(0, 10) : value
  try {
    return format(parseISO(normalized), 'dd/MM/yyyy')
  } catch {
    return value
  }
}

// มาตรฐานกลางสำหรับวันที่บนหน้าจอ: ใช้ ค.ศ. (คริสต์ศักราช) เสมอ
// อย่าใช้ Intl.DateTimeFormat('th-TH', ...) ตรงๆ ใน component เพราะ locale 'th-TH'
// ใช้ปฏิทินพุทธเป็นค่าเริ่มต้น -> ปีจะออกมาเป็น พ.ศ. (+543) โดยไม่ได้ตั้งใจ
// ฟอร์แมตเตอร์นี้บังคับ calendar: 'gregory' ไว้ที่จุดเดียว เพื่อกันปีหลุดเป็น พ.ศ.
export function formatThaiDateCE(value: Date | string | number, options: Intl.DateTimeFormatOptions = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('th-TH', { ...options, calendar: 'gregory' }).format(date)
}

export function formatThaiMonthYearLabel(year: string | number, month: string | number) {
  return new Intl.DateTimeFormat('th-TH', { calendar: 'gregory', month: 'long', year: 'numeric' }).format(new Date(Number(year), Number(month) - 1, 1))
}

export function formatPhoneDisplay(value: string | null | undefined) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('66')) {
    const localDigits = `0${digits.slice(2)}`
    return localDigits.length === 10
      ? `${localDigits.slice(0, 3)}-${localDigits.slice(3, 6)}-${localDigits.slice(6)}`
      : localDigits
  }
  if (digits.length === 10 && digits.startsWith('0')) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 9 && digits.startsWith('0')) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  return value
}

export function formatAccountNoDisplay(value: string | null | undefined) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 3)} - ${digits.slice(3, 6)} - ${digits.slice(6)}`

  return digits
}

export function sanitizePhoneInput(value: string) {
  let digitCount = 0
  let output = ''

  for (const char of value.replace(/[^0-9+\s().-]/g, '')) {
    if (/\d/.test(char)) {
      if (digitCount >= 15) continue
      digitCount += 1
    }
    output += char
  }

  return output
}

export function sanitizeAccountNoInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 40)
}

export function sanitizeDecimalInput(value: string, maxFractionDigits = 2) {
  let output = ''
  let seenDot = false
  let fractionDigits = 0

  for (const char of value) {
    if (/\d/.test(char)) {
      if (seenDot && fractionDigits >= maxFractionDigits) continue
      output += char
      if (seenDot) fractionDigits += 1
      continue
    }
    if (char === '.' && !seenDot) {
      output += char
      seenDot = true
    }
  }

  return output
}

export function formatDecimalDisplay(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''

  return value.toLocaleString('th-TH', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function formatDecimalDraft(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return value.toFixed(fractionDigits)
}
