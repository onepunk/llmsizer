import type {
  LlmModel,
  SystemSpecs,
  ModelFit,
  FitLevel,
  RunMode,
  Quantization,
  QuantOption,
  UseCase,
} from './types'
import {
  GGUF_QUANT_HIERARCHY,
  bestQuantForBudget,
} from './quantization'
import { estimateMemory, type ModelMeta } from './memory'
import { estimateTps } from './speed'
import {
  qualityScore,
  speedScore,
  fitScore,
  contextScore,
  compositeScore,
} from './score'

const DEFAULT_CONTEXT = 8192

function parseParamsB(model: LlmModel): number {
  if (model.parameters_raw != null) {
    return model.parameters_raw / 1e9
  }

  const raw = model.parameter_count
  if (raw) {
    const match = raw.match(/^([\d.]+)\s*([BMT]?)$/i)
    if (match) {
      const num = parseFloat(match[1] ?? '0')
      const unit = (match[2] || 'B').toUpperCase()
      if (unit === 'T') return num * 1000
      if (unit === 'M') return num / 1000
      return num
    }
  }

  return 7
}

function extractModelMeta(model: LlmModel): ModelMeta {
  return {
    num_hidden_layers: model.num_hidden_layers,
    num_key_value_heads: model.num_key_value_heads,
    head_dim: model.head_dim,
  }
}

function classifyFitLevel(
  requiredGb: number,
  availableGb: number,
  runMode: RunMode,
  recommendedRamGb: number,
): FitLevel {
  if (requiredGb > availableGb) return 'wont_run'
  if (runMode === 'cpu_only') return 'marginal'

  if (runMode === 'gpu' || runMode === 'unified') {
    if (requiredGb <= recommendedRamGb) return 'perfect'
    if (availableGb >= requiredGb * 1.2) return 'good'
    return 'marginal'
  }

  // cpu_offload
  if (availableGb >= requiredGb * 1.2) return 'good'
  return 'marginal'
}

function normalizeUseCase(useCase: string): UseCase {
  const lower = useCase.toLowerCase() as UseCase
  const valid: UseCase[] = ['general', 'coding', 'reasoning', 'chat', 'multimodal', 'embedding']
  return valid.includes(lower) ? lower : 'general'
}

export function analyzeModelFit(
  model: LlmModel,
  system: SystemSpecs,
  useCase: string,
): ModelFit {
  // 1. Parse paramsB
  const paramsB = parseParamsB(model)

  // 2. Cap context
  const context = Math.min(model.context_length, DEFAULT_CONTEXT)

  // 3. Extract model meta
  const meta = extractModelMeta(model)

  // 4. Determine run mode and available memory
  let runMode: RunMode
  let availableGb: number

  if (system.unified_memory) {
    runMode = 'unified'
    availableGb = system.ram_gb
  } else if (system.vram_gb > 0) {
    // Try GPU first
    const gpuQuant = bestQuantForBudget(paramsB, system.vram_gb, context, meta)
    if (gpuQuant != null) {
      runMode = 'gpu'
      availableGb = system.vram_gb
    } else {
      // Try CPU offload
      const offloadQuant = bestQuantForBudget(
        paramsB,
        system.vram_gb + system.ram_gb,
        context,
        meta,
      )
      if (offloadQuant != null) {
        runMode = 'cpu_offload'
        availableGb = system.vram_gb + system.ram_gb
      } else {
        // Try CPU only
        const cpuQuant = bestQuantForBudget(paramsB, system.ram_gb, context, meta)
        if (cpuQuant != null) {
          runMode = 'cpu_only'
          availableGb = system.ram_gb
        } else {
          runMode = 'cpu_only'
          availableGb = system.ram_gb
        }
      }
    }
  } else {
    runMode = 'cpu_only'
    availableGb = system.ram_gb
  }

  // 5. Best quantization
  const bestQuant: Quantization =
    bestQuantForBudget(paramsB, availableGb, context, meta) ?? 'Q4_K_M'

  // 6. Memory estimate
  const memEstimate = estimateMemory(paramsB, bestQuant, context, meta)
  const requiredGb = memEstimate.total_gb

  // 7. Speed
  const tps = estimateTps({
    paramsB,
    quant: bestQuant,
    bandwidthGbps: runMode === 'cpu_only' ? 0 : system.bandwidth_gbps,
    runMode,
    cpuCores: system.cpu_cores,
  })

  // 8. Fit classification
  const fitLevel = classifyFitLevel(
    requiredGb,
    availableGb,
    runMode,
    model.recommended_ram_gb,
  )

  // 9. Scoring
  const uc = normalizeUseCase(useCase)
  const scores = {
    quality: qualityScore(paramsB, model.name, bestQuant, uc),
    speed: speedScore(tps, uc),
    fit: fitScore(requiredGb, availableGb),
    context: contextScore(context, uc),
  }
  const score = fitLevel === 'wont_run' ? 0 : compositeScore(scores, uc)

  // 10. Viable quants
  const viable_quants: QuantOption[] = []
  for (const quant of GGUF_QUANT_HIERARCHY) {
    const qMem = estimateMemory(paramsB, quant, context, meta)
    const qTps = estimateTps({
      paramsB,
      quant,
      bandwidthGbps: runMode === 'cpu_only' ? 0 : system.bandwidth_gbps,
      runMode,
      cpuCores: system.cpu_cores,
    })
    viable_quants.push({
      quant,
      memory_required_gb: qMem.total_gb,
      estimated_tps: qTps,
      fits: qMem.total_gb <= availableGb,
    })
  }

  return {
    model,
    fit_level: fitLevel,
    run_mode: runMode,
    best_quant: bestQuant,
    memory_required_gb: requiredGb,
    memory_available_gb: availableGb,
    estimated_tps: tps,
    score,
    scores,
    viable_quants,
  }
}
