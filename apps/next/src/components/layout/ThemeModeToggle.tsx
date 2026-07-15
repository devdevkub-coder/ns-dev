'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'
  const nextTheme = isDark ? 'light' : 'dark'
  const actionLabel = !mounted
    ? 'สลับธีม'
    : nextTheme === 'dark'
      ? 'เปิดโหมดมืด'
      : 'เปิดโหมดสว่าง'

  function toggleTheme() {
    if (!mounted) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!('startViewTransition' in document) || prefersReducedMotion) {
      setTheme(nextTheme)
      return
    }

    const rect = buttonRef.current?.getBoundingClientRect()
    const originX = rect ? rect.left + rect.width / 2 : window.innerWidth
    const originY = rect ? rect.top + rect.height / 2 : 0
    const radius = Math.hypot(
      Math.max(originX, window.innerWidth - originX),
      Math.max(originY, window.innerHeight - originY),
    )
    const transition = document.startViewTransition(() => setTheme(nextTheme))

    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${originX}px ${originY}px)`, `circle(${radius}px at ${originX}px ${originY}px)`] },
        {
          duration: 420,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    }).catch(() => {})
  }

  return (
    <button
      aria-label={actionLabel}
      aria-checked={isDark}
      data-state={isDark ? 'checked' : 'unchecked'}
      ref={buttonRef}
      className="inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-[#e5e5e5] p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#737373]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#ffffff] dark:focus-visible:ring-offset-[#0f172a]"
      role="switch"
      title={actionLabel}
      type="button"
      onClick={toggleTheme}
    >
      <span
        className="pointer-events-none flex size-5 items-center justify-center rounded-full bg-white text-[#525252] shadow-lg ring-0 transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=checked]:bg-[#171717] data-[state=checked]:text-[#fafafa]"
        data-state={isDark ? 'checked' : 'unchecked'}
      >
        {mounted && isDark ? <Moon className="size-3" aria-hidden="true" /> : <Sun className="size-3" aria-hidden="true" />}
      </span>
    </button>
  )
}
