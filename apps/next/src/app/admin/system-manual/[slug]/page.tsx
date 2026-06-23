import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { findManualPage, manualPages } from '../manual-content'
import { SystemManualPage } from '../SystemManualPage'

type ManualRouteProps = {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return manualPages.map((manual) => ({ slug: manual.slug }))
}

export async function generateMetadata({ params }: ManualRouteProps): Promise<Metadata> {
  const { slug } = await params
  const manual = findManualPage(slug)
  return {
    title: `คู่มือระบบ | ${manual.title}`,
  }
}

export default async function ManualModulePage({ params }: ManualRouteProps) {
  const { slug } = await params
  const manual = findManualPage(slug)

  if (manual.slug !== slug) {
    notFound()
  }

  return <SystemManualPage manual={manual} />
}
