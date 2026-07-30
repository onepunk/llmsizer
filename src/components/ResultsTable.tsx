import type { ModelFit, SortKey, SortDir } from '../engine/types'

interface ResultsTableProps {
  results: ModelFit[]
  selectedModelName: string | null
  onSelect: (modelName: string) => void
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  compareSet: Set<string>
  onToggleCompare: (modelName: string) => void
  compareLimit: number
}

function modelDisplayName(name: string): string {
  const lastSlash = name.lastIndexOf('/')
  return lastSlash >= 0 ? name.slice(lastSlash + 1) : name
}

const FIT_LABELS: Record<string, string> = {
  perfect: 'Perfect fit',
  good: 'Good fit',
  marginal: 'Marginal fit',
  wont_run: "Won't run",
}

// Pick a short, human-facing label for the verbose `use_case` strings in the
// model database. We fall back to the raw first word so rows stay scannable.
const USE_CASE_SHORT: Record<string, string> = {
  code: 'coding',
  coding: 'coding',
  reasoning: 'reasoning',
  chat: 'chat',
  multimodal: 'multimodal',
  embedding: 'embedding',
  general: 'general',
}

function shortUseCase(raw: string | undefined | null): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  for (const [key, label] of Object.entries(USE_CASE_SHORT)) {
    if (lower.includes(key)) return label
  }
  return lower.split(/[\s,]+/)[0] || null
}

const CAPABILITY_ICON: Record<string, { icon: string; label: string }> = {
  vision: { icon: '\u{1F441}', label: 'vision' },
  tool_use: { icon: '\u{1F527}', label: 'tool use' },
  'tool-use': { icon: '\u{1F527}', label: 'tool use' },
  tools: { icon: '\u{1F527}', label: 'tool use' },
  audio: { icon: '\u{1F3A7}', label: 'audio' },
  function_calling: { icon: '\u{1F527}', label: 'function calling' },
}

function capabilityBadges(caps: string[] | null | undefined): { icon: string; label: string }[] {
  if (!caps) return []
  const seen = new Set<string>()
  const out: { icon: string; label: string }[] = []
  for (const cap of caps) {
    if (typeof cap !== 'string') continue
    const key = cap.toLowerCase().replace(/\s+/g, '_')
    const match = CAPABILITY_ICON[key]
    if (match && !seen.has(match.label)) {
      seen.add(match.label)
      out.push(match)
    }
  }
  return out
}

function SortArrow({ columnKey, sortKey, sortDir }: { columnKey: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  const active = columnKey === sortKey
  return (
    <span className={`sort-arrow${active ? ' sort-arrow-active' : ''}`}>
      {active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC'}
    </span>
  )
}

function SortHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string
  columnKey: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = columnKey === sortKey
  return (
    <th
      className={`${className} sortable-th`.trim()}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="sort-button"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}`}
      >
        {label} <SortArrow columnKey={columnKey} sortKey={sortKey} sortDir={sortDir} />
      </button>
    </th>
  )
}

export default function ResultsTable({
  results,
  selectedModelName,
  onSelect,
  sortKey,
  sortDir,
  onSort,
  compareSet,
  onToggleCompare,
  compareLimit,
}: ResultsTableProps) {
  if (results.length === 0) {
    return (
      <div className="results-empty">
        No models match your hardware and filters.
      </div>
    )
  }

  return (
    <div className="results-table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th className="col-compare" title="Add to compare">vs</th>
            <SortHeader
              label="Model"
              columnKey="name"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <th>Fit</th>
            <th>Quant</th>
            <SortHeader
              label="T/S"
              columnKey="tps"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              className="col-hide-mobile"
            />
            <SortHeader
              label="Released"
              columnKey="release_date"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              className="col-hide-mobile"
            />
            <SortHeader
              label="Score"
              columnKey="score"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              className="col-hide-mobile"
            />
          </tr>
        </thead>
        <tbody>
          {results.map((fit, i) => {
            const inCompare = compareSet.has(fit.model.name)
            const canAdd = inCompare || compareSet.size < compareLimit
            return (
              <tr
                key={`${fit.model.name}-${i}`}
                className={fit.model.name === selectedModelName ? 'row-selected' : ''}
                onClick={() => onSelect(fit.model.name)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(fit.model.name)
                  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    const direction = e.key === 'ArrowDown' ? 1 : -1
                    const sibling = e.currentTarget.parentElement?.children[i + direction]
                    if (sibling instanceof HTMLElement) sibling.focus()
                  }
                }}
                tabIndex={
                  fit.model.name === selectedModelName || (selectedModelName === null && i === 0)
                    ? 0
                    : -1
                }
              >
                <td className="col-compare" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="compare-checkbox"
                    checked={inCompare}
                    disabled={!canAdd}
                    onChange={() => onToggleCompare(fit.model.name)}
                    aria-label={inCompare ? 'Remove from compare' : 'Add to compare'}
                    title={
                      inCompare
                        ? 'Remove from compare'
                        : canAdd
                          ? 'Add to compare'
                          : `Compare limit reached (${compareLimit})`
                    }
                  />
                </td>
                <td>
                  <span className="cell-model">
                    <span className="model-name">
                      {modelDisplayName(fit.model.name)}
                    </span>
                    <span className="model-provider">{fit.model.provider}</span>
                    {(() => {
                      const uc = shortUseCase(fit.model.use_case)
                      if (uc && uc !== 'general') {
                        return <span className="model-tag model-tag-usecase">{uc}</span>
                      }
                      return null
                    })()}
                    {capabilityBadges(fit.model.capabilities).map((b) => (
                      <span
                        key={b.label}
                        className="model-tag model-tag-cap"
                        title={b.label}
                        aria-label={b.label}
                      >{b.icon}</span>
                    ))}
                  </span>
                </td>
                <td>
                  <span
                    className={`fit-dot fit-dot-${fit.fit_level}`}
                    title={FIT_LABELS[fit.fit_level] ?? fit.fit_level}
                  >
                    {'\u25CF'}
                  </span>
                </td>
                <td>{fit.best_quant}</td>
                <td className="col-hide-mobile">
                  {fit.estimated_tps.toFixed(1)}
                </td>
                <td className="col-hide-mobile">
                  {fit.model.release_date ?? '\u2014'}
                </td>
                <td className="col-hide-mobile">
                  {fit.score.toFixed(1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
