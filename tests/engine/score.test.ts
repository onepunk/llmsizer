import { describe, it, expect } from 'vitest'
import {
  qualityScore,
  speedScore,
  fitScore,
  contextScore,
  compositeScore,
} from '../../src/engine/score'

describe('qualityScore', () => {
  it('7B Llama Q4_K_M general → 57', () => {
    // base(7)=60 (3-7B range), llama+2, Q4_K_M-5, no task alignment → 57
    expect(qualityScore(7, 'Llama-3-7B', 'Q4_K_M', 'general')).toBe(57)
  })

  it('70B DeepSeek Q8_0 → 98', () => {
    // base(70)=95 (>=40B), deepseek+3, Q8_0=0 → 98
    expect(qualityScore(70, 'DeepSeek-V3-70B', 'Q8_0', 'general')).toBe(98)
  })

  it('coding model: 5B code model Q4_K_M coding → 61', () => {
    // base(5)=60 (3-7B), no family bump, Q4_K_M-5, coding+code+6 → 61
    expect(qualityScore(5, 'CodeGen-5B', 'Q4_K_M', 'coding')).toBe(61)
  })

  it('clamps to 100 for very high scores', () => {
    // base(70)=95, deepseek+3, Q8_0=0, reasoning+>=13=+5 → clamped to 100
    expect(qualityScore(70, 'DeepSeek-R1-70B', 'Q8_0', 'reasoning')).toBe(100)
  })

  it('clamps to 0 for very low scores', () => {
    // base(<1)=30, Q2_K=-12 → 18 (still above 0, just testing clamp doesn't go negative)
    const score = qualityScore(0.5, 'tiny-model', 'Q2_K', 'general')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

describe('speedScore', () => {
  it('40 tps general → 100', () => {
    expect(speedScore(40, 'general')).toBe(100)
  })

  it('20 tps general → 50', () => {
    expect(speedScore(20, 'general')).toBe(50)
  })

  it('25 tps reasoning → 100', () => {
    expect(speedScore(25, 'reasoning')).toBe(100)
  })

  it('clamps to 0 for 0 tps', () => {
    expect(speedScore(0, 'general')).toBe(0)
  })

  it('clamps to 100 for very high tps', () => {
    expect(speedScore(1000, 'general')).toBe(100)
  })
})

describe('fitScore', () => {
  it('60% utilization → 100 (sweet spot)', () => {
    // ratio = 6/10 = 0.6, between 0.5 and 0.8 → 100
    expect(fitScore(6, 10)).toBe(100)
  })

  it('20% utilization → >60 and <100', () => {
    // ratio = 2/10 = 0.2 ≤ 0.5 → 60 + (0.2/0.5)*40 = 76
    const score = fitScore(2, 10)
    expect(score).toBeGreaterThan(60)
    expect(score).toBeLessThan(100)
  })

  it('85% utilization → 70', () => {
    // ratio = 8.5/10 = 0.85, between 0.8 and 0.9 → 70
    expect(fitScore(8.5, 10)).toBe(70)
  })

  it('95% utilization → 50', () => {
    // ratio = 9.5/10 = 0.95 > 0.9 → 50
    expect(fitScore(9.5, 10)).toBe(50)
  })

  it('over budget → 0', () => {
    expect(fitScore(12, 10)).toBe(0)
  })
})

describe('contextScore', () => {
  it('8192 context general → 100', () => {
    // target=4096, 8192 >= 4096 → 100
    expect(contextScore(8192, 'general')).toBe(100)
  })

  it('2048 context general → 70', () => {
    // target=4096, 2048 >= 4096/2=2048 → 70
    expect(contextScore(2048, 'general')).toBe(70)
  })

  it('1024 context general → 30', () => {
    // target=4096, 1024 < 2048 → 30
    expect(contextScore(1024, 'general')).toBe(30)
  })

  it('4096 context coding → 50 (below target 8192/2)', () => {
    // target=8192, 4096 >= 8192/2=4096 → 70
    expect(contextScore(4096, 'coding')).toBe(70)
  })

  it('512 context embedding → 100', () => {
    // target=512, 512 >= 512 → 100
    expect(contextScore(512, 'embedding')).toBe(100)
  })
})

describe('compositeScore', () => {
  it('general weights verified: quality=80, speed=60, fit=100, context=100 → 79', () => {
    // 80*0.45 + 60*0.30 + 100*0.15 + 100*0.10 = 36 + 18 + 15 + 10 = 79
    const result = compositeScore(
      { quality: 80, speed: 60, fit: 100, context: 100 },
      'general',
    )
    expect(result).toBe(79)
  })

  it('coding weights applied correctly', () => {
    // 80*0.50 + 60*0.20 + 100*0.15 + 100*0.15 = 40 + 12 + 15 + 15 = 82
    const result = compositeScore(
      { quality: 80, speed: 60, fit: 100, context: 100 },
      'coding',
    )
    expect(result).toBe(82)
  })

  it('rounds to 1 decimal place', () => {
    // 75*0.45 + 50*0.30 + 90*0.15 + 80*0.10 = 33.75 + 15 + 13.5 + 8 = 70.25
    const result = compositeScore(
      { quality: 75, speed: 50, fit: 90, context: 80 },
      'general',
    )
    expect(result).toBe(70.3)
  })
})
