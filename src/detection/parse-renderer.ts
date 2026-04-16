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

/**
 * Case-insensitive lookup against ALL_GPU_SPECS (discrete + Apple Silicon).
 * Also checks for integrated GPUs and returns a shared-memory spec.
 * Tries exact match first, then longest substring match.
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

  // Try longest substring match: find GPU name keys that appear in the parsed name
  let bestKey: string | null = null
  let bestLen = 0

  for (const key of Object.keys(ALL_GPU_SPECS)) {
    const keyLower = key.toLowerCase()
    if (lower.includes(keyLower) && key.length > bestLen) {
      bestKey = key
      bestLen = key.length
    }
  }

  if (bestKey !== null) {
    return ALL_GPU_SPECS[bestKey] ?? null
  }

  return null
}

/**
 * Returns a sorted list of all GPU name keys (discrete GPUs only, for dropdown).
 */
export function getAllGpuNames(): string[] {
  return Object.keys(ALL_GPU_SPECS).sort()
}
