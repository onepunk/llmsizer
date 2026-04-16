import { describe, it, expect } from 'vitest'
import { parseRendererString, lookupGpu, isIntegratedGpu, getAllGpuNames } from '../../src/detection/parse-renderer'

describe('parseRendererString', () => {
  it('strips /PCIe/SSE2 suffix', () => {
    expect(parseRendererString('NVIDIA GeForce RTX 3090/PCIe/SSE2')).toBe('NVIDIA GeForce RTX 3090')
  })

  it('extracts GPU name from ANGLE wrapper (NVIDIA)', () => {
    expect(
      parseRendererString('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)')
    ).toBe('NVIDIA GeForce RTX 4090')
  })

  it('extracts GPU name from ANGLE wrapper (AMD)', () => {
    expect(
      parseRendererString('ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)')
    ).toBe('AMD Radeon RX 7900 XTX')
  })

  it('handles Apple Silicon renderer string', () => {
    expect(parseRendererString('Apple M2 Pro')).toBe('Apple M2 Pro')
  })

  it('strips (R) from Intel names', () => {
    expect(parseRendererString('Intel(R) UHD Graphics 770')).toBe('Intel UHD Graphics 770')
  })

  it('strips (TM) and device ID from Intel Arc integrated', () => {
    expect(parseRendererString('Intel Arc(TM) Graphics (0x00007D55)')).toBe('Intel Arc Graphics')
  })

  it('extracts GPU name from ANGLE wrapper (Apple)', () => {
    expect(
      parseRendererString('ANGLE (Apple, Apple M1 Max, OpenGL 4.1)')
    ).toBe('Apple M1 Max')
  })

  it('returns original string for unknown GPU', () => {
    expect(parseRendererString('Some Unknown GPU')).toBe('Some Unknown GPU')
  })
})

describe('isIntegratedGpu', () => {
  it('detects Intel UHD Graphics as iGPU', () => {
    expect(isIntegratedGpu('Intel UHD Graphics 770')).toBe(true)
  })

  it('detects Intel Iris as iGPU', () => {
    expect(isIntegratedGpu('Intel Iris Xe Graphics')).toBe(true)
  })

  it('detects Intel Arc Graphics (integrated) as iGPU', () => {
    expect(isIntegratedGpu('Intel Arc Graphics')).toBe(true)
  })

  it('detects AMD Radeon Graphics (APU) as iGPU', () => {
    expect(isIntegratedGpu('AMD Radeon Graphics')).toBe(true)
  })

  it('does NOT detect discrete GPUs as iGPU', () => {
    expect(isIntegratedGpu('NVIDIA GeForce RTX 3090')).toBe(false)
    expect(isIntegratedGpu('AMD Radeon RX 7900 XTX')).toBe(false)
    expect(isIntegratedGpu('Arc A770')).toBe(false)
  })
})

describe('lookupGpu', () => {
  it('looks up NVIDIA GeForce RTX 3090 via substring match', () => {
    const spec = lookupGpu('NVIDIA GeForce RTX 3090')
    expect(spec).not.toBeNull()
    expect(spec!.vram_gb).toBe(24)
    expect(spec!.bandwidth_gbps).toBe(936)
  })

  it('looks up Apple M2 Pro correctly', () => {
    const spec = lookupGpu('Apple M2 Pro')
    expect(spec).not.toBeNull()
    expect(spec!.unified).toBe(true)
    expect(spec!.bandwidth_gbps).toBe(200)
  })

  it('returns iGPU spec for Intel Arc Graphics (integrated)', () => {
    const spec = lookupGpu('Intel Arc Graphics')
    expect(spec).not.toBeNull()
    expect(spec!.unified).toBe(true)
    expect(spec!.vram_gb).toBeNull()
  })

  it('returns iGPU spec for Intel UHD Graphics', () => {
    const spec = lookupGpu('Intel UHD Graphics 770')
    expect(spec).not.toBeNull()
    expect(spec!.unified).toBe(true)
  })

  it('returns iGPU spec for AMD Radeon Graphics (APU)', () => {
    const spec = lookupGpu('AMD Radeon Graphics')
    expect(spec).not.toBeNull()
    expect(spec!.unified).toBe(true)
  })

  it('looks up Intel Arc A770 (discrete) correctly', () => {
    const spec = lookupGpu('Arc A770')
    expect(spec).not.toBeNull()
    expect(spec!.vram_gb).toBe(16)
    expect(spec!.bandwidth_gbps).toBe(512)
  })

  it('returns null for unknown GPU', () => {
    expect(lookupGpu('Some Unknown GPU XYZ 9999')).toBeNull()
  })

  it('is case insensitive', () => {
    const spec = lookupGpu('nvidia geforce rtx 3090')
    expect(spec).not.toBeNull()
  })
})

describe('getAllGpuNames', () => {
  it('returns a sorted, non-empty array of strings', () => {
    const names = getAllGpuNames()
    expect(names.length).toBeGreaterThan(0)
    const sorted = [...names].sort()
    expect(names).toEqual(sorted)
  })
})
