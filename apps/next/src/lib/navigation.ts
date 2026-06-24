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
  | 'master-data'
  | 'admin'

export type NavigationItem = {
  children?: NavigationItem[]
  href: string
  icon: string
  label: string
  pageTitle?: string
  pageSubtitle?: string
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
  '/api/daily/weight-tickets': 'daily.weight_tickets.view',
  '/api/daily/weight-tickets/options': 'daily.weight_tickets.view',
  '/api/daily/weight-tickets/products': 'daily.weight_tickets.view',
  '/api/daily/weight-tickets/stock-options': 'daily.weight_tickets.view',
  '/api/owner-daily': 'reports.reports.view',
  '/api/production/orders': 'production.orders.view',
  '/api/production/orders/options': 'production.orders.view',
  '/api/production/orders/product-stock': 'production.orders.view',
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
  '/daily/weight-ticket-list': 'daily.weight_tickets.view',
  '/daily/weight-tickets': 'daily.weight_tickets.view',
  '/daily-report': 'reports.reports.view',
  '/master-data/customers': 'master.customers.view',
  '/master-data/products': 'master.products.view',
  '/master-data/impurity-products': 'master.products.view',
  '/master-data/suppliers': 'master.suppliers.view',
  '/owner-daily': 'reports.reports.view',
  '/production/orders': 'production.orders.view',
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
  { key: 'master-data', label: 'ข้อมูลหลัก' },
  { key: 'admin', label: 'ระบบ' },
]

export const navigationItems: NavigationItem[] = [
  { href: '/owner-daily', icon: '☀️', label: 'Owner Daily Control (เปิดทุกเช้า)', pageTitle: 'Owner Daily Control', pageSubtitle: 'เปิดดูทุกเช้า · ตรวจสอบสถานะการเงินครบทุกมุมก่อนเริ่มวัน', section: 'main' },
  { href: '/daily-report', icon: '📰', label: 'Daily Report (รายงานประจำวัน)', pageTitle: 'Daily Report', pageSubtitle: 'รายงานสรุปประจำวัน — ทุกตัวเลขสำคัญในหน้าเดียว', section: 'main' },
  { href: '/dashboard', icon: '📊', label: 'Dashboard', pageTitle: 'Financial Dashboard', pageSubtitle: 'ภาพรวมทางการเงิน · Real-time overview', section: 'main' },
  { href: '/profit-cost-analysis', icon: '💎', label: 'Profit & Cost Analysis', pageSubtitle: 'วิเคราะห์ซื้อ ขาย COGS GP และ Stock Value ด้วย WAC/ต้นทุนจากบิลขาย', section: 'main' },
  { href: '/sales-plan', icon: '📋', label: 'วางแผนการขาย (LME)', pageTitle: 'วางแผนการขาย (Sales Plan) — ทองแดง / ทองเหลือง', pageSubtitle: 'เสนอ % LME + ช่องทางขาย → กดล็อกเพื่อยืนยันราคา → ตู้ในรอขายลดลงอัตโนมัติ', section: 'main' },
  { href: '/sales-commission', icon: '💼', label: 'Sales Tracking Dashboard', pageTitle: 'Sales Tracking — ผลงานพนักงาน', pageSubtitle: 'ผูก Sales กับ Supplier · ดึงยอดบิลรับซื้อ · กดการ์ดเพื่อดูรายละเอียด', section: 'main' },
  { href: '/cash-flow-calendar', icon: '📅', label: 'Cash Flow Calendar', pageSubtitle: 'ปฏิทินรายวันของเงินเข้า/ออก จากบัญชี Cash/Bank/OD ทั้งหมด — คลิกแต่ละวันเพื่อ Drill Down', section: 'main' },
  { href: '/business-calendar', icon: '🗓️', label: 'Business Calendar', pageSubtitle: 'ปฏิทินรายวัน: ยอดซื้อ / ยอดขาย / ค่าใช้จ่าย / รับ / จ่าย / Actual GP / Net Cash Flow', section: 'main' },
  { href: '/cash-others-summary', icon: '💰', label: 'Cash & Others Summary', pageSubtitle: 'สรุปสินทรัพย์ / หนี้สิน / สภาพคล่อง สำหรับเจ้าของ', section: 'main' },
  { href: '/tracking/customer', icon: '👥', label: 'Customer Tracking', pageTitle: 'Customer Tracking 360°', pageSubtitle: 'วิเคราะห์ลูกค้าจากยอดขาย รับเงิน ลูกหนี้ และกำไรขั้นต้น', section: 'tracking' },
  { href: '/tracking/supplier', icon: '🏭', label: 'Supplier Tracking', pageTitle: 'Supplier Tracking 360°', pageSubtitle: 'วิเคราะห์ผู้ขายจากบิลรับซื้อและรายการจ่ายเงิน Supplier', section: 'tracking' },
  { href: '/tracking/product', icon: '📦', label: 'Product Tracking', pageTitle: 'Product Tracking 360°', pageSubtitle: 'วิเคราะห์สินค้าจากยอดซื้อ ยอดขาย กำไร Stock และ WAC', section: 'tracking' },
  { href: '/purchase/bills', icon: '📥', label: 'บิลรับซื้อ', pageTitle: 'บิลรับซื้อ', pageSubtitle: 'บันทึกบิลซื้อแบบ Stock / Trading พร้อม PO receipt, VAT, WAC และเอกสารรับสินค้า', section: 'daily' },
  { href: '/sales/bills', icon: '📤', label: 'บิลขาย', pageTitle: 'บิลขาย', pageSubtitle: 'ดูบิลขาย, สถานะรับเงิน, Gross Profit, ค้างรับ และ Trading match baseline', section: 'daily' },
  {
    href: '/purchase/receipt-vouchers',
    icon: '🧾',
    label: 'ใบสำคัญรับเงิน (Receipt Voucher)',
    pageSubtitle: 'ใช้ออกให้ Supplier บุคคลธรรมดาเซ็นรับเงิน (กรณีไม่มีใบเสร็จของ Supplier) — ดึงข้อมูลจากบิลซื้อ + แก้ไขส่วนที่ขาดได้ + พิมพ์ออกได้',
    pageTitle: 'ใบสำคัญรับเงิน (Receipt Voucher)',
    section: 'daily',
  },
  { href: '/daily/weight-ticket-list', icon: '📋', label: 'รายการใบรับ-ส่งของ', pageSubtitle: 'ค้นหาและกรอง WTI/WTO เพื่อเปิดรายละเอียดหรือเลือกเอกสารไปออกบิล', section: 'daily' },
  { href: '/trading/matching', icon: '🤝', label: 'Trading Matching / จับคู่ดีล', pageSubtitle: 'จับคู่บิลซื้อ Trading กับบิลขาย Trading → คำนวณ GP ต่อดีล (ก่อน VAT)', section: 'finance-debt' },
  { href: '/daily/expense', icon: '🧾', label: 'ค่าใช้จ่าย', pageSubtitle: 'บันทึกใบแจ้งหนี้ก่อนจ่ายจริง พร้อม VAT, WHT, วันครบกำหนด และสถานะการจ่าย', section: 'finance-debt' },
  { href: '/daily/expense-dashboard', icon: '📊', label: 'Dashboard ค่าใช้จ่าย', section: 'reports' },
  { href: '/stock/transfer', icon: '🚚', label: 'โอนสินค้าระหว่างสาขา', section: 'stock' },
  { href: '/daily/design-mockup', icon: '🎨', label: 'Design Mockup', pageSubtitle: 'พื้นที่สำหรับทดสอบและออกแบบ UI (Playground)', section: 'daily' },
  { href: '/production/orders', icon: '🏭', label: 'ใบสั่งผลิต', section: 'production' },
  { href: '/production/report', icon: '📐', label: 'รายงานการผลิต / Yield', section: 'production' },
  { href: '/purchase/po-buy', icon: '📝', label: 'PO Buy (จองซื้อ)', pageTitle: 'PO Buy (จองซื้อ)', pageSubtitle: 'จองซื้อล่วงหน้า - ใช้จองดีลกับ Supplier ล็อคยอด ล็อคราคาล่วงหน้า', section: 'daily' },
  { href: '/sales/po-sell', icon: '📃', label: 'PO Sell (จองขาย)', pageTitle: 'PO Sell (จองขาย)', pageSubtitle: 'จองขายล่วงหน้า - ใช้กับ Cost Allocator เพื่อคำนวณกำไรคาดการณ์ก่อนขายจริง', section: 'daily' },
  { href: '/dual-costing/cost-pool', icon: '🪣', label: 'Cost Pool', section: 'dual-costing' },
  { href: '/dual-costing/cost-allocator', icon: '🎯', label: 'Cost Allocator (ทอง/เหลือง)', section: 'dual-costing' },
  { href: '/dual-costing/waiting-allocations', icon: '⏳', label: 'Waiting Allocations', section: 'dual-costing' },
  { href: '/dual-costing/cost-allocation-ledger', icon: '📒', label: 'Allocation Ledger', section: 'dual-costing' },
  { href: '/dual-costing/report', icon: '📊', label: 'Dual Costing Report', section: 'dual-costing' },
  { href: '/dual-costing/deal-margin', icon: '💎', label: 'Deal Margin Report', section: 'dual-costing' },
  { href: '/daily/payment-approval', icon: '✅', label: 'อนุมัติจ่ายเงิน (Payment Approval)', pageSubtitle: 'เช็ครายการที่จะจ่าย แล้วพิมพ์ใบอนุมัติส่งให้ cashier', section: 'finance-debt' },
  { href: '/purchase/advance-payments', icon: '⏪', label: 'เงินล่วงหน้า/มัดจำ', pageSubtitle: 'รวม ADV จ่ายล่วงหน้า Supplier และ CADV รับล่วงหน้า Customer แยกเป็น 2 แท็บ', section: 'finance-debt' },
  { href: '/purchase/payments', icon: '💸', label: 'จ่ายเงิน', pageSubtitle: 'บันทึกเงินออกจากบัญชีและดูแท็บประวัติการจ่ายเงิน', section: 'finance-debt' },
  { href: '/sales/receipts', icon: '💰', label: 'รับเงิน Customer', pageSubtitle: 'บันทึกเงินเข้าบัญชีและประวัติ voucher รับ Customer', section: 'finance-debt' },
  { href: '/daily/transfer', icon: '🔄', label: 'โอนเงินระหว่างบัญชี', section: 'finance-debt' },
  { href: '/finance/ar', icon: '📈', label: 'ลูกหนี้ (AR)', section: 'finance-debt' },
  { href: '/finance/ap', icon: '📉', label: 'เจ้าหนี้ (AP)', pageTitle: 'รายการค้างจ่าย / Accounts Payable', pageSubtitle: 'สรุปยอดค้างจ่าย Supplier · Aging Buckets · Detail per Bill', section: 'finance-debt' },
  { href: '/finance/bank', icon: '🏦', label: 'Cash / Bank Statement', pageTitle: 'Bank Statement Dashboard', pageSubtitle: 'เดินบัญชี — ดู Cash Flow รายบัญชีพร้อม Chart', section: 'finance-debt' },
  { href: '/finance/cash-position', icon: '💼', label: 'Cash Position', section: 'finance-debt' },
  { href: '/daily/petty-advance', icon: '🏦', label: 'เงินสำรองจ่าย / กู้กรรมการ', pageSubtitle: 'ติดตามยอดยืมของกรรมการ/พนักงาน รายละเอียดบิลที่ใช้เงินแต่ละก้อน และการคืนเงิน', section: 'finance-debt' },
  { href: '/stock/balance', icon: '📦', label: 'สต๊อกคงเหลือ', pageTitle: 'สต๊อกคงเหลือ / Stock Balance', pageSubtitle: 'แยกตามหมวดสินค้า (ทองแดง/ทองเหลือง/เหล็ก) และสถานะ RM/WIP/FG', section: 'stock' },
  { href: '/stock/ledger', icon: '📋', label: 'Stock Ledger', section: 'stock' },
  { href: '/stock/status-convert', icon: '🔄', label: 'ปรับสถานะสินค้า (RM→FG)', pageSubtitle: 'แปลง stock bucket RM ↔ FG ของสินค้าเดิม · ลดต้นทางเพิ่มปลายทางทันที · ใช้ source WAC และบันทึก Stock Ledger 2 ฝั่ง', section: 'stock' },
  { href: '/stock/convert', icon: '🔀', label: 'Grade Adjustment / ปรับเกรด', pageSubtitle: 'ตัด source cost pool และสร้าง target cost พร้อม variance audit', section: 'stock' },
  { href: '/stock/adjust', icon: '🔢', label: 'นับสต๊อก / Stock Count Adjust', pageSubtitle: 'หาของไม่เจอ · สต๊อกตัด 0 แล้ว แต่ในระบบยังมี · นับเกินระบบ — Quick Adjust ทีละ row · Note-only ไม่ลง P&L', section: 'stock' },
  { href: '/trading/dashboard', icon: '🔄', label: 'Trading Dashboard', pageSubtitle: 'รายการ Trading (ซื้อมาขายไป) แยกออกจาก Stock — ไม่กระทบ Stock On Hand / WAC', section: 'reports' },
  { href: '/po-reports/outstanding', icon: '📑', label: 'PO ซื้อ/ขาย คงเหลือ', pageTitle: 'รายงาน PO ซื้อ / PO ขาย คงเหลือ', pageSubtitle: 'PO Buy ที่ยังไม่ได้รับของ + PO Sell ที่ยังไม่ได้ส่งของ เรียงตามวันที่', section: 'reports' },
  { href: '/reports', icon: '📑', label: 'รายงานทั้งหมด', pageTitle: 'รายงานสรุป', pageSubtitle: 'รายงานรวมซื้อ/ขายตามช่องทาง Supplier สินค้า และลูกค้า ตามรูปแบบ legacy', section: 'reports' },
  { href: '/finance-accounting/financial-dashboard', icon: '💼', label: 'Financial Dashboard', pageSubtitle: 'รายเดือน · KPI ครบ 19 ตัว + Analysis 7 มุมมอง', section: 'finance-accounting' },
  { href: '/finance-accounting/cash-flow-analysis', icon: '🔍', label: 'Cash Flow Analysis', pageSubtitle: 'ตอบ 6 คำถามสำคัญ: กำไร vs เงินสด · Stock/AR Trap · Collection Rate · OD Forecast', section: 'finance-accounting' },
  { href: '/finance-accounting/cf-forecast-calendar', icon: '📅', label: 'CF Forecast Calendar', pageSubtitle: 'พยากรณ์เงินสดรายวัน · Expected Receipt/Payment · Loan/Tax/Payroll Due · เห็นวันเงินติดลบ', section: 'finance-accounting' },
  { href: '/finance-accounting/working-capital', icon: '⚙️', label: 'Working Capital Analysis', pageSubtitle: 'Cash Conversion Cycle · AR/AP/Inv Days · Stock Turnover · Current/Quick Ratio', section: 'finance-accounting' },
  { href: '/finance-accounting/stock-finance', icon: '📦', label: 'Stock Finance Analysis', pageSubtitle: 'วิเคราะห์ Stock เชิงการเงิน · Paid/Unpaid · RM/WIP/FG · Aging · Slow Moving · Margin Potential', section: 'finance-accounting' },
  { href: '/finance-accounting/profit-leak', icon: '🔻', label: 'Profit Leak Dashboard', pageSubtitle: 'ดูว่ากำไรหายตรงไหน · 10 จุดรั่วไหลของกำไร', section: 'finance-accounting' },
  { href: '/finance-accounting/tax-vat-wht', icon: '🧾', label: 'Tax / VAT / WHT', pageSubtitle: 'VAT ซื้อ-ขาย · VAT Payable · WHT ถูกหัก / หักไว้ · Tax Calendar 6 เดือน · เอกสารภาษีไม่ครบ', section: 'finance-accounting' },
  { href: '/finance-accounting/pl-statement', icon: '📈', label: 'งบกำไรขาดทุน (P&L)', pageSubtitle: 'รายได้จาก Sales Bills · COGS จาก WAC · ค่าใช้จ่ายจาก Expense · ค่าเสื่อม · ดอกเบี้ย · FX', section: 'finance-accounting' },
  { href: '/finance-accounting/balance-sheet', icon: '⚖️', label: 'งบดุล (Balance Sheet)', pageSubtitle: 'Cash · AR · AP · Inventory (WAC) · Fixed Asset · Loan · Equity — Balanced Check', section: 'finance-accounting' },
  { href: '/finance-accounting/cash-flow-statement', icon: '💧', label: 'งบกระแสเงินสด', pageSubtitle: 'Direct Method · ดึงจาก Bank Statement จริง · แยก Operating/Investing/Financing · ตัด Internal Transfer', section: 'finance-accounting' },
  { href: '/finance-accounting/asset-register', icon: '🏗️', label: 'Fixed Assets / ทรัพย์สิน', pageTitle: 'Fixed Asset Register / ทะเบียนทรัพย์สิน', pageSubtitle: 'บันทึก/ติดตาม Land · Building · Machinery · Vehicle · Equipment · Lease Asset', section: 'finance-accounting' },
  { href: '/finance-accounting/depreciation', icon: '📉', label: 'ค่าเสื่อมราคา', pageTitle: 'Depreciation / ค่าเสื่อมราคา', pageSubtitle: 'คำนวณค่าเสื่อมจากทะเบียนทรัพย์สินแบบ read baseline ก่อนออกแบบ GL/posting', section: 'finance-accounting' },
  { href: '/finance-accounting/asset-disposal', icon: '🗑️', label: 'จำหน่ายทรัพย์สิน', pageTitle: 'Asset Disposal / จำหน่ายทรัพย์สิน', pageSubtitle: 'ขาย / Scrap / Write Off / Lost — คำนวณ Gain/Loss อัตโนมัติจาก NBV', section: 'finance-accounting' },
  { href: '/finance-accounting/loan-contracts', icon: '🏦', label: 'Loan / Leasing / BSL', pageTitle: 'Loan / Leasing / BSL Contracts', pageSubtitle: 'BSL · Leasing · Hire Purchase · Bank Loan · OD · FCD Loan · Director Loan', section: 'finance-accounting' },
  { href: '/finance-accounting/loan-dashboard', icon: '📊', label: 'Loan Dashboard', pageSubtitle: 'Total Outstanding · Due · Overdue · Interest · Next 7/30 days', section: 'finance-accounting' },
  { href: '/finance-accounting/asset-overview', icon: '💎', label: 'Net Worth / Track Asset', section: 'finance-accounting' },
  { href: '/finance-accounting/equity-maint', icon: '👑', label: 'Equity / ทุนจดทะเบียน', pageSubtitle: 'ใช้คำนวณ Total Equity ในงบดุล (Current Year P&L คำนวณอัตโนมัติจาก Transactions)', section: 'finance-accounting' },
  { href: '/finance-accounting/opening-balance', icon: '🚀', label: 'Opening Balance / ตั้งต้นยอด', pageTitle: 'Opening Balance / ตั้งต้นยอดก่อน Go-Live', pageSubtitle: 'ตั้งยอดก่อนเริ่มใช้ระบบจริง · Cash/Bank/FCD/OD · AR/AP · Stock · Fixed Asset · Loan · VAT/WHT · Equity', section: 'finance-accounting' },
  { href: '/finance-accounting/accounting-periods', icon: '🗓️', label: 'Accounting Periods', pageSubtitle: 'จัดการงวดบัญชี FA5: create, soft close, lock, reopen แบบ policy state ก่อน enforce กับเอกสาร', section: 'finance-accounting' },
  { href: '/finance-accounting/posting-rules', icon: '🧭', label: 'Posting Rules', pageSubtitle: 'ตรวจ readiness และจัดการ source-to-account mapping สำหรับ FA5 โดยยังไม่ post GL อัตโนมัติ', section: 'finance-accounting' },
  { href: '/finance-accounting/historical-data', icon: '📅', label: 'ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 (ก่อน Go-Live)', section: 'finance-accounting' },
  { href: '/master-data/customers', icon: '👥', label: 'ลูกค้า', section: 'master-data' },
  { href: '/master-data/salespersons', icon: '👨‍💼', label: 'พนักงานขาย (Sales)', section: 'master-data' },
  { href: '/master-data/suppliers', icon: '🏭', label: 'ผู้ขาย', section: 'master-data' },
  {
    href: '/master-data/asset-categories',
    icon: '🏗️',
    label: 'ทรัพย์สิน',
    section: 'master-data',
    children: [
      { href: '/master-data/asset-categories', icon: '📂', label: 'หมวดหมู่ทรัพย์สิน', section: 'master-data' },
      { href: '/master-data/departments', icon: '🏢', label: 'แผนก', section: 'master-data' },
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
  { href: '/master-data/impurities', icon: '🧪', label: 'รายการสิ่งเจือปน', pageSubtitle: 'กำหนดชื่อสิ่งเจือปนสำหรับใช้ต่อในเอกสารรับ-ส่งของและการหักน้ำหนัก', section: 'master-data' },
  { href: '/master-data/branches', icon: '🏢', label: 'สาขา', section: 'master-data' },
  { href: '/master-data/warehouses', icon: '🏬', label: 'คลัง', section: 'master-data' },
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
        pageSubtitle: 'ดูและจัดการบัญชีเงินสด/เงินโอนของบริษัทจาก master กลาง',
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
        pageSubtitle: 'กำหนดประเภทบัญชีสำหรับบัญชีเงินโอน เช่น ออมทรัพย์ กระแสรายวัน FCD และ OD',
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
  { href: '/master-data/directors', icon: '🧑‍💼', label: 'พนักงาน / กรรมการ', section: 'master-data' },
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
      { href: '/admin/system-manual', icon: '📘', label: 'คู่มือระบบ', pageTitle: 'คู่มือระบบ', pageSubtitle: 'คู่มือการใช้งานแยกตาม Module และ Flow การทำงาน', section: 'admin' },
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

export function pageSubtitleForPath(pathname: string) {
  if (pathname === '/login') return null

  for (const item of navigationItems) {
    const child = item.children?.find((entry) => entry.href === pathname)
    if (child) return child.pageSubtitle ?? null
    if (item.href === pathname) return item.pageSubtitle ?? null
  }

  return null
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
