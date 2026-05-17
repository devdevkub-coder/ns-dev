import { z } from 'zod'

export const customerSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().nullable().default(null),
  taxId: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  addressNo: z.string().nullable().default(null),
  addressMoo: z.string().nullable().default(null),
  addressVillage: z.string().nullable().default(null),
  addressRoad: z.string().nullable().default(null),
  addressSubdistrict: z.string().nullable().default(null),
  addressDistrict: z.string().nullable().default(null),
  addressProvince: z.string().nullable().default(null),
  addressPostalCode: z.string().nullable().default(null),
  addressCountry: z.string().nullable().default(null),
  contact: z.string().nullable().default(null),
  creditTerm: z.number().int().nullable().default(null),
  creditLimit: z.number().nullable().default(null),
  salesId: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  active: z.boolean().default(true),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
})

export const customerListSchema = z.array(customerSchema)
export type Customer = z.infer<typeof customerSchema>

export const customerFormSchema = z.object({
  id: z.string().trim().optional(),
  code: z.string().trim().optional().nullable().default(null),
  name: z.string().trim().min(1, 'กรอกชื่อลูกค้า'),
  type: z.string().trim().nullable().default(null),
  taxId: z.string().trim().nullable().default(null),
  phone: z.string().trim().nullable().default(null),
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').or(z.literal('')).nullable().default(null),
  address: z.string().trim().nullable().default(null),
  addressNo: z.string().trim().nullable().default(null),
  addressMoo: z.string().trim().nullable().default(null),
  addressVillage: z.string().trim().nullable().default(null),
  addressRoad: z.string().trim().nullable().default(null),
  addressSubdistrict: z.string().trim().nullable().default(null),
  addressDistrict: z.string().trim().nullable().default(null),
  addressProvince: z.string().trim().nullable().default(null),
  addressPostalCode: z.string().trim().nullable().default(null),
  addressCountry: z.string().trim().nullable().default('ไทย'),
  contact: z.string().trim().nullable().default(null),
  creditTerm: z.number().int().min(0).nullable().default(null),
  creditLimit: z.number().min(0).nullable().default(null),
  salesId: z.string().trim().nullable().default(null),
  notes: z.string().trim().nullable().default(null),
  active: z.boolean().default(true),
})

export type CustomerFormValues = z.infer<typeof customerFormSchema>

async function readJson<TSchema extends z.ZodTypeAny>(response: Response, schema: TSchema): Promise<z.output<TSchema>> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Request failed')
  }

  return schema.parse(payload)
}

export async function listCustomers(): Promise<Customer[]> {
  const response = await fetch('/api/master-data/customers', { cache: 'no-store' })
  return readJson(response, customerListSchema)
}

export async function saveCustomer(values: CustomerFormValues): Promise<Customer> {
  const response = await fetch('/api/master-data/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })

  return readJson(response, customerSchema)
}

export async function setCustomerActive(customerId: string, active: boolean): Promise<Customer> {
  const response = await fetch(`/api/master-data/customers/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  })

  return readJson(response, customerSchema)
}
