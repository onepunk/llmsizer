import type { MemoryEstimate, Quantization } from './types'
import { quantBpp } from './quantization'

export interface ModelMeta {
  num_hidden_layers?: number | null
  num_key_value_heads?: number | null
  head_dim?: number | null
}

export function estimateKvCache(
  context: number,
  meta: ModelMeta,
  paramsB?: number,
): number {
  const layers = meta.num_hidden_layers
  const kvHeads = meta.num_key_value_heads
  const headDim = meta.head_dim

  if (layers != null && kvHeads != null && headDim != null) {
    return (2 * layers * kvHeads * headDim * context * 2.0) / 1e9
  }

  if (paramsB != null) {
    return 0.000008 * paramsB * context
  }

  return 0
}

export function estimateMemory(
  paramsB: number,
  quant: Quantization,
  context: number,
  meta: ModelMeta,
): MemoryEstimate {
  const model_weight_gb = paramsB * quantBpp(quant)
  const kv_cache_gb = estimateKvCache(context, meta, paramsB)
  const overhead_gb = 0.5
  const total_gb = model_weight_gb + kv_cache_gb + overhead_gb

  return { model_weight_gb, kv_cache_gb, overhead_gb, total_gb }
}
