import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useHardware } from './hooks/useHardware'
import { useModels } from './hooks/useModels'
import type { FilterState, SortKey } from './engine/types'
import HardwarePanel from './components/HardwarePanel'
import FilterBar from './components/FilterBar'
import ResultsTable from './components/ResultsTable'
import DetailPanel from './components/DetailPanel'
import ComparePanel from './components/ComparePanel'
import { readUrlState, writeUrl, currentShareUrl } from './url'

const DEFAULT_FILTERS: FilterState = {
  search: '',
  useCase: 'all',
  minFit: 'marginal',
  context: 8192,
  sort: 'score',
  sortDir: 'desc',
}

const COMPARE_LIMIT = 3

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme | null {
  try {
    const stored = localStorage.getItem('llmsizer-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* noop */ }
  return null
}

function getInitialFilters(): FilterState {
  const { filters } = readUrlState()
  return { ...DEFAULT_FILTERS, ...filters }
}

function getInitialCompare(): string[] {
  return readUrlState().compare.slice(0, COMPARE_LIMIT)
}

export default function App() {
  const hw = useHardware()
  const [filters, setFilters] = useState<FilterState>(getInitialFilters)
  const [compare, setCompare] = useState<string[]>(getInitialCompare)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const { results, loading, error, totalModels } = useModels(hw.system, filters)

  const handleSort = useCallback((key: SortKey) => {
    setFilters((prev) => ({
      ...prev,
      sort: key,
      sortDir: prev.sort === key ? (prev.sortDir === 'desc' ? 'asc' : 'desc') : 'desc',
    }))
  }, [])

  const [themeOverride, setThemeOverride] = useState<Theme | null>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    if (themeOverride) {
      root.setAttribute('data-theme', themeOverride)
    } else {
      root.removeAttribute('data-theme')
    }
  }, [themeOverride])

  const toggleTheme = useCallback(() => {
    setThemeOverride((prev) => {
      let next: Theme
      if (prev === null) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        next = prefersDark ? 'light' : 'dark'
      } else {
        next = prev === 'dark' ? 'light' : 'dark'
      }
      try { localStorage.setItem('llmsizer-theme', next) } catch { /* noop */ }
      return next
    })
  }, [])

  const effectiveTheme: Theme = themeOverride ??
    (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark')

  const selectedFit = selectedIndex !== null ? results[selectedIndex] ?? null : null

  // Compare selections resolved against current results. A compared model may
  // not appear in the filtered results (e.g. fit filter hides it), so we keep
  // the name list as the source of truth and fall through model lookup.
  const compareFits = useMemo(() => {
    if (compare.length === 0) return []
    const byName = new Map(results.map((r) => [r.model.name, r]))
    return compare
      .map((name) => byName.get(name))
      .filter((f): f is NonNullable<typeof f> => f != null)
  }, [compare, results])

  const compareSet = useMemo(() => new Set(compare), [compare])

  const toggleCompare = useCallback((modelName: string) => {
    setCompare((prev) => {
      if (prev.includes(modelName)) return prev.filter((n) => n !== modelName)
      if (prev.length >= COMPARE_LIMIT) return prev
      return [...prev, modelName]
    })
  }, [])

  const clearCompare = useCallback(() => setCompare([]), [])

  // Single URL write pipeline — hardware + filters + compare converge here.
  useEffect(() => {
    if (!hw.ready) return
    writeUrl({
      hw: {
        gpus: hw.gpus,
        interconnect: hw.interconnect,
        parallelism: hw.parallelism,
        ramGb: hw.ramGb,
        cpuCores: hw.cpuCores,
        unified: hw.unified,
      },
      filters,
      compare,
      defaults: DEFAULT_FILTERS,
    })
  }, [hw.ready, hw.gpus, hw.interconnect, hw.parallelism, hw.ramGb, hw.cpuCores, hw.unified, filters, compare])

  // On reset, drop the query string entirely.
  const previousReadyRef = useRef(hw.ready)
  useEffect(() => {
    if (previousReadyRef.current && !hw.ready) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    previousReadyRef.current = hw.ready
  }, [hw.ready])

  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const shareTimer = useRef<number | null>(null)

  const handleShare = useCallback(async () => {
    const url = currentShareUrl({
      hw: {
        gpus: hw.gpus,
        interconnect: hw.interconnect,
        parallelism: hw.parallelism,
        ramGb: hw.ramGb,
        cpuCores: hw.cpuCores,
        unified: hw.unified,
      },
      filters,
      compare,
      defaults: DEFAULT_FILTERS,
    })
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('copied')
    } catch {
      setShareStatus('error')
    }
    if (shareTimer.current) window.clearTimeout(shareTimer.current)
    shareTimer.current = window.setTimeout(() => setShareStatus('idle'), 2000)
  }, [hw.gpus, hw.interconnect, hw.parallelism, hw.ramGb, hw.cpuCores, hw.unified, filters, compare])

  useEffect(() => () => {
    if (shareTimer.current) window.clearTimeout(shareTimer.current)
  }, [])

  const shareLabel =
    shareStatus === 'copied' ? 'copied!' :
    shareStatus === 'error' ? 'copy failed' :
    'share'

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-logo" onClick={hw.reset} title="Back to start">llmsizer</h1>
        <span className="app-tagline">&mdash; what fits on your hardware</span>
        <div className="header-actions">
          <a
            className="github-link"
            href="https://github.com/onepunk/llmsizer"
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </a>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {effectiveTheme === 'dark' ? '\u263C' : '\u263E'}
          </button>
        </div>
      </header>

      {hw.ready && (
        <HardwarePanel
          gpuName={hw.gpus[0]?.name ?? ''}
          vramGb={hw.gpus[0]?.vram_gb ?? 0}
          ramGb={hw.ramGb}
          ramUserSet={hw.ramUserSet}
          cpuCores={hw.cpuCores}
          unified={hw.unified}
          gpuDetected={hw.gpuDetected}
          editing={hw.editing}
          onEditingChange={hw.setEditing}
          onGpuChange={(name, spec) => {
            if (hw.gpus.length === 0) hw.addGpu(name, spec)
            else hw.updateGpuName(0, name, spec)
          }}
          onVramChange={(gb) => {
            if (hw.gpus.length > 0) hw.updateGpuAt(0, { vram_gb: gb })
          }}
          onRamChange={hw.setRamGb}
          onCpuCoresChange={hw.setCpuCores}
          onRescan={hw.scan}
        />
      )}

      {hw.ready ? (
        <>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            resultCount={results.length}
            totalCount={totalModels}
            onShare={handleShare}
            shareLabel={shareLabel}
          />

          {error && <div className="error-banner">{error}</div>}

          {compareFits.length > 0 && (
            <ComparePanel
              fits={compareFits}
              onRemove={toggleCompare}
              onClear={clearCompare}
            />
          )}

          {loading ? (
            <div className="loading">Loading model database...</div>
          ) : (
            <div className={`results-layout${hw.editing ? ' results-disabled' : ''}`}>
              {hw.editing && (
                <div className="results-editing-overlay">
                  Enter your hardware specs above to see which models fit.
                </div>
              )}
              <ResultsTable
                results={results}
                selectedIndex={hw.editing ? null : selectedIndex}
                onSelect={hw.editing ? () => {} : setSelectedIndex}
                sortKey={filters.sort}
                sortDir={filters.sortDir}
                onSort={handleSort}
                compareSet={compareSet}
                onToggleCompare={toggleCompare}
                compareLimit={COMPARE_LIMIT}
              />
              {!hw.editing && selectedFit && (
                <DetailPanel
                  fit={selectedFit}
                  onClose={() => setSelectedIndex(null)}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <div className="scan-prompt">
          <p className="scan-prompt-text">Detect your hardware to see which models fit.</p>
          <div className="scan-prompt-actions">
            <button className="btn btn-primary" onClick={hw.scan}>
              Scan My Hardware
            </button>
            <button className="btn btn-secondary" onClick={hw.enterManual}>
              Enter Manually
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
