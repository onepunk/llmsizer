import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../../src/components/FilterBar'
import type { FilterState } from '../../src/engine/types'

const BASE_FILTERS: FilterState = {
  search: '',
  useCase: 'all',
  minFit: 'marginal',
  context: 8192,
  sort: 'score',
  sortDir: 'desc',
}

describe('FilterBar', () => {
  it('renders the context selector and emits new values on change', () => {
    const onChange = vi.fn()
    render(
      <FilterBar
        filters={BASE_FILTERS}
        onChange={onChange}
        resultCount={10}
        totalCount={100}
      />,
    )

    // Context select shows the current value as "8K"
    const ctxSelect = screen.getByRole('combobox', { name: /ctx/i }) as HTMLSelectElement
    expect(ctxSelect.value).toBe('8192')

    fireEvent.change(ctxSelect, { target: { value: '32768' } })
    expect(onChange).toHaveBeenCalledWith({ ...BASE_FILTERS, context: 32768 })
  })

  it('renders a share button only when a handler is provided', () => {
    const onShare = vi.fn()
    const { rerender } = render(
      <FilterBar
        filters={BASE_FILTERS}
        onChange={() => {}}
        resultCount={0}
        totalCount={0}
        onShare={onShare}
        shareLabel="share"
      />,
    )

    const btn = screen.getByRole('button', { name: /share/i })
    fireEvent.click(btn)
    expect(onShare).toHaveBeenCalledTimes(1)

    rerender(
      <FilterBar
        filters={BASE_FILTERS}
        onChange={() => {}}
        resultCount={0}
        totalCount={0}
      />,
    )
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull()
  })

  it('reflects custom share label (for copied / error states)', () => {
    render(
      <FilterBar
        filters={BASE_FILTERS}
        onChange={() => {}}
        resultCount={0}
        totalCount={0}
        onShare={() => {}}
        shareLabel="copied!"
      />,
    )
    expect(screen.getByRole('button', { name: /copied!/i })).toBeTruthy()
  })
})
