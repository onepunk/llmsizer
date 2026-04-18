import type { ModelFit, SortKey, SortDir } from '../engine/types'

interface ResultsTableProps {
  results: ModelFit[]
  selectedIndex: number | null
  onSelect: (i: number) => void
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

export default function ResultsTable({
  results,
  selectedIndex,
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
            <th className="sortable-th" onClick={() => onSort('name')}>
              Model <SortArrow columnKey="name" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th>Fit</th>
            <th>Quant</th>
            <th className="col-hide-mobile sortable-th" onClick={() => onSort('tps')}>
              T/S <SortArrow columnKey="tps" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className="col-hide-mobile sortable-th" onClick={() => onSort('release_date')}>
              Released <SortArrow columnKey="release_date" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className="col-hide-mobile sortable-th" onClick={() => onSort('score')}>
              Score <SortArrow columnKey="score" sortKey={sortKey} sortDir={sortDir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((fit, i) => {
            const inCompare = compareSet.has(fit.model.name)
            const canAdd = inCompare || compareSet.size < compareLimit
            return (
              <tr
                key={`${fit.model.name}-${i}`}
                className={i === selectedIndex ? 'row-selected' : ''}
                onClick={() => onSelect(i)}
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
