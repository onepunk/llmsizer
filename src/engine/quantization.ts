import type { Quantization } from './types'
import { estimateMemory, type ModelMeta } from './memory'

export const GGUF_QUANT_HIERARCHY: Quantization[] = [
  'Q8_0',
  'Q6_K',
  'Q5_K_M',
  'Q4_K_M',
  'Q3_K_M',
  'Q2_K',
]

const BPP_MAP: Record<string, number> = {
  F16: 2.0,
  BF16: 2.0,
  Q8_0: 1.05,
  Q6_K: 0.80,
  Q5_K_M: 0.68,
  Q4_K_M: 0.58,
  Q3_K_M: 0.48,
  Q2_K: 0.37,
  'AWQ-4bit': 0.60,
  'AWQ-8bit': 1.10,
  'GPTQ-Int4': 0.60,
  'GPTQ-Int8': 1.10,
  'GPTQ-Int2': 0.35,
  'MLX-4bit': 0.55,
  'MLX-8bit': 1.05,
  'MLX-6bit': 0.80,
  'MLX-3bit': 0.45,
  'BNB-4bit': 0.60,
  'BNB-8bit': 1.05,
}

const BYTES_PER_PARAM_MAP: Record<string, number> = {
  F16: 2.0,
  BF16: 2.0,
  Q8_0: 1.0,
  Q6_K: 0.75,
  Q5_K_M: 0.625,
  Q4_K_M: 0.5,
  Q3_K_M: 0.375,
  Q2_K: 0.25,
  'AWQ-4bit': 0.5,
  'AWQ-8bit': 1.0,
  'GPTQ-Int4': 0.5,
  'GPTQ-Int8': 1.0,
  'GPTQ-Int2': 0.25,
  'MLX-4bit': 0.5,
  'MLX-8bit': 1.0,
  'MLX-6bit': 0.75,
  'MLX-3bit': 0.375,
  'BNB-4bit': 0.5,
  'BNB-8bit': 1.0,
}

const SPEED_MULTIPLIER_MAP: Record<string, number> = {
  F16: 0.6,
  BF16: 0.6,
  Q8_0: 0.8,
  Q6_K: 0.95,
  Q5_K_M: 1.0,
  Q4_K_M: 1.15,
  Q3_K_M: 1.25,
  Q2_K: 1.35,
  'AWQ-4bit': 1.15,
  'AWQ-8bit': 0.8,
  'GPTQ-Int4': 1.15,
  'GPTQ-Int8': 0.8,
  'GPTQ-Int2': 1.3,
  'MLX-4bit': 1.15,
  'MLX-8bit': 0.8,
  'MLX-6bit': 0.95,
  'MLX-3bit': 1.25,
  'BNB-4bit': 1.10,
  'BNB-8bit': 0.8,
}

export function quantBpp(quant: Quantization | string): number {
  return BPP_MAP[quant] ?? 0.58
}

export function quantBytesPerParam(quant: Quantization | string): number {
  return BYTES_PER_PARAM_MAP[quant] ?? 0.5
}

export function quantSpeedMultiplier(quant: Quantization | string): number {
  return SPEED_MULTIPLIER_MAP[quant] ?? 1.0
}

export function bestQuantForBudget(
  paramsRaw: number,
  budgetGb: number,
  context: number,
  modelMeta: ModelMeta,
): Quantization | null {
  for (const quant of GGUF_QUANT_HIERARCHY) {
    const mem = estimateMemory(paramsRaw, quant, context, modelMeta)
    if (mem.total_gb <= budgetGb) {
      return quant
    }
  }
  return null
}
