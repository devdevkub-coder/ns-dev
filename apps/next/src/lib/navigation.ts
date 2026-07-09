export type NavigationSectionKey =
  | 'main'
  | 'tracking'
  | 'daily'
  | 'production'
  | 'dual-costing'
  | 'finance-debt'
  | 'stock'
  | 'trading'
  | 'po-reports'
  | 'reports'
  | 'finance-accounting'
  | 'company-data'
  | 'master-data'
  | 'admin'

export type NavigationItem = {
  children?: NavigationItem[]
  href: string
  icon: string
  label: string
  pageTitle?: string
  section: NavigationSectionKey
}

export type BreadcrumbItem = {
  href?: string
  label: string
}

const exactPathPermissions: Record<string, string> = {
  '/admin/audit': 'system.audit.view',
  '/admin/company-profile': 'system.settings.manage',
  '/admin/line-settings': 'system.settings.manage',
  '/admin/migration-tools': 'system.backup.manage',
  '/admin/system-settings': 'system.settings.manage',
  '/admin/transaction-ledger': 'finance.cash.view',
  '/admin/roles-permissions': 'system.users.manage',
  '/admin/users': 'system.users.manage',
  '/admin/users-permissions': 'system.users.manage',
  '/api/admin/company-profile': 'system.settings.manage',
  '/api/admin/line-settings': 'system.settings.manage',
  '/api/admin/line-settings/test': 'system.settings.manage',
  '/api/admin/line-groups': 'system.settings.manage',
  '/api/admin/auth-events': 'system.audit.view',
  '/api/admin/transaction-ledger': 'finance.cash.view',
  '/api/admin/users': 'system.users.manage',
  '/api/business-calendar': 'reports.reports.view',
  '/api/cash-others-summary': 'reports.reports.view',
  '/api/cash-flow-calendar': 'reports.reports.view',
  '/api/dashboard': 'reports.reports.view',
  '/api/daily-report': 'reports.reports.view',
  '/api/daily/weight-ticket-dashboard': 'daily.weight_tickets.view',
  '/api/daily/weight-tickets': 'daily.weight_tickets.view',
  '/api/daily/weight-tickets/options': 'daily.weight_tickets.view',
  '/api/daily/weight-tickets/products': 'daily.weight_tickets.view',
  '/api/daily/weight-tickets/stock-options': 'daily.weight_tickets.view',
  '/api/owner-daily': 'reports.reports.view',
  '/api/production/orders': 'production.orders.view',
  '/api/production/orders/options': 'production.orders.view',
  '/api/production/orders/product-stock': 'production.orders.view',
  '/api/production/dashboard': 'production.operations.view',
  '/api/production/production-cost-report': 'production.reports.view',
  '/api/production/report': 'production.reports.view',
  '/api/production/yield-loss-report': 'production.reports.view',
  '/api/profit-cost-analysis': 'reports.reports.view',
  '/api/sales-commission': 'reports.reports.view',
  '/api/sales-plan': 'reports.reports.view',
  '/business-calendar': 'reports.reports.view',
  '/cash-others-summary': 'reports.reports.view',
  '/cash-flow-calendar': 'reports.reports.view',
  '/api/master-data/customers': 'master.customers.view',
  '/api/master-data/customers/export': 'master.customers.export',
  '/api/master-data/customers/import': 'master.customers.create',
  '/api/master-data/products': 'master.products.view',
  '/api/master-data/products/export': 'master.products.export',
  '/api/master-data/suppliers': 'master.suppliers.view',
  '/api/master-data/suppliers/export': 'master.suppliers.export',
  '/api/master-data/suppliers/import': 'master.suppliers.create',
  '/api/master-data/vat-settings': 'system.settings.manage',
  '/api/master-data/wht-settings': 'system.settings.manage',
  '/dashboard': 'reports.reports.view',
  '/daily/weight-ticket-dashboard': 'daily.weight_tickets.view',
  '/daily/weight-ticket-list': 'daily.weight_tickets.view',
  '/daily/weight-tickets': 'daily.weight_tickets.view',
  '/daily-report': 'reports.reports.view',
  '/analytics-dashboard': 'reports.reports.view',
  '/master-data/customers': 'master.customers.view',
  '/master-data/products': 'master.products.view',
  '/master-data/impurity-products': 'master.products.view',
  '/master-data/suppliers': 'master.suppliers.view',
  '/owner-daily': 'reports.reports.view',
  '/production/orders': 'production.orders.view',
  '/production/dashboard': 'production.operations.view',
  '/production/production-cost-report': 'production.reports.view',
  '/production/report': 'production.reports.view',
  '/production/yield-loss-report': 'production.reports.view',
  '/profit-cost-analysis': 'reports.reports.view',
  '/sales-commission': 'reports.reports.view',
  '/sales-plan': 'reports.reports.view',
}

const prefixPathPermissions: Array<[string, string]> = [
  ['/api/master-data/customers/', 'master.customers.update'],
  ['/api/master-data/products/', 'master.products.update'],
  ['/api/master-data/suppliers/', 'master.suppliers.update'],
  ['/api/master-data/vat-settings/', 'system.settings.manage'],
  ['/api/master-data/wht-settings/', 'system.settings.manage'],
  ['/api/daily/weight-tickets/', 'daily.weight_tickets.view'],
  ['/daily/weight-ticket-list/', 'daily.weight_tickets.view'],
  ['/daily/weight-tickets/', 'daily.weight_tickets.view'],
  ['/api/production/orders/', 'production.orders.view'],
  ['/api/daily/', 'finance.cash.view'],
  ['/api/dual-costing/', 'finance.cash.view'],
  ['/api/finance/', 'finance.cash.view'],
  ['/api/finance-accounting/', 'finance.financials.view'],
  ['/api/master-data/', 'master.reference.view'],
  ['/api/po-reports/', 'reports.reports.view'],
  ['/api/production/', 'production.operations.view'],
  ['/api/purchase/', 'finance.cash.view'],
  ['/api/sales/', 'finance.cash.view'],
  ['/api/stock/', 'stock.ledger.view'],
  ['/api/tracking/', 'reports.reports.view'],
  ['/api/trading/', 'finance.cash.view'],
  ['/admin/system-manual/', 'system.settings.manage'],
  ['/daily/', 'finance.cash.view'],
  ['/dual-costing/', 'finance.cash.view'],
  ['/finance-accounting/', 'finance.financials.view'],
  ['/finance/', 'finance.cash.view'],
  ['/master-data/', 'master.reference.view'],
  ['/po-reports/', 'reports.reports.view'],
  ['/production/', 'production.operations.view'],
  ['/purchase/', 'finance.cash.view'],
  ['/reports', 'reports.reports.view'],
  ['/sales/', 'finance.cash.view'],
  ['/stock/', 'stock.ledger.view'],
  ['/tracking/', 'reports.reports.view'],
  ['/trading/', 'finance.cash.view'],
]

export function permissionForPath(pathname: string) {
  const normalizedPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname
  const exactPermission = exactPathPermissions[normalizedPath]

  if (exactPermission) {
    return exactPermission
  }

  if (normalizedPath.startsWith('/api/master-data/customers/') && normalizedPath.endsWith('/status')) {
    return 'master.customers.status'
  }

  if (normalizedPath.startsWith('/api/master-data/products/') && normalizedPath.endsWith('/status')) {
    return 'master.products.status'
  }

  if (normalizedPath.startsWith('/api/master-data/suppliers/') && normalizedPath.endsWith('/status')) {
    return 'master.suppliers.status'
  }

  return prefixPathPermissions.find(([prefix]) => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix))?.[1] ?? null
}

export function canAccessPath(pathname: string, context: { isAdmin?: boolean; permissions?: string[] }) {
  const requiredPermission = permissionForPath(pathname)

  return !requiredPermission || context.isAdmin === true || (context.permissions ?? []).includes(requiredPermission)
}

export const navigationSections: Array<{ key: NavigationSectionKey; label: string }> = [
  { key: 'main', label: 'Dashboard & Reports' },
  { key: 'tracking', label: 'Tracking 360°' },
  { key: 'daily', label: 'รายการประจำวัน' },
  { key: 'production', label: 'การผลิต' },
  { key: 'dual-costing', label: 'Dual Costing (จองดีล)' },
  { key: 'finance-debt', label: 'การเงิน & หนี้' },
  { key: 'stock', label: 'สินค้า' },
  { key: 'trading', label: 'Trading / ซื้อมาขายไป' },
  { key: 'po-reports', label: 'PO Reports' },
  { key: 'reports', label: 'รายงาน' },
  { key: 'finance-accounting', label: 'Finance / Accounting' },
  { key: 'company-data', label: 'ข้อมูลบริษัท' },
  { key: 'master-data', label: 'ข้อมูลหลัก' },
  { key: 'admin', label: 'ระบบ' },
]

export const navigationItems: NavigationItem[] = [
  { href: '/owner-daily', icon: '☀️', label: 'Owner Daily Control (เปิดทุกเช้า)', pageTitle: 'Owner Daily Control', section: 'main' },
  { href: '/daily-report', icon: '📰', label: 'Daily Report (รายงานประจำวัน)', pageTitle: 'Daily Report', section: 'main' },
  { href: '/analytics-dashboard', icon: '📈', label: 'Analytics Dashboard (วิเคราะห์ข้อมูล)', pageTitle: 'Analytics Dashboard', section: 'main' },
  { href: '/dashboard', icon: '📊', label: 'Dashboard Overview', pageTitle: 'Dashboard Overview', section: 'main' },
  { href: '/profit-cost-analysis', icon: '💎', label: 'Profit & Cost Analysis', section: 'main' },
  { href: '/sales-plan', icon: '📋', label: 'วางแผนการขาย (LME)', pageTitle: 'วางแผนการขาย (Sales Plan) — ทองแดง / ทองเหลือง', section: 'main' },
  { href: '/sales-commission', icon: '💼', label: 'Sales Tracking Dashboard', pageTitle: 'Sales Tracking — ผลงานพนักงาน', section: 'main' },
  { href: '/cash-flow-calendar', icon: '📅', label: 'Cash Flow Calendar', section: 'main' },
  { href: '/business-calendar', icon: '🗓️', label: 'Business Calendar', section: 'main' },
  { href: '/cash-others-summary', icon: '💰', label: 'Cash & Others Summary', section: 'main' },
  { href: '/tracking/customer', icon: '👥', label: 'Customer Tracking', pageTitle: 'Customer Tracking 360°', section: 'tracking' },
  { href: '/tracking/supplier', icon: '🏭', label: 'Supplier Tracking', pageTitle: 'Supplier Tracking 360°', section: 'tracking' },
  { href: '/tracking/product', icon: '📦', label: 'Product Tracking', pageTitle: 'Product Tracking 360°', section: 'tracking' },
  { href: '/purchase/bills', icon: '📥', label: 'บิลรับซื้อ', pageTitle: 'บิลรับซื้อ', section: 'daily' },
  { href: '/sales/bills', icon: '📤', label: 'บิลขาย', pageTitle: 'บิลขาย', section: 'daily' },
  {
    href: '/purchase/receipt-vouchers',
    icon: '🧾',
    label: 'ใบสำคัญรับเงิน (Receipt Voucher)',
    pageTitle: 'ใบสำคัญรับเงิน (Receipt Voucher)',
    section: 'daily',
  },
  { href: '/daily/weight-ticket-dashboard', icon: '📊', label: 'Dashboard ใบรับ-ส่งของ', section: 'daily' },
  { href: '/daily/weight-ticket-list', icon: '📋', label: 'รายการใบรับ-ส่งของ', section: 'daily' },
  { href: '/trading/matching', icon: '🤝', label: 'Trading Matching / จับคู่ดีล', section: 'finance-debt' },
  { href: '/daily/expense', icon: '🧾', label: 'ค่าใช้จ่าย', section: 'finance-debt' },
  { href: '/daily/expense-dashboard', icon: '📊', label: 'Dashboard ค่าใช้จ่าย', section: 'reports' },
  { href: '/stock/transfer', icon: '🚚', label: 'โอนสินค้าระหว่างสาขา', section: 'stock' },
  { href: '/production/dashboard', icon: '📊', label: 'แดชบอร์ดการผลิต', section: 'production' },
  { href: '/production/orders', icon: '🏭', label: 'ใบสั่งผลิต', section: 'production' },
  { href: '/production/report', icon: '📐', label: 'รายงานการผลิต / Yield', section: 'production' },
  { href: '/purchase/po-buy', icon: '📝', label: 'PO Buy (จองซื้อ)', pageTitle: 'PO Buy (จองซื้อ)', section: 'daily' },
  { href: '/sales/po-sell', icon: '📃', label: 'PO Sell (จองขาย)', pageTitle: 'PO Sell (จองขาย)', section: 'daily' },
  { href: '/dual-costing/cost-pool', icon: '🪣', label: 'Cost Pool', section: 'dual-costing' },
  { href: '/dual-costing/cost-allocator', icon: '🎯', label: 'Cost Allocator (ทอง/เหลือง)', section: 'dual-costing' },
  { href: '/dual-costing/waiting-allocations', icon: '⏳', label: 'Waiting Allocations', section: 'dual-costing' },
  { href: '/dual-costing/cost-allocation-ledger', icon: '📒', label: 'Allocation Ledger', section: 'dual-costing' },
  { href: '/dual-costing/report', icon: '📊', label: 'Dual Costing Report', section: 'dual-costing' },
  { href: '/dual-costing/deal-margin', icon: '💎', label: 'Deal Margin Report', section: 'dual-costing' },
  { href: '/daily/payment-approval', icon: '✅', label: 'อนุมัติจ่ายเงิน (Payment Approval)', section: 'finance-debt' },
  { href: '/purchase/advance-payments', icon: '⏪', label: 'เงินล่วงหน้า/มัดจำ', section: 'daily' },
  { href: '/purchase/payments', icon: '💸', label: 'จ่ายเงิน', section: 'finance-debt' },
  { href: '/sales/receipts', icon: '💰', label: 'รับเงิน Customer', section: 'finance-debt' },
  { href: '/daily/transfer', icon: '🔄', label: 'โอนเงินระหว่างบัญชี', section: 'finance-debt' },
  { href: '/finance/ar', icon: '📈', label: 'ลูกหนี้ (AR)', section: 'finance-debt' },
  { href: '/finance/ap', icon: '📉', label: 'เจ้าหนี้ (AP)', pageTitle: 'รายการค้างจ่าย / Accounts Payable', section: 'finance-debt' },
  { href: '/finance/bank', icon: '🏦', label: 'Cash / Bank Statement', pageTitle: 'Bank Statement Dashboard', section: 'finance-debt' },
  { href: '/finance/cash-position', icon: '💼', label: 'Cash Position', section: 'finance-debt' },
  { href: '/daily/petty-advance', icon: '🏦', label: 'เงินสำรองจ่าย / กู้กรรมการ', section: 'finance-debt' },
  { href: '/stock/balance', icon: '📦', label: 'สต๊อกคงเหลือ', pageTitle: 'สต๊อกคงเหลือ / Stock Balance', section: 'stock' },
  { href: '/stock/ledger', icon: '📋', label: 'Stock Ledger', section: 'stock' },
  { href: '/stock/status-convert', icon: '🔄', label: 'ปรับสถานะสินค้า (RM→FG)', section: 'stock' },
  { href: '/stock/convert', icon: '🔀', label: 'Grade Adjustment / ปรับเกรด', section: 'stock' },
  { href: '/stock/adjust', icon: '🔢', label: 'นับสต๊อก / Stock Count Adjust', section: 'stock' },
  { href: '/trading/dashboard', icon: '🔄', label: 'Trading Dashboard', section: 'reports' },
  { href: '/po-reports/outstanding', icon: '📑', label: 'PO ซื้อ/ขาย คงเหลือ', pageTitle: 'รายงาน PO ซื้อ / PO ขาย คงเหลือ', section: 'reports' },
  { href: '/reports', icon: '📑', label: 'รายงานทั้งหมด', pageTitle: 'รายงานสรุป', section: 'reports' },
  { href: '/finance-accounting/financial-dashboard', icon: '💼', label: 'Financial Dashboard', section: 'finance-accounting' },
  { href: '/finance-accounting/cash-flow-analysis', icon: '🔍', label: 'Cash Flow Analysis', section: 'finance-accounting' },
  { href: '/finance-accounting/cf-forecast-calendar', icon: '📅', label: 'CF Forecast Calendar', section: 'finance-accounting' },
  { href: '/finance-accounting/working-capital', icon: '⚙️', label: 'Working Capital Analysis', section: 'finance-accounting' },
  { href: '/finance-accounting/stock-finance', icon: '📦', label: 'Stock Finance Analysis', section: 'finance-accounting' },
  { href: '/finance-accounting/profit-leak', icon: '🔻', label: 'Profit Leak Dashboard', section: 'finance-accounting' },
  { href: '/finance-accounting/tax-vat-wht', icon: '🧾', label: 'Tax / VAT / WHT', section: 'finance-accounting' },
  { href: '/finance-accounting/pl-statement', icon: '📈', label: 'งบกำไรขาดทุน (P&L)', section: 'finance-accounting' },
  { href: '/finance-accounting/balance-sheet', icon: '⚖️', label: 'งบดุล (Balance Sheet)', section: 'finance-accounting' },
  { href: '/finance-accounting/cash-flow-statement', icon: '💧', label: 'งบกระแสเงินสด', section: 'finance-accounting' },
  { href: '/finance-accounting/asset-register', icon: '🏗️', label: 'Fixed Assets / ทรัพย์สิน', pageTitle: 'Fixed Asset Register / ทะเบียนทรัพย์สิน', section: 'finance-accounting' },
  { href: '/finance-accounting/depreciation', icon: '📉', label: 'ค่าเสื่อมราคา', pageTitle: 'Depreciation / ค่าเสื่อมราคา', section: 'finance-accounting' },
  { href: '/finance-accounting/asset-disposal', icon: '🗑️', label: 'จำหน่ายทรัพย์สิน', pageTitle: 'Asset Disposal / จำหน่ายทรัพย์สิน', section: 'finance-accounting' },
  { href: '/finance-accounting/loan-contracts', icon: '🏦', label: 'Loan / Leasing / BSL', pageTitle: 'Loan / Leasing / BSL Contracts', section: 'finance-accounting' },
  { href: '/finance-accounting/loan-dashboard', icon: '📊', label: 'Loan Dashboard', section: 'finance-accounting' },
  { href: '/finance-accounting/asset-overview', icon: '💎', label: 'Net Worth / Track Asset', section: 'finance-accounting' },
  { href: '/finance-accounting/equity-maint', icon: '👑', label: 'Equity / ทุนจดทะเบียน', section: 'finance-accounting' },
  { href: '/finance-accounting/opening-balance', icon: '🚀', label: 'Opening Balance / ตั้งต้นยอด', pageTitle: 'Opening Balance / ตั้งต้นยอดก่อน Go-Live', section: 'finance-accounting' },
  { href: '/finance-accounting/accounting-periods', icon: '🗓️', label: 'Accounting Periods', section: 'finance-accounting' },
  { href: '/finance-accounting/posting-rules', icon: '🧭', label: 'Posting Rules', section: 'finance-accounting' },
  { href: '/finance-accounting/historical-data', icon: '📅', label: 'ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 (ก่อน Go-Live)', section: 'finance-accounting' },
  // กลุ่มข้อมูลบริษัท
  { href: '/master-data/branches', icon: '🏢', label: 'สาขา', section: 'company-data' },
  { href: '/master-data/warehouses', icon: '🏬', label: 'คลัง', section: 'company-data' },
  { href: '/master-data/departments', icon: '🏢', label: 'แผนก', section: 'company-data' },
  { href: '/master-data/salespersons', icon: '👨‍💼', label: 'พนักงานขาย (Sales)', section: 'company-data' },
  { href: '/master-data/directors', icon: '🧑‍💼', label: 'พนักงาน / กรรมการ', section: 'company-data' },

  // กลุ่มข้อมูลหลัก (Master Data)
  { href: '/master-data/customers', icon: '👥', label: 'ลูกค้า', section: 'master-data' },
  { href: '/master-data/suppliers', icon: '🏭', label: 'ผู้ขาย', section: 'master-data' },
  {
    href: '/master-data/asset-categories',
    icon: '🏗️',
    label: 'ทรัพย์สิน',
    section: 'master-data',
    children: [
      { href: '/master-data/asset-categories', icon: '📂', label: 'หมวดหมู่ทรัพย์สิน', section: 'master-data' },
    ],
  },
  {
    href: '/master-data/products',
    icon: '🔩',
    label: 'สินค้า',
    section: 'master-data',
    children: [
      { href: '/master-data/products', icon: '📋', label: 'รายการสินค้า', section: 'master-data' },
      { href: '/master-data/impurity-products', icon: '🧪', label: 'รายการสินค้าสิ่งเจือปน', section: 'master-data' },
      { href: '/master-data/product-types', icon: '🏷️', label: 'ประเภทสินค้า', section: 'master-data' },
      { href: '/master-data/product-units', icon: '⚖️', label: 'หน่วยสินค้า', section: 'master-data' },
    ],
  },
  { href: '/master-data/impurities', icon: '🧪', label: 'รายการสิ่งเจือปน', section: 'master-data' },
  {
    href: '/master-data/accounts',
    icon: '💳',
    label: 'บัญชีเงินบริษัท',
    section: 'master-data',
    children: [
      {
        href: '/master-data/accounts',
        icon: '📋',
        label: 'รายชื่อบัญชีบริษัท',
        pageTitle: 'รายชื่อบัญชีบริษัท',
        section: 'master-data',
      },
      {
        href: '/master-data/payment-methods',
        icon: '🪪',
        label: 'วิธีจ่าย/รับเงิน',
        section: 'master-data',
      },
      {
        href: '/master-data/account-subtypes',
        icon: '🧩',
        label: 'ประเภทบัญชีธนาคาร',
        pageTitle: 'ประเภทบัญชีธนาคาร',
        section: 'master-data',
      },
    ],
  },
  { href: '/master-data/bank-names', icon: '🏦', label: 'ชื่อธนาคาร', section: 'master-data' },
  {
    href: '/master-data/expense-categories',
    icon: '💸',
    label: 'ค่าใช้จ่าย',
    section: 'master-data',
    children: [
      { href: '/master-data/expense-categories', icon: '📂', label: 'หมวดค่าใช้จ่าย', section: 'master-data' },
      { href: '/master-data/expense-types', icon: '🧩', label: 'ประเภทค่าใช้จ่าย', section: 'master-data' },
    ],
  },

  {
    href: '/master-data/machines',
    icon: '⚙️',
    label: 'เครื่องจักร',
    section: 'master-data',
    children: [
      { href: '/master-data/machines', icon: '📋', label: 'รายการเครื่องจักร', section: 'master-data' },
      { href: '/master-data/machine-types', icon: '🧩', label: 'ประเภทเครื่องจักร', section: 'master-data' },
    ],
  },
  { href: '/master-data/production-lines', icon: '🛤️', label: 'Production Line', section: 'master-data' },
  { href: '/master-data/currencies', icon: '💲', label: 'สกุลเงิน', section: 'master-data' },
  { href: '/master-data/beneficiaries', icon: '🌏', label: 'ผู้รับเงินต่างประเทศ', section: 'master-data' },
  { href: '/master-data/remittance-purposes', icon: '🎯', label: 'วัตถุประสงค์โอน', section: 'master-data' },
  {
    href: '/admin/system-settings',
    icon: '⚙️',
    label: 'ตั้งค่าระบบ',
    section: 'admin',
    children: [
      { href: '/admin/system-settings', icon: '🧾', label: 'VAT / WHT', pageTitle: 'ตั้งค่าระบบ', section: 'admin' },
      { href: '/admin/company-profile', icon: '🏢', label: 'ข้อมูลบริษัท (สำหรับใบพิมพ์)', section: 'admin' },
      { href: '/admin/line-settings', icon: '💬', label: 'ตั้งค่า LINE Notification', section: 'admin' },
      { href: '/admin/system-manual', icon: '📘', label: 'คู่มือระบบ', pageTitle: 'คู่มือระบบ', section: 'admin' },
    ],
  },
  { href: '/admin/transaction-ledger', icon: '📒', label: 'Transaction Ledger (เช็คเงินเข้า-ออก)', section: 'admin' },
  { href: '/admin/migration-tools', icon: '💾', label: 'Backup / Restore (สำคัญ)', section: 'admin' },
  { href: '/admin/audit', icon: '🔍', label: 'Audit & Activity Log', section: 'admin' },
  {
    href: '/admin/users',
    icon: '👤',
    label: 'ผู้ใช้และสิทธิ์',
    section: 'admin',
    children: [
      { href: '/admin/users', icon: '👥', label: 'รายชื่อพนักงาน / Users', section: 'admin' },
      { href: '/admin/roles-permissions', icon: '🛡️', label: 'Roles & Permissions', section: 'admin' },
    ],
  },
]

const sidebarParentPathByDetailPrefix: Array<[string, string]> = [
  ['/purchase/payment-approvals', '/daily/payment-approval'],
]

export function sidebarNavigationPath(pathname: string) {
  const normalizedPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname
  const mappedParent = sidebarParentPathByDetailPrefix.find(([detailPrefix]) => (
    normalizedPath === detailPrefix || normalizedPath.startsWith(`${detailPrefix}/`)
  ))
  return mappedParent?.[1] ?? normalizedPath
}

export function pageTitleForPath(pathname: string) {
  if (pathname === '/login') return 'เข้าสู่ระบบ'

  for (const item of navigationItems) {
    const child = item.children?.find((entry) => entry.href === pathname)
    if (child) return child.pageTitle ?? child.label
    if (item.href === pathname) return item.pageTitle ?? item.label
  }

  return 'NS Scrap ERP'
}


export function breadcrumbsForPath(pathname: string): BreadcrumbItem[] {
  if (pathname === '/login') return []

  const normalizedPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname

  for (const item of navigationItems) {
    const sectionLabel = navigationSections.find((section) => section.key === item.section)?.label
    const child = item.children?.find((entry) => entry.href === normalizedPath)

    if (child) {
      return [
        ...(sectionLabel ? [{ label: sectionLabel }] : []),
        { href: item.href, label: item.label },
        { label: child.label },
      ]
    }

    if (item.href === normalizedPath) {
      return [
        ...(sectionLabel ? [{ label: sectionLabel }] : []),
        { label: item.label },
      ]
    }
  }

  return normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => ({ label: decodeURIComponent(segment) }))
}
