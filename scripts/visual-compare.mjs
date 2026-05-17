import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(new URL('..', import.meta.url).pathname)
const reportDir = join(root, 'reports/frontend-visual-audit')
const legacyPort = Number(process.env.LEGACY_PORT || 5180)
const vuePort = Number(process.env.VUE_PORT || 5179)
const viewKey = process.argv[2] || 'dailyReport'

const pages = {
  dashboard: { legacyLabel: 'Dashboard', vuePath: '/', waitText: 'Financial Dashboard' },
  dailyReport: { legacyLabel: 'Daily Report (รายงานประจำวัน)', vuePath: '/daily-report', waitText: 'Daily Report' },
  ownerDaily: { legacyLabel: 'Owner Daily Control (เปิดทุกเช้า)', vuePath: '/owner-daily', waitText: 'Owner Daily Control' },
  anomalyDetector: { legacyLabel: 'ตรวจจับความผิดปกติ', vuePath: '/anomaly-detector', waitText: 'ตรวจจับความผิดปกติ' },
  profitCostAnalysis: { legacyLabel: 'Profit & Cost Analysis', vuePath: '/profit-cost-analysis', waitText: 'Profit & Cost Analysis' },
  pendingSales: { legacyLabel: 'รายการรอขาย', vuePath: '/sales/pending', waitText: 'รายการรอขาย' },
  salesPlan: { legacyLabel: 'วางแผนการขาย (LME)', vuePath: '/sales-plan', waitText: 'วางแผนการขาย' },
  salesCommission: { legacyLabel: 'Sales Tracking Dashboard', vuePath: '/sales-commission', waitText: 'Sales Tracking Dashboard' },
  cashFlowCalendar: { legacyLabel: 'Cash Flow Calendar', vuePath: '/cash-flow-calendar', waitText: 'Cash Flow Calendar' },
  businessCalendar: { legacyLabel: 'Business Calendar', vuePath: '/business-calendar', waitText: 'Business Calendar' },
  cashOthersSummary: { legacyLabel: 'Cash & Others Summary', vuePath: '/cash-others-summary', waitText: 'Cash & Others Summary' },
  customerTracking: { legacyLabel: 'Customer Tracking', vuePath: '/tracking/customer', waitText: 'Customer Tracking' },
  supplierTracking: { legacyLabel: 'Supplier Tracking', vuePath: '/tracking/supplier', waitText: 'Supplier Tracking' },
  productTracking: { legacyLabel: 'Product Tracking', vuePath: '/tracking/product', waitText: 'Product Tracking' },
  purchase: { legacyLabel: 'บิลรับซื้อ', vuePath: '/purchase', waitText: 'บิลรับซื้อ' },
  sales: { legacyLabel: 'บิลขาย', vuePath: '/sales', waitText: 'บิลขาย' },
  stockIssue: { legacyLabel: 'เบิกออกรอบิล (Pending Sale)', vuePath: '/sales/stock-issue', waitText: 'เบิกออกรอบิล' },
  paymentApproval: { legacyLabel: 'อนุมัติโอนเงิน (Payment Approval)', vuePath: '/daily/payment-approval', waitText: 'อนุมัติโอนเงิน' },
  payment: { legacyLabel: 'จ่ายเงิน Supplier', vuePath: '/purchase/payments', waitText: 'จ่ายเงิน Supplier' },
  receiptVoucher: { legacyLabel: 'ใบสำคัญรับเงิน (Receipt Voucher)', vuePath: '/purchase/receipt-vouchers', waitText: 'ใบสำคัญรับเงิน' },
  receipt: { legacyLabel: 'รับเงิน Customer', vuePath: '/sales/receipts', waitText: 'รับเงิน Customer' },
  transfer: { legacyLabel: 'โอนเงินระหว่างบัญชี', vuePath: '/daily/transfer', waitText: 'โอนเงินระหว่างบัญชี' },
  expense: { legacyLabel: 'ค่าใช้จ่าย', vuePath: '/daily/expense', waitText: 'ค่าใช้จ่าย' },
  pettyAdvance: { legacyLabel: 'เงินสำรองจ่าย / กู้กรรมการ', vuePath: '/daily/petty-advance', waitText: 'เงินสำรองจ่าย' },
  expenseDashboard: { legacyLabel: 'Dashboard ค่าใช้จ่าย', vuePath: '/daily/expense-dashboard', waitText: 'Dashboard ค่าใช้จ่าย' },
  stockTransfer: { legacyLabel: 'โอนสินค้าระหว่างสาขา', vuePath: '/stock/transfer', waitText: 'โอนสินค้าระหว่างสาขา' },
  billSwapHistory: { legacyLabel: 'ประวัติเปลี่ยน Supplier ในบิล', vuePath: '/daily/bill-swap-history', waitText: 'ประวัติเปลี่ยน Supplier' },
  production: { legacyLabel: 'ใบสั่งผลิต', vuePath: '/production/orders', waitText: 'ใบสั่งผลิต' },
  productionDashboard: { legacyLabel: 'Production Dashboard', vuePath: '/production/dashboard', waitText: 'Production Dashboard' },
  wipReport: { legacyLabel: 'WIP คงเหลือ', vuePath: '/production/wip-report', waitText: 'WIP คงเหลือ' },
  productionReport: { legacyLabel: 'รายงานการผลิต / Yield', vuePath: '/production/report', waitText: 'รายงานการผลิต' },
  productionCostReport: { legacyLabel: 'Production Cost Report', vuePath: '/production/production-cost-report', waitText: 'Production Cost Report' },
  yieldLossReport: { legacyLabel: 'Yield/Loss + Abnormal', vuePath: '/production/yield-loss-report', waitText: 'Yield/Loss' },
  machineUtil: { legacyLabel: 'Machine Utilization', vuePath: '/production/machine-utilization', waitText: 'Machine Utilization' },
  poBuy: { legacyLabel: 'PO Buy (จองซื้อ)', vuePath: '/purchase/po-buy', waitText: 'PO Buy' },
  poSell: { legacyLabel: 'PO Sell (จองขาย)', vuePath: '/sales/po-sell', waitText: 'PO Sell' },
  costPool: { legacyLabel: 'Cost Pool', vuePath: '/dual-costing/cost-pool', waitText: 'Cost Pool' },
  costAllocator: { legacyLabel: 'Cost Allocator', vuePath: '/dual-costing/cost-allocator', waitText: 'Cost Allocator' },
  matchLog: { legacyLabel: 'Match Log', vuePath: '/dual-costing/match-log', waitText: 'Match Log' },
  dealMargin: { legacyLabel: 'Deal Margin Report', vuePath: '/dual-costing/deal-margin', waitText: 'Deal Margin' },
  compareMargin: { legacyLabel: 'Compare Deal vs Stock', vuePath: '/dual-costing/compare-margin', waitText: 'Compare Deal vs Stock' },
  tradingDashboard: { legacyLabel: 'Trading Dashboard', vuePath: '/trading/dashboard', waitText: 'Trading Dashboard' },
  tradingMatching: { legacyLabel: 'Trading Matching / จับคู่ดีล', vuePath: '/trading/matching', waitText: 'Trading Matching' },
  poOutstanding: { legacyLabel: 'PO ซื้อ/ขาย คงเหลือ', vuePath: '/po-reports/outstanding', waitText: 'PO ซื้อ/ขาย คงเหลือ' },
  ar: { legacyLabel: 'ลูกหนี้ (AR)', vuePath: '/finance/ar', waitText: 'ลูกหนี้' },
  ap: { legacyLabel: 'เจ้าหนี้ (AP)', vuePath: '/finance/ap', waitText: 'เจ้าหนี้' },
  bank: { legacyLabel: 'Cash / Bank Statement', vuePath: '/finance/bank', waitText: 'Cash / Bank Statement' },
  cashPosition: { legacyLabel: 'Cash Position', vuePath: '/finance/cash-position', waitText: 'Cash Position' },
  supplierAdvance: { legacyLabel: 'จ่ายล่วงหน้า Supplier', vuePath: '/finance/supplier-advance', waitText: 'จ่ายล่วงหน้า Supplier' },
  customerAdvance: { legacyLabel: 'รับล่วงหน้าจาก Customer', vuePath: '/finance/customer-advance', waitText: 'รับล่วงหน้าจาก Customer' },
  intlTransfer: { legacyLabel: 'โอนเงินต่างประเทศ', vuePath: '/finance/foreign/intl-transfer', waitText: 'โอนเงินต่างประเทศ' },
  overseasReceipt: { legacyLabel: 'รับเงินจากต่างประเทศ', vuePath: '/finance/foreign/overseas-receipt', waitText: 'รับเงินจากต่างประเทศ' },
  fxRate: { legacyLabel: 'FX Rate Management', vuePath: '/finance/foreign/fx-rate', waitText: 'FX Rate Management' },
  fcdLedger: { legacyLabel: 'FCD Ledger', vuePath: '/finance/foreign/fcd-ledger', waitText: 'FCD Ledger' },
  fxGainLossReport: { legacyLabel: 'FX Gain/Loss Report', vuePath: '/finance/foreign/fx-gain-loss-report', waitText: 'FX Gain/Loss Report' },
  bankRecon: { legacyLabel: 'Bank Reconciliation', vuePath: '/finance/foreign/bank-reconciliation', waitText: 'Bank Reconciliation' },
  stockBalance: { legacyLabel: 'สต๊อกคงเหลือ', vuePath: '/stock/balance', waitText: 'สต๊อกคงเหลือ' },
  stockLedger: { legacyLabel: 'Stock Ledger', vuePath: '/stock/ledger', waitText: 'Stock Ledger' },
  statusConvert: { legacyLabel: 'ปรับสถานะสินค้า (RM→FG)', vuePath: '/stock/status-convert', waitText: 'ปรับสถานะสินค้า' },
  gradeAdjustment: { legacyLabel: 'Grade Adjustment / ปรับเกรด', vuePath: '/stock/convert', waitText: 'Grade Adjustment' },
  stockAdjust: { legacyLabel: 'นับสต๊อก / Stock Count Adjust', vuePath: '/stock/adjust', waitText: 'Stock Count Adjust' },
  customerReturn: { legacyLabel: 'Customer Return / ของคืน', vuePath: '/stock/customer-return', waitText: 'Customer Return' },
  reports: { legacyLabel: 'รายงานทั้งหมด', vuePath: '/reports', waitText: 'รายงานทั้งหมด' },
  finDashboard: { legacyLabel: 'Financial Dashboard', vuePath: '/finance-accounting/financial-dashboard', waitText: 'Financial Dashboard' },
  cashFlowAnalysis: { legacyLabel: 'Cash Flow Analysis', vuePath: '/finance-accounting/cash-flow-analysis', waitText: 'Cash Flow Analysis' },
  cashFlowForecast: { legacyLabel: 'CF Forecast Calendar', vuePath: '/finance-accounting/cf-forecast-calendar', waitText: 'CF Forecast Calendar' },
  workingCapital: { legacyLabel: 'Working Capital Analysis', vuePath: '/finance-accounting/working-capital', waitText: 'Working Capital Analysis' },
  stockFinance: { legacyLabel: 'Stock Finance Analysis', vuePath: '/finance-accounting/stock-finance', waitText: 'Stock Finance Analysis' },
  profitLeak: { legacyLabel: 'Profit Leak Dashboard', vuePath: '/finance-accounting/profit-leak', waitText: 'Profit Leak Dashboard' },
  taxVAT: { legacyLabel: 'Tax / VAT / WHT', vuePath: '/finance-accounting/tax-vat-wht', waitText: 'Tax / VAT / WHT' },
  plStatement: { legacyLabel: 'งบกำไรขาดทุน (P&L)', vuePath: '/finance-accounting/pl-statement', waitText: 'งบกำไรขาดทุน' },
  balanceSheet: { legacyLabel: 'งบดุล (Balance Sheet)', vuePath: '/finance-accounting/balance-sheet', waitText: 'งบดุล' },
  cashFlowStatement: { legacyLabel: 'งบกระแสเงินสด', vuePath: '/finance-accounting/cash-flow-statement', waitText: 'งบกระแสเงินสด' },
  assetRegister: { legacyLabel: 'Fixed Assets / ทรัพย์สิน', vuePath: '/finance-accounting/asset-register', waitText: 'Fixed Asset Register' },
  depreciation: { legacyLabel: 'ค่าเสื่อมราคา', vuePath: '/finance-accounting/depreciation', waitText: 'Depreciation' },
  assetDisposal: { legacyLabel: 'จำหน่ายทรัพย์สิน', vuePath: '/finance-accounting/asset-disposal', waitText: 'Asset Disposal' },
  loanContracts: { legacyLabel: 'Loan / Leasing / BSL', vuePath: '/finance-accounting/loan-contracts', waitText: 'Loan / Leasing' },
  loanDashboard: { legacyLabel: 'Loan Dashboard', vuePath: '/finance-accounting/loan-dashboard', waitText: 'Loan Dashboard' },
  equityMaint: { legacyLabel: 'Equity / ทุนจดทะเบียน', vuePath: '/finance-accounting/equity-maint', waitText: 'Equity' },
  openingBalance: { legacyLabel: 'Opening Balance / ตั้งต้นยอด', vuePath: '/finance-accounting/opening-balance', waitText: 'Opening Balance' },
  historicalData: { legacyLabel: 'ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 (ก่อน Go-Live)', vuePath: '/finance-accounting/historical-data', waitText: 'ข้อมูลย้อนหลัง' },
  changePassword: { legacyLabel: 'เปลี่ยน Password ของฉัน', vuePath: '/admin/change-password', waitText: 'เปลี่ยน Password' },
  transactionLedger: { legacyLabel: 'Transaction Ledger (เช็คเงินเข้า-ออก)', vuePath: '/admin/transaction-ledger', waitText: 'Transaction Ledger' },
  audit: { legacyLabel: 'Audit Log', vuePath: '/admin/audit', waitText: 'เวลา' },
  mdCustomer: { legacyLabel: 'ลูกค้า', vuePath: '/master-data/customers', waitText: 'ลูกค้า' },
  mdSalesperson: { legacyLabel: 'พนักงานขาย (Sales)', vuePath: '/master-data/salespersons', waitText: 'พนักงานขาย' },
  mdSupplier: { legacyLabel: 'ผู้ขาย', vuePath: '/master-data/suppliers', waitText: 'ผู้ขาย' },
  mdProduct: { legacyLabel: 'สินค้า', vuePath: '/master-data/products', waitText: 'สินค้า' },
  mdBranch: { legacyLabel: 'สาขา / คลัง', vuePath: '/master-data/branches', waitText: 'สาขา' },
  mdWarehouse: { legacyLabel: 'สาขา / คลัง', vuePath: '/master-data/warehouses', waitText: 'คลังสินค้า' },
  mdAccount: { legacyLabel: 'บัญชีเงิน', vuePath: '/master-data/accounts', waitText: 'บัญชีเงิน' },
  mdChannel: { legacyLabel: 'ช่องทางซื้อ/ขาย', vuePath: '/master-data/channels', waitText: 'ช่องทางซื้อ/ขาย' },
  mdExpense: { legacyLabel: 'หมวดค่าใช้จ่าย', vuePath: '/master-data/expense-categories', waitText: 'หมวดค่าใช้จ่าย' },
  mdDirector: { legacyLabel: 'กรรมการ/พนักงาน', vuePath: '/master-data/directors', waitText: 'กรรมการ/พนักงาน' },
  mdMachine: { legacyLabel: 'เครื่องจักร', vuePath: '/master-data/machines', waitText: 'เครื่องจักร' },
  mdProductionLine: { legacyLabel: 'Production Line', vuePath: '/master-data/production-lines', waitText: 'Production Line' },
  mdCurrency: { legacyLabel: 'สกุลเงิน', vuePath: '/master-data/currencies', waitText: 'สกุลเงิน' },
  mdBeneficiary: { legacyLabel: 'ผู้รับเงินต่างประเทศ', vuePath: '/master-data/beneficiaries', waitText: 'ผู้รับเงินต่างประเทศ' },
  mdPaymentMethod: { legacyLabel: 'วิธีจ่าย/รับเงิน', vuePath: '/master-data/payment-methods', waitText: 'วิธีจ่าย/รับเงิน' },
  mdRemittancePurpose: { legacyLabel: 'วัตถุประสงค์โอน', vuePath: '/master-data/remittance-purposes', waitText: 'วัตถุประสงค์โอน' },
  mdImport: { legacyLabel: 'Import Master จาก Excel', vuePath: '/master-data/import', waitText: 'Import Master' },
  importTxn: { legacyLabel: 'Import บิลซื้อ/บิลขาย', vuePath: '/master-data/import-transactions', waitText: 'Import บิลซื้อ' },
  companyProfile: { legacyLabel: 'ข้อมูลบริษัท (สำหรับใบพิมพ์)', vuePath: '/admin/company-profile', waitText: 'ข้อมูลบริษัท' },
  userPermission: { legacyLabel: 'Users & Permissions', vuePath: '/admin/users-permissions', waitText: 'Users' },
  userActivity: { legacyLabel: 'User Activity Log', vuePath: '/admin/user-activity', waitText: 'User Activity' },
  backup: { legacyLabel: 'Backup / Restore (สำคัญ)', vuePath: '/admin/migration-tools', waitText: 'Backup' },
}

const target = pages[viewKey]
if (!target) {
  console.error(`Unknown view key: ${viewKey}`)
  console.error(`Available: ${Object.keys(pages).join(', ')}`)
  process.exit(1)
}

mkdirSync(reportDir, { recursive: true })

function contentType(filePath) {
  const ext = extname(filePath)
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function startLegacyServer() {
  const legacyRoot = join(root, 'old-apps/legacy')
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${legacyPort}`)
    const requestPath = url.pathname === '/' ? '/index.html' : url.pathname
    const filePath = join(legacyRoot, requestPath)
    if (!filePath.startsWith(legacyRoot) || !existsSync(filePath)) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    res.setHeader('content-type', contentType(filePath))
    createReadStream(filePath).pipe(res)
  })
  return new Promise((resolveServer) => {
    server.listen(legacyPort, '127.0.0.1', () => resolveServer(server))
  })
}

function startVueServer() {
  const child = spawn('npm', ['run', 'old-vue:dev', '--', '--port', String(vuePort), '--host', '127.0.0.1'], {
    cwd: root,
    env: { ...process.env, VITE_AUTH_BYPASS: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
  return child
}

async function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // retry
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

async function loginLegacy(page) {
  await page.goto(`http://127.0.0.1:${legacyPort}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('ns-aom@nsscrap.com').fill('admin')
  await page.locator('input[type="password"]').fill('admin')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForTimeout(1000)
}

async function openLegacyView(page) {
  await loginLegacy(page)
  await page.evaluate((key) => {
    if (typeof window._setView === 'function') {
      window._setView(key)
    }
  }, viewKey)
  await page.waitForTimeout(800)
}

async function collectText(page) {
  return page.locator('h1,h2,h3,button,th').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const element = node
        const style = window.getComputedStyle(element)
        return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
      })
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 120),
  )
}

async function captureViewport(browser, name, viewport) {
  const legacy = await browser.newPage({ viewport })
  const vue = await browser.newPage({ viewport })

  await openLegacyView(legacy)
  await legacy.screenshot({ path: join(reportDir, `${viewKey}-${name}-legacy.png`), fullPage: true })

  await vue.goto(`http://127.0.0.1:${vuePort}${target.vuePath}`, { waitUntil: 'networkidle' })
  await vue.locator('body').waitFor({ timeout: 15000 })
  await vue.waitForTimeout(1000)
  await vue.screenshot({ path: join(reportDir, `${viewKey}-${name}-vue.png`), fullPage: true })

  const result = {
    viewport,
    legacyText: await collectText(legacy),
    vueText: await collectText(vue),
  }

  await legacy.close()
  await vue.close()
  return result
}

const legacyServer = await startLegacyServer()
const vueServer = startVueServer()

try {
  await waitForHttp(`http://127.0.0.1:${vuePort}/`)
  const browser = await chromium.launch({ headless: true })
  const results = []
  results.push(await captureViewport(browser, 'desktop', { width: 1440, height: 1000 }))
  results.push(await captureViewport(browser, 'mobile', { width: 390, height: 844 }))
  await browser.close()
  const summary = {
    viewKey,
    legacyUrl: `http://127.0.0.1:${legacyPort}/`,
    vueUrl: `http://127.0.0.1:${vuePort}${target.vuePath}`,
    screenshots: [
      `${viewKey}-desktop-legacy.png`,
      `${viewKey}-desktop-vue.png`,
      `${viewKey}-mobile-legacy.png`,
      `${viewKey}-mobile-vue.png`,
    ],
    results,
  }
  console.log(JSON.stringify(summary, null, 2))
} finally {
  vueServer.kill('SIGTERM')
  legacyServer.close()
}
