export function formatPhoneDisplay(value: string | null | undefined) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 9 && digits.startsWith('0')) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  return value
}

export function formatAccountNoDisplay(value: string | null | undefined) {
  if (!value) return null

  return value.replace(/\D/g, '')
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
