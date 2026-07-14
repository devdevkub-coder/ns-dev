import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MobileFilterSheet } from './MobileFilterSheet'

describe('MobileFilterSheet', () => {
  it('uses the canonical 80dvh cap and a theme-stable dark scrim', () => {
    const html = renderToStaticMarkup(
      <MobileFilterSheet
        footer={<button type="button">ใช้ตัวกรอง</button>}
        onClose={() => undefined}
        title="ตัวกรอง"
      >
        <div>filters</div>
      </MobileFilterSheet>,
    )

    expect(html).toContain('max-h-[80dvh]')
    expect(html).toContain('bg-[rgba(2,6,23,0.55)]')
  })
})
