#!/usr/bin/env tsx
/**
 * generate-gpu-specs.ts
 *
 * Reads the RightNow-GPU-Database and generates src/detection/gpu-specs.ts.
 * Apple Silicon specs and iGPU patterns are hardcoded templates (not in the database).
 *
 * Usage:
 *   npx tsx scripts/generate-gpu-specs.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const DB_PATH = '/tmp/RightNow-GPU-Database/data/all-gpus.json'
const OUT_PATH = resolve(import.meta.dirname, '../src/detection/gpu-specs.ts')

const ALLOWED_VENDORS = new Set(['nvidia', 'amd', 'intel'])

interface DbEntry {
  id: string
  name: string
  vendor: string
  manufacturer: string
  memorySize: number | null
  memoryBandwidth: number | null
  [key: string]: unknown
}

interface GpuRecord {
  name: string
  vram_gb: number
  bandwidth_gbps: number
}

function load(): DbEntry[] {
  const raw = readFileSync(DB_PATH, 'utf-8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error('GPU database is not an array')
  return data as DbEntry[]
}

function filter(entries: DbEntry[]): DbEntry[] {
  return entries.filter(
    (e) =>
      ALLOWED_VENDORS.has(e.vendor) &&
      typeof e.memorySize === 'number' && isFinite(e.memorySize) &&
      typeof e.memoryBandwidth === 'number' && isFinite(e.memoryBandwidth) &&
      e.memorySize >= 1 &&
      e.memoryBandwidth > 0,
  )
}

function toRecord(e: DbEntry): GpuRecord {
  return {
    name: e.name,
    vram_gb: e.memorySize as number,
    bandwidth_gbps: Math.round(e.memoryBandwidth as number),
  }
}

function dedupe(records: GpuRecord[]): GpuRecord[] {
  // Keep the first occurrence of each name (entries are sorted by recency in the db already)
  const seen = new Set<string>()
  return records.filter((r) => {
    if (seen.has(r.name)) return false
    seen.add(r.name)
    return true
  })
}

function byVendor(entries: DbEntry[], vendor: string): GpuRecord[] {
  const records = entries.filter((e) => e.vendor === vendor).map(toRecord)
  const unique = dedupe(records)
  // Sort by bandwidth descending
  unique.sort((a, b) => b.bandwidth_gbps - a.bandwidth_gbps)
  return unique
}

function formatEntry(r: GpuRecord): string {
  const safeName = r.name.replace(/'/g, "\\'")
  return `  '${safeName}': { vram_gb: ${r.vram_gb}, bandwidth_gbps: ${r.bandwidth_gbps} },`
}

function generate(entries: DbEntry[]): string {
  const nvidia = byVendor(entries, 'nvidia')
  const amd = byVendor(entries, 'amd')
  const intel = byVendor(entries, 'intel')

  const nvidiaLines = nvidia.map(formatEntry).join('\n')
  const amdLines = amd.map(formatEntry).join('\n')
  const intelLines = intel.map(formatEntry).join('\n')

  return `import type { GpuSpec } from '../engine/types'

// Auto-generated from onepunk/RightNow-GPU-Database
// Run: npx tsx scripts/generate-gpu-specs.ts

export const GPU_SPECS: Record<string, GpuSpec> = {
  // NVIDIA
${nvidiaLines}
  // AMD
${amdLines}
  // Intel
${intelLines}
}

// Apple Silicon (not in RightNow database — maintained manually)
export const APPLE_SPECS: Record<string, GpuSpec> = {
  'Apple M4 Ultra': { vram_gb: null, bandwidth_gbps: 819, unified: true },
  'Apple M4 Max': { vram_gb: null, bandwidth_gbps: 546, unified: true },
  'Apple M4 Pro': { vram_gb: null, bandwidth_gbps: 273, unified: true },
  'Apple M4': { vram_gb: null, bandwidth_gbps: 120, unified: true },
  'Apple M3 Ultra': { vram_gb: null, bandwidth_gbps: 800, unified: true },
  'Apple M3 Max': { vram_gb: null, bandwidth_gbps: 400, unified: true },
  'Apple M3 Pro': { vram_gb: null, bandwidth_gbps: 150, unified: true },
  'Apple M3': { vram_gb: null, bandwidth_gbps: 100, unified: true },
  'Apple M2 Ultra': { vram_gb: null, bandwidth_gbps: 800, unified: true },
  'Apple M2 Max': { vram_gb: null, bandwidth_gbps: 400, unified: true },
  'Apple M2 Pro': { vram_gb: null, bandwidth_gbps: 200, unified: true },
  'Apple M2': { vram_gb: null, bandwidth_gbps: 100, unified: true },
  'Apple M1 Ultra': { vram_gb: null, bandwidth_gbps: 800, unified: true },
  'Apple M1 Max': { vram_gb: null, bandwidth_gbps: 400, unified: true },
  'Apple M1 Pro': { vram_gb: null, bandwidth_gbps: 200, unified: true },
  'Apple M1': { vram_gb: null, bandwidth_gbps: 68, unified: true },
}

// Integrated GPUs — no dedicated VRAM, share system RAM
// These are detected by renderer string patterns, not exact name match
export const IGPU_PATTERNS: string[] = [
  'Intel HD Graphics',
  'Intel UHD Graphics',
  'Intel Iris',
  'Intel Arc Graphics',   // Integrated Arc (Meteor Lake, etc.)
  'AMD Radeon Graphics',  // AMD APU iGPUs (Ryzen integrated)
  'AMD Radeon Vega',      // Older AMD APU iGPUs
  'Mali',                 // ARM Mali
  'Adreno',               // Qualcomm
  'PowerVR',              // Imagination Technologies
]

export const ALL_GPU_SPECS: Record<string, GpuSpec> = { ...GPU_SPECS, ...APPLE_SPECS }
`
}

// --- main ---

const all = load()
const valid = filter(all)
const nvidia = valid.filter((e) => e.vendor === 'nvidia')
const amd = valid.filter((e) => e.vendor === 'amd')
const intel = valid.filter((e) => e.vendor === 'intel')

// Dedupe counts (for stats)
const nvidiaDeduped = byVendor(valid, 'nvidia')
const amdDeduped = byVendor(valid, 'amd')
const intelDeduped = byVendor(valid, 'intel')

const output = generate(valid)
writeFileSync(OUT_PATH, output, 'utf-8')

const total = nvidiaDeduped.length + amdDeduped.length + intelDeduped.length
console.log(
  `Generated ${total} GPU entries (${nvidiaDeduped.length} NVIDIA, ${amdDeduped.length} AMD, ${intelDeduped.length} Intel)`,
)
console.log(`  Raw valid entries before dedup: ${valid.length} (${nvidia.length} NVIDIA, ${amd.length} AMD, ${intel.length} Intel)`)
console.log(`  Output: ${OUT_PATH}`)
