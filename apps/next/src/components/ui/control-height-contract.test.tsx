import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BranchSelectCombobox } from './BranchSelectCombobox'
import { Combobox, ComboboxInput } from './combobox'
import { DatePicker } from './date-picker'
import { DatePickerInput } from './date-picker-input'
import { Input } from './Input'
import { InputGroup, InputGroupInput } from './input-group'
import { SearchCombobox } from './SearchCombobox'
import { Select } from './Select'

const branches = [{ id: 'branch-a', name: 'Branch A' }]

function expectClassForAttribute(markup: string, tag: string, attribute: string, value: string, className: string) {
  expect(markup).toMatch(new RegExp(`<${tag}(?=[^>]*${attribute}="${value}")(?=[^>]*class="[^"]*\\b${className}\\b)[^>]*>`))
}

describe('shared single-line control height contract', () => {
  it('uses h-10 defaults without changing each primitive width contract', () => {
    const markup = renderToStaticMarkup(
      <>
        <Input id="contract-input" />
        <Select aria-label="contract-select"><option value="open">Open</option></Select>
        <SearchCombobox hideLabel inputId="contract-search" label="Search" options={[]} value="" onChange={() => undefined} />
        <Combobox inputId="contract-combobox" items={['One']} value="One">
          <ComboboxInput aria-label="contract-combobox" withDropdownButton />
        </Combobox>
        <InputGroup data-testid="contract-input-group"><InputGroupInput id="contract-input-group-input" /></InputGroup>
        <DatePickerInput id="contract-date-input" value="" onChange={() => undefined} />
        <DatePicker id="contract-date-picker" onChange={() => undefined} />
        <BranchSelectCombobox branches={branches} inputId="contract-branch" placeholder="Choose branch" value="branch-a" onChange={() => undefined} />
      </>,
    )

    for (const id of ['contract-input', 'contract-search', 'contract-combobox', 'contract-branch']) {
      expectClassForAttribute(markup, 'input', 'id', id, 'h-10')
    }
    expectClassForAttribute(markup, 'div', 'data-testid', 'contract-input-group', 'h-10')
    expect(markup).toMatch(/<div(?=[^>]*data-slot="input-group")(?=[^>]*class="[^"]*\bh-10\b[^"]*w-\[130px\][^"]*")[^>]*>/)
    expect(markup).toMatch(/<button(?=[^>]*aria-label="contract-select")(?=[^>]*class="[^"]*\bh-10\b)[^>]*>/)
    expect(markup).toMatch(/<button(?=[^>]*id="contract-date-picker")(?=[^>]*class="[^"]*\bh-10\b)[^>]*>/)

    expect(markup).toMatch(/<input(?=[^>]*id="contract-input")(?=[^>]*class="[^"]*\bw-full\b)[^>]*>/)
    expect(markup).toMatch(/<button(?=[^>]*aria-label="contract-select")(?=[^>]*class="[^"]*\bw-full\b)[^>]*>/)
    expect(markup).toMatch(/<div(?=[^>]*data-slot="input-group")(?=[^>]*class="[^"]*\bh-10\b[^"]*w-\[130px\][^"]*")[^>]*>/)
  })

  it('keeps h-9 as an explicit filter-only variant without changing widths', () => {
    const markup = renderToStaticMarkup(
      <>
        <Input id="filter-input" className="h-9" />
        <Select aria-label="filter-select" className="h-9"><option value="open">Open</option></Select>
        <SearchCombobox hideLabel inputClassName="h-9" inputId="filter-search" label="Search" options={[]} value="" onChange={() => undefined} />
        <Combobox inputId="filter-combobox" items={['One']} value="One">
          <ComboboxInput aria-label="filter-combobox" className="h-9" inputGroupClassName="h-9" withDropdownButton />
        </Combobox>
        <InputGroup data-testid="filter-input-group" size="sm"><InputGroupInput id="filter-input-group-input" /></InputGroup>
        <DatePickerInput className="h-9 w-[130px]" id="filter-date-input" value="" onChange={() => undefined} />
        <DatePicker className="h-9" id="filter-date-picker" onChange={() => undefined} />
        <BranchSelectCombobox branches={branches} controlSize="filter" inputId="filter-branch" placeholder="Choose branch" value="branch-a" onChange={() => undefined} />
      </>,
    )

    for (const id of ['filter-input', 'filter-search', 'filter-combobox', 'filter-branch']) {
      expectClassForAttribute(markup, 'input', 'id', id, 'h-9')
    }
    expectClassForAttribute(markup, 'div', 'data-testid', 'filter-input-group', 'h-9')
    expect(markup).toMatch(/<div(?=[^>]*data-slot="input-group")(?=[^>]*class="[^"]*\bh-9\b[^"]*w-\[130px\][^"]*")[^>]*>/)
    expect(markup).toMatch(/<button(?=[^>]*aria-label="filter-select")(?=[^>]*class="[^"]*\bh-9\b)[^>]*>/)
    expect(markup).toMatch(/<button(?=[^>]*id="filter-date-picker")(?=[^>]*class="[^"]*\bh-9\b)[^>]*>/)
    expect(markup).toMatch(/<input(?=[^>]*id="filter-input")(?=[^>]*class="[^"]*\bw-full\b)[^>]*>/)
    expect(markup).toMatch(/<div(?=[^>]*data-slot="input-group")(?=[^>]*class="[^"]*\bh-9\b[^"]*w-\[130px\][^"]*")[^>]*>/)
  })
})
