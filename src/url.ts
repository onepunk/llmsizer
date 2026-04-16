import type { FilterState } from './engine/types'

export interface HardwareUrlState {
  gpu: string | null
  vram: number | null
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

export function readUrlState(search: string = window.location.search): AppUrlState {
  const params = new URLSearchParams(search)

  const hw: HardwareUrlState = {
    gpu: params.get('gpu'),
    vram: clampNum(params.get('vram'), 0, 1024),
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
    gpuName: string
    vramGb: number
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

  if (hw.gpuName) params.set('gpu', hw.gpuName)
  if (hw.vramGb > 0) params.set('vram', String(hw.vramGb))
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
