import { describe, it, expect } from 'vitest'
import { analyzeModelFit } from '../../src/engine/fit'
import type { LlmModel, SystemSpecs } from '../../src/engine/types'

const LLAMA_8B_GGUF: LlmModel = {
  name: 'meta-llama/Llama-3.1-8B-Instruct',
  provider: 'meta-llama',
  parameter_count: '8B',
  parameters_raw: 8_030_000_000,
  min_ram_gb: 8,
  recommended_ram_gb: 16,
  min_vram_gb: 8,
  quantization: 'Q4_K_M',
  format: 'gguf',
  context_length: 131072,
  use_case: 'general',
  is_moe: false,
  num_experts: null,
  active_experts: null,
  active_parameters: null,
  release_date: '2025-07-23',
  capabilities: ['text-generation'],
  num_attention_heads: 32,
  num_key_value_heads: 8,
  num_hidden_layers: 32,
  head_dim: 128,
  license: 'llama3.1',
  weight_gb: 5.0,
}

const BASE_SYSTEM: SystemSpecs = {
  gpu_name: null,
  gpu_detected: false,
  gpus: [],
  interconnect: 'none',
  parallelism: 'auto',
  ram_gb: 32,
  cpu_cores: 8,
  unified_memory: false,
}

describe('disk-space gate', () => {
  it('rejects model when weight_gb exceeds disk_free_gb', () => {
    const result = analyzeModelFit(
      LLAMA_8B_GGUF,
      { ...BASE_SYSTEM, disk_free_gb: 2 },
      'general',
    )
    expect(result.fit_level).toBe('wont_run')
    expect(result.fit_reason).toBe('disk_full')
  })

  it('allows model when disk_free_gb is comfortably large', () => {
    const result = analyzeModelFit(
      LLAMA_8B_GGUF,
      { ...BASE_SYSTEM, disk_free_gb: 500 },
      'general',
    )
    expect(result.fit_reason).not.toBe('disk_full')
  })

  it('skips the disk check when disk_free_gb is null/undefined', () => {
    const result = analyzeModelFit(
      LLAMA_8B_GGUF,
      { ...BASE_SYSTEM, disk_free_gb: null },
      'general',
    )
    expect(result.fit_reason).not.toBe('disk_full')
  })
})
