import type { GpuSpec, SystemSpecs } from '../engine/types'
import { parseRendererString, lookupGpu } from './parse-renderer'

export interface HardwareDetection {
  gpu_renderer: string | null
  gpu_parsed: string | null
  gpu_spec: GpuSpec | null
  cpu_cores: number
  device_memory: number | null
}

/**
 * Detects GPU info via WebGL, CPU core count, and device memory.
 * Must be called in a browser environment.
 */
export function detectHardware(): HardwareDetection {
  let gpu_renderer: string | null = null
  let gpu_parsed: string | null = null
  let gpu_spec: GpuSpec | null = null

  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl') as WebGLRenderingContext | null

    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) {
        const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string
        if (raw) {
          gpu_renderer = raw
          gpu_parsed = parseRendererString(raw)
          gpu_spec = lookupGpu(gpu_parsed)
        }
      }
    }
  } catch {
    // WebGL not available — leave gpu fields null
  }

  const cpu_cores = navigator.hardwareConcurrency ?? 1
  const device_memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null

  return { gpu_renderer, gpu_parsed, gpu_spec, cpu_cores, device_memory }
}

export interface DetectionOverrides {
  vram_gb?: number
  ram_gb?: number
  bandwidth_gbps?: number
  unified_memory?: boolean
}

/**
 * Builds a SystemSpecs object from a HardwareDetection result and optional user overrides.
 * device_memory (GB) is used as the RAM estimate when available.
 */
export function buildSystemSpecs(
  detection: HardwareDetection,
  overrides: DetectionOverrides = {}
): SystemSpecs {
  const spec = detection.gpu_spec
  const unified = overrides.unified_memory ?? spec?.unified ?? false

  // VRAM: override > spec value > 0
  const vram_gb = overrides.vram_gb ?? (spec && !unified ? (spec.vram_gb ?? 0) : 0)

  // RAM: override > device_memory API > 0
  const ram_gb = overrides.ram_gb ?? (detection.device_memory ?? 0)

  // Bandwidth: override > spec value > 0
  const bandwidth_gbps = overrides.bandwidth_gbps ?? spec?.bandwidth_gbps ?? 0

  const gpu_detected = detection.gpu_spec !== null

  return {
    gpu_name: detection.gpu_parsed,
    gpu_detected,
    vram_gb,
    ram_gb,
    cpu_cores: detection.cpu_cores,
    bandwidth_gbps,
    unified_memory: unified,
  }
}
