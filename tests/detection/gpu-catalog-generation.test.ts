import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

async function loadGenerator() {
  try {
    const modulePath = '../../scripts/lib/gpu-catalog'
    return await import(/* @vite-ignore */ modulePath)
  } catch {
    return {}
  }
}

describe('open-gpu-catalog generation', () => {
  it('defaults to the versioned, consumer-neutral runtime artifact', () => {
    const generator = readFileSync(
      resolve(import.meta.dirname, '../../scripts/generate-gpu-specs.ts'),
      'utf8',
    )

    expect(generator).toContain(
      'open-gpu-catalog/v1.1.0/dist/runtime.json',
    )
  })

  it('generates canonical specs, aliases, and integrated GPU patterns', async () => {
    const { generateGpuSpecsSource } = await loadGenerator()
    expect(typeof generateGpuSpecsSource).toBe('function')

    const source = generateGpuSpecsSource!({
      schema_version: '1.0.0',
      catalog_version: '1.1.0',
      source_repository: 'https://github.com/onepunk/open-gpu-catalog',
      gpus: [
        {
          name: 'B200',
          aliases: ['NVIDIA B200'],
          vendor: 'nvidia',
          vram_gb: 180,
          bandwidth_gbps: 8000,
          nvlink: true,
        },
        {
          name: 'Apple M5',
          aliases: ['Apple M5 GPU'],
          vendor: 'apple',
          vram_gb: null,
          bandwidth_gbps: 153,
          unified: true,
        },
      ],
      integrated_gpu_patterns: ['Intel Iris'],
    })

    expect(source).toContain('// Auto-generated from onepunk/open-gpu-catalog v1.1.0')
    expect(source).toContain(
      '// Source: https://github.com/onepunk/open-gpu-catalog/blob/v1.1.0/dist/runtime.json',
    )
    expect(source).toContain(
      "'B200': { vram_gb: 180, bandwidth_gbps: 8000, nvlink: true }",
    )
    expect(source).toContain(
      "'Apple M5': { vram_gb: null, bandwidth_gbps: 153, unified: true }",
    )
    expect(source).toContain("'NVIDIA B200': 'B200'")
    expect(source).toContain("'Apple M5 GPU': 'Apple M5'")
    expect(source).toContain("'Intel Iris'")
  })
})
