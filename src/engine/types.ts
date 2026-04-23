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
  native_context_length?: number | null
  context_extension?: string | null
  use_case: string
  is_moe: boolean
  num_experts: number | null
  active_experts: number | null
  active_parameters: number | null
  release_date: string | null
  capabilities: string[] | null
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
  // Whether this card physically supports NVLink peer-to-peer interconnect.
  // Inferred from product lineage in scripts/generate-gpu-specs.ts. Consumer
  // cards since the RTX 3090 Ti have dropped NVLink; datacenter/workstation
  // cards (A100/H100/H200/B100/B200, A-series workstation A4500+, Quadro
  // GV/RTX 5000+, Titan V/RTX, plus the RTX 3090 and RTX 2080 Ti) still carry it.
  nvlink?: boolean
}

export type Interconnect = 'nvlink' | 'pcie5' | 'pcie4' | 'pcie3' | 'none'
export type ParallelismMode = 'auto' | 'layer_split' | 'tensor_parallel'

export interface GpuEntry {
  name: string
  vram_gb: number
  bandwidth_gbps: number
  count: number
  nvlink?: boolean
}

export interface CpuFlags {
  avx512: boolean
  amx: boolean
  neon: boolean
}

export interface SystemSpecs {
  gpu_name: string | null
  gpu_detected: boolean
  gpus: GpuEntry[]              // [] means CPU-only; flatten count via expandGpus
  interconnect: Interconnect
  parallelism: ParallelismMode
  ram_gb: number
  cpu_cores: number
  unified_memory: boolean
  /** Effective system-memory bandwidth in GB/s. When set, overrides the default
   *  CPU-mode bandwidth used in speed estimation. Undefined = use default. */
  ram_bandwidth_gbps?: number | null
  /** Feature flags reported by the user. Missing means "unknown", which we treat
   *  as "no bonus" so estimates stay conservative. */
  cpu_flags?: CpuFlags | null
  /** Free disk space in GB. When set, models whose on-disk weight exceeds this
   *  value are rejected with fit_level='wont_run' and reason='disk_full'. */
  disk_free_gb?: number | null
}

export interface MemoryEstimate {
  model_weight_gb: number
  kv_cache_gb: number
  overhead_gb: number
  total_gb: number
}

export type FitReason = 'ok' | 'memory' | 'disk_full' | 'incompatible_format'

export interface ModelFit {
  model: LlmModel
  fit_level: FitLevel
  fit_reason: FitReason
  run_mode: RunMode
  best_quant: string
  memory_required_gb: number
  memory_available_gb: number
  memory_breakdown: MemoryEstimate
  context_used: number
  estimated_tps: number
  score: number
  scores: { quality: number; speed: number; fit: number; context: number }
  viable_quants: QuantOption[]
  resolved_parallelism: ParallelismMode
  gpu_count: number
}

export interface QuantOption {
  quant: string
  memory_required_gb: number
  estimated_tps: number
  fits: boolean
}

export type SortKey = 'score' | 'tps' | 'params' | 'memory' | 'context' | 'name' | 'release_date'
export type SortDir = 'asc' | 'desc'

export interface FilterState {
  search: string
  useCase: UseCase | 'all'
  minFit: FitLevel | 'all'
  context: number
  sort: SortKey
  sortDir: SortDir
}
