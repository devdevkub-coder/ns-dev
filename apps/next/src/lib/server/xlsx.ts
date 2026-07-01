import readXlsxFile from 'read-excel-file/node'
import writeXlsxFile, { type SheetData } from 'write-excel-file/node'

type CellValue = string | number | boolean | Date | null | undefined

type SheetColumn = {
  wch?: number
}

export type WorkSheet = {
  '!autofilter'?: { ref: string }
  '!cols'?: SheetColumn[]
  '!freeze'?: { xSplit: number; ySplit: number }
  '!rows'?: { hpt?: number }[]
  rows: CellValue[][]
}

export type WorkBook = {
  SheetNames: string[]
  Sheets: Record<string, WorkSheet>
}

type JsonSheetOptions = {
  header?: string[]
}

function normalizeCell(value: unknown): CellValue {
  if (value === null || value === undefined) return undefined
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim()
}

function objectRowsToSheet(rows: Record<string, unknown>[], options?: JsonSheetOptions): WorkSheet {
  const headers = options?.header ?? Array.from(rows.reduce((keys, row) => {
    Object.keys(row).forEach((key) => keys.add(key))
    return keys
  }, new Set<string>()))

  return {
    rows: [
      headers,
      ...rows.map((row) => headers.map((header) => normalizeCell(row[header]))),
    ],
  }
}

function arrayRowsToSheet(rows: unknown[][]): WorkSheet {
  return {
    rows: rows.map((row) => row.map(normalizeCell)),
  }
}

function rangeRef(columnCount: number, rowCount: number) {
  const lastColumn = Math.max(0, columnCount - 1)
  let columnName = ''
  let column = lastColumn
  do {
    columnName = String.fromCharCode(65 + (column % 26)) + columnName
    column = Math.floor(column / 26) - 1
  } while (column >= 0)
  return `A1:${columnName}${Math.max(1, rowCount)}`
}

function sheetToData(sheet: WorkSheet): SheetData {
  const headerStyle = {
    backgroundColor: '#f8fafc',
    fontWeight: 'bold' as const,
  }

  return sheet.rows.map((row, rowIndex) => row.map((value) => ({
    alignVertical: 'top' as const,
    ...(rowIndex === 0 ? headerStyle : {}),
    value: value ?? undefined,
  })))
}

export async function readWorkbook(buffer: Buffer): Promise<WorkBook> {
  const sheets = await readXlsxFile(buffer)
  const workbook: WorkBook = { SheetNames: [], Sheets: {} }

  for (const sheet of sheets) {
    workbook.SheetNames.push(sheet.sheet)
    workbook.Sheets[sheet.sheet] = { rows: sheet.data as CellValue[][] }
  }

  return workbook
}

export const XLSX = {
  read: readWorkbook,
  utils: {
    aoa_to_sheet: arrayRowsToSheet,
    book_append_sheet(workbook: WorkBook, sheet: WorkSheet, sheetName: string) {
      workbook.SheetNames.push(sheetName)
      workbook.Sheets[sheetName] = sheet
    },
    book_new(): WorkBook {
      return { SheetNames: [], Sheets: {} }
    },
    json_to_sheet: objectRowsToSheet,
    sheet_to_json<T extends Record<string, unknown> | unknown[]>(sheet: WorkSheet, options?: { blankrows?: boolean; defval?: unknown; header?: 1 }): T[] {
      const rows = options?.blankrows === false
        ? sheet.rows.filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''))
        : sheet.rows

      if (options?.header === 1) return rows as T[]

      const headers = rows[0]?.map(normalizeHeader) ?? []
      return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [
        header,
        row[index] ?? options?.defval ?? '',
      ]))) as T[]
    },
  },
  async write(workbook: WorkBook, _options: { bookType: 'xlsx'; type: 'buffer' }): Promise<Buffer> {
    const sheets = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      return {
        columns: sheet['!cols']?.map((column) => ({ width: column.wch })) ?? [],
        data: sheetToData(sheet),
        sheet: sheetName,
        stickyRowsCount: sheet['!freeze']?.ySplit ?? undefined,
      }
    })

    return writeXlsxFile(sheets).toBuffer()
  },
}

export function applyWorksheetTableLayout(sheet: WorkSheet, columnCount: number, rowCount: number) {
  if (columnCount <= 0 || rowCount <= 0) return
  sheet['!autofilter'] = { ref: rangeRef(columnCount, rowCount) }
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 }
  sheet['!rows'] = [{ hpt: 22 }]
}
