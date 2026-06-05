import type { MasterDataPageConfig } from '@/lib/master-data'

const statusColumn = { key: 'active', label: 'สถานะ', align: 'center', format: 'status' } as const

export const salespersonsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/salespersons',
  createLabel: 'เพิ่มพนักงานขาย',
  entityName: 'พนักงานขาย',
  emptyMessage: 'ไม่พบข้อมูลพนักงานขาย',
  fields: [
    { key: 'name', label: 'ชื่อพนักงานขาย', required: true },
    { key: 'phone', label: 'โทรศัพท์' },
    { key: 'email', label: 'อีเมล' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ' },
    { key: 'phone', label: 'โทร' },
    { key: 'email', label: 'อีเมล' },
    statusColumn,
  ],
}

export const currenciesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/currencies',
  createLabel: 'เพิ่มสกุลเงิน',
  entityName: 'สกุลเงิน',
  emptyMessage: 'ไม่พบข้อมูลสกุลเงิน',
  supportsActive: false,
  fields: [
    { key: 'name', label: 'ชื่อสกุลเงิน', required: true },
    { key: 'symbol', label: 'สัญลักษณ์', required: true },
    { key: 'rateToThb', label: 'อัตราเทียบบาท', type: 'number', inputFormat: 'money' },
  ],
  columns: [
    { key: 'name', label: 'ชื่อ' },
    { key: 'symbol', label: 'สัญลักษณ์', align: 'center' },
    { key: 'rateToThb', label: 'อัตราเทียบบาท', align: 'right', format: 'number' },
  ],
}

export const expenseCategoriesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/expense-categories',
  createLabel: 'เพิ่มหมวดค่าใช้จ่าย',
  entityName: 'หมวดค่าใช้จ่าย',
  emptyMessage: 'ไม่พบข้อมูลหมวดค่าใช้จ่าย',
  fields: [
    { key: 'code', label: 'รหัสหมวด' },
    { key: 'name', label: 'ชื่อหมวด', required: true },
    { key: 'type', label: 'ประเภทค่าใช้จ่าย', type: 'select', optionsApiPath: '/api/master-data/expense-types', optionValueKey: 'code' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อหมวด' },
    { key: 'typeLabel', label: 'ประเภทค่าใช้จ่าย' },
    statusColumn,
  ],
}

export const expenseTypesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/expense-types',
  createLabel: 'เพิ่มประเภทค่าใช้จ่าย',
  entityName: 'ประเภทค่าใช้จ่าย',
  emptyMessage: 'ไม่พบข้อมูลประเภทค่าใช้จ่าย',
  fields: [
    { key: 'code', label: 'รหัสประเภท' },
    { key: 'name', label: 'ชื่อประเภท', required: true },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อประเภท' },
    statusColumn,
  ],
}

export const channelsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/channels',
  createLabel: 'เพิ่มช่องทางขาย',
  entityName: 'ช่องทางขาย',
  emptyMessage: 'ไม่พบข้อมูลช่องทางขาย',
  fields: [
    { key: 'name', label: 'ชื่อช่องทาง', required: true },
  ],
  columns: [
    { key: 'name', label: 'ชื่อช่องทาง' },
    statusColumn,
  ],
}

export const branchesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/branches',
  createLabel: 'เพิ่มสาขา',
  entityName: 'สาขา',
  emptyMessage: 'ไม่พบข้อมูลสาขา',
  fields: [
    { key: 'code', label: 'รหัสสาขา', required: true },
    { key: 'name', label: 'ชื่อสาขา', required: true },
    { key: 'phone', label: 'โทรศัพท์' },
    { key: 'address', label: 'ที่อยู่' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อสาขา' },
    { key: 'phone', label: 'โทร' },
    { key: 'address', label: 'ที่อยู่' },
    statusColumn,
  ],
}

export const warehousesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/warehouses',
  createLabel: 'เพิ่มคลัง',
  entityName: 'คลัง',
  emptyMessage: 'ไม่พบข้อมูลคลัง',
  fields: [
    { key: 'code', label: 'รหัสคลัง', required: true },
    { key: 'name', label: 'ชื่อคลัง', required: true },
    { key: 'type', label: 'ประเภทคลัง', type: 'select', required: true, options: [{ label: 'RM - วัตถุดิบ', value: 'RM' }, { label: 'FG - พร้อมขาย', value: 'FG' }, { label: 'WIP - ระหว่างผลิต', value: 'WIP' }, { label: 'SCRAP - เศษ/ของเสีย', value: 'SCRAP' }] },
    { key: 'branchId', label: 'สาขา', type: 'select', required: true, optionsApiPath: '/api/master-data/branches', optionValueKey: 'code' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อคลัง' },
    { key: 'type', label: 'ประเภทคลัง', align: 'center' },
    { key: 'branchName', label: 'สาขา' },
    statusColumn,
  ],
}

export const accountsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/accounts',
  createLabel: 'เพิ่มบัญชีเงินบริษัท',
  entityName: 'บัญชีเงินบริษัท',
  emptyMessage: 'ไม่พบข้อมูลบัญชีเงินบริษัท',
  fields: [
    { key: 'type', label: 'วิธีจ่าย/รับเงิน', type: 'select', required: true, optionsApiPath: '/api/master-data/payment-methods' },
    { key: 'branchId', label: 'สาขา', type: 'select', required: true, optionsApiPath: '/api/master-data/branches', optionValueKey: 'code' },
    { key: 'name', label: 'ชื่อบัญชี', required: true },
    { key: 'subtype', label: 'ประเภทบัญชี', type: 'select', required: true, options: [{ label: 'ออมทรัพย์', value: 'savings' }, { label: 'กระแสรายวัน', value: 'current' }, { label: 'FCD', value: 'fcd' }, { label: 'OD', value: 'od' }] },
    { key: 'bankName', label: 'ธนาคาร', type: 'select', optionsApiPath: '/api/master-data/bank-names' },
    { key: 'bankBranch', label: 'สาขาธนาคาร' },
    { key: 'accountNo', label: 'เลขที่บัญชี' },
    { key: 'currency', label: 'สกุลเงิน' },
    { key: 'odLimit', label: 'วงเงิน OD', type: 'number', inputFormat: 'money' },
    { key: 'openingBalance', label: 'ยอดเงินคงเหลือ', type: 'number', inputFormat: 'money' },
  ],
  columns: [
    { key: 'name', label: 'ชื่อบัญชีบริษัท' },
    { key: 'typeLabel', label: 'วิธีจ่าย/รับเงิน' },
    { key: 'subtypeLabel', label: 'ประเภทบัญชี' },
    { key: 'bankName', label: 'ธนาคาร' },
    { key: 'bankBranch', label: 'สาขาธนาคาร' },
    { key: 'accountNo', label: 'เลขที่บัญชี' },
    { key: 'currency', label: 'สกุลเงิน', align: 'center' },
    { key: 'openingBalance', label: 'ยอดเงินคงเหลือ', align: 'right', format: 'money' },
    { key: 'branchName', label: 'สาขา' },
    statusColumn,
  ],
}

export const bankNamesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/bank-names',
  createLabel: 'เพิ่มชื่อธนาคาร',
  entityName: 'ชื่อธนาคาร',
  emptyMessage: 'ไม่พบข้อมูลชื่อธนาคาร',
  fields: [
    { key: 'code', label: 'รหัสธนาคาร' },
    { key: 'name', label: 'ชื่อธนาคาร', required: true },
    { key: 'symbol', label: 'สัญลักษณ์' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อธนาคาร' },
    { key: 'symbol', label: 'สัญลักษณ์', align: 'center' },
    statusColumn,
  ],
}

export const suppliersPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/suppliers',
  createLabel: 'เพิ่มผู้ขาย',
  entityName: 'ผู้ขาย',
  emptyMessage: 'ไม่พบข้อมูลผู้ขาย',
  fields: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อผู้ขาย', required: true },
    { key: 'type', label: 'ประเภท' },
    { key: 'taxId', label: 'เลขผู้เสียภาษี' },
    { key: 'phone', label: 'โทรศัพท์' },
    { key: 'branchId', label: 'สาขา', type: 'select', optionsApiPath: '/api/master-data/branches', optionValueKey: 'code' },
    { key: 'bankName', label: 'ธนาคารรับเงิน', type: 'select', optionsApiPath: '/api/master-data/bank-names' },
    { key: 'accountNo', label: 'เลขที่บัญชีรับเงิน' },
    { key: 'address', label: 'ที่อยู่' },
    { key: 'note', label: 'หมายเหตุ' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อผู้ขาย' },
    { key: 'type', label: 'ประเภท' },
    { key: 'phone', label: 'โทร' },
    { key: 'bankName', label: 'ธนาคารรับเงิน' },
    { key: 'accountNo', label: 'เลขที่บัญชีรับเงิน' },
    { key: 'branchName', label: 'สาขา' },
    statusColumn,
  ],
}

export const productsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/products',
  createLabel: 'เพิ่มสินค้า',
  entityName: 'รายการสินค้า',
  emptyMessage: 'ไม่พบข้อมูลสินค้า',
  fields: [
    { key: 'code', label: 'รหัสสินค้า', required: true },
    { key: 'name', label: 'ชื่อสินค้า', required: true },
    { key: 'type', label: 'ประเภท' },
    { key: 'unit', label: 'หน่วย' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อสินค้า' },
    { key: 'unit', label: 'หน่วย', align: 'center' },
    statusColumn,
  ],
}

export const productUnitsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/product-units',
  createLabel: 'เพิ่มหน่วยสินค้า',
  entityName: 'หน่วยสินค้า',
  emptyMessage: 'ไม่พบข้อมูลหน่วยสินค้า',
  fields: [
    { key: 'code', label: 'รหัสหน่วย' },
    { key: 'name', label: 'ชื่อหน่วย', required: true },
    { key: 'symbol', label: 'ตัวย่อ' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อหน่วย' },
    { key: 'symbol', label: 'ตัวย่อ', align: 'center' },
    statusColumn,
  ],
}

export const productTypesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/product-types',
  createLabel: 'เพิ่มประเภทสินค้า',
  entityName: 'ประเภทสินค้า',
  emptyMessage: 'ไม่พบข้อมูลประเภทสินค้า',
  fields: [
    { key: 'code', label: 'รหัสประเภท' },
    { key: 'name', label: 'ชื่อประเภท', required: true },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อประเภท' },
    statusColumn,
  ],
}

export const directorsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/directors',
  createLabel: 'เพิ่มกรรมการ/พนักงาน',
  entityName: 'กรรมการ/พนักงาน',
  emptyMessage: 'ไม่พบข้อมูลกรรมการ/พนักงาน',
  fields: [
    { key: 'code', label: 'รหัส', required: true },
    { key: 'name', label: 'ชื่อ', required: true },
    { key: 'type', label: 'ประเภท', type: 'select', options: [{ label: 'กรรมการ', value: 'กรรมการ' }, { label: 'พนักงาน', value: 'พนักงาน' }, { label: 'อื่นๆ', value: 'อื่นๆ' }] },
    { key: 'phone', label: 'โทรศัพท์' },
    { key: 'bankName', label: 'ธนาคาร', type: 'select', optionsApiPath: '/api/master-data/bank-names' },
    { key: 'accountNo', label: 'เลขบัญชี' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ' },
    { key: 'type', label: 'ประเภท' },
    { key: 'phone', label: 'โทร' },
    { key: 'bankName', label: 'ธนาคาร' },
    { key: 'accountNo', label: 'เลขบัญชี' },
    statusColumn,
  ],
}

export const machinesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/machines',
  createLabel: 'เพิ่มเครื่องจักร',
  entityName: 'รายการเครื่องจักร',
  emptyMessage: 'ไม่พบข้อมูลเครื่องจักร',
  fields: [
    { key: 'name', label: 'ชื่อเครื่องจักร', required: true },
    { key: 'branchId', label: 'สาขา', type: 'select', optionsApiPath: '/api/master-data/branches', optionValueKey: 'code' },
    { key: 'type', label: 'ประเภท', type: 'select', optionsApiPath: '/api/master-data/machine-types' },
    { key: 'capacityKgPerHr', label: 'กำลังผลิต (กก./ชม.)', type: 'number' },
    { key: 'normalYieldPct', label: 'Normal Yield %', type: 'number' },
    { key: 'stdProcessCostPerHr', label: 'ค่า Process/ชม.', type: 'number', inputFormat: 'money' },
  ],
  columns: [
    { key: 'name', label: 'ชื่อเครื่องจักร' },
    { key: 'branchName', label: 'สาขา' },
    { key: 'type', label: 'ประเภท' },
    { key: 'capacityKgPerHr', label: 'กก./ชม.', align: 'right', format: 'number' },
    { key: 'normalYieldPct', label: 'Yield %', align: 'right', format: 'number' },
    statusColumn,
  ],
}

export const machineTypesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/machine-types',
  createLabel: 'เพิ่มประเภทเครื่องจักร',
  entityName: 'ประเภทเครื่องจักร',
  emptyMessage: 'ไม่พบข้อมูลประเภทเครื่องจักร',
  fields: [
    { key: 'name', label: 'ชื่อประเภท', required: true },
  ],
  columns: [
    { key: 'name', label: 'ชื่อประเภท' },
    statusColumn,
  ],
}

export const productionLinesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/production-lines',
  createLabel: 'เพิ่ม Production Line',
  entityName: 'Production Line',
  emptyMessage: 'ไม่พบข้อมูล Production Line',
  fields: [
    { key: 'name', label: 'ชื่อ Line', required: true },
    { key: 'branchId', label: 'สาขา', type: 'select', optionsApiPath: '/api/master-data/branches', optionValueKey: 'code' },
    { key: 'responsiblePerson', label: 'ผู้รับผิดชอบ' },
  ],
  columns: [
    { key: 'name', label: 'ชื่อ Line' },
    { key: 'branchName', label: 'สาขา' },
    { key: 'responsiblePerson', label: 'ผู้รับผิดชอบ' },
    statusColumn,
  ],
}

export const productionOutputCategoriesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/production/output-categories',
  createLabel: 'เพิ่มหมวดหมู่ผลผลิต',
  entityName: 'หมวดหมู่ผลผลิต',
  emptyMessage: 'ไม่พบข้อมูลหมวดหมู่ผลผลิต',
  fields: [
    { key: 'code', label: 'รหัส', required: true },
    { key: 'name', label: 'ชื่อหมวดหมู่', required: true },
    {
      key: 'stockEffect',
      label: 'ผลต่อสต๊อก',
      type: 'select',
      required: true,
      options: [
        { label: 'รับเข้าสต๊อก', value: 'stock_in' },
        { label: 'รับเข้าของคืน', value: 'return_stock_in' },
        { label: 'สูญเสีย/ของเสีย', value: 'loss' },
      ],
    },
    {
      key: 'availableForSale',
      label: 'ขายได้',
      type: 'select',
      options: [
        { label: 'ขายได้', value: 'true' },
        { label: 'ขายไม่ได้', value: 'false' },
      ],
    },
    { key: 'sortOrder', label: 'ลำดับ', type: 'number' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อหมวดหมู่' },
    { key: 'stockEffect', label: 'ผลต่อสต๊อก' },
    { key: 'availableForSale', label: 'ขายได้', align: 'center' },
    { key: 'sortOrder', label: 'ลำดับ', align: 'right', format: 'number' },
    statusColumn,
  ],
}

export const beneficiariesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/beneficiaries',
  createLabel: 'เพิ่มผู้รับเงินต่างประเทศ',
  entityName: 'ผู้รับเงินต่างประเทศ',
  emptyMessage: 'ไม่พบข้อมูลผู้รับเงินต่างประเทศ',
  fields: [
    { key: 'code', label: 'รหัสผู้รับเงิน' },
    { key: 'name', label: 'ชื่อ', required: true },
    { key: 'country', label: 'ประเทศ' },
    { key: 'bankName', label: 'ธนาคาร' },
    { key: 'accountNo', label: 'เลขบัญชี' },
    { key: 'swift', label: 'SWIFT' },
    { key: 'accountCurrency', label: 'สกุลเงินบัญชี' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ' },
    { key: 'country', label: 'ประเทศ' },
    { key: 'bankName', label: 'ธนาคาร' },
    { key: 'swift', label: 'SWIFT' },
    { key: 'accountNo', label: 'เลขบัญชี' },
    { key: 'accountCurrency', label: 'สกุล' },
    statusColumn,
  ],
}

export const paymentMethodsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/payment-methods',
  createLabel: 'เพิ่มวิธีจ่าย/รับเงิน',
  entityName: 'วิธีจ่าย/รับเงิน',
  emptyMessage: 'ไม่พบข้อมูลวิธีจ่าย/รับเงิน',
  fields: [
    { key: 'code', label: 'รหัสวิธีจ่าย/รับเงิน' },
    { key: 'name', label: 'ชื่อ', required: true },
    {
      key: 'type',
      label: 'กลุ่มบัญชี',
      type: 'select',
      required: true,
      options: [
        { label: 'เงินสด', value: 'cash' },
        { label: 'ธนาคาร', value: 'bank' },
      ],
    },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ' },
    { key: 'typeLabel', label: 'กลุ่มบัญชี' },
    statusColumn,
  ],
}

export const accountSubtypesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/account-subtypes',
  createLabel: 'เพิ่มประเภทบัญชีธนาคาร',
  entityName: 'ประเภทบัญชีธนาคาร',
  emptyMessage: 'ไม่พบข้อมูลประเภทบัญชีธนาคาร',
  fields: [
    { key: 'name', label: 'ชื่อ', required: true },
  ],
  columns: [
    { key: 'name', label: 'ชื่อ' },
    statusColumn,
  ],
}

export const vatSettingsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/vat-settings',
  createLabel: 'เพิ่มอัตรา VAT',
  entityName: 'อัตรา VAT',
  emptyMessage: 'ไม่พบข้อมูลอัตรา VAT',
  fields: [
    { key: 'name', label: 'ชื่ออัตรา VAT', required: true },
    { key: 'ratePercent', label: 'VAT %', type: 'number', required: true },
  ],
  columns: [
    { key: 'name', label: 'ชื่อ' },
    { key: 'ratePercent', label: 'VAT %', align: 'right' },
    statusColumn,
  ],
}

export const whtSettingsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/wht-settings',
  createLabel: 'เพิ่มอัตรา WHT',
  entityName: 'อัตรา WHT',
  emptyMessage: 'ไม่พบข้อมูลอัตรา WHT',
  fields: [
    { key: 'name', label: 'ชื่ออัตรา WHT', required: true },
    { key: 'ratePercent', label: 'WHT %', type: 'number', required: true },
  ],
  columns: [
    { key: 'name', label: 'ชื่อ' },
    { key: 'ratePercent', label: 'WHT %', align: 'right' },
    statusColumn,
  ],
}

export const remittancePurposesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/remittance-purposes',
  createLabel: 'เพิ่มวัตถุประสงค์โอน',
  entityName: 'วัตถุประสงค์โอน',
  emptyMessage: 'ไม่พบข้อมูลวัตถุประสงค์โอน',
  fields: [
    { key: 'code', label: 'รหัสวัตถุประสงค์โอน' },
    { key: 'name', label: 'ชื่อวัตถุประสงค์', required: true },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ' },
    statusColumn,
  ],
}
