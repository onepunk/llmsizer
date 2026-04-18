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
    const fits = models.map((m) => analyzeModelFit(m, system, useCase, filters.context))

    // Filter by minFit
    const minFitLevel = filters.minFit === 'all' ? 0 : FIT_ORDER[filters.minFit]
    const filtered = fits.filter((f) => FIT_ORDER[f.fit_level] >= minFitLevel)

    // Filter by use case — map filter keywords to patterns that match verbose use_case strings
    const useCaseKeywords: Record<string, string[]> = {
      general: ['general'],
      coding: ['code', 'coding'],
      reasoning: ['reasoning'],
      chat: ['chat'],
      multimodal: ['multimodal'],
      embedding: ['embedding'],
    }
    const useCaseFiltered = filters.useCase === 'all'
      ? filtered
      : filtered.filter((f) => {
          const modelUc = f.model.use_case?.toLowerCase() ?? ''
          if (modelUc.startsWith('general')) return true
          const keywords = useCaseKeywords[filters.useCase] ?? [filters.useCase]
          return keywords.some((kw) => modelUc.includes(kw))
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
    const dir = filters.sortDir === 'asc' ? 1 : -1
    const sorted = [...searched]
    sorted.sort((a, b) => {
      let cmp: number
      switch (filters.sort) {
        case 'name': {
          const nameA = a.model.name.slice(a.model.name.lastIndexOf('/') + 1)
          const nameB = b.model.name.slice(b.model.name.lastIndexOf('/') + 1)
          cmp = nameA.localeCompare(nameB)
          break
        }
        case 'score': cmp = a.score - b.score; break
        case 'tps': cmp = a.estimated_tps - b.estimated_tps; break
        case 'params': cmp = parseParamsNum(a.model.parameter_count) - parseParamsNum(b.model.parameter_count); break
        case 'memory': cmp = a.memory_required_gb - b.memory_required_gb; break
        case 'context': cmp = a.model.context_length - b.model.context_length; break
        case 'release_date': {
          // Missing dates sort to the bottom regardless of direction
          const dateA = a.model.release_date
          const dateB = b.model.release_date
          if (!dateA && !dateB) return 0
          if (!dateA) return 1
          if (!dateB) return -1
          cmp = dateA.localeCompare(dateB)
          break
        }
        default: cmp = a.score - b.score
      }
      return cmp * dir
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
