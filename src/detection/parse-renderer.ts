import type { GpuSpec } from '../engine/types'
import { ALL_GPU_SPECS, IGPU_PATTERNS } from './gpu-specs'

/**
 * Normalizes a WebGL renderer string to a clean GPU name.
 *
 * Handles:
 * - ANGLE wrappers: "ANGLE (Vendor, GPU Name DirectX/OpenGL/Metal..., ...)"
 * - /PCIe/SSE2 suffixes
 * - Intel (R) cleanup
 * - Device ID suffixes like (0x00007D55)
 * - Whitespace normalization
 */
export function parseRendererString(renderer: string): string {
  let name = renderer.trim()

  // Extract inner GPU name from ANGLE wrapper
  // Format: "ANGLE (Vendor, GPU Name Renderer..., Extra)"
  const angleMatch = name.match(/^ANGLE\s*\(([^,]+),\s*(.+?)(?:\s+(?:Direct3D|OpenGL|Metal|Vulkan|D3D)\S*.*?)?,\s*[^,)]+\)$/)
  if (angleMatch) {
    name = (angleMatch[2] ?? '').trim()
    name = name.replace(/\s+(Direct3D\d*|OpenGL|Metal|Vulkan|D3D\d*)\s*.*$/i, '').trim()
  }

  // Strip /PCIe/SSE2 and similar suffixes
  name = name.replace(/\/PCIe\/SSE2\b.*$/, '').trim()
  name = name.replace(/\/SSE2\b.*$/, '').trim()
  name = name.replace(/\/PCIe\b.*$/, '').trim()

  // Strip (R) and (TM) from Intel names
  name = name.replace(/\(R\)/g, '').trim()
  name = name.replace(/\(TM\)/g, '').trim()

  // Strip device ID suffixes like (0x00007D55)
  name = name.replace(/\s*\(0x[0-9A-Fa-f]+\)\s*$/, '').trim()

  // Normalize internal whitespace
  name = name.replace(/\s+/g, ' ').trim()

  return name
}

/**
 * Check if a parsed GPU name matches a known integrated GPU pattern.
 * iGPUs share system RAM — no dedicated VRAM.
 */
export function isIntegratedGpu(parsedName: string): boolean {
  const lower = parsedName.toLowerCase()
  return IGPU_PATTERNS.some(pattern => lower.includes(pattern.toLowerCase()))
}

// Minimum input length for reverse substring matching.
// Shorter inputs (e.g. "x", "RTX") would spuriously match many catalog keys,
// so we refuse to do reverse-substring lookup below this length.
const REVERSE_MATCH_MIN_LEN = 4

/**
 * Case-insensitive lookup against ALL_GPU_SPECS (discrete + Apple Silicon).
 * Also checks for integrated GPUs and returns a shared-memory spec.
 *
 * Matching order (first hit wins):
 * 1. Exact match (case-insensitive)
 * 2. Forward substring: key appears inside input — longest key wins
 *    (more specific keys beat less specific ones, e.g. "RTX 3090 Ti" > "RTX 3090")
 * 3. Reverse substring: input appears inside key — shortest key wins
 *    (most conservative interpretation, e.g. "RTX 3090" -> "GeForce RTX 3090",
 *    not "GeForce RTX 3090 Ti"). Requires input length >= REVERSE_MATCH_MIN_LEN.
 *    Alphabetical tie-break for determinism.
 */
export function lookupGpu(parsedName: string): GpuSpec | null {
  const lower = parsedName.toLowerCase()

  // Check for integrated GPU first
  if (isIntegratedGpu(parsedName)) {
    return { vram_gb: null, bandwidth_gbps: 0, unified: true }
  }

  // Try exact match (case-insensitive)
  for (const key of Object.keys(ALL_GPU_SPECS)) {
    if (key.toLowerCase() === lower) {
      return ALL_GPU_SPECS[key] ?? null
    }
  }

  // Pass 1: forward substring match (input contains key). Longest wins.
  let forwardKey: string | null = null
  let forwardLen = 0

  for (const key of Object.keys(ALL_GPU_SPECS)) {
    const keyLower = key.toLowerCase()
    if (lower.includes(keyLower) && key.length > forwardLen) {
      forwardKey = key
      forwardLen = key.length
    }
  }

  if (forwardKey !== null) {
    return ALL_GPU_SPECS[forwardKey] ?? null
  }

  // Pass 2: reverse substring match (key contains input). Shortest wins.
  // Guarded by minimum input length to avoid spurious matches on very short inputs.
  if (lower.length >= REVERSE_MATCH_MIN_LEN) {
    let reverseKey: string | null = null
    let reverseLen = Infinity

    for (const key of Object.keys(ALL_GPU_SPECS)) {
      const keyLower = key.toLowerCase()
      if (keyLower.includes(lower)) {
        if (
          key.length < reverseLen ||
          (key.length === reverseLen && reverseKey !== null && key < reverseKey)
        ) {
          reverseKey = key
          reverseLen = key.length
        }
      }
    }

    if (reverseKey !== null) {
      return ALL_GPU_SPECS[reverseKey] ?? null
    }
  }

  return null
}

/**
 * Returns a sorted list of all GPU name keys (discrete GPUs only, for dropdown).
 */
export function getAllGpuNames(): string[] {
  return Object.keys(ALL_GPU_SPECS).sort()
}
