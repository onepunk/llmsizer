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
    const state = readUrlState(
      '?gpu=RTX%204090&vram=24&ram=64&cores=16&unified=0&ctx=16384&uc=coding&fit=perfect&cmp=a/b,c/d',
    )

    expect(state.hw.gpu).toBe('RTX 4090')
    expect(state.hw.vram).toBe(24)
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
    expect(state.hw.gpu).toBeNull()
    expect(state.hw.vram).toBeNull()
    expect(state.hw.unified).toBeNull()
    expect(state.filters).toEqual({})
    expect(state.compare).toEqual([])
  })

  it('clamps out-of-range numeric params', () => {
    const state = readUrlState('?vram=9999&ram=-5&cores=0')
    // vram max is 1024
    expect(state.hw.vram).toBe(1024)
    // ram min is 1
    expect(state.hw.ram).toBe(1)
    // cores min is 1
    expect(state.hw.cores).toBe(1)
  })

  it('rejects non-numeric values (NaN) gracefully', () => {
    const state = readUrlState('?vram=abc&ctx=zzz')
    expect(state.hw.vram).toBeNull()
    expect(state.filters.context).toBeUndefined()
  })
})

describe('buildUrlSearch', () => {
  it('omits filter keys equal to defaults, includes hardware', () => {
    const qs = buildUrlSearch({
      hw: {
        gpuName: 'RTX 4090',
        vramGb: 24,
        ramGb: 64,
        cpuCores: 16,
        unified: false,
      },
      filters: DEFAULTS,
      compare: [],
      defaults: DEFAULTS,
    })

    const params = new URLSearchParams(qs)
    expect(params.get('gpu')).toBe('RTX 4090')
    expect(params.get('vram')).toBe('24')
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
        gpuName: '',
        vramGb: 0,
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
    expect(params.has('gpu')).toBe(false)
    expect(params.has('vram')).toBe(false)
    expect(params.get('cmp')).toBe('meta/Llama-3.1-8B,qwen/Qwen2.5-7B')
  })

  it('round-trips a state through build + read', () => {
    const qs = buildUrlSearch({
      hw: {
        gpuName: 'Apple M2 Max',
        vramGb: 0,
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
    expect(state.hw.gpu).toBe('Apple M2 Max')
    expect(state.hw.ram).toBe(96)
    expect(state.hw.unified).toBe(true)
    expect(state.filters.context).toBe(16384)
    expect(state.filters.useCase).toBe('reasoning')
    expect(state.filters.sort).toBe('tps')
    expect(state.filters.sortDir).toBe('asc')
    expect(state.compare).toEqual(['a/b'])
  })
})
