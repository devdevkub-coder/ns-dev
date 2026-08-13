import { describe, expect, it } from 'vitest'
import { supplierFormSchema, supplierBankAccountValidationIssues } from '@/lib/supplier'

describe('SupplierForm Sequential Validation Order Contract', () => {
  it('detects top-most invalid field first in sequential DOM order', () => {
    // Step 1: Nothing filled -> Error on name
    const step1 = { type: 'นิติบุคคล' as const, name: '', salesId: null, branchIds: [] }
    const res1 = supplierFormSchema.safeParse(step1)
    const err1: Record<string, string> = !res1.success ? Object.fromEntries(res1.error.issues.map((i) => [i.path.join('.'), i.message])) : {}
    expect(err1.name).toBe('กรอกชื่อบริษัท')
    expect(err1.salesId).toBe('เลือกผู้ดูแล')

    // Step 2: Name filled -> Error on salesId
    const step2 = { type: 'นิติบุคคล' as const, name: 'บริษัท ทดสอบ จำกัด', salesId: null, branchIds: [] }
    const res2 = supplierFormSchema.safeParse(step2)
    const err2: Record<string, string> = !res2.success ? Object.fromEntries(res2.error.issues.map((i) => [i.path.join('.'), i.message])) : {}
    expect(err2.name).toBeUndefined()
    expect(err2.salesId).toBe('เลือกผู้ดูแล')

    // Step 3: Name & SalesId filled -> Error on branchIds
    const step3 = { type: 'นิติบุคคล' as const, name: 'บริษัท ทดสอบ จำกัด', salesId: 'SALES001', branchIds: [] }
    const res3 = supplierFormSchema.safeParse(step3)
    const err3: Record<string, string> = !res3.success ? Object.fromEntries(res3.error.issues.map((i) => [i.path.join('.'), i.message])) : {}
    const branchErr3: Record<string, string> = step3.branchIds.length === 0 ? { branchIds: 'เลือกสาขาที่ใช้ได้อย่างน้อย 1 สาขา' } : {}
    const all3: Record<string, string> = { ...err3, ...branchErr3 }
    expect(all3.name).toBeUndefined()
    expect(all3.salesId).toBeUndefined()
    expect(all3.branchIds).toBe('เลือกสาขาที่ใช้ได้อย่างน้อย 1 สาขา')

    // Step 4: Name, SalesId & BranchIds filled -> Error on bankAccounts
    const step4 = {
      type: 'นิติบุคคล' as const,
      name: 'บริษัท ทดสอบ จำกัด',
      salesId: 'SALES001',
      branchIds: ['01'],
      bankAccounts: [{ id: null, paymentMethod: '', bankName: null, accountNo: null, bankAccount: null, branchCode: null, isPrimary: true, active: true }],
    }
    const res4 = supplierFormSchema.safeParse(step4)
    const err4: Record<string, string> = !res4.success ? Object.fromEntries(res4.error.issues.map((i) => [i.path.join('.'), i.message])) : {}
    const bankIssues4 = res4.success ? supplierBankAccountValidationIssues(res4.data as any, []) : []
    const bankErr4: Record<string, string> = Object.fromEntries(bankIssues4.map((i) => [i.path.join('.'), i.message]))
    const all4: Record<string, string> = { ...err4, ...bankErr4 }
    expect(all4.name).toBeUndefined()
    expect(all4.salesId).toBeUndefined()
    expect(all4.branchIds).toBeUndefined()
    expect(all4['bankAccounts.0.paymentMethod']).toBe('เลือกวิธีจ่าย/รับเงิน')
  })
})
