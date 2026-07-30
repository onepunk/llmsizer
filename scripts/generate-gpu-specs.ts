#!/usr/bin/env tsx
/**
 * Generates src/detection/gpu-specs.ts from open-gpu-catalog's versioned
 * runtime artifact.
 *
 * Usage:
 *   npx tsx scripts/generate-gpu-specs.ts
 *
 * Set GPU_CATALOG_PATH for a local artifact or GPU_CATALOG_URL to use a
 * different published revision.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  generateGpuSpecsSource,
  type LlmsizerGpuCatalog,
} from './lib/gpu-catalog'

const CATALOG_PATH = process.env.GPU_CATALOG_PATH
const CATALOG_URL =
  process.env.GPU_CATALOG_URL ??
  'https://raw.githubusercontent.com/onepunk/open-gpu-catalog/v1.1.0/dist/runtime.json'
const OUT_PATH = resolve(import.meta.dirname, '../src/detection/gpu-specs.ts')

function parseCatalog(raw: string): LlmsizerGpuCatalog {
  const value = JSON.parse(raw) as Partial<LlmsizerGpuCatalog>
  if (
    typeof value.catalog_version !== 'string' ||
    typeof value.source_repository !== 'string' ||
    !Array.isArray(value.gpus) ||
    !Array.isArray(value.integrated_gpu_patterns)
  ) {
    throw new Error('Invalid open-gpu-catalog runtime artifact')
  }
  return value as LlmsizerGpuCatalog
}

async function loadCatalog(): Promise<LlmsizerGpuCatalog> {
  if (CATALOG_PATH) {
    if (!existsSync(CATALOG_PATH)) {
      throw new Error(`GPU catalog not found: ${CATALOG_PATH}`)
    }
    return parseCatalog(readFileSync(CATALOG_PATH, 'utf8'))
  }

  const response = await fetch(CATALOG_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch GPU catalog: ${response.status} ${response.statusText}`)
  }
  return parseCatalog(await response.text())
}

const catalog = await loadCatalog()
writeFileSync(OUT_PATH, generateGpuSpecsSource(catalog), 'utf8')

console.log(
  `Generated ${catalog.gpus.length} GPU entries from open-gpu-catalog ` +
  `v${catalog.catalog_version}`,
)
console.log(`  Output: ${OUT_PATH}`)
