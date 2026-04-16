import { describe, it, expect } from 'vitest'
import { estimateMemory, estimateKvCache } from '../../src/engine/memory'

describe('estimateMemory', () => {
  it('estimates memory for 7B Q4_K_M with full metadata', () => {
    const meta = {
      num_hidden_layers: 32,
      num_key_value_heads: 8,
      head_dim: 128,
    }
    const result = estimateMemory(7, 'Q4_K_M', 4096, meta)

    expect(result.model_weight_gb).toBeCloseTo(7 * 0.58, 4)
    expect(result.kv_cache_gb).toBeCloseTo(
      (2 * 32 * 8 * 128 * 4096 * 2.0) / 1e9,
      4,
    )
    expect(result.overhead_gb).toBe(0.5)
    expect(result.total_gb).toBeCloseTo(
      result.model_weight_gb + result.kv_cache_gb + result.overhead_gb,
      4,
    )
  })

  it('estimates memory with fallback KV estimation', () => {
    const meta = {}
    const result = estimateMemory(7, 'Q4_K_M', 4096, meta)

    expect(result.model_weight_gb).toBeCloseTo(7 * 0.58, 4)
    // fallback: 0.000008 * 7 * 4096
    expect(result.kv_cache_gb).toBeCloseTo(0.000008 * 7 * 4096, 4)
    expect(result.overhead_gb).toBe(0.5)
    expect(result.total_gb).toBeCloseTo(
      result.model_weight_gb + result.kv_cache_gb + result.overhead_gb,
      4,
    )
  })

  it('estimates memory for 70B model', () => {
    const meta = {
      num_hidden_layers: 80,
      num_key_value_heads: 8,
      head_dim: 128,
    }
    const result = estimateMemory(70, 'Q4_K_M', 4096, meta)

    expect(result.model_weight_gb).toBeCloseTo(70 * 0.58, 4)
    expect(result.kv_cache_gb).toBeCloseTo(
      (2 * 80 * 8 * 128 * 4096 * 2.0) / 1e9,
      4,
    )
    expect(result.overhead_gb).toBe(0.5)
    expect(result.total_gb).toBeCloseTo(
      result.model_weight_gb + result.kv_cache_gb + result.overhead_gb,
      4,
    )
  })
})

describe('estimateKvCache', () => {
  it('computes precise KV cache for Llama-3.1-8B', () => {
    const meta = {
      num_hidden_layers: 32,
      num_key_value_heads: 8,
      head_dim: 128,
    }
    const result = estimateKvCache(8192, meta)
    const expected = (2 * 32 * 8 * 128 * 8192 * 2.0) / 1e9
    expect(result).toBeCloseTo(expected, 6)
  })

  it('uses fallback when metadata is missing', () => {
    const meta = {}
    const result = estimateKvCache(4096, meta, 7)
    const expected = 0.000008 * 7 * 4096
    expect(result).toBeCloseTo(expected, 6)
  })

  it('returns 0 when no metadata and no paramsB', () => {
    const meta = {}
    const result = estimateKvCache(4096, meta)
    expect(result).toBe(0)
  })
})
