import { quantBytesPerParam, quantSpeedMultiplier } from './quantization'
import type { RunMode } from './types'

const RUN_MODE_FACTOR: Record<RunMode, number> = {
  gpu: 1.0,
  unified: 1.0,
  cpu_offload: 0.5,
  cpu_only: 0,
}

const CPU_K = 70
const REFERENCE_RAM_GBPS = 50 // DDR4-3200 dual-channel baseline

export interface SpeedParams {
  paramsB: number
  quant: string
  bandwidthGbps: number
  runMode: RunMode
  cpuCores: number
  tpMultiplier?: number
  /** Optional override for CPU-memory-bound modes (cpu_only, cpu_offload).
   *  When set, scales CPU base TPS by ramBandwidthGbps / REFERENCE_RAM_GBPS. */
  ramBandwidthGbps?: number | null
}

export function estimateTps(params: SpeedParams): number {
  const { paramsB, quant, bandwidthGbps, runMode, cpuCores, tpMultiplier = 1.0, ramBandwidthGbps } = params
  if (paramsB <= 0) return 0

  const bwScale = ramBandwidthGbps ? ramBandwidthGbps / REFERENCE_RAM_GBPS : 1.0

  if (runMode === 'cpu_only' || bandwidthGbps === 0) {
    const base = (CPU_K / paramsB) * quantSpeedMultiplier(quant)
    const threadingBonus = cpuCores >= 8 ? 1.1 : 1.0
    return base * threadingBonus * bwScale
  }

  const modelSizeGb = paramsB * quantBytesPerParam(quant)
  const rawTps = (bandwidthGbps / modelSizeGb) * 0.55
  const cpuOffloadScale = runMode === 'cpu_offload' ? bwScale : 1.0
  return rawTps * RUN_MODE_FACTOR[runMode] * tpMultiplier * cpuOffloadScale
}
