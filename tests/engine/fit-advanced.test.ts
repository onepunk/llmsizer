import { describe, it, expect } from 'vitest'
import { analyzeModelFit } from '../../src/engine/fit'
import type { LlmModel, SystemSpecs } from '../../src/engine/types'

const LLAMA_70B: LlmModel = {
  name: 'meta-llama/Llama-3.3-70B-Instruct',
  provider: 'meta-llama',
  parameter_count: '70B',
  parameters_raw: 70_000_000_000,
  min_ram_gb: 40,
  recommended_ram_gb: 80,
  min_vram_gb: 40,
  quantization: 'Q4_K_M',
  format: 'gguf',
  context_length: 131072,
  use_case: 'general',
  is_moe: false,
  num_experts: null,
  active_experts: null,
  active_parameters: null,
  release_date: '2025-12-06',
  capabilities: ['text-generation'],
  num_attention_heads: 64,
  num_key_value_heads: 8,
  num_hidden_layers: 80,
  head_dim: 128,
  license: 'llama3',
  weight_gb: 40,
}

const BASE: SystemSpecs = {
  gpu_name: null,
  gpu_detected: false,
  gpus: [],
  interconnect: 'none',
  parallelism: 'auto',
  ram_gb: 96, // enough to actually hold a 70B at Q4
  cpu_cores: 16,
  unified_memory: false,
}

describe('Advanced mode end-to-end', () => {
  it('AVX-512 + fast RAM beats scalar + slow RAM for cpu_only 70B', () => {
    const slow = analyzeModelFit(
      LLAMA_70B,
      { ...BASE, ram_bandwidth_gbps: 25 },
      'general',
    )
    const fast = analyzeModelFit(
      LLAMA_70B,
      {
        ...BASE,
        ram_bandwidth_gbps: 90,
        cpu_flags: { avx512: true, amx: false, neon: false },
      },
      'general',
    )
    // Both fits run, the fast system should estimate more tokens/sec.
    expect(slow.fit_reason).not.toBe('disk_full')
    expect(fast.fit_reason).not.toBe('disk_full')
    expect(fast.estimated_tps).toBeGreaterThan(slow.estimated_tps)
  })

  it('rejects a 40 GB model on a 30 GB free disk with disk_full reason', () => {
    const result = analyzeModelFit(
      LLAMA_70B,
      { ...BASE, disk_free_gb: 30 },
      'general',
    )
    expect(result.fit_level).toBe('wont_run')
    expect(result.fit_reason).toBe('disk_full')
  })

  it('leaves disk check disabled when disk_free_gb is unset', () => {
    const result = analyzeModelFit(LLAMA_70B, BASE, 'general')
    expect(result.fit_reason).not.toBe('disk_full')
  })

  it('RAM bandwidth override also lifts per-quant TPS in viable_quants', () => {
    const slow = analyzeModelFit(
      LLAMA_70B,
      { ...BASE, ram_bandwidth_gbps: 25 },
      'general',
    )
    const fast = analyzeModelFit(
      LLAMA_70B,
      { ...BASE, ram_bandwidth_gbps: 100 },
      'general',
    )
    // Compare same quant across both runs — the viable_quants entry for
    // bestQuant should reflect the bandwidth scaling, not just headline TPS.
    const slowEntry = slow.viable_quants.find((q) => q.quant === slow.best_quant)
    const fastEntry = fast.viable_quants.find((q) => q.quant === fast.best_quant)
    expect(slowEntry).toBeDefined()
    expect(fastEntry).toBeDefined()
    // In cpu_only, the viable-quants TPS should scale with RAM bandwidth
    // just like the headline TPS.
    expect(fastEntry!.estimated_tps).toBeGreaterThan(slowEntry!.estimated_tps)
  })
})
