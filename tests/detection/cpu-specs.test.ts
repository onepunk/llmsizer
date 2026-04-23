import { describe, it, expect } from 'vitest'
import { CPU_SPECS, lookupCpu, getAllCpuNames } from '../../src/detection/cpu-specs'

describe('cpu-specs curated catalog', () => {
  it('every entry has unique name, ≥1 core, and valid vendor', () => {
    const names = new Set<string>()
    for (const cpu of CPU_SPECS) {
      expect(names.has(cpu.name), `duplicate CPU name: ${cpu.name}`).toBe(false)
      names.add(cpu.name)
      expect(cpu.cores).toBeGreaterThanOrEqual(1)
      expect(['AMD', 'Intel', 'Apple', 'Qualcomm', 'AWS', 'Ampere']).toContain(cpu.vendor)
    }
  })

  it('Zen 4+ Ryzen/Threadripper/EPYC expose AVX-512; Zen 3 does not', () => {
    // Spot-checks — family rules drive flags.
    expect(lookupCpu('AMD Ryzen 9 9950X')?.flags.avx512).toBe(true)
    expect(lookupCpu('AMD Ryzen 9 7950X')?.flags.avx512).toBe(true)
    expect(lookupCpu('AMD Ryzen 9 5950X')?.flags.avx512).toBe(false)
  })

  it('Intel Xeon SPR/EMR expose AVX-512 + AMX; consumer Core does not', () => {
    expect(lookupCpu('Intel Xeon Platinum 8480+')?.flags.amx).toBe(true)
    expect(lookupCpu('Intel Xeon Platinum 8480+')?.flags.avx512).toBe(true)
    expect(lookupCpu('Intel Core i9-14900K')?.flags.amx).toBe(false)
    expect(lookupCpu('Intel Core i9-14900K')?.flags.avx512).toBe(false)
  })

  it('Apple M-series sets NEON + unified', () => {
    const m4 = lookupCpu('Apple M4 Max')
    expect(m4?.flags.neon).toBe(true)
    expect(m4?.unified).toBe(true)
  })

  it('lookup returns null for unknown names', () => {
    expect(lookupCpu('Totally Fake CPU 2099')).toBeNull()
  })

  it('getAllCpuNames matches CPU_SPECS length', () => {
    expect(getAllCpuNames()).toHaveLength(CPU_SPECS.length)
  })
})
