import { NextResponse } from 'next/server'
import { customerFormSchema } from '@/lib/customer'
import { mapPrismaCustomer, toCustomerWriteInput } from '@/lib/domain/customer'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

async function getNextCustomerCode() {
  const lastCustomer = await prisma.customers.findFirst({
    where: {
      code: {
        startsWith: 'CUS',
      },
    },
    orderBy: {
      code: 'desc',
    },
    select: {
      code: true,
    },
  })

  const lastNumber = Number(String(lastCustomer?.code ?? '').replace(/^CUS/i, ''))
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `CUS${String(nextNumber).padStart(3, '0')}`
}

export async function GET() {
  try {
    const customers = await prisma.customers.findMany({
      orderBy: {
        code: 'asc',
      },
    })

    return NextResponse.json(customers.map(mapPrismaCustomer))
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'โหลดข้อมูลลูกค้าไม่ได้' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const values = customerFormSchema.parse(body)
    const code = values.id ? values.code : await getNextCustomerCode()
    const payload = toCustomerWriteInput({ ...values, code })

    const customer = await prisma.customers.upsert({
      where: {
        id: payload.id,
      },
      create: payload,
      update: payload,
    })

    return NextResponse.json(mapPrismaCustomer(customer))
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'บันทึกข้อมูลลูกค้าไม่ได้' }, { status: 400 })
  }
}
