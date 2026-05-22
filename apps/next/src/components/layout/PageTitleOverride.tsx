'use client'

import { useEffect } from 'react'

const PAGE_TITLE_EVENT = 'ns-scrap-erp-page-title'

type PageTitleOverrideProps = {
  title: string
}

export function PageTitleOverride({ title }: PageTitleOverrideProps) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT, { detail: { title } }))

    return () => {
      window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT, { detail: { title: null } }))
    }
  }, [title])

  return null
}
