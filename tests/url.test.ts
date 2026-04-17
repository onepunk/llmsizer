import { describe, it, expect } from 'vitest'
import { readUrlState, buildUrlSearch } from '../src/url'
import type { FilterState } from '../src/engine/types'

const DEFAULTS: FilterState = {
  search: '',
  useCase: 'all',
  minFit: 'marginal',
  context: 8192,
  sort: 'score',
  sortDir: 'desc',
}

describe('readUrlState', () => {
  it('reads hardware, filter, and compare params', () => {
    // TODO(Task 4): restore gpu/vram params once multi-GPU URL format lands.
    const state = readUrlState(
      '?ram=64&cores=16&unified=0&ctx=16384&uc=coding&fit=perfect&cmp=a/b,c/d',
    )

    expect(state.hw.gpus).toEqual([])
    expect(state.hw.ram).toBe(64)
    expect(state.hw.cores).toBe(16)
    expect(state.hw.unified).toBe(false)
    expect(state.filters.context).toBe(16384)
    expect(state.filters.useCase).toBe('coding')
    expect(state.filters.minFit).toBe('perfect')
    expect(state.compare).toEqual(['a/b', 'c/d'])
  })

  it('returns nulls / empties when no params are set', () => {
    const state = readUrlState('')
    expect(state.hw.gpus).toEqual([])
    expect(state.hw.interconnect).toBeNull()
    expect(state.hw.parallelism).toBeNull()
    expect(state.hw.unified).toBeNull()
    expect(state.filters).toEqual({})
    expect(state.compare).toEqual([])
  })

  it('clamps out-of-range numeric params', () => {
    const state = readUrlState('?ram=-5&cores=0')
    // ram min is 1
    expect(state.hw.ram).toBe(1)
    // cores min is 1
    expect(state.hw.cores).toBe(1)
  })

  it('rejects non-numeric values (NaN) gracefully', () => {
    const state = readUrlState('?ram=abc&ctx=zzz')
    expect(state.hw.ram).toBeNull()
    expect(state.filters.context).toBeUndefined()
  })
})

describe('buildUrlSearch', () => {
  it('omits filter keys equal to defaults, includes hardware', () => {
    // TODO(Task 4): assert gpu/vram params once multi-GPU URL format lands.
    const qs = buildUrlSearch({
      hw: {
        gpus: [{ name: 'RTX 4090', vram_gb: 24, bandwidth_gbps: 1008, count: 1 }],
        interconnect: 'none',
        parallelism: 'auto',
        ramGb: 64,
        cpuCores: 16,
        unified: false,
      },
      filters: DEFAULTS,
      compare: [],
      defaults: DEFAULTS,
    })

    const params = new URLSearchParams(qs)
    expect(params.get('ram')).toBe('64')
    expect(params.get('cores')).toBe('16')
    expect(params.has('unified')).toBe(false)
    expect(params.has('ctx')).toBe(false)
    expect(params.has('uc')).toBe(false)
    expect(params.has('fit')).toBe(false)
    expect(params.has('cmp')).toBe(false)
  })

  it('includes non-default filters and compare selection', () => {
    const qs = buildUrlSearch({
      hw: {
        gpus: [],
        interconnect: 'none',
        parallelism: 'auto',
        ramGb: 32,
        cpuCores: 8,
        unified: true,
      },
      filters: {
        ...DEFAULTS,
        context: 32768,
        useCase: 'coding',
        minFit: 'perfect',
        search: 'llama',
      },
      compare: ['meta/Llama-3.1-8B', 'qwen/Qwen2.5-7B'],
      defaults: DEFAULTS,
    })

    const params = new URLSearchParams(qs)
    expect(params.get('ctx')).toBe('32768')
    expect(params.get('uc')).toBe('coding')
    expect(params.get('fit')).toBe('perfect')
    expect(params.get('q')).toBe('llama')
    expect(params.get('unified')).toBe('1')
    expect(params.get('cmp')).toBe('meta/Llama-3.1-8B,qwen/Qwen2.5-7B')
  })

  it('round-trips a state through build + read', () => {
    // TODO(Task 4): extend to cover gpus[] round-trip once URL format lands.
    const qs = buildUrlSearch({
      hw: {
        gpus: [],
        interconnect: 'none',
        parallelism: 'auto',
        ramGb: 96,
        cpuCores: 12,
        unified: true,
      },
      filters: {
        ...DEFAULTS,
        context: 16384,
        useCase: 'reasoning',
        sort: 'tps',
        sortDir: 'asc',
      },
      compare: ['a/b'],
      defaults: DEFAULTS,
    })

    const state = readUrlState('?' + qs)
    expect(state.hw.ram).toBe(96)
    expect(state.hw.unified).toBe(true)
    expect(state.filters.context).toBe(16384)
    expect(state.filters.useCase).toBe('reasoning')
    expect(state.filters.sort).toBe('tps')
    expect(state.filters.sortDir).toBe('asc')
    expect(state.compare).toEqual(['a/b'])
  })
})
