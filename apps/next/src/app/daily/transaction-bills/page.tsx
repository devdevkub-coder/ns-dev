import { redirect } from 'next/navigation'

type TransactionBillsRedirectPageProps = {
  searchParams?: Promise<{
    mode?: string
  }>
}

export default async function TransactionBillsRedirectPage({ searchParams }: TransactionBillsRedirectPageProps) {
  const params = await searchParams
  if (params?.mode === 'purchase') {
    redirect('/purchase/bills')
  }
  redirect('/sales/bills')
}
