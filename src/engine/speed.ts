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

const CPU_FLAG_BONUS = { amx: 1.8, avx512: 1.4, neon: 1.2, none: 1.0 } as const

function cpuFlagMultiplier(flags?: SpeedParams['cpuFlags']): number {
  if (!flags) return CPU_FLAG_BONUS.none
  if (flags.amx) return CPU_FLAG_BONUS.amx
  if (flags.avx512) return CPU_FLAG_BONUS.avx512
  if (flags.neon) return CPU_FLAG_BONUS.neon
  return CPU_FLAG_BONUS.none
}

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
  /** CPU feature flags for the target CPU. AMX > AVX-512 > NEON; the best
   *  applicable multiplier is used (flags are NOT additive). Undefined/null
   *  means "unknown" and yields no bonus. */
  cpuFlags?: { avx512: boolean; amx: boolean; neon: boolean } | null
}

export function estimateTps(params: SpeedParams): number {
  const { paramsB, quant, bandwidthGbps, runMode, cpuCores, tpMultiplier = 1.0, ramBandwidthGbps, cpuFlags } = params
  if (paramsB <= 0) return 0

  const bwScale = ramBandwidthGbps ? ramBandwidthGbps / REFERENCE_RAM_GBPS : 1.0
  const flagMult = cpuFlagMultiplier(cpuFlags)

  if (runMode === 'cpu_only' || bandwidthGbps === 0) {
    const base = (CPU_K / paramsB) * quantSpeedMultiplier(quant)
    const threadingBonus = cpuCores >= 8 ? 1.1 : 1.0
    return base * threadingBonus * bwScale * flagMult
  }

  const modelSizeGb = paramsB * quantBytesPerParam(quant)
  const rawTps = (bandwidthGbps / modelSizeGb) * 0.55
  const cpuPenalty = runMode === 'cpu_offload' ? bwScale * flagMult : 1.0
  return rawTps * RUN_MODE_FACTOR[runMode] * tpMultiplier * cpuPenalty
}
