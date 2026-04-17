import { describe, it, expect } from 'vitest'
import { analyzeModelFit } from '../../src/engine/fit'
import type { LlmModel, SystemSpecs } from '../../src/engine/types'

const LLAMA_8B: LlmModel = {
  name: 'meta-llama/Llama-3.1-8B-Instruct',
  provider: 'meta-llama',
  parameter_count: '8B',
  parameters_raw: 8_000_000_000,
  min_ram_gb: 6,
  recommended_ram_gb: 10,
  min_vram_gb: 6,
  quantization: 'Q4_K_M',
  format: 'gguf',
  context_length: 131072,
  use_case: 'General',
  is_moe: false,
  num_experts: null,
  active_experts: null,
  active_parameters: null,
  release_date: '2024-07-23',
  capabilities: [],
  num_attention_heads: 32,
  num_key_value_heads: 8,
  num_hidden_layers: 32,
  head_dim: 128,
  license: 'llama3.1',
}

const RTX_3090_SYSTEM: SystemSpecs = {
  gpu_name: 'NVIDIA GeForce RTX 3090',
  gpu_detected: true,
  gpus: [{ name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 1 }],
  interconnect: 'none',
  parallelism: 'auto',
  ram_gb: 64,
  cpu_cores: 16,
  unified_memory: false,
}

const CPU_ONLY_SYSTEM: SystemSpecs = {
  gpu_name: null,
  gpu_detected: false,
  gpus: [],
  interconnect: 'none',
  parallelism: 'auto',
  ram_gb: 32,
  cpu_cores: 8,
  unified_memory: false,
}

describe('analyzeModelFit', () => {
  it('8B on RTX 3090: gpu, perfect, Q8_0, tps > 50', () => {
    const result = analyzeModelFit(LLAMA_8B, RTX_3090_SYSTEM, 'general')

    expect(result.run_mode).toBe('gpu')
    expect(result.fit_level).toBe('perfect')
    expect(result.best_quant).toBe('Q8_0')
    expect(result.estimated_tps).toBeGreaterThan(50)
  })

  it('8B on CPU-only (32GB): cpu_only, marginal, tps > 0 and < 20', () => {
    const result = analyzeModelFit(LLAMA_8B, CPU_ONLY_SYSTEM, 'general')

    expect(result.run_mode).toBe('cpu_only')
    expect(result.fit_level).toBe('marginal')
    expect(result.estimated_tps).toBeGreaterThan(0)
    expect(result.estimated_tps).toBeLessThan(20)
  })

  it('8B on tiny system (2GB RAM, no GPU): wont_run', () => {
    const tinySystem: SystemSpecs = {
      gpu_name: null,
      gpu_detected: false,
      gpus: [],
      interconnect: 'none',
      parallelism: 'auto',
      ram_gb: 2,
      cpu_cores: 4,
      unified_memory: false,
    }
    const result = analyzeModelFit(LLAMA_8B, tinySystem, 'general')

    expect(result.fit_level).toBe('wont_run')
    expect(result.score).toBe(0)
  })

  it('viable_quants populated with > 0 entries, all fitting on RTX 3090', () => {
    const result = analyzeModelFit(LLAMA_8B, RTX_3090_SYSTEM, 'general')

    expect(result.viable_quants.length).toBeGreaterThan(0)
    const fittingQuants = result.viable_quants.filter((q) => q.fits)
    expect(fittingQuants.length).toBeGreaterThan(0)

    // All quants for 8B should fit in 24GB VRAM
    for (const q of result.viable_quants) {
      expect(q.fits).toBe(true)
    }
  })

  it('unified memory (Apple M2 Pro, 32GB): unified, perfect', () => {
    const m2ProSystem: SystemSpecs = {
      gpu_name: 'Apple M2 Pro',
      gpu_detected: true,
      gpus: [],
      interconnect: 'none',
      parallelism: 'auto',
      ram_gb: 32,
      cpu_cores: 12,
      unified_memory: true,
    }
    const result = analyzeModelFit(LLAMA_8B, m2ProSystem, 'general')

    expect(result.run_mode).toBe('unified')
    expect(result.fit_level).toBe('perfect')
  })

  it('exposes memory breakdown and context_used for the UI', () => {
    const result = analyzeModelFit(LLAMA_8B, RTX_3090_SYSTEM, 'general', 4096)

    expect(result.context_used).toBe(4096)
    const mem = result.memory_breakdown
    expect(mem.model_weight_gb).toBeGreaterThan(0)
    expect(mem.kv_cache_gb).toBeGreaterThan(0)
    expect(mem.overhead_gb).toBe(0.5)
    expect(mem.total_gb).toBeCloseTo(
      mem.model_weight_gb + mem.kv_cache_gb + mem.overhead_gb,
      4,
    )
    expect(result.memory_required_gb).toBeCloseTo(mem.total_gb, 4)
  })

  it('larger context increases KV cache and required memory', () => {
    const small = analyzeModelFit(LLAMA_8B, RTX_3090_SYSTEM, 'general', 4096)
    const large = analyzeModelFit(LLAMA_8B, RTX_3090_SYSTEM, 'general', 32768)

    expect(large.memory_breakdown.kv_cache_gb).toBeGreaterThan(
      small.memory_breakdown.kv_cache_gb,
    )
    expect(large.memory_required_gb).toBeGreaterThan(small.memory_required_gb)
  })

  it('context is capped at the model context_length', () => {
    // LLAMA_8B.context_length is 131072. Ask for 1M.
    const result = analyzeModelFit(LLAMA_8B, RTX_3090_SYSTEM, 'general', 1_000_000)
    expect(result.context_used).toBe(131072)
  })

  it('2x RTX 3090 (homogeneous, nvlink): aggregates VRAM, applies TP multiplier', () => {
    const dual3090: SystemSpecs = {
      gpu_name: 'NVIDIA GeForce RTX 3090',
      gpu_detected: true,
      gpus: [{ name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 2 }],
      interconnect: 'nvlink',
      parallelism: 'auto',
      ram_gb: 64,
      cpu_cores: 16,
      unified_memory: false,
    }
    const single = analyzeModelFit(LLAMA_8B, RTX_3090_SYSTEM, 'general')
    const dual = analyzeModelFit(LLAMA_8B, dual3090, 'general')

    expect(dual.memory_available_gb).toBeGreaterThan(single.memory_available_gb * 1.8)
    expect(dual.estimated_tps).toBeGreaterThan(single.estimated_tps * 1.4)
    expect(dual.resolved_parallelism).toBe('tensor_parallel')
    expect(dual.gpu_count).toBe(2)
  })

  it('mixed 3090 + 3060 (heterogeneous): falls back to layer_split, lower TPS than homogeneous', () => {
    const mixed: SystemSpecs = {
      gpu_name: 'Mixed',
      gpu_detected: true,
      gpus: [
        { name: 'RTX 3090', vram_gb: 24, bandwidth_gbps: 936, count: 1 },
        { name: 'RTX 3060', vram_gb: 12, bandwidth_gbps: 360, count: 1 },
      ],
      interconnect: 'nvlink',
      parallelism: 'auto',
      ram_gb: 64,
      cpu_cores: 16,
      unified_memory: false,
    }
    const result = analyzeModelFit(LLAMA_8B, mixed, 'general')
    expect(result.resolved_parallelism).toBe('layer_split')
    expect(result.gpu_count).toBe(2)
    // 10% heterogeneity overhead on raw 36GB = ~32.4GB effective
    expect(result.memory_available_gb).toBeCloseTo(32.4, 0)
  })
})
