import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../src/App'
import type { LlmModel } from '../src/engine/types'

function makeModel(name: string, paramsB: number): LlmModel {
  return {
    name,
    provider: 'test-org',
    parameter_count: `${paramsB}B`,
    parameters_raw: paramsB * 1_000_000_000,
    min_ram_gb: 4,
    recommended_ram_gb: paramsB,
    min_vram_gb: 4,
    quantization: 'Q4_K_M',
    format: 'gguf',
    context_length: 32_768,
    use_case: 'General',
    is_moe: false,
    num_experts: null,
    active_experts: null,
    active_parameters: null,
    release_date: '2026-01-01',
    capabilities: [],
    num_attention_heads: 32,
    num_key_value_heads: 8,
    num_hidden_layers: 32,
    head_dim: 128,
    license: 'test',
  }
}

const MODELS = [
  makeModel('org/Alpha-7B', 7),
  makeModel('org/Zulu-70B', 70),
]

beforeEach(() => {
  window.history.replaceState(null, '', '/?gpu=RTX%204090&ram=64')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => MODELS,
  }))
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.className = ''
  window.history.replaceState(null, '', '/')
})

describe('App model state', () => {
  it('keeps details stable across sorting and comparisons visible across filtering', async () => {
    render(<App />)

    const alphaName = await screen.findByText('Alpha-7B')
    fireEvent.click(alphaName.closest('tr')!)

    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Alpha-7B' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Model' }))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Alpha-7B' })).toBeTruthy()

    const compareCheckboxes = screen.getAllByRole('checkbox', { name: 'Add to compare' })
    fireEvent.click(compareCheckboxes[0]!)
    fireEvent.click(compareCheckboxes[1]!)
    expect(screen.getByRole('heading', { name: 'Compare (2)' })).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: 'Alpha' },
    })

    await waitFor(() => expect(screen.getByText('1/2')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Compare (2)' })).toBeTruthy()
    expect(screen.getByText('Zulu-70B', { selector: '.compare-card-name' })).toBeTruthy()
  })

  it('drops retired comparison models from old shared URLs', async () => {
    window.history.replaceState(
      null,
      '',
      '/?gpu=RTX%204090&ram=64&cmp=retired/a,retired/b,retired/c',
    )
    render(<App />)

    await screen.findByText('Alpha-7B')
    const checkbox = screen.getAllByRole('checkbox', { name: 'Add to compare' })[0] as HTMLInputElement

    await waitFor(() => expect(checkbox.disabled).toBe(false))
    await waitFor(() => expect(window.location.search).not.toContain('cmp='))
  })
})
