import type { GpuSpec } from '../engine/types'
import { parseRendererString, lookupGpu, isIntegratedGpu } from './parse-renderer'

export interface HardwareDetection {
  gpu_renderer: string | null
  gpu_parsed: string | null
  gpu_spec: GpuSpec | null
  cpu_cores: number
  device_memory: number | null
}

/**
 * Creates a WebGL context with the given attributes and reads the unmasked
 * renderer string. Returns null if WebGL or the debug extension is unavailable.
 */
function probeRenderer(attrs?: WebGLContextAttributes): string | null {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2', attrs) ??
      canvas.getContext('webgl', attrs) ??
      (canvas.getContext('experimental-webgl', attrs) as WebGLRenderingContext | null)
    if (!gl) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return null
    const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string
    return raw || null
  } catch {
    return null
  }
}

/**
 * Detects GPU info via WebGL, CPU core count, and device memory.
 * Must be called in a browser environment.
 *
 * On laptops with switchable graphics (Intel iGPU + NVIDIA/AMD dGPU), the
 * browser defaults WebGL contexts to the integrated GPU for power savings —
 * which means a naive probe misses the discrete GPU entirely. We probe twice:
 * once with powerPreference: 'high-performance' to hint the browser toward
 * the dGPU, and once with the default preference. If the two probes return
 * different GPUs, prefer the discrete one.
 */
export function detectHardware(): HardwareDetection {
  let gpu_renderer: string | null = null
  let gpu_parsed: string | null = null
  let gpu_spec: GpuSpec | null = null

  const candidates: string[] = []
  const seen = new Set<string>()
  const perfRaw = probeRenderer({ powerPreference: 'high-performance' })
  if (perfRaw) {
    candidates.push(perfRaw)
    seen.add(perfRaw)
  }
  const defaultRaw = probeRenderer()
  if (defaultRaw && !seen.has(defaultRaw)) {
    candidates.push(defaultRaw)
  }

  // Prefer a discrete GPU over an integrated one. Among multiple discretes
  // (rare), the high-performance probe comes first so it wins.
  let chosen: string | null = null
  for (const raw of candidates) {
    if (!isIntegratedGpu(parseRendererString(raw))) {
      chosen = raw
      break
    }
  }
  if (chosen === null) chosen = candidates[0] ?? null

  if (chosen !== null) {
    gpu_renderer = chosen
    gpu_parsed = parseRendererString(chosen)
    gpu_spec = lookupGpu(gpu_parsed)
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
 * Flat detection result used by the hardware UI state. The UI still stores
 * scalar vram/bandwidth because it's single-GPU for now; the multi-GPU shape
 * is assembled inside useHardware when building SystemSpecs.
 */
export interface DetectedSystem {
  gpu_name: string | null
  gpu_detected: boolean
  vram_gb: number
  ram_gb: number
  cpu_cores: number
  bandwidth_gbps: number
  unified_memory: boolean
}

/**
 * Builds a DetectedSystem from a HardwareDetection result and optional user overrides.
 * device_memory (GB) is used as the RAM estimate when available.
 */
export function buildSystemSpecs(
  detection: HardwareDetection,
  overrides: DetectionOverrides = {}
): DetectedSystem {
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
