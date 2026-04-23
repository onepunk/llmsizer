import { describe, it, expect } from 'vitest'
import { readUrlState, buildUrlSearch } from '../src/url'
import type { FilterState } from '../src/engine/types'

const DEFAULTS: FilterState = {
  search: '',
  useCase: 'all',
  minFit: 'all',
  context: 8192,
  sort: 'score',
  sortDir: 'desc',
}

describe('readUrlState', () => {
  it('reads hardware (legacy format), filter, and compare params', () => {
    const state = readUrlState(
      '?gpu=RTX%204090&vram=24&ram=64&cores=16&unified=0&ctx=16384&uc=coding&fit=perfect&cmp=a/b,c/d',
    )

    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].name).toBe('RTX 4090')
    expect(state.hw.gpus[0].vram_gb).toBe(24)
    expect(state.hw.gpus[0].count).toBe(1)
    expect(state.hw.ram).toBe(64)
    expect(state.hw.cores).toBe(16)
    expect(state.hw.unified).toBe(false)
    expect(state.filters.context).toBe(16384)
    expect(state.filters.useCase).toBe('coding')
    expect(state.filters.minFit).toBe('perfect')
    expect(state.compare).toEqual(['a/b', 'c/d'])
  })

  it('returns empties when no params are set', () => {
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
    expect(params.get('gpu')).toBe('RTX 4090')
    expect(params.get('ram')).toBe('64')
    expect(params.get('cores')).toBe('16')
    expect(params.has('unified')).toBe(false)
    expect(params.has('ic')).toBe(false)
    expect(params.has('par')).toBe(false)
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
    // Uses short "RTX 3090" / "RTX 4080" names — both resolve unambiguously
    // via lookupGpu's reverse-substring match (shortest key wins), so vram_gb
    // and bandwidth_gbps survive the round trip. We assert them strictly
    // to catch any regression in lookupGpu or in the URL parser.
    const qs = buildUrlSearch({
      hw: {
        gpus: [
          { name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 2 },
          { name: 'RTX 4080', vram_gb: 16, bandwidth_gbps: 717, count: 1 },
        ],
        interconnect: 'nvlink',
        parallelism: 'tensor_parallel',
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
    expect(state.hw.gpus).toHaveLength(2)
    expect(state.hw.gpus[0]).toEqual({
      name: 'RTX 3090',
      vram_gb: 24,
      bandwidth_gbps: 936,
      count: 2,
      nvlink: true,
    })
    expect(state.hw.gpus[1]).toEqual({
      name: 'RTX 4080',
      vram_gb: 16,
      bandwidth_gbps: 717,
      count: 1,
      nvlink: false,
    })
    expect(state.hw.interconnect).toBe('nvlink')
    expect(state.hw.parallelism).toBe('tensor_parallel')
    expect(state.hw.ram).toBe(96)
    expect(state.hw.unified).toBe(true)
    expect(state.filters.context).toBe(16384)
    expect(state.filters.useCase).toBe('reasoning')
    expect(state.filters.sort).toBe('tps')
    expect(state.filters.sortDir).toBe('asc')
    expect(state.compare).toEqual(['a/b'])
  })
})

describe('multi-GPU URL state', () => {
  it('parses single GPU with count: RTX%203090:2', () => {
    const state = readUrlState('?gpu=RTX%203090:2&ic=nvlink&par=auto&ram=64')
    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].name).toBe('RTX 3090')
    expect(state.hw.gpus[0].count).toBe(2)
    // vram_gb/bandwidth_gbps are reconstituted from the catalog via lookupGpu's
    // reverse-substring match ("RTX 3090" -> "GeForce RTX 3090").
    expect(state.hw.gpus[0].vram_gb).toBe(24)
    expect(state.hw.gpus[0].bandwidth_gbps).toBe(936)
    expect(state.hw.interconnect).toBe('nvlink')
    expect(state.hw.parallelism).toBe('auto')
  })

  it('parses multiple GPUs: RTX%203090:2,RTX%204080:1', () => {
    const state = readUrlState('?gpu=RTX%203090:2,RTX%204080:1&ic=pcie4')
    expect(state.hw.gpus).toHaveLength(2)
    expect(state.hw.gpus[0]).toEqual({
      name: 'RTX 3090',
      vram_gb: 24,
      bandwidth_gbps: 936,
      count: 2,
      nvlink: true,
    })
    expect(state.hw.gpus[1]).toEqual({
      name: 'RTX 4080',
      vram_gb: 16,
      bandwidth_gbps: 717,
      count: 1,
      nvlink: false,
    })
    expect(state.hw.interconnect).toBe('pcie4')
  })

  it('defaults count to 1 when colon omitted', () => {
    const state = readUrlState('?gpu=RTX%203090')
    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].count).toBe(1)
  })

  it('strips malformed count suffix (gpu=name:) and falls back to count=1', () => {
    const state = readUrlState('?gpu=RTX%203090:')
    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].name).toBe('RTX 3090')
    expect(state.hw.gpus[0].count).toBe(1)
  })

  it('strips malformed count suffix (gpu=name:0)', () => {
    const state = readUrlState('?gpu=RTX%203090:0')
    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].name).toBe('RTX 3090')
    expect(state.hw.gpus[0].count).toBe(1)
  })

  it('strips malformed count suffix (gpu=name:-3)', () => {
    const state = readUrlState('?gpu=RTX%203090:-3')
    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].name).toBe('RTX 3090')
    expect(state.hw.gpus[0].count).toBe(1)
  })

  it('strips malformed count suffix (gpu=name:abc)', () => {
    const state = readUrlState('?gpu=RTX%203090:abc')
    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].name).toBe('RTX 3090')
    expect(state.hw.gpus[0].count).toBe(1)
  })

  it('back-compat: legacy ?gpu=X&vram=N becomes single-GPU entry', () => {
    const state = readUrlState('?gpu=RTX%204090&vram=24&ram=32')
    expect(state.hw.gpus).toHaveLength(1)
    expect(state.hw.gpus[0].name).toBe('RTX 4090')
    expect(state.hw.gpus[0].vram_gb).toBe(24)
    expect(state.hw.gpus[0].count).toBe(1)
  })

  it('rejects invalid interconnect, falls back to null', () => {
    const state = readUrlState('?ic=not-a-thing')
    expect(state.hw.interconnect).toBeNull()
  })

  it('rejects invalid parallelism, falls back to null', () => {
    const state = readUrlState('?par=bogus')
    expect(state.hw.parallelism).toBeNull()
  })
})

describe('Advanced hardware URL params', () => {
  it('reads ramBandwidthGbps from ?rs=', () => {
    const state = readUrlState('?rs=90')
    expect(state.hw.ramBandwidthGbps).toBe(90)
  })

  it('reads cpu_flags bitmask from ?cf=', () => {
    const state = readUrlState('?cf=3') // avx512 + amx
    expect(state.hw.cpuFlags).toEqual({ avx512: true, amx: true, neon: false })
  })

  it('reads diskFreeGb from ?dk=', () => {
    const state = readUrlState('?dk=500')
    expect(state.hw.diskFreeGb).toBe(500)
  })

  it('returns null for Advanced fields when unset', () => {
    const state = readUrlState('')
    expect(state.hw.ramBandwidthGbps).toBeNull()
    expect(state.hw.cpuFlags).toBeNull()
    expect(state.hw.diskFreeGb).toBeNull()
  })

  it('treats cf=0 as null (no flags set)', () => {
    const state = readUrlState('?cf=0')
    expect(state.hw.cpuFlags).toBeNull()
  })

  it('clamps ramBandwidthGbps within 0..2000', () => {
    expect(readUrlState('?rs=-5').hw.ramBandwidthGbps).toBe(0)
    expect(readUrlState('?rs=9999').hw.ramBandwidthGbps).toBe(2000)
  })

  it('clamps diskFreeGb within 0..100000', () => {
    expect(readUrlState('?dk=-5').hw.diskFreeGb).toBe(0)
    expect(readUrlState('?dk=999999').hw.diskFreeGb).toBe(100000)
  })

  it('writer omits Advanced params when null/undefined', () => {
    const qs = buildUrlSearch({
      hw: {
        gpus: [],
        interconnect: 'none',
        parallelism: 'auto',
        ramGb: 64,
        cpuCores: 16,
        unified: false,
        ramBandwidthGbps: null,
        cpuFlags: null,
        diskFreeGb: null,
      },
      filters: DEFAULTS,
      compare: [],
      defaults: DEFAULTS,
    })
    expect(qs).not.toContain('rs=')
    expect(qs).not.toContain('cf=')
    expect(qs).not.toContain('dk=')
  })

  it('writer emits rs/cf/dk when set', () => {
    const qs = buildUrlSearch({
      hw: {
        gpus: [],
        interconnect: 'none',
        parallelism: 'auto',
        ramGb: 64,
        cpuCores: 16,
        unified: false,
        ramBandwidthGbps: 90,
        cpuFlags: { avx512: true, amx: false, neon: true }, // bits 1 + 4 = 5
        diskFreeGb: 500,
      },
      filters: DEFAULTS,
      compare: [],
      defaults: DEFAULTS,
    })
    expect(qs).toContain('rs=90')
    expect(qs).toContain('cf=5')
    expect(qs).toContain('dk=500')
  })

  it('round-trips rs/cf/dk through write then read', () => {
    const qs = buildUrlSearch({
      hw: {
        gpus: [],
        interconnect: 'none',
        parallelism: 'auto',
        ramGb: 32,
        cpuCores: 8,
        unified: false,
        ramBandwidthGbps: 75,
        cpuFlags: { avx512: false, amx: true, neon: false },
        diskFreeGb: 250,
      },
      filters: DEFAULTS,
      compare: [],
      defaults: DEFAULTS,
    })
    const state = readUrlState('?' + qs)
    expect(state.hw.ramBandwidthGbps).toBe(75)
    expect(state.hw.cpuFlags).toEqual({ avx512: false, amx: true, neon: false })
    expect(state.hw.diskFreeGb).toBe(250)
  })
})

describe('multi-GPU URL writing', () => {
  const DEFAULTS: FilterState = {
    search: '', useCase: 'all', minFit: 'all', context: 8192,
    sort: 'score', sortDir: 'desc',
  }

  it('writes single GPU with count 1 as bare name (no :1 suffix)', () => {
    const qs = buildUrlSearch({
      hw: {
        gpus: [{ name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 1 }],
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
    expect(qs).toContain('gpu=RTX+3090')
    expect(qs).not.toContain('gpu=RTX+3090%3A1')
  })

  // Using URLSearchParams.get() (not decodeURIComponent) because
  // URLSearchParams.toString() form-encodes space as '+', and
  // decodeURIComponent doesn't convert '+' to space.
  it('writes multiple GPUs with counts', () => {
    const qs = buildUrlSearch({
      hw: {
        gpus: [
          { name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 2 },
          { name: 'RTX 3060', vram_gb: 12, bandwidth_gbps: 360, count: 1 },
        ],
        interconnect: 'nvlink',
        parallelism: 'tensor_parallel',
        ramGb: 128, cpuCores: 32, unified: false,
      },
      filters: DEFAULTS,
      compare: [],
      defaults: DEFAULTS,
    })
    const params = new URLSearchParams(qs)
    expect(params.get('gpu')).toBe('RTX 3090:2,RTX 3060')
    expect(params.get('ic')).toBe('nvlink')
    expect(params.get('par')).toBe('tensor_parallel')
  })

  it('omits ic and par when default', () => {
    const qs = buildUrlSearch({
      hw: {
        gpus: [{ name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 1 }],
        interconnect: 'none',
        parallelism: 'auto',
        ramGb: 64, cpuCores: 16, unified: false,
      },
      filters: DEFAULTS,
      compare: [],
      defaults: DEFAULTS,
    })
    expect(qs).not.toContain('ic=')
    expect(qs).not.toContain('par=')
  })
})
