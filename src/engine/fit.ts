import type {
  LlmModel,
  SystemSpecs,
  ModelFit,
  FitLevel,
  RunMode,
  QuantOption,
  UseCase,
} from './types'
import {
  GGUF_QUANT_HIERARCHY,
  bestQuantForBudget,
  quantBpp,
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
import {
  effectiveVramGb,
  effectiveBandwidthGbps,
  tensorParallelMultiplier,
  autoParallelism,
  usableGpuCount,
  isHomogeneous,
  resolveInterconnect,
} from './multi-gpu'

export const DEFAULT_CONTEXT = 8192

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
  requestedContext: number = DEFAULT_CONTEXT,
): ModelFit {
  const paramsB = parseParamsB(model)
  const context = Math.min(model.context_length, Math.max(512, requestedContext))
  const meta = extractModelMeta(model)
  const preQuantized = model.weight_gb != null

  // Derived multi-GPU values
  const gpuCount = usableGpuCount(system.gpus)
  const totalVramGb = effectiveVramGb(system.gpus)
  const homogeneous = isHomogeneous(system.gpus)
  // Degrade requested interconnect if the hardware can't actually do it —
  // e.g. 2× RTX 4090 with ic=nvlink is physically impossible, so treat as pcie4.
  const resolvedInterconnect = resolveInterconnect(system.gpus, system.interconnect)
  const resolvedParallelism =
    system.parallelism === 'auto'
      ? autoParallelism(gpuCount, resolvedInterconnect, homogeneous)
      : system.parallelism
  const tpMult =
    resolvedParallelism === 'tensor_parallel'
      ? tensorParallelMultiplier(gpuCount, resolvedInterconnect, homogeneous)
      : 1.0
  const effectiveBw = effectiveBandwidthGbps(system.gpus)

  // Determine run mode and available memory
  let runMode: RunMode
  let availableGb: number

  if (system.unified_memory) {
    runMode = 'unified'
    availableGb = system.ram_gb
  } else if (totalVramGb > 0) {
    const gpuMem = estimateMemory(
      paramsB,
      model.quantization,
      context,
      meta,
      preQuantized ? model.weight_gb : null,
    ).total_gb
    const gpuFits = preQuantized
      ? gpuMem <= totalVramGb
      : bestQuantForBudget(paramsB, totalVramGb, context, meta) != null

    if (gpuFits) {
      runMode = 'gpu'
      availableGb = totalVramGb
    } else {
      const offloadFits = preQuantized
        ? gpuMem <= totalVramGb + system.ram_gb
        : bestQuantForBudget(paramsB, totalVramGb + system.ram_gb, context, meta) != null
      if (offloadFits) {
        runMode = 'cpu_offload'
        availableGb = totalVramGb + system.ram_gb
      } else {
        runMode = 'cpu_only'
        availableGb = system.ram_gb
      }
    }
  } else {
    runMode = 'cpu_only'
    availableGb = system.ram_gb
  }

  // Best quantization: native for pre-quantized, GGUF-best-fit otherwise
  const bestQuant: string = preQuantized
    ? model.quantization
    : bestQuantForBudget(paramsB, availableGb, context, meta) ?? 'Q4_K_M'

  // Disk-space gate (Advanced mode). Skipped when user hasn't set disk_free_gb.
  const diskNeededGb = model.weight_gb ?? (paramsB * quantBpp(bestQuant))
  if (system.disk_free_gb != null && diskNeededGb > system.disk_free_gb) {
    return {
      model,
      fit_level: 'wont_run',
      fit_reason: 'disk_full',
      run_mode: 'cpu_only',
      best_quant: bestQuant,
      memory_required_gb: 0,
      memory_available_gb: 0,
      memory_breakdown: { model_weight_gb: diskNeededGb, kv_cache_gb: 0, overhead_gb: 0, total_gb: diskNeededGb },
      context_used: requestedContext,
      estimated_tps: 0,
      score: 0,
      scores: { quality: 0, speed: 0, fit: 0, context: 0 },
      viable_quants: [],
      resolved_parallelism: system.parallelism,
      gpu_count: 0,
    }
  }

  const memEstimate = estimateMemory(
    paramsB,
    bestQuant,
    context,
    meta,
    preQuantized ? model.weight_gb : null,
  )
  const requiredGb = memEstimate.total_gb

  const tps = estimateTps({
    paramsB,
    quant: bestQuant,
    bandwidthGbps: runMode === 'cpu_only' ? 0 : effectiveBw,
    tpMultiplier: runMode === 'gpu' || runMode === 'unified' ? tpMult : 1.0,
    runMode,
    cpuCores: system.cpu_cores,
  })

  const fitLevel = classifyFitLevel(
    requiredGb,
    availableGb,
    runMode,
    model.recommended_ram_gb,
  )

  const uc = normalizeUseCase(useCase)
  const scores = {
    quality: qualityScore(paramsB, model.name, bestQuant, uc),
    speed: speedScore(tps, uc),
    fit: fitScore(requiredGb, availableGb),
    context: contextScore(context, uc),
  }
  const score = fitLevel === 'wont_run' ? 0 : compositeScore(scores, uc)

  // Viable quants: for pre-quantized repos, show only the native quant
  // since you can't re-quantize someone else's packed weights.
  const viable_quants: QuantOption[] = preQuantized
    ? [{
        quant: bestQuant,
        memory_required_gb: requiredGb,
        estimated_tps: tps,
        fits: requiredGb <= availableGb,
      }]
    : GGUF_QUANT_HIERARCHY.map((quant) => {
        const qMem = estimateMemory(paramsB, quant, context, meta)
        const qTps = estimateTps({
          paramsB,
          quant,
          bandwidthGbps: runMode === 'cpu_only' ? 0 : effectiveBw,
          tpMultiplier: runMode === 'gpu' || runMode === 'unified' ? tpMult : 1.0,
          runMode,
          cpuCores: system.cpu_cores,
        })
        return {
          quant,
          memory_required_gb: qMem.total_gb,
          estimated_tps: qTps,
          fits: qMem.total_gb <= availableGb,
        }
      })

  return {
    model,
    fit_level: fitLevel,
    fit_reason: fitLevel === 'wont_run' ? 'memory' : 'ok',
    run_mode: runMode,
    best_quant: bestQuant,
    memory_required_gb: requiredGb,
    memory_available_gb: availableGb,
    memory_breakdown: memEstimate,
    context_used: context,
    estimated_tps: tps,
    score,
    scores,
    viable_quants,
    resolved_parallelism: resolvedParallelism,
    gpu_count: gpuCount,
  }
}
