import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ResultsTable from '../../src/components/ResultsTable'
import type { ModelFit, LlmModel } from '../../src/engine/types'

function makeModel(overrides: Partial<LlmModel> = {}): LlmModel {
  return {
    name: 'meta/Llama-3.1-8B',
    provider: 'meta',
    parameter_count: '8B',
    parameters_raw: 8_000_000_000,
    min_ram_gb: 6,
    recommended_ram_gb: 10,
    min_vram_gb: 6,
    quantization: 'Q4_K_M',
    format: 'gguf',
    context_length: 131072,
    use_case: 'Coding',
    is_moe: false,
    num_experts: null,
    active_experts: null,
    active_parameters: null,
    release_date: null,
    capabilities: ['vision', 'tool_use'],
    num_attention_heads: 32,
    num_key_value_heads: 8,
    num_hidden_layers: 32,
    head_dim: 128,
    license: null,
    ...overrides,
  }
}

function makeFit(overrides: Partial<ModelFit> = {}, modelOverrides: Partial<LlmModel> = {}): ModelFit {
  const model = makeModel(modelOverrides)
  return {
    model,
    fit_level: 'perfect',
    run_mode: 'gpu',
    best_quant: 'Q4_K_M',
    memory_required_gb: 6,
    memory_available_gb: 24,
    memory_breakdown: {
      model_weight_gb: 4.6,
      kv_cache_gb: 0.2,
      overhead_gb: 0.5,
      total_gb: 5.3,
    },
    context_used: 8192,
    estimated_tps: 85,
    score: 92,
    scores: { quality: 80, speed: 90, fit: 85, context: 100 },
    viable_quants: [],
    ...overrides,
  }
}

describe('ResultsTable', () => {
  it('renders the compare checkbox and toggles selection', () => {
    const fits = [makeFit()]
    const onToggleCompare = vi.fn()

    render(
      <ResultsTable
        results={fits}
        selectedIndex={null}
        onSelect={() => {}}
        sortKey="score"
        sortDir="desc"
        onSort={() => {}}
        compareSet={new Set()}
        onToggleCompare={onToggleCompare}
        compareLimit={3}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: /add to compare/i }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    expect(onToggleCompare).toHaveBeenCalledWith('meta/Llama-3.1-8B')
  })

  it('disables unselected compare checkboxes when limit reached', () => {
    const fits = [makeFit({}, { name: 'a/1' }), makeFit({}, { name: 'b/2' })]

    render(
      <ResultsTable
        results={fits}
        selectedIndex={null}
        onSelect={() => {}}
        sortKey="score"
        sortDir="desc"
        onSort={() => {}}
        compareSet={new Set(['a/1'])}
        onToggleCompare={() => {}}
        compareLimit={1}
      />,
    )

    // Already-selected stays enabled so the user can uncheck it.
    const selected = screen.getByRole('checkbox', { name: /remove from compare/i }) as HTMLInputElement
    expect(selected.disabled).toBe(false)

    // The other row is at-limit and should be disabled.
    const addable = screen.getByRole('checkbox', { name: /add to compare/i }) as HTMLInputElement
    expect(addable.disabled).toBe(true)
  })

  it('shows use-case and capability tags on the row', () => {
    const fits = [makeFit()]
    render(
      <ResultsTable
        results={fits}
        selectedIndex={null}
        onSelect={() => {}}
        sortKey="score"
        sortDir="desc"
        onSort={() => {}}
        compareSet={new Set()}
        onToggleCompare={() => {}}
        compareLimit={3}
      />,
    )

    expect(screen.getByText('coding')).toBeTruthy()
    expect(screen.getByLabelText('vision')).toBeTruthy()
    expect(screen.getByLabelText('tool use')).toBeTruthy()
  })

  it('suppresses the use-case tag for general models', () => {
    const fits = [makeFit({}, { use_case: 'General', capabilities: [] })]
    render(
      <ResultsTable
        results={fits}
        selectedIndex={null}
        onSelect={() => {}}
        sortKey="score"
        sortDir="desc"
        onSort={() => {}}
        compareSet={new Set()}
        onToggleCompare={() => {}}
        compareLimit={3}
      />,
    )
    expect(screen.queryByText('general')).toBeNull()
  })
})
