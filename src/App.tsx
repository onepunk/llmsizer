import { useState, useEffect, useCallback } from 'react'
import { useHardware } from './hooks/useHardware'
import { useModels } from './hooks/useModels'
import type { FilterState, SortKey } from './engine/types'
import HardwarePanel from './components/HardwarePanel'
import FilterBar from './components/FilterBar'
import ResultsTable from './components/ResultsTable'
import DetailPanel from './components/DetailPanel'

const DEFAULT_FILTERS: FilterState = {
  search: '',
  useCase: 'all',
  minFit: 'marginal',
  sort: 'score',
  sortDir: 'desc',
}

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme | null {
  try {
    const stored = localStorage.getItem('llmsizer-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* noop */ }
  return null
}

export default function App() {
  const hw = useHardware()
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
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

  // Apply data-theme attribute to root element
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
        // Currently following system preference; toggle to opposite
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        next = prefersDark ? 'light' : 'dark'
      } else {
        next = prev === 'dark' ? 'light' : 'dark'
      }
      try { localStorage.setItem('llmsizer-theme', next) } catch { /* noop */ }
      return next
    })
  }, [])

  // Determine the effective theme for the toggle icon
  const effectiveTheme: Theme = themeOverride ??
    (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark')

  const selectedFit = selectedIndex !== null ? results[selectedIndex] ?? null : null

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
          gpuName={hw.gpuName}
          vramGb={hw.vramGb}
          ramGb={hw.ramGb}
          cpuCores={hw.cpuCores}
          unified={hw.unified}
          gpuDetected={hw.gpuDetected}
          editing={hw.editing}
          onEditingChange={hw.setEditing}
          onGpuChange={hw.updateGpu}
          onVramChange={hw.setVramGb}
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
          />

          {error && <div className="error-banner">{error}</div>}

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
