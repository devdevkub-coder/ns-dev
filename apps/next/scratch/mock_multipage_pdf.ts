/**
 * Mock PDF Generator สำหรับทดสอบ multi-page
 *
 * สร้าง weight ticket จำลองที่มี 50 รายการสินค้า + 20 รูป
 * แล้ว render PDF ผ่าน code path เดียวกับส่ง LINE จริง (generateWeightTicketPdf)
 * เพื่อดูว่าเอกสารที่เนื้อหาเยอะจะขยายเป็นหลายหน้ายังไง
 *
 * ไม่แตะ Database เลย — ใช้ mock data ทั้งหมด
 *
 * วิธีรัน:
 *   cd apps/next && npx tsx scratch/mock_multipage_pdf.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateWeightTicketPdf } from '../src/lib/server/weight-ticket-line-notification'
import type { WeightTicketRecord, WeightTicketRecordLine } from '../src/lib/weight-tickets'

// รายชื่อสินค้าจริงบางส่วนของโรงงาน (ใช้แค่ชื่อ mock ไม่ได้ query DB)
const PRODUCT_NAMES = [
  'ทองแดงเส้น',
  'อลูมิเนียมแท่ง',
  'สแตนเลส 304',
  'ทองเหลืองก้าน',
  'เหล็กกล้าเส้น',
  'ตะกั่วแท่ง',
  'สังกะสีเส้น',
  'ทองแดงเส้นใหญ่',
  'อลูมิเนียมแผ่น',
  'สแตนเลส 316',
]

const IMPURITY_NAMES = ['ขยะปน', 'กระดาษ', 'การ์ด', 'พลาสติก', 'อื่นๆ']

function makeLine(index: number): WeightTicketRecordLine {
  const productIndex = index % PRODUCT_NAMES.length
  const productName = PRODUCT_NAMES[productIndex]
  const grossWeight = 100 + (index * 7) % 400 // 100-500 kg
  const containerDeduction = 4
  const deductionWeight = 5 + (index % 10)
  const netWeight = grossWeight - containerDeduction - deductionWeight
  const hasImpurity = index % 3 === 0
  const imageCount = 1 + (index % 3) // 1-3 รูปต่อ line

  return {
    id: `mock-line-${index + 1}`,
    lineNo: index + 1,
    productId: `SKU-${String(productIndex + 1).padStart(3, '0')}`,
    productName: `${productName} (รุ่น ${index + 1})`,
    warehouseId: 'WH-RM-01',
    warehouseName: 'คลังวัตถุดิบหลัก',
    warehouseType: 'RM',
    grossWeight: String(grossWeight),
    grossWeightValue: grossWeight,
    containerDeductionWeight: String(containerDeduction),
    containerDeductionWeightValue: containerDeduction,
    deductionMode: hasImpurity ? 'kg' : 'none',
    deductionValue: hasImpurity ? String(deductionWeight) : '0',
    deductionWeight,
    netWeight,
    impurityId: hasImpurity ? 'IMP-001' : '',
    impurityName: hasImpurity ? IMPURITY_NAMES[index % IMPURITY_NAMES.length] : '',
    note: hasImpurity ? `หัก ${IMPURITY_NAMES[index % IMPURITY_NAMES.length]} ${deductionWeight} กก.` : '-',
    imageNames: Array.from({ length: imageCount }, (_, i) => `mock-photo-${index + 1}-${i + 1}.jpg`),
    imageCount,
  }
}

function makeMockTicket(lineCount: number, imageCount: number): WeightTicketRecord {
  const lines: WeightTicketRecordLine[] = Array.from({ length: lineCount }, (_, i) => makeLine(i))

  const totals = lines.reduce(
    (acc, line) => ({
      grossWeight: acc.grossWeight + line.grossWeightValue,
      containerDeductionWeight: acc.containerDeductionWeight + line.containerDeductionWeightValue,
      deductionWeight: acc.deductionWeight + line.deductionWeight,
      netWeight: acc.netWeight + line.netWeight,
    }),
    { grossWeight: 0, containerDeductionWeight: 0, deductionWeight: 0, netWeight: 0 }
  )

  // สร้างรูป mock (ใช้ชื่อไฟล์เฉยๆ — generateWeightTicketPdf จะ handle รูปที่โหลดไม่ได้เป็น placeholder)
  const imageNames = Array.from({ length: imageCount }, (_, i) => `mock-vehicle-${i + 1}.jpg`)

  // group summary ระดับสินค้า
  const productGroups = new Map<string, { productId: string; productName: string; lines: WeightTicketRecordLine[] }>()
  for (const line of lines) {
    const key = line.productId
    if (!productGroups.has(key)) {
      productGroups.set(key, { productId: line.productId, productName: line.productName, lines: [] })
    }
    productGroups.get(key)!.lines.push(line)
  }

  const productSummaries = Array.from(productGroups.values()).map((group) => {
    const groupTotals = group.lines.reduce(
      (acc, line) => ({
        grossWeight: acc.grossWeight + line.grossWeightValue,
        containerDeductionWeight: acc.containerDeductionWeight + line.containerDeductionWeightValue,
        deductWeight: acc.deductWeight + line.deductionWeight,
        netWeight: acc.netWeight + line.netWeight,
      }),
      { grossWeight: 0, containerDeductionWeight: 0, deductWeight: 0, netWeight: 0 }
    )
    return {
      id: `mock-summary-${group.productId}`,
      productId: group.productId,
      productName: group.productName,
      lineCount: group.lines.length,
      grossWeight: groupTotals.grossWeight,
      containerDeductionWeight: groupTotals.containerDeductionWeight,
      deductWeight: groupTotals.deductWeight,
      netWeight: groupTotals.netWeight,
      billedWeight: 0,
      remainingWeight: groupTotals.netWeight,
      hasMixedDeductionProfiles: false,
    }
  })

  return {
    id: 'mock-ticket-001',
    documentNo: 'WTIMOCK2606-0001',
    type: 'WTI',
    status: 'received' as const,
    branchId: '01',
    branchName: 'สมุทรสาคร',
    partyId: 'SUP-MOCK-001',
    partyName: 'บริษัท Mock Supplier จำกัด',
    vehicleNo: 'ทก-1234 กรุงเทพมหานคร',
    documentDate: '2026-06-26',
    createdAt: '2026-06-26T10:00:00+07:00',
    updatedAt: null,
    updatedBy: '',
    enteredBy: 'Mock Tester',
    remark: 'เอกสารทดสอบ multi-page (mock data)',
    cancelNote: '',
    cancelledAt: null,
    canEdit: true,
    canCancel: true,
    lines,
    productSummaries,
    totals,
    imageCount,
    imageNames,
    vehicleImageCount: 0,
    vehicleImageNames: [],
    warehouseName: 'คลังวัตถุดิบหลัก',
    usedInPurchaseBillCount: 0,
    usedInPurchaseBillDocNos: [],
    usedInSalesBillCount: 0,
    usedInSalesBillDocNos: [],
    downstreamAllocations: [],
    timeline: [],
    usageTimeline: [],
  }
}

async function main() {
  console.log('=== Mock Multi-Page PDF Test ===')
  console.log('สร้างเอกสารจำลอง: 50 รายการสินค้า + 20 รูป')
  console.log('(ไม่แตะ Database)')
  console.log('')

  const ticket = makeMockTicket(50, 20)

  // Profile mock แบบง่าย (generateWeightTicketPdf ใช้ loadCompanyPrintProfile ภายในเอง ถ้าส่ง null)
  console.log('เริ่ม render PDF ผ่าน code path เดียวกับส่ง LINE จริง...')
  const { pdfBuffer } = await generateWeightTicketPdf(ticket, null)

  const outputPath = join(process.cwd(), 'scratch', 'mock_multipage_output.pdf')
  writeFileSync(outputPath, pdfBuffer)

  console.log('')
  console.log('=== เสร็จสิ้น ===')
  console.log(`ไฟล์ PDF: ${outputPath}`)
  console.log(`ขนาด: ${(pdfBuffer.length / 1024).toFixed(1)} KB`)
  console.log('')
  console.log('เปิดไฟล์ดูผลลัพธ์ multi-page เพื่อตรวจสอบการแบ่งหน้า')
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
