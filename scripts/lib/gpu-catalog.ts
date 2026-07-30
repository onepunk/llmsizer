export interface CatalogGpu {
  name: string
  aliases: string[]
  vendor: string
  vram_gb: number | null
  bandwidth_gbps: number
  unified?: boolean
  nvlink?: boolean
}

export interface LlmsizerGpuCatalog {
  schema_version: string
  catalog_version: string
  source_repository: string
  gpus: CatalogGpu[]
  integrated_gpu_patterns: string[]
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function formatSpec(gpu: CatalogGpu): string {
  const unified = gpu.unified ? ', unified: true' : ''
  const nvlink = gpu.nvlink ? ', nvlink: true' : ''
  return `  ${quote(gpu.name)}: { vram_gb: ${gpu.vram_gb}, bandwidth_gbps: ${gpu.bandwidth_gbps}${unified}${nvlink} },`
}

export function generateGpuSpecsSource(catalog: LlmsizerGpuCatalog): string {
  const specs = catalog.gpus.map(formatSpec).join('\n')
  const aliases = catalog.gpus
    .flatMap(gpu => gpu.aliases.map(alias => [alias, gpu.name] as const))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([alias, canonical]) => `  ${quote(alias)}: ${quote(canonical)},`)
    .join('\n')
  const integratedPatterns = catalog.integrated_gpu_patterns
    .map(pattern => `  ${quote(pattern)},`)
    .join('\n')

  return `import type { GpuSpec } from '../engine/types'

// Auto-generated from onepunk/open-gpu-catalog v${catalog.catalog_version}
// Source: ${catalog.source_repository}/blob/v${catalog.catalog_version}/dist/runtime.json
// Run: npx tsx scripts/generate-gpu-specs.ts

export const GPU_SPECS: Record<string, GpuSpec> = {
${specs}
}

export const GPU_ALIASES: Record<string, string> = {
${aliases}
}

export const IGPU_PATTERNS: string[] = [
${integratedPatterns}
]

export const ALL_GPU_SPECS: Record<string, GpuSpec> = GPU_SPECS
`
}
