import { describe, it, expect } from 'vitest'
import {
  quantBpp,
  quantBytesPerParam,
  quantSpeedMultiplier,
  GGUF_QUANT_HIERARCHY,
  bestQuantForBudget,
} from '../../src/engine/quantization'

describe('quantBpp', () => {
  it('returns correct values for known quants', () => {
    expect(quantBpp('Q8_0')).toBe(1.05)
    expect(quantBpp('Q4_K_M')).toBe(0.58)
    expect(quantBpp('Q2_K')).toBe(0.37)
    expect(quantBpp('F16')).toBe(2.0)
  })

  it('returns default 0.58 for unknown quant', () => {
    expect(quantBpp('UNKNOWN')).toBe(0.58)
  })
})

describe('quantBytesPerParam', () => {
  it('returns correct values for known quants', () => {
    expect(quantBytesPerParam('F16')).toBe(2.0)
    expect(quantBytesPerParam('Q8_0')).toBe(1.0)
    expect(quantBytesPerParam('Q6_K')).toBe(0.75)
    expect(quantBytesPerParam('Q5_K_M')).toBe(0.625)
    expect(quantBytesPerParam('Q4_K_M')).toBe(0.5)
    expect(quantBytesPerParam('Q3_K_M')).toBe(0.375)
    expect(quantBytesPerParam('Q2_K')).toBe(0.25)
  })

  it('returns default 0.5 for unknown quant', () => {
    expect(quantBytesPerParam('UNKNOWN')).toBe(0.5)
  })
})

describe('quantSpeedMultiplier', () => {
  it('returns correct values for known quants', () => {
    expect(quantSpeedMultiplier('F16')).toBe(0.6)
    expect(quantSpeedMultiplier('Q8_0')).toBe(0.8)
    expect(quantSpeedMultiplier('Q6_K')).toBe(0.95)
    expect(quantSpeedMultiplier('Q5_K_M')).toBe(1.0)
    expect(quantSpeedMultiplier('Q4_K_M')).toBe(1.15)
    expect(quantSpeedMultiplier('Q3_K_M')).toBe(1.25)
    expect(quantSpeedMultiplier('Q2_K')).toBe(1.35)
  })

  it('returns default 1.0 for unknown quant', () => {
    expect(quantSpeedMultiplier('UNKNOWN')).toBe(1.0)
  })
})

describe('GGUF_QUANT_HIERARCHY', () => {
  it('is in correct order from best to most compressed', () => {
    expect(GGUF_QUANT_HIERARCHY).toEqual([
      'Q8_0',
      'Q6_K',
      'Q5_K_M',
      'Q4_K_M',
      'Q3_K_M',
      'Q2_K',
    ])
  })
})

describe('bestQuantForBudget', () => {
  const meta8B = {
    num_hidden_layers: 32,
    num_key_value_heads: 8,
    head_dim: 128,
  }

  it('returns Q6_K for 7B model with 8GB budget', () => {
    const result = bestQuantForBudget(7, 8, 4096, meta8B)
    expect(result).toBe('Q6_K')
  })

  it('returns null for 70B model with 4GB budget', () => {
    const result = bestQuantForBudget(70, 4, 4096, meta8B)
    expect(result).toBeNull()
  })

  it('returns Q8_0 for 7B model with 24GB budget', () => {
    const result = bestQuantForBudget(7, 24, 4096, meta8B)
    expect(result).toBe('Q8_0')
  })
})
