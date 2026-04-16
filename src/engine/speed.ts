import { quantBytesPerParam, quantSpeedMultiplier } from './quantization'
import type { RunMode } from './types'

const RUN_MODE_FACTOR: Record<RunMode, number> = {
  gpu: 1.0,
  unified: 1.0,
  cpu_offload: 0.5,
  cpu_only: 0,
}

const CPU_K = 70

export interface SpeedParams {
  paramsB: number
  quant: string
  bandwidthGbps: number
  runMode: RunMode
  cpuCores: number
}

export function estimateTps(params: SpeedParams): number {
  const { paramsB, quant, bandwidthGbps, runMode, cpuCores } = params
  if (paramsB <= 0) return 0

  if (runMode === 'cpu_only' || bandwidthGbps === 0) {
    const base = (CPU_K / paramsB) * quantSpeedMultiplier(quant)
    const threadingBonus = cpuCores >= 8 ? 1.1 : 1.0
    return base * threadingBonus
  }

  const modelSizeGb = paramsB * quantBytesPerParam(quant)
  const rawTps = (bandwidthGbps / modelSizeGb) * 0.55
  return rawTps * RUN_MODE_FACTOR[runMode]
}
