export type UseCase = 'general' | 'coding' | 'reasoning' | 'chat' | 'multimodal' | 'embedding'
export type FitLevel = 'perfect' | 'good' | 'marginal' | 'wont_run'
export type RunMode = 'gpu' | 'unified' | 'cpu_offload' | 'cpu_only'
export type Quantization = 'F16' | 'BF16' | 'Q8_0' | 'Q6_K' | 'Q5_K_M' | 'Q4_K_M' | 'Q3_K_M' | 'Q2_K'

export interface GgufSource {
  repo: string
  provider: string
}

export interface LlmModel {
  name: string
  provider: string
  parameter_count: string
  parameters_raw: number | null
  min_ram_gb: number
  recommended_ram_gb: number
  min_vram_gb: number | null
  quantization: string
  format: string
  context_length: number
  use_case: string
  is_moe: boolean
  num_experts: number | null
  active_experts: number | null
  active_parameters: number | null
  release_date: string | null
  capabilities: string[]
  num_attention_heads: number | null
  num_key_value_heads: number | null
  num_hidden_layers: number | null
  head_dim: number | null
  license: string | null
  architecture?: string | null
  gguf_sources?: GgufSource[]
  weight_gb?: number | null
}

export interface GpuSpec {
  vram_gb: number | null
  bandwidth_gbps: number
  unified?: boolean
}

export interface SystemSpecs {
  gpu_name: string | null
  gpu_detected: boolean
  vram_gb: number
  ram_gb: number
  cpu_cores: number
  bandwidth_gbps: number
  unified_memory: boolean
}

export interface MemoryEstimate {
  model_weight_gb: number
  kv_cache_gb: number
  overhead_gb: number
  total_gb: number
}

export interface ModelFit {
  model: LlmModel
  fit_level: FitLevel
  run_mode: RunMode
  best_quant: string
  memory_required_gb: number
  memory_available_gb: number
  estimated_tps: number
  score: number
  scores: { quality: number; speed: number; fit: number; context: number }
  viable_quants: QuantOption[]
}

export interface QuantOption {
  quant: string
  memory_required_gb: number
  estimated_tps: number
  fits: boolean
}

export type SortKey = 'score' | 'tps' | 'params' | 'memory' | 'context' | 'name'
export type SortDir = 'asc' | 'desc'

export interface FilterState {
  search: string
  useCase: UseCase | 'all'
  minFit: FitLevel | 'all'
  sort: SortKey
  sortDir: SortDir
}
