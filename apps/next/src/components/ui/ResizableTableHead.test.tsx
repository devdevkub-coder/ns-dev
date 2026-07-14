import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ResizableTableHead } from './ResizableTableHead'

describe('ResizableTableHead numeric alignment', () => {
  it('keeps a right-aligned label on the same edge as its body values', () => {
    const html = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <ResizableTableHead
              activeSortKey="amount"
              align="right"
              direction="asc"
              label="ยอดรวม"
              sortKey="amount"
              onSort={() => undefined}
            />
          </tr>
        </thead>
      </table>,
    )

    expect(html.indexOf('<svg')).toBeLessThan(html.indexOf('ยอดรวม'))
    expect(html).toContain('p-2 pr-3')
  })
})
