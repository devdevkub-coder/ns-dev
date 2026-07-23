// @vitest-environment jsdom

import * as React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { TableActionButton, TableActionMenuItem } from './TableActionButton'

describe('TableActionButton', () => {
  it('renders an accessible ellipsis-only trigger without a visible frame', () => {
    const html = renderToStaticMarkup(<TableActionButton label="แก้ไขรายการ" />)

    expect(html).toContain('aria-label="แก้ไขรายการ"')
    expect(html).toContain('<svg')
    expect(html).not.toContain('>จัดการ<')
    expect(html).not.toContain('>แก้ไขรายการ<')
    expect(html).toContain('h-9 w-9')
    expect(html).toContain('border-0 bg-transparent')
    expect(html).toContain('shadow-none')
  })

  it('renders the outlined management label for mobile cards', () => {
    const html = renderToStaticMarkup(<TableActionButton mobileLabel />)

    expect(html).toContain('>จัดการ</button>')
    expect(html).not.toContain('<svg')
    expect(html).toContain('h-9')
    expect(html).toContain('w-full')
    expect(html).toContain('border-slate-300 bg-white')
  })

  it('keeps the action menu compact with centered labels and subtle row dividers', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ui/TableActionButton.tsx'), 'utf8')

    expect(source).toContain('min-w-56')
    expect(source).toContain('w-[var(--radix-dropdown-menu-trigger-width)]')
    expect(source).toContain('grid-cols-[1rem_minmax(0,1fr)_1rem]')
    expect(source).toContain('border-b border-slate-200/80')
    expect(source).toContain('last:border-b-0')
    expect(source).toContain('className="size-4 shrink-0"')
    expect(source).toContain('className="min-w-0 text-center"')
    expect(source).not.toContain('min-h-14')
  })

  it('does not let a portalled menu selection open the parent row', async () => {
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    const container = document.createElement('div')
    const onRowClick = vi.fn()
    const onShare = vi.fn()
    document.body.appendChild(container)
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <div onClick={onRowClick}>
            <TableActionButton
              aria-label="จัดการ WTI012607-0016"
              menu={<TableActionMenuItem onSelect={onShare}>แชร์</TableActionMenuItem>}
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
        )
      })

      const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="จัดการ WTI012607-0016"]')
      if (!trigger) throw new Error('Expected action trigger')
      await act(async () => {
        trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      const shareItem = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.includes('แชร์'))
      if (!shareItem) throw new Error('Expected share menu item')
      await act(async () => {
        shareItem.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(onShare).toHaveBeenCalledTimes(1)
      expect(onRowClick).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
      container.remove()
    }
  })
})
