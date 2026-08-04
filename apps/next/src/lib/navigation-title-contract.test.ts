import { describe, expect, it } from 'vitest'
import { breadcrumbsForPath, navigationItems, navigationSections, pageTitleForPath } from './navigation'

function displayLabel(label: string) {
  return label.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

describe('sidebar page-title contract', () => {
  it('uses every effective sidebar label for shell titles and breadcrumbs, without parenthetical text', () => {
    for (const parent of navigationItems) {
      const entries = parent.children?.length ? parent.children : [parent]
      const sectionLabel = navigationSections.find((section) => section.key === parent.section)?.label

      for (const entry of entries) {
        const breadcrumbs = breadcrumbsForPath(entry.href)

        expect(pageTitleForPath(entry.href, 'legacy title override')).toBe(displayLabel(entry.label))
        expect(breadcrumbs.at(-1)?.label).toBe(displayLabel(entry.label))
        expect(breadcrumbs[0]?.label).toBe(displayLabel(sectionLabel ?? ''))

        if (entry !== parent) {
          expect(breadcrumbs[1]).toEqual({ href: parent.href, label: displayLabel(parent.label) })
        }
      }
    }
  })

  it('keeps a dynamic detail title when no sidebar route owns the path', () => {
    expect(pageTitleForPath('/sales/bills/123', 'รายละเอียดบิลขาย - SB0001')).toBe('รายละเอียดบิลขาย - SB0001')
  })
})
