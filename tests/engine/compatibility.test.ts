import { describe, it, expect } from 'vitest'
import {
  compatibilityReason,
  detectRuntimeBackend,
  filterCompatibleModels,
  isModelCompatible,
} from '../../src/engine/compatibility'
import type { LlmModel, SystemSpecs } from '../../src/engine/types'

const DISCRETE_GPU_SYSTEM: SystemSpecs = {
  gpu_name: 'NVIDIA GeForce RTX 4090',
  gpu_detected: true,
  gpus: [{ name: 'RTX 4090', vram_gb: 24, bandwidth_gbps: 1010, count: 1 }],
  interconnect: 'none',
  parallelism: 'auto',
  ram_gb: 64,
  cpu_cores: 16,
  unified_memory: false,
}

const APPLE_UNIFIED_SYSTEM: SystemSpecs = {
  gpu_name: 'Apple M3 Max',
  gpu_detected: true,
  gpus: [],
  interconnect: 'none',
  parallelism: 'auto',
  ram_gb: 64,
  cpu_cores: 16,
  unified_memory: true,
}

const CPU_ONLY_SYSTEM: SystemSpecs = {
  gpu_name: null,
  gpu_detected: false,
  gpus: [],
  interconnect: 'none',
  parallelism: 'auto',
  ram_gb: 64,
  cpu_cores: 16,
  unified_memory: false,
}

function model(format: string | undefined, name = format ?? 'missing-format'): LlmModel {
  return {
    name,
    provider: 'test',
    parameter_count: '7B',
    parameters_raw: 7_000_000_000,
    min_ram_gb: 8,
    recommended_ram_gb: 16,
    min_vram_gb: 6,
    quantization: 'Q4_K_M',
    format: format as string,
    context_length: 8192,
    use_case: 'General',
    is_moe: false,
    num_experts: null,
    active_experts: null,
    active_parameters: null,
    release_date: null,
    capabilities: [],
    num_attention_heads: null,
    num_key_value_heads: null,
    num_hidden_layers: null,
    head_dim: null,
    license: null,
  }
}

describe('model runtime compatibility', () => {
  it('classifies hardware backends from system specs', () => {
    expect(detectRuntimeBackend(DISCRETE_GPU_SYSTEM)).toBe('discrete_gpu')
    expect(detectRuntimeBackend(APPLE_UNIFIED_SYSTEM)).toBe('apple_unified')
    expect(detectRuntimeBackend(CPU_ONLY_SYSTEM)).toBe('cpu_only')
  })

  it('allows MLX only on Apple unified memory systems', () => {
    const mlx = model('mlx')

    expect(isModelCompatible(mlx, APPLE_UNIFIED_SYSTEM)).toBe(true)
    expect(isModelCompatible(mlx, DISCRETE_GPU_SYSTEM)).toBe(false)
    expect(isModelCompatible(mlx, CPU_ONLY_SYSTEM)).toBe(false)
    expect(compatibilityReason(mlx, 'discrete_gpu')).toContain('Apple Silicon')
  })

  it('allows native GPU quant formats only on discrete GPU systems', () => {
    for (const format of ['awq', 'gptq', 'bnb', 'exl2', 'safetensors']) {
      const quantized = model(format)

      expect(isModelCompatible(quantized, DISCRETE_GPU_SYSTEM)).toBe(true)
      expect(isModelCompatible(quantized, APPLE_UNIFIED_SYSTEM)).toBe(false)
      expect(isModelCompatible(quantized, CPU_ONLY_SYSTEM)).toBe(false)
      expect(compatibilityReason(quantized, 'apple_unified')).toContain('discrete GPU')
    }
  })

  it('keeps GGUF and unknown formats broadly available', () => {
    for (const broad of [model('gguf'), model(undefined), model('')]) {
      expect(isModelCompatible(broad, DISCRETE_GPU_SYSTEM)).toBe(true)
      expect(isModelCompatible(broad, APPLE_UNIFIED_SYSTEM)).toBe(true)
      expect(isModelCompatible(broad, CPU_ONLY_SYSTEM)).toBe(true)
    }
  })

  it('filters incompatible rows before fit analysis', () => {
    const models = [
      model('gguf', 'gguf-row'),
      model('mlx', 'mlx-row'),
      model('awq', 'awq-row'),
      model('gptq', 'gptq-row'),
    ]

    expect(filterCompatibleModels(models, DISCRETE_GPU_SYSTEM).map((m) => m.name)).toEqual([
      'gguf-row',
      'awq-row',
      'gptq-row',
    ])
    expect(filterCompatibleModels(models, APPLE_UNIFIED_SYSTEM).map((m) => m.name)).toEqual([
      'gguf-row',
      'mlx-row',
    ])
    expect(filterCompatibleModels(models, CPU_ONLY_SYSTEM).map((m) => m.name)).toEqual([
      'gguf-row',
    ])
  })
})
