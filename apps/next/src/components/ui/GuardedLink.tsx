'use client'

import Link, { type LinkProps } from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'

import { useActionConfirmation } from '@/components/ui/FormSafetyProvider'

type GuardedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & LinkProps & {
  href: string
}

function isModifiedNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

export function GuardedLink({ href, onClick, replace = false, target, ...props }: GuardedLinkProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { requestNavigation } = useActionConfirmation()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || isModifiedNavigation(event) || target === '_blank' || props.download || href === pathname) return

    event.preventDefault()
    requestNavigation(() => {
      if (replace) {
        router.replace(href)
      } else {
        router.push(href)
      }
    })
  }

  return <Link href={href} replace={replace} target={target} {...props} onClick={handleClick} />
}
