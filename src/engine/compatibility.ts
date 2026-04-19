import type { LlmModel, SystemSpecs } from './types'
import { usableGpuCount } from './multi-gpu'

export type RuntimeBackend = 'apple_unified' | 'discrete_gpu' | 'cpu_only'

const DISCRETE_GPU_FORMATS = new Set(['awq', 'gptq', 'bnb', 'exl2', 'safetensors'])

export function detectRuntimeBackend(system: SystemSpecs): RuntimeBackend {
  if (system.unified_memory) return 'apple_unified'
  if (usableGpuCount(system.gpus) > 0) return 'discrete_gpu'
  return 'cpu_only'
}

function modelFormat(model: LlmModel): string {
  return (model.format ?? '').trim().toLowerCase()
}

export function compatibilityReason(
  model: LlmModel,
  backend: RuntimeBackend,
): string | null {
  const format = modelFormat(model)

  if (format === 'mlx') {
    return backend === 'apple_unified'
      ? null
      : 'MLX models require Apple Silicon unified memory'
  }

  if (DISCRETE_GPU_FORMATS.has(format)) {
    return backend === 'discrete_gpu'
      ? null
      : `${format.toUpperCase()} models require a discrete GPU runtime`
  }

  return null
}

export function isModelCompatible(model: LlmModel, system: SystemSpecs): boolean {
  return compatibilityReason(model, detectRuntimeBackend(system)) == null
}

export function filterCompatibleModels(
  models: LlmModel[],
  system: SystemSpecs,
): LlmModel[] {
  const backend = detectRuntimeBackend(system)
  return models.filter((model) => compatibilityReason(model, backend) == null)
}
