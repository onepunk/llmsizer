import { useState, useEffect, useMemo } from 'react'
import type { LlmModel, SystemSpecs, ModelFit, FilterState, FitLevel } from '../engine/types'
import { analyzeModelFit } from '../engine/fit'

const FIT_ORDER: Record<FitLevel, number> = {
  perfect: 3,
  good: 2,
  marginal: 1,
  wont_run: 0,
}

function parseParamsNum(raw: string | null | undefined): number {
  if (!raw) return 0
  const match = raw.match(/^([\d.]+)\s*([BMT]?)$/i)
  if (!match) return 0
  const num = parseFloat(match[1] ?? '0')
  const unit = (match[2] || 'B').toUpperCase()
  if (unit === 'T') return num * 1000
  if (unit === 'M') return num / 1000
  return num
}

export function useModels(system: SystemSpecs, filters: FilterState) {
  const [models, setModels] = useState<LlmModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/models.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load models: ${res.status}`)
        return res.json()
      })
      .then((data: unknown) => {
        if (!cancelled) {
          if (!Array.isArray(data)) throw new Error('Invalid model data: expected array')
          setModels(data as LlmModel[])
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const results = useMemo<ModelFit[]>(() => {
    if (models.length === 0) return []

    const useCase = filters.useCase === 'all' ? 'general' : filters.useCase

    // Analyze all models
    const fits = models.map((m) => analyzeModelFit(m, system, useCase))

    // Filter by minFit
    const minFitLevel = filters.minFit === 'all' ? 0 : FIT_ORDER[filters.minFit]
    const filtered = fits.filter((f) => FIT_ORDER[f.fit_level] >= minFitLevel)

    // Filter by use case
    const useCaseFiltered = filters.useCase === 'all'
      ? filtered
      : filtered.filter((f) => {
          const modelUc = f.model.use_case?.toLowerCase() ?? ''
          return modelUc === filters.useCase || modelUc === 'general'
        })

    // Filter by search
    const searchLower = filters.search.toLowerCase().trim()
    const searched = searchLower
      ? useCaseFiltered.filter((f) => {
          const name = f.model.name.toLowerCase()
          const provider = f.model.provider.toLowerCase()
          const params = f.model.parameter_count?.toLowerCase() ?? ''
          return name.includes(searchLower) || provider.includes(searchLower) || params.includes(searchLower)
        })
      : useCaseFiltered

    // Sort
    const sorted = [...searched]
    sorted.sort((a, b) => {
      switch (filters.sort) {
        case 'score': return b.score - a.score
        case 'tps': return b.estimated_tps - a.estimated_tps
        case 'params': return parseParamsNum(b.model.parameter_count) - parseParamsNum(a.model.parameter_count)
        case 'memory': return a.memory_required_gb - b.memory_required_gb
        case 'context': return b.model.context_length - a.model.context_length
        default: return b.score - a.score
      }
    })

    return sorted
  }, [models, system, filters])

  return {
    results,
    loading,
    error,
    totalModels: models.length,
  }
}
