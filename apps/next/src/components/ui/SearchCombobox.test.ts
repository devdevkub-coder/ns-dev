import { describe, expect, it } from 'vitest'

import { getSearchComboboxPanelPlacement } from './SearchCombobox'

describe('SearchCombobox panel placement', () => {
  it('opens upward when the mobile visual viewport has insufficient space below the input', () => {
    expect(getSearchComboboxPanelPlacement({
      inputRect: { bottom: 620, left: 16, top: 580, width: 300 },
      viewport: { height: 700, top: 0 },
    })).toEqual({
      maxHeight: 256,
      placement: 'above',
      top: 320,
    })
  })

  it('keeps the panel below the input and caps it to the available viewport space', () => {
    expect(getSearchComboboxPanelPlacement({
      inputRect: { bottom: 120, left: 16, top: 80, width: 300 },
      viewport: { height: 700, top: 0 },
    })).toEqual({
      maxHeight: 256,
      placement: 'below',
      top: 124,
    })
  })
})
