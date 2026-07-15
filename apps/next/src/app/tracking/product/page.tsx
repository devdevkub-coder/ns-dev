import type { Metadata } from 'next'
import { ProductTrackingPageClient } from '@/components/tracking/ProductTrackingPageClient'

export const metadata: Metadata = {
  title: 'ติดตามสินค้า | NS Scrap ERP',
}

type ProductTrackingPageProps = {
  searchParams?: Promise<{
    customerId?: string
    dateFrom?: string
    dateTo?: string
    metalGroup?: string
    month?: string
    productId?: string
    q?: string
    supplierId?: string
    year?: string
  }>
}

export default async function ProductTrackingPage({ searchParams }: ProductTrackingPageProps) {
  const params = await searchParams
  return (
    <ProductTrackingPageClient
      initialCustomerId={params?.customerId}
      initialDateFrom={params?.dateFrom}
      initialDateTo={params?.dateTo}
      initialMetalGroup={params?.metalGroup}
      initialMonth={params?.month}
      initialProductId={params?.productId}
      initialSearch={params?.q}
      initialSupplierId={params?.supplierId}
      initialYear={params?.year}
    />
  )
}
