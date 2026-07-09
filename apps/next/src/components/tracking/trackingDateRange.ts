export function trackingCurrentYear() {
  return String(new Date().getFullYear())
}

export function trackingYearStart(year = trackingCurrentYear()) {
  return `${year}-01-01`
}

export function trackingYearEnd(year = trackingCurrentYear()) {
  return `${year}-12-31`
}

export function trackingRangeFromYearMonth(year = trackingCurrentYear(), month = '') {
  const normalizedMonth = month ? month.padStart(2, '0') : ''
  if (!normalizedMonth) {
    return { dateFrom: trackingYearStart(year), dateTo: trackingYearEnd(year) }
  }
  const lastDay = new Date(Date.UTC(Number(year), Number(normalizedMonth), 0)).getUTCDate()
  return {
    dateFrom: `${year}-${normalizedMonth}-01`,
    dateTo: `${year}-${normalizedMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function trackingScopeYear(dateFrom: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom.slice(0, 4) : trackingCurrentYear()
}
