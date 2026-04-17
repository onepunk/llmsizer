import type { FilterState, GpuEntry, Interconnect, ParallelismMode } from './engine/types'
import { lookupGpu } from './detection/parse-renderer'

const INTERCONNECTS: Interconnect[] = ['nvlink', 'pcie5', 'pcie4', 'pcie3', 'none']
const PARALLELISMS: ParallelismMode[] = ['auto', 'layer_split', 'tensor_parallel']

export interface HardwareUrlState {
  gpus: GpuEntry[]
  interconnect: Interconnect | null
  parallelism: ParallelismMode | null
  ram: number | null
  cores: number | null
  unified: boolean | null
}

export interface AppUrlState {
  hw: HardwareUrlState
  filters: Partial<FilterState>
  compare: string[]
}

function clampNum(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null
}

function parseGpusParam(raw: string | null, vramLegacy: number | null): GpuEntry[] {
  if (!raw) return []

  // Legacy: single name + separate vram param, no colon in the value
  if (!raw.includes(',') && !raw.includes(':') && vramLegacy !== null) {
    const spec = lookupGpu(raw)
    return [{
      name: raw,
      vram_gb: vramLegacy,
      bandwidth_gbps: spec?.bandwidth_gbps ?? 0,
      count: 1,
    }]
  }

  return raw.split(',').map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const colonIdx = chunk.lastIndexOf(':')
    let name = chunk
    let count = 1
    if (colonIdx > 0) {
      const tail = chunk.slice(colonIdx + 1)
      const parsed = Number(tail)
      if (Number.isFinite(parsed) && parsed > 0) {
        name = chunk.slice(0, colonIdx)
        count = Math.min(8, Math.max(1, Math.floor(parsed)))
      }
    }
    const spec = lookupGpu(name)
    return {
      name,
      vram_gb: spec?.vram_gb ?? 0,
      bandwidth_gbps: spec?.bandwidth_gbps ?? 0,
      count,
    }
  })
}

function parseInterconnect(raw: string | null): Interconnect | null {
  if (raw === null) return null
  return (INTERCONNECTS as string[]).includes(raw) ? (raw as Interconnect) : null
}

function parseParallelism(raw: string | null): ParallelismMode | null {
  if (raw === null) return null
  return (PARALLELISMS as string[]).includes(raw) ? (raw as ParallelismMode) : null
}

export function readUrlState(search: string = window.location.search): AppUrlState {
  const params = new URLSearchParams(search)

  const vramLegacy = clampNum(params.get('vram'), 0, 1024)
  const hw: HardwareUrlState = {
    gpus: parseGpusParam(params.get('gpu'), vramLegacy),
    interconnect: parseInterconnect(params.get('ic')),
    parallelism: parseParallelism(params.get('par')),
    ram: clampNum(params.get('ram'), 1, 8192),
    cores: clampNum(params.get('cores'), 1, 512),
    unified: params.has('unified') ? params.get('unified') === '1' : null,
  }

  const filters: Partial<FilterState> = {}
  const ctx = clampNum(params.get('ctx'), 512, 1048576)
  if (ctx !== null) filters.context = ctx
  const uc = params.get('uc')
  if (uc) filters.useCase = uc as FilterState['useCase']
  const fit = params.get('fit')
  if (fit) filters.minFit = fit as FilterState['minFit']
  const q = params.get('q')
  if (q) filters.search = q
  const sort = params.get('sort')
  if (sort) filters.sort = sort as FilterState['sort']
  const sdir = params.get('sdir')
  if (sdir === 'asc' || sdir === 'desc') filters.sortDir = sdir

  const cmp = params.get('cmp')
  const compare = cmp ? cmp.split(',').filter(Boolean) : []

  return { hw, filters, compare }
}

export interface WriteUrlInput {
  hw: {
    gpus: GpuEntry[]
    interconnect: Interconnect
    parallelism: ParallelismMode
    ramGb: number
    cpuCores: number
    unified: boolean
  }
  filters: FilterState
  compare: string[]
  defaults: FilterState
}

export function buildUrlSearch(input: WriteUrlInput): string {
  const params = new URLSearchParams()
  const { hw, filters, compare, defaults } = input

  if (hw.gpus.length > 0) {
    const encoded = hw.gpus
      .map((g) => (g.count > 1 ? `${g.name}:${g.count}` : g.name))
      .join(',')
    params.set('gpu', encoded)
  }
  if (hw.interconnect !== 'none') params.set('ic', hw.interconnect)
  if (hw.parallelism !== 'auto') params.set('par', hw.parallelism)
  if (hw.ramGb > 0) params.set('ram', String(hw.ramGb))
  if (hw.cpuCores > 0) params.set('cores', String(hw.cpuCores))
  if (hw.unified) params.set('unified', '1')

  if (filters.context !== defaults.context) params.set('ctx', String(filters.context))
  if (filters.useCase !== defaults.useCase) params.set('uc', filters.useCase)
  if (filters.minFit !== defaults.minFit) params.set('fit', filters.minFit)
  if (filters.search.trim()) params.set('q', filters.search.trim())
  if (filters.sort !== defaults.sort) params.set('sort', filters.sort)
  if (filters.sortDir !== defaults.sortDir) params.set('sdir', filters.sortDir)

  if (compare.length > 0) params.set('cmp', compare.join(','))

  return params.toString()
}

export function writeUrl(input: WriteUrlInput): void {
  const qs = buildUrlSearch(input)
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export function currentShareUrl(input: WriteUrlInput): string {
  const qs = buildUrlSearch(input)
  const origin = window.location.origin
  const path = window.location.pathname
  return qs ? `${origin}${path}?${qs}` : `${origin}${path}`
}
