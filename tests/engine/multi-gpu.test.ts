import { describe, it, expect } from 'vitest'
import {
  isHomogeneous,
  rawTotalVramGb,
  effectiveVramGb,
  effectiveBandwidthGbps,
  tensorParallelMultiplier,
  autoParallelism,
  expandGpus,
} from '../../src/engine/multi-gpu'
import type { GpuEntry } from '../../src/engine/types'

const RTX_3090: GpuEntry = { name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 1 }
const RTX_3060: GpuEntry = { name: 'RTX 3060', vram_gb: 12, bandwidth_gbps: 360, count: 1 }

describe('expandGpus', () => {
  it('flattens count into individual entries', () => {
    const out = expandGpus([{ ...RTX_3090, count: 2 }, { ...RTX_3060, count: 1 }])
    expect(out).toHaveLength(3)
    expect(out[0].vram_gb).toBe(24)
    expect(out[2].vram_gb).toBe(12)
  })

  it('drops zero-count entries', () => {
    expect(expandGpus([{ ...RTX_3090, count: 0 }])).toHaveLength(0)
  })
})

describe('isHomogeneous', () => {
  it('true for single GPU', () => {
    expect(isHomogeneous([RTX_3090])).toBe(true)
  })

  it('true for multiple copies of the same GPU', () => {
    expect(isHomogeneous([{ ...RTX_3090, count: 3 }])).toBe(true)
  })

  it('false for mixed GPUs', () => {
    expect(isHomogeneous([RTX_3090, RTX_3060])).toBe(false)
  })

  it('true for empty list (vacuous)', () => {
    expect(isHomogeneous([])).toBe(true)
  })
})

describe('rawTotalVramGb', () => {
  it('sums VRAM across expanded entries', () => {
    expect(rawTotalVramGb([{ ...RTX_3090, count: 2 }, RTX_3060])).toBe(60)
  })

  it('returns 0 for empty', () => {
    expect(rawTotalVramGb([])).toBe(0)
  })
})

describe('effectiveVramGb', () => {
  it('no overhead for single GPU', () => {
    expect(effectiveVramGb([RTX_3090])).toBeCloseTo(24, 2)
  })

  it('5% overhead for homogeneous multi-GPU', () => {
    const out = effectiveVramGb([{ ...RTX_3090, count: 2 }])
    expect(out).toBeCloseTo(48 * 0.95, 2)
  })

  it('10% overhead for heterogeneous multi-GPU', () => {
    const out = effectiveVramGb([RTX_3090, RTX_3060])
    expect(out).toBeCloseTo(36 * 0.90, 2)
  })
})

describe('effectiveBandwidthGbps', () => {
  it('single GPU: bandwidth * 0.98 (inter-GPU overhead is zero in practice but formula applies)', () => {
    // For N=1 we skip the overhead multiplier
    expect(effectiveBandwidthGbps([RTX_3090])).toBeCloseTo(936, 1)
  })

  it('homogeneous 2x: same bandwidth minus 2% transfer overhead', () => {
    const out = effectiveBandwidthGbps([{ ...RTX_3090, count: 2 }])
    expect(out).toBeCloseTo(936 * 0.98, 1)
  })

  it('heterogeneous: VRAM-weighted harmonic mean of bandwidths, minus 2%', () => {
    // 24GB @ 936 + 12GB @ 360, total 36GB
    // shares: 2/3, 1/3
    // time_per_token = (2/3)/936 + (1/3)/360 = 0.000712 + 0.000926 = 0.001638
    // eff_bw = 1 / 0.001638 = 610.5
    // * 0.98 = 598.3
    const out = effectiveBandwidthGbps([RTX_3090, RTX_3060])
    expect(out).toBeCloseTo(598, 0)
  })

  it('empty list returns 0', () => {
    expect(effectiveBandwidthGbps([])).toBe(0)
  })
})

describe('tensorParallelMultiplier', () => {
  it('returns 1.0 for single GPU regardless of interconnect', () => {
    expect(tensorParallelMultiplier(1, 'nvlink', true)).toBe(1.0)
  })

  it('returns 1.0 when not homogeneous', () => {
    expect(tensorParallelMultiplier(2, 'nvlink', false)).toBe(1.0)
  })

  it('NVLink 2 GPUs homogeneous: 1.6x', () => {
    expect(tensorParallelMultiplier(2, 'nvlink', true)).toBeCloseTo(1.6, 2)
  })

  it('NVLink 4 GPUs homogeneous: 2.8x', () => {
    expect(tensorParallelMultiplier(4, 'nvlink', true)).toBeCloseTo(2.8, 2)
  })

  it('PCIe5 2 GPUs: 1.25x', () => {
    expect(tensorParallelMultiplier(2, 'pcie5', true)).toBeCloseTo(1.25, 2)
  })

  it('PCIe4 2 GPUs: 1.05x (barely worth it)', () => {
    expect(tensorParallelMultiplier(2, 'pcie4', true)).toBeCloseTo(1.05, 2)
  })

  it('PCIe3 2 GPUs: 0.95x (regresses, comms overhead dominates)', () => {
    expect(tensorParallelMultiplier(2, 'pcie3', true)).toBeCloseTo(0.95, 2)
  })

  it('none: always 1.0', () => {
    expect(tensorParallelMultiplier(2, 'none', true)).toBe(1.0)
  })
})

describe('autoParallelism', () => {
  it('single GPU: layer_split', () => {
    expect(autoParallelism(1, 'pcie4', true)).toBe('layer_split')
  })

  it('homogeneous + nvlink: tensor_parallel', () => {
    expect(autoParallelism(2, 'nvlink', true)).toBe('tensor_parallel')
  })

  it('homogeneous + pcie5: tensor_parallel', () => {
    expect(autoParallelism(2, 'pcie5', true)).toBe('tensor_parallel')
  })

  it('homogeneous + pcie4: layer_split (TP not worth it)', () => {
    expect(autoParallelism(2, 'pcie4', true)).toBe('layer_split')
  })

  it('heterogeneous: layer_split regardless of interconnect', () => {
    expect(autoParallelism(2, 'nvlink', false)).toBe('layer_split')
  })
})
