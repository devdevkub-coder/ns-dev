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
    { key: 'code', label: 'รหัส', required: true },
    { key: 'name', label: 'ชื่อสกุลเงิน', required: true },
    { key: 'symbol', label: 'สัญลักษณ์' },
    { key: 'rateToThb', label: 'อัตราเทียบบาท', type: 'number' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
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
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อหมวด', required: true },
    { key: 'parentId', label: 'หมวดแม่' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อหมวด' },
    { key: 'parentId', label: 'หมวดแม่' },
    statusColumn,
  ],
}

export const channelsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/channels',
  createLabel: 'เพิ่มช่องทาง',
  entityName: 'ช่องทางซื้อ/ขาย',
  emptyMessage: 'ไม่พบข้อมูลช่องทางซื้อ/ขาย',
  fields: [
    { key: 'channelType', label: 'ประเภทช่องทาง', type: 'select', required: true, options: [{ label: 'ซื้อ', value: 'purchase' }, { label: 'ขาย', value: 'sales' }] },
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อช่องทาง', required: true },
  ],
  columns: [
    { key: 'channelType', label: 'ประเภท' },
    { key: 'code', label: 'รหัส' },
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
  createLabel: 'เพิ่มคลังสินค้า',
  entityName: 'คลังสินค้า',
  emptyMessage: 'ไม่พบข้อมูลคลังสินค้า',
  fields: [
    { key: 'code', label: 'รหัสคลัง', required: true },
    { key: 'name', label: 'ชื่อคลัง', required: true },
    { key: 'branchId', label: 'สาขา', type: 'select', options: [{ label: 'สมุทรสาคร', value: 'BR002' }, { label: 'นครสวรรค์', value: 'BR003' }] },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อคลัง' },
    { key: 'branchName', label: 'สาขา' },
    statusColumn,
  ],
}

export const accountsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/accounts',
  createLabel: 'เพิ่มบัญชีเงิน',
  entityName: 'บัญชีเงิน',
  emptyMessage: 'ไม่พบข้อมูลบัญชีเงิน',
  fields: [
    { key: 'code', label: 'รหัสบัญชี' },
    { key: 'name', label: 'ชื่อบัญชี', required: true },
    { key: 'type', label: 'ประเภท', type: 'select', required: true, options: [{ label: 'เงินสด', value: 'cash' }, { label: 'ธนาคาร', value: 'bank' }, { label: 'อื่น ๆ', value: 'other' }] },
    { key: 'bankName', label: 'ธนาคาร', type: 'select', optionsApiPath: '/api/master-data/bank-names' },
    { key: 'accountNo', label: 'เลขที่บัญชี' },
    { key: 'currency', label: 'สกุลเงิน' },
    { key: 'openingBalance', label: 'ยอดยกมา', type: 'number' },
    { key: 'odLimit', label: 'วงเงิน OD', type: 'number' },
    { key: 'branchId', label: 'รหัสสาขา' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อบัญชี' },
    { key: 'type', label: 'ประเภท' },
    { key: 'bankName', label: 'ธนาคาร' },
    { key: 'accountNo', label: 'เลขที่บัญชี' },
    { key: 'currency', label: 'สกุลเงิน', align: 'center' },
    { key: 'openingBalance', label: 'ยอดยกมา', align: 'right', format: 'money' },
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
    { key: 'code', label: 'รหัส', required: true },
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
    { key: 'branchId', label: 'รหัสสาขา' },
    { key: 'creditTerm', label: 'เครดิตเทอม (วัน)', type: 'number' },
    { key: 'creditLimit', label: 'วงเงินเครดิต', type: 'number' },
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
    { key: 'creditTerm', label: 'Term', align: 'right', format: 'number' },
    { key: 'creditLimit', label: 'วงเงินเครดิต', align: 'right', format: 'money' },
    statusColumn,
  ],
}

export const productsPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/products',
  createLabel: 'เพิ่มสินค้า',
  entityName: 'สินค้า',
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
    { key: 'code', label: 'รหัสหน่วย', required: true },
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
    { key: 'code', label: 'รหัสประเภท', required: true },
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
  entityName: 'เครื่องจักร',
  emptyMessage: 'ไม่พบข้อมูลเครื่องจักร',
  fields: [
    { key: 'code', label: 'รหัสเครื่องจักร', required: true },
    { key: 'name', label: 'ชื่อเครื่องจักร', required: true },
    { key: 'branchId', label: 'รหัสสาขา' },
    { key: 'type', label: 'ประเภท', type: 'select', options: [{ label: 'Sorting', value: 'Sorting' }, { label: 'Cutting', value: 'Cutting' }, { label: 'Baling', value: 'Baling' }, { label: 'Crushing', value: 'Crushing' }, { label: 'Melting', value: 'Melting' }, { label: 'Other', value: 'Other' }] },
    { key: 'capacityKgPerHr', label: 'กำลังผลิต (กก./ชม.)', type: 'number' },
    { key: 'normalYieldPct', label: 'Normal Yield %', type: 'number' },
    { key: 'stdProcessCostPerHr', label: 'ค่า Process/ชม.', type: 'number' },
    { key: 'maintenanceStatus', label: 'สถานะบำรุงรักษา', type: 'select', options: [{ label: 'Normal', value: 'Normal' }, { label: 'Maintenance', value: 'Maintenance' }, { label: 'Breakdown', value: 'Breakdown' }] },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อเครื่องจักร' },
    { key: 'branchId', label: 'สาขา' },
    { key: 'type', label: 'ประเภท' },
    { key: 'capacityKgPerHr', label: 'กก./ชม.', align: 'right', format: 'number' },
    { key: 'normalYieldPct', label: 'Yield %', align: 'right', format: 'number' },
    { key: 'maintenanceStatus', label: 'บำรุงรักษา' },
    statusColumn,
  ],
}

export const productionLinesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/production-lines',
  createLabel: 'เพิ่ม Production Line',
  entityName: 'Production Line',
  emptyMessage: 'ไม่พบข้อมูล Production Line',
  fields: [
    { key: 'code', label: 'รหัส Line', required: true },
    { key: 'name', label: 'ชื่อ Line', required: true },
    { key: 'branchId', label: 'รหัสสาขา' },
    { key: 'responsiblePerson', label: 'ผู้รับผิดชอบ' },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ Line' },
    { key: 'branchId', label: 'สาขา' },
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
    { key: 'name', label: 'ชื่อ', required: true },
    { key: 'country', label: 'ประเทศ' },
    { key: 'bankName', label: 'ธนาคาร' },
    { key: 'accountNo', label: 'เลขบัญชี' },
    { key: 'swift', label: 'SWIFT' },
    { key: 'accountCurrency', label: 'สกุลเงินบัญชี' },
  ],
  columns: [
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
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ', required: true },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ' },
    statusColumn,
  ],
}

export const remittancePurposesPageConfig: MasterDataPageConfig = {
  apiPath: '/api/master-data/remittance-purposes',
  createLabel: 'เพิ่มวัตถุประสงค์โอน',
  entityName: 'วัตถุประสงค์โอน',
  emptyMessage: 'ไม่พบข้อมูลวัตถุประสงค์โอน',
  fields: [
    { key: 'code', label: 'รหัส', required: true },
    { key: 'name', label: 'ชื่อวัตถุประสงค์', required: true },
  ],
  columns: [
    { key: 'code', label: 'รหัส' },
    { key: 'name', label: 'ชื่อ' },
    statusColumn,
  ],
}
