import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LlmModel } from '../src/engine/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const models = JSON.parse(
  readFileSync(resolve(__dirname, '../public/models.json'), 'utf8'),
) as LlmModel[]

function model(name: string): LlmModel {
  const found = models.find((m) => m.name === name)
  if (!found) throw new Error(`Missing model fixture: ${name}`)
  return found
}

describe('models.json metadata audit', () => {
  it('keeps known RoPE/YaRN context lengths at documented maxima', () => {
    expect(model('meta-llama/Llama-3.1-8B-Instruct').context_length).toBe(131_072)
    expect(model('meta-llama/Llama-3.1-70B-Instruct').context_length).toBe(131_072)
    expect(model('deepseek-ai/DeepSeek-V3').context_length).toBe(131_072)
    expect(model('moonshotai/Kimi-K2-Instruct').context_length).toBe(131_072)
    expect(model('google/gemma-2-9b-it').context_length).toBe(8_192)
    expect(model('meta-llama/CodeLlama-7b-Instruct-hf').context_length).toBe(16_384)
  })

  it('records native context and extension method for Qwen long-context rows', () => {
    const qwen25 = model('Qwen/Qwen2.5-7B-Instruct')
    expect(qwen25.context_length).toBe(131_072)
    expect(qwen25.native_context_length).toBe(32_768)
    expect(qwen25.context_extension).toBe('YaRN')

    const qwen3 = model('Qwen/Qwen3-8B')
    expect(qwen3.context_length).toBe(131_072)
    expect(qwen3.native_context_length).toBe(32_768)
    expect(qwen3.context_extension).toBe('YaRN')
  })

  it('includes current headline 2026 model families', () => {
    expect(model('deepseek-ai/DeepSeek-V4-Pro').context_length).toBe(1_048_576)
    expect(model('deepseek-ai/DeepSeek-V4-Flash').context_length).toBe(1_048_576)
    expect(model('Qwen/Qwen3-0.6B').context_length).toBe(131_072)
    expect(model('Qwen/Qwen3-8B').context_length).toBe(131_072)
    expect(model('google/gemma-3-4b-it').capabilities).toContain('vision')
  })

  it('backfills MoE active-parameter metadata for Kimi and GLM families', () => {
    const kimi = model('moonshotai/Kimi-K2-Instruct')
    expect(kimi.is_moe).toBe(true)
    expect(kimi.num_experts).toBe(384)
    expect(kimi.active_experts).toBe(8)
    expect(kimi.active_parameters).toBe(32_000_000_000)

    const glm = model('zai-org/GLM-5')
    expect(glm.is_moe).toBe(true)
    expect(glm.num_experts).toBe(256)
    expect(glm.active_experts).toBe(8)
    expect(glm.active_parameters).toBe(40_000_000_000)
  })

  it('uses real weight sizes for representative pre-quantized repos', () => {
    const awq = model('cyankiwi/Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit')
    expect(awq.format).toBe('awq')
    expect(awq.quantization).toBe('AWQ-4bit')
    expect(awq.weight_gb).toBeGreaterThan(18)
    expect(awq.parameters_raw).toBeGreaterThan(30_000_000_000)
    expect(awq.active_parameters).toBeGreaterThan(3_000_000_000)
    expect(awq.active_parameters).toBeLessThan(3_500_000_000)

    const mlx = model('lmstudio-community/DeepSeek-R1-0528-Qwen3-8B-MLX-4bit')
    expect(mlx.format).toBe('mlx')
    expect(mlx.quantization).toBe('MLX-4bit')
    expect(mlx.context_length).toBe(131_072)
    expect(mlx.weight_gb).toBeGreaterThan(4)
    expect(mlx.parameters_raw).toBeGreaterThan(8_000_000_000)

    // Trending repositories can enter and leave the weekly database, so assert
    // the sizing invariant against any current GPTQ Int4 row instead of pinning
    // the test to one repository forever.
    const gptq = models.find((m) => m.format === 'gptq' && m.quantization === 'GPTQ-Int4')
    expect(gptq).toBeDefined()
    const gptqParamsB = gptq!.parameters_raw! / 1e9
    expect(gptq!.weight_gb).toBeGreaterThan(gptqParamsB * 0.4)
    expect(gptq!.weight_gb).toBeLessThan(gptqParamsB * 0.8)
  })

  it('does not leave native pre-quantized formats without weight_gb', () => {
    const nativeFormats = new Set(['awq', 'gptq', 'mlx', 'bnb', 'exl2'])
    const missing = models.filter((m) => nativeFormats.has(m.format?.toLowerCase()) && m.weight_gb == null)
    expect(missing.map((m) => m.name)).toEqual([])
  })

  it('excludes test fixtures without dropping legitimate small models', () => {
    const fixtureNames = models
      .map((m) => m.name)
      .filter((name) =>
        /(?:^|[/_-])(?:tiny[-_]?random|unit[-_]?test|dummy)(?:[/_-]|$)|[/_-]internal-testing(?:[/_-]|$)/i
          .test(name),
      )

    expect(fixtureNames).toEqual([])
    expect(model('TinyLlama/TinyLlama-1.1B-Chat-v1.0').parameters_raw).toBeGreaterThan(1_000_000_000)
  })
})
