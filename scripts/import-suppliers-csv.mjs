import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const csvPath = process.argv.find((arg) => arg.endsWith('.csv')) ?? 'nsscrap permission and master data   - ผู้ขาย.csv'
const shouldApply = process.argv.includes('--apply')
const defaultOwnerName = 'PLOY'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  }
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

function readRows(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const lines = text.trimEnd().split(/\r?\n/)
  const headers = parseCsvLine(lines[0])
  return {
    headers,
    rows: lines.slice(1).filter((line) => line.trim()).map((line, index) => ({ lineNumber: index + 2, cells: parseCsvLine(line) })),
  }
}

function compactName(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/บริษัทจำกัด|บจก|บจ|หจก|ห้างหุ้นส่วนจำกัด/g, '')
    .replace(/[\s.()（）\-_/\\,]+/g, '')
    .trim()
}

function cleanText(value) {
  const text = String(value ?? '').normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, '').trim()
  return text || null
}

function normalizeBankText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/เงิินสด|เงิดสด/g, 'เงินสด')
    .replace(/กรุุงไทย|กรุยไทย|กรงไทย/g, 'กรุงไทย')
    .replace(/กรุงศรีอยุทธยา/g, 'กรุงศรีอยุธยา')
    .replace(/กสิรไทย/g, 'กสิกรไทย')
    .replace(/พร้้อมเพย์/g, 'พร้อมเพย์')
    .trim()
}

function canonicalBankName(value) {
  const compact = normalizeBankText(value).toLowerCase().replace(/\s+/g, '')
  if (!compact || compact === '-' || compact === '0') return null
  if (/^[0-9\s().-]{9,}$/.test(compact)) return 'พร้อมเพย์'
  if (compact.includes('พร้อมเพย์')) return 'พร้อมเพย์'
  if (compact.includes('เงินสด')) return 'เงินสด'
  if (compact.includes('กสิกร')) return 'ธนาคารกสิกรไทย'
  if (compact.includes('ไทยพาณิชย์') || compact === 'scb') return 'ธนาคารไทยพาณิชย์'
  if (compact.includes('กรุงเทพ') || compact === 'bbl') return 'ธนาคารกรุงเทพ'
  if (compact.includes('กรุงไทย')) return 'ธนาคารกรุงไทย'
  if (compact.includes('กรุงศรี') || compact === 'bay') return 'ธนาคารกรุงศรีอยุธยา'
  if (compact.includes('ttb') || compact.includes('tmb') || compact.includes('ทหารไทย') || compact.includes('ธนชาติ')) return 'ธนาคารทหารไทยธนชาต'
  if (compact.includes('ออมสิน')) return 'ธนาคารออมสิน'
  if (compact.includes('ธกส') || compact.includes('ธกศ')) return 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร'
  if (compact.includes('uob') || compact.includes('ยูโอบี')) return 'ธนาคารยูโอบี'
  if (compact.includes('ซีไอเอ็มบี')) return 'ธนาคารซีไอเอ็มบี ไทย'
  if (compact.includes('เกียรตินาคิน')) return 'ธนาคารเกียรตินาคินภัทร'
  return normalizeBankText(value) || null
}

function parseBank(value) {
  const raw = normalizeBankText(value)
  if (!raw || raw === '-' || raw === '0') return { bankName: null, accountNo: null }

  if (/^[0-9\s().-]{9,}$/.test(raw)) {
    return { bankName: 'พร้อมเพย์', accountNo: raw.replace(/[^0-9\s-]/g, '').trim() }
  }

  const withoutCashPrefix = raw.replace(/^เงินสด\s*-\s*/, '').trim()
  let bankPart = withoutCashPrefix
  let accountPart = ''
  let match = withoutCashPrefix.match(/^(.*?)\s*\/\/\s*(.+)$/)
  if (!match) match = withoutCashPrefix.match(/^(.*?)\s*\/\s*(.+)$/)
  if (!match) match = withoutCashPrefix.match(/^(.*?)(\d[\d\s-]{5,}\d)$/)
  if (match) {
    bankPart = match[1].trim()
    accountPart = match[2].trim()
  }

  const bankName = canonicalBankName(bankPart)
  const promptPayMatch = withoutCashPrefix.match(/พร้อมเพย์\s+(.+)$/)
  const rawAccount = promptPayMatch ? promptPayMatch[1] : accountPart
  const accountNo = rawAccount.replace(/[^0-9\s-]/g, '').trim() || null
  return { bankName, accountNo }
}

function splitPersonName(name) {
  const trimmed = cleanText(name) ?? ''
  const titles = ['นางสาว', 'นาย', 'นาง', 'คุณ', 'MISS', 'MRS', 'MR', 'MS']
  const title = titles.find((item) => trimmed.toUpperCase().startsWith(item.toUpperCase()))
  if (!title) return null
  const rest = trimmed.slice(title.length).trim()
  const parts = rest.split(/\s+/).filter(Boolean)
  return {
    firstName: parts.shift() || rest || '-',
    lastName: parts.join(' ') || '-',
    nameTitle: title,
  }
}

function compactAddress({ address, subdistrict, district, province }) {
  return [address, subdistrict ? `ต.${subdistrict}` : null, district ? `อ.${district}` : null, province ? `จ.${province}` : null]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ') || null
}

function supplierRowFromCsv(row, index, salesLookup) {
  const [, rawName, , , rawPhone, rawBank, rawOwner, rawAddress, rawSubdistrict, rawDistrict, rawProvince] = row.cells
  const name = cleanText(rawName)
  if (!name) throw new Error(`แถว ${row.lineNumber}: ไม่มีชื่อผู้ขาย`)
  const person = splitPersonName(name)
  const type = person ? 'บุคคล' : 'นิติบุคคล'
  const taxId = null
  const phoneDigits = String(rawPhone ?? '').replace(/[^\d+().\s-]/g, '').trim()
  const ownerName = cleanText(rawOwner) ?? defaultOwnerName
  const salesperson = salesLookup.get(ownerName.toUpperCase())
  if (!salesperson) throw new Error(`แถว ${row.lineNumber}: ไม่พบผู้ดูแล ${ownerName}`)
  const bank = parseBank(rawBank)
  const address = cleanText(rawAddress)
  const subdistrict = cleanText(rawSubdistrict)
  const district = cleanText(rawDistrict)
  const province = cleanText(rawProvince)
  const id = `SU${String(index + 1).padStart(4, '0')}`

  return {
    id,
    code: id,
    name,
    tax_id: taxId,
    phone: phoneDigits || null,
    address: compactAddress({ address, subdistrict, district, province }),
    bank_name: bank.bankName,
    bank_account: bank.accountNo,
    bank_account_name: name,
    sales_rep: salesperson.name,
    credit_term: 0,
    branch_id: null,
    notes: null,
    active: true,
    sales_id: salesperson.id,
    type,
    credit_limit: null,
    market_scope: 'ในประเทศ',
    name_title: person?.nameTitle ?? null,
    first_name: person?.firstName ?? null,
    last_name: person?.lastName ?? null,
    address_no: address,
    address_moo: null,
    address_village: null,
    address_road: null,
    address_subdistrict: subdistrict,
    address_district: district,
    address_province: province,
    address_postal_code: null,
    address_country: 'ไทย',
    country_code: 'TH',
    address_line1: address,
    address_line2: null,
    address_city: district,
    address_state_region: province,
    address_postal_code_intl: null,
    source_line: row.lineNumber,
    source_kind: 'csv',
    missing_tax: true,
    owner_placeholder: !cleanText(rawOwner),
  }
}

function mergeFallbackBank(row, fallback) {
  if (!fallback || (row.bank_name && row.bank_account)) return row
  const oldBank = parseBank([fallback.bank_name, fallback.bank_account].filter(Boolean).join(' // '))
  return {
    ...row,
    bank_name: row.bank_name ?? oldBank.bankName,
    bank_account: row.bank_account ?? oldBank.accountNo,
  }
}

async function insertJsonRows(client, rows) {
  await client.query(`
    insert into public.suppliers (
      id, code, name, tax_id, phone, address, bank_name, bank_account, bank_account_name,
      sales_rep, credit_term, branch_id, notes, active, created_at, updated_at, sales_id,
      type, credit_limit, market_scope, name_title, first_name, last_name,
      address_no, address_moo, address_village, address_road, address_subdistrict,
      address_district, address_province, address_postal_code, address_country,
      country_code, address_line1, address_line2, address_city, address_state_region,
      address_postal_code_intl
    )
    select
      id, code, name, tax_id, phone, address, bank_name, bank_account, bank_account_name,
      sales_rep, credit_term, branch_id, notes, active, now(), now(), sales_id,
      type, credit_limit, market_scope, name_title, first_name, last_name,
      address_no, address_moo, address_village, address_road, address_subdistrict,
      address_district, address_province, address_postal_code, address_country,
      country_code, address_line1, address_line2, address_city, address_state_region,
      address_postal_code_intl
    from jsonb_to_recordset($1::jsonb) as x(
      id text, code text, name text, tax_id text, phone text, address text, bank_name text,
      bank_account text, bank_account_name text, sales_rep text, credit_term int,
      branch_id text, notes text, active boolean, sales_id text, type text,
      credit_limit numeric, market_scope text, name_title text, first_name text, last_name text,
      address_no text, address_moo text, address_village text, address_road text,
      address_subdistrict text, address_district text, address_province text,
      address_postal_code text, address_country text, country_code text, address_line1 text,
      address_line2 text, address_city text, address_state_region text,
      address_postal_code_intl text
    )
  `, [JSON.stringify(rows)])
}

async function main() {
  loadEnv()
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (!connectionString) throw new Error('DATABASE_URL or SUPABASE_DB_URL is required')
  const { rows } = readRows(path.resolve(csvPath))
  const client = new Client({ connectionString })
  await client.connect()

  const salesRows = await client.query('select id, code, name from public.salespersons where active is not false')
  const salesLookup = new Map()
  for (const row of salesRows.rows) {
    salesLookup.set(String(row.name).toUpperCase(), row)
    salesLookup.set(String(row.code).toUpperCase(), row)
    salesLookup.set(String(row.id).toUpperCase(), row)
  }
  const defaultSalesperson = salesLookup.get(defaultOwnerName.toUpperCase())
  if (!defaultSalesperson) throw new Error(`ไม่พบผู้ดูแลเริ่มต้น ${defaultOwnerName}`)
  const importedRows = rows.map((row, index) => supplierRowFromCsv(row, index, salesLookup))
  const importedByName = new Map()
  for (const row of importedRows) {
    const key = compactName(row.name)
    if (!importedByName.has(key)) importedByName.set(key, row.id)
  }

  const existingSuppliers = await client.query('select * from public.suppliers')
  const existingById = new Map(existingSuppliers.rows.map((row) => [row.id, row]))
  const existingByName = new Map()
  for (const row of existingSuppliers.rows) {
    const key = compactName(row.name)
    if (!key) continue
    const existing = existingByName.get(key)
    const score = (row.bank_name ? 1 : 0) + (row.bank_account ? 2 : 0)
    const existingScore = existing ? (existing.bank_name ? 1 : 0) + (existing.bank_account ? 2 : 0) : -1
    if (!existing || score > existingScore) existingByName.set(key, row)
  }
  for (const row of importedRows) {
    const merged = mergeFallbackBank(row, existingByName.get(compactName(row.name)))
    row.bank_name = merged.bank_name
    row.bank_account = merged.bank_account
  }
  const referenced = await client.query(`
    select distinct supplier_id from (
      select supplier_id from public.assets where supplier_id is not null
      union select supplier_id from public.payments where supplier_id is not null
      union select supplier_id from public.po_buys where supplier_id is not null
      union select supplier_id from public.purchase_bills where supplier_id is not null
      union select supplier_id from public.trading_deals where supplier_id is not null
    ) refs
  `)
  const referenceMap = new Map()
  const preservedRows = []
  let nextNumber = importedRows.length + 1
  for (const { supplier_id: oldId } of referenced.rows) {
    const oldRow = existingById.get(oldId)
    if (!oldRow) continue
    const matchedNewId = importedByName.get(compactName(oldRow.name))
    if (matchedNewId) {
      referenceMap.set(oldId, { newId: matchedNewId, matched: true, oldName: oldRow.name })
      continue
    }
    const newId = `SU${String(nextNumber).padStart(4, '0')}`
    nextNumber += 1
    const normalizedOldBank = parseBank([oldRow.bank_name, oldRow.bank_account].filter(Boolean).join(' // '))
    preservedRows.push({
      ...oldRow,
      id: newId,
      code: newId,
      tax_id: String(oldRow.tax_id ?? '').replace(/\D/g, '').length === 13 ? oldRow.tax_id : null,
      bank_name: normalizedOldBank.bankName,
      bank_account: normalizedOldBank.accountNo ?? oldRow.bank_account,
      active: false,
      sales_id: oldRow.sales_id ?? defaultSalesperson.id,
      sales_rep: oldRow.sales_rep ?? defaultSalesperson.name,
      notes: oldRow.notes,
      source_kind: 'preserved-reference',
    })
    referenceMap.set(oldId, { newId, matched: false, oldName: oldRow.name })
  }

  const allRows = [...importedRows, ...preservedRows]
  const bankNames = [...new Set(allRows.map((row) => row.bank_name).filter(Boolean))]
  const bankRows = await client.query('select name from public.bank_names')
  const existingBankNames = new Set(bankRows.rows.map((row) => row.name))
  const missingBanks = bankNames.filter((name) => !existingBankNames.has(name))
  const missingTaxCount = importedRows.filter((row) => row.missing_tax).length
  const ownerPlaceholderCount = importedRows.filter((row) => row.owner_placeholder).length

  const summary = {
    apply: shouldApply,
    csvRows: importedRows.length,
    preservedReferencedRows: preservedRows.length,
    finalSupplierRows: allRows.length,
    missingTaxCount,
    ownerPlaceholderCount,
    missingBanks,
    referencedSuppliers: referenced.rows.length,
    referencedMatched: [...referenceMap.values()].filter((row) => row.matched).length,
    referencedPreserved: [...referenceMap.values()].filter((row) => !row.matched).length,
    backupSuffix: stamp,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!shouldApply) {
    await client.end()
    return
  }

  await client.query('begin')
  try {
    await client.query('create schema if not exists maintenance')
    await client.query(`create table maintenance.supplier_replace_backup_${stamp} as table public.suppliers`)
    await client.query(`
      create table maintenance.supplier_replace_fk_backup_${stamp} (
        table_name text not null,
        row_id text not null,
        old_supplier_id text,
        old_supplier_name text,
        new_supplier_id text,
        matched boolean
      )
    `)
    await client.query(`
      create temp table tmp_supplier_reference_map (
        old_supplier_id text primary key,
        old_supplier_name text,
        new_supplier_id text,
        matched boolean
      ) on commit drop
    `)
    for (const [oldId, row] of referenceMap) {
      await client.query('insert into tmp_supplier_reference_map values ($1, $2, $3, $4)', [oldId, row.oldName, row.newId, row.matched])
    }
    for (const tableName of ['assets', 'payments', 'po_buys', 'purchase_bills', 'trading_deals']) {
      await client.query(`
        insert into maintenance.supplier_replace_fk_backup_${stamp}
        select $1, t.id, t.supplier_id, m.old_supplier_name, m.new_supplier_id, m.matched
        from public.${tableName} t
        left join tmp_supplier_reference_map m on m.old_supplier_id = t.supplier_id
        where t.supplier_id is not null
      `, [tableName])
      await client.query(`update public.${tableName} set supplier_id = null where supplier_id is not null`)
    }
    await client.query('delete from public.suppliers')

    for (const name of missingBanks) {
      const id = name === 'เงินสด' ? 'BANK-CASH'
        : name === 'พร้อมเพย์' ? 'BANK-PROMPTPAY'
          : name === 'ธนาคารออมสิน' ? 'BANK-GSB'
            : name === 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร' ? 'BANK-BAAC'
              : `BANK-CUSTOM-${Math.abs([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0))}`
      await client.query(`
        insert into public.bank_names (id, name, active, created_at, updated_at)
        values ($1, $2, true, now(), now())
        on conflict (name) do update set active = true, updated_at = now()
      `, [id, name])
    }

    await insertJsonRows(client, allRows)

    for (const tableName of ['assets', 'payments', 'po_buys', 'purchase_bills', 'trading_deals']) {
      await client.query(`
        update public.${tableName} t
        set supplier_id = b.new_supplier_id
        from maintenance.supplier_replace_fk_backup_${stamp} b
        where b.table_name = $1 and b.row_id = t.id and b.new_supplier_id is not null
      `, [tableName])
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
