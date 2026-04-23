import { describe, it, expect } from 'vitest'
import { estimateTps } from '../../src/engine/speed'

describe('estimateTps', () => {
  it('GPU path: RTX 3090 (936 GB/s), 7B Q4_K_M → ~147.1 t/s', () => {
    // modelSizeGb = 7 * 0.5 = 3.5, rawTps = (936 / 3.5) * 0.55 ≈ 147.09
    const result = estimateTps({
      paramsB: 7,
      quant: 'Q4_K_M',
      bandwidthGbps: 936,
      runMode: 'gpu',
      cpuCores: 16,
    })
    expect(result).toBeCloseTo(147.1, 0)
  })

  it('CPU offload penalty: 0.5x of GPU speed', () => {
    const gpu = estimateTps({
      paramsB: 7,
      quant: 'Q4_K_M',
      bandwidthGbps: 936,
      runMode: 'gpu',
      cpuCores: 16,
    })
    const offload = estimateTps({
      paramsB: 7,
      quant: 'Q4_K_M',
      bandwidthGbps: 936,
      runMode: 'cpu_offload',
      cpuCores: 16,
    })
    expect(offload).toBeCloseTo(gpu * 0.5, 5)
  })

  it('CPU-only x86: 7B Q4_K_M, 16 cores → ~12.65 t/s', () => {
    // base = (70 / 7) * 1.15 = 11.5, threadingBonus = 1.1 → 12.65
    const result = estimateTps({
      paramsB: 7,
      quant: 'Q4_K_M',
      bandwidthGbps: 936,
      runMode: 'cpu_only',
      cpuCores: 16,
    })
    expect(result).toBeCloseTo(12.65, 2)
  })

  it('CPU-only with fewer cores: 4 cores → ~11.5 t/s (no threading bonus)', () => {
    // base = (70 / 7) * 1.15 = 11.5, no bonus
    const result = estimateTps({
      paramsB: 7,
      quant: 'Q4_K_M',
      bandwidthGbps: 936,
      runMode: 'cpu_only',
      cpuCores: 4,
    })
    expect(result).toBeCloseTo(11.5, 2)
  })

  it('bandwidth=0 triggers CPU fallback regardless of runMode', () => {
    const result = estimateTps({
      paramsB: 7,
      quant: 'Q4_K_M',
      bandwidthGbps: 0,
      runMode: 'gpu',
      cpuCores: 16,
    })
    // Should use CPU path: (70/7)*1.15*1.1 = 12.65
    expect(result).toBeCloseTo(12.65, 2)
  })

  it('applies tpMultiplier to GPU-mode TPS', () => {
    const base = estimateTps({ paramsB: 8, quant: 'Q4_K_M', bandwidthGbps: 936, runMode: 'gpu', cpuCores: 16 })
    const boosted = estimateTps({ paramsB: 8, quant: 'Q4_K_M', bandwidthGbps: 936, runMode: 'gpu', cpuCores: 16, tpMultiplier: 1.6 })
    expect(boosted).toBeCloseTo(base * 1.6, 2)
  })
})

describe('RAM bandwidth override', () => {
  it('fast RAM yields higher cpu_only TPS than slow RAM at same paramsB', () => {
    const fast = estimateTps({
      paramsB: 8,
      quant: 'Q4_K_M',
      bandwidthGbps: 0,
      runMode: 'cpu_only',
      cpuCores: 8,
      ramBandwidthGbps: 90,
    })
    const slow = estimateTps({
      paramsB: 8,
      quant: 'Q4_K_M',
      bandwidthGbps: 0,
      runMode: 'cpu_only',
      cpuCores: 8,
      ramBandwidthGbps: 25,
    })
    expect(fast).toBeGreaterThan(slow)
  })

  it('undefined ramBandwidthGbps behaves as the reference baseline', () => {
    const defaulted = estimateTps({
      paramsB: 8,
      quant: 'Q4_K_M',
      bandwidthGbps: 0,
      runMode: 'cpu_only',
      cpuCores: 8,
    })
    const baseline = estimateTps({
      paramsB: 8,
      quant: 'Q4_K_M',
      bandwidthGbps: 0,
      runMode: 'cpu_only',
      cpuCores: 8,
      ramBandwidthGbps: 50, // matches REFERENCE_RAM_GBPS
    })
    expect(defaulted).toBeCloseTo(baseline, 4)
  })
})

describe('CPU feature flag bonuses', () => {
  const baseParams = {
    paramsB: 8,
    quant: 'Q4_K_M',
    bandwidthGbps: 0,
    runMode: 'cpu_only' as const,
    cpuCores: 8,
  }

  it('AVX-512 beats scalar (no flags)', () => {
    const scalar = estimateTps(baseParams)
    const avx512 = estimateTps({
      ...baseParams,
      cpuFlags: { avx512: true, amx: false, neon: false },
    })
    expect(avx512).toBeGreaterThan(scalar)
  })

  it('AMX beats AVX-512', () => {
    const avx512 = estimateTps({
      ...baseParams,
      cpuFlags: { avx512: true, amx: false, neon: false },
    })
    const amx = estimateTps({
      ...baseParams,
      cpuFlags: { avx512: false, amx: true, neon: false },
    })
    expect(amx).toBeGreaterThan(avx512)
  })

  it('NEON beats scalar but trails AVX-512', () => {
    const scalar = estimateTps(baseParams)
    const neon = estimateTps({
      ...baseParams,
      cpuFlags: { avx512: false, amx: false, neon: true },
    })
    const avx512 = estimateTps({
      ...baseParams,
      cpuFlags: { avx512: true, amx: false, neon: false },
    })
    expect(neon).toBeGreaterThan(scalar)
    expect(neon).toBeLessThan(avx512)
  })

  it('AMX wins when multiple flags are set (not additive)', () => {
    const amxAlone = estimateTps({
      ...baseParams,
      cpuFlags: { avx512: false, amx: true, neon: false },
    })
    const allSet = estimateTps({
      ...baseParams,
      cpuFlags: { avx512: true, amx: true, neon: true },
    })
    expect(allSet).toBeCloseTo(amxAlone, 4)
  })

  it('cpu_offload mode also benefits from CPU flags', () => {
    const offloadParams = {
      paramsB: 8,
      quant: 'Q4_K_M',
      bandwidthGbps: 500,
      runMode: 'cpu_offload' as const,
      cpuCores: 8,
    }
    const scalar = estimateTps(offloadParams)
    const amx = estimateTps({
      ...offloadParams,
      cpuFlags: { avx512: false, amx: true, neon: false },
    })
    expect(amx).toBeGreaterThan(scalar)
  })
})
