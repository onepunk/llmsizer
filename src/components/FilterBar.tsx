import type { FilterState } from '../engine/types'

interface FilterBarProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  resultCount: number
  totalCount: number
}

export default function FilterBar({
  filters,
  onChange,
  resultCount,
  totalCount,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <input
        className="filter-input filter-search"
        type="text"
        placeholder="Search models..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />

      <select
        className="filter-input"
        value={filters.useCase}
        onChange={(e) =>
          onChange({ ...filters, useCase: e.target.value as FilterState['useCase'] })
        }
      >
        <option value="all">All Use Cases</option>
        <option value="general">General</option>
        <option value="coding">Coding</option>
        <option value="reasoning">Reasoning</option>
        <option value="chat">Chat</option>
        <option value="multimodal">Multimodal</option>
        <option value="embedding">Embedding</option>
      </select>

      <select
        className="filter-input"
        value={filters.minFit}
        onChange={(e) =>
          onChange({ ...filters, minFit: e.target.value as FilterState['minFit'] })
        }
      >
        <option value="all">All Fit Levels</option>
        <option value="perfect">Perfect</option>
        <option value="good">Good+</option>
        <option value="marginal">Marginal+</option>
      </select>

      <select
        className="filter-input"
        value={filters.sort}
        onChange={(e) =>
          onChange({ ...filters, sort: e.target.value as FilterState['sort'] })
        }
      >
        <option value="score">Sort: Score</option>
        <option value="tps">Sort: Speed</option>
        <option value="params">Sort: Params</option>
        <option value="memory">Sort: Memory</option>
        <option value="context">Sort: Context</option>
      </select>

      <div className="filter-right">
        <span className="filter-count">
          {resultCount}/{totalCount}
        </span>
        <div className="fit-legend">
          <span className="fit-legend-item">
            <span className="fit-dot fit-dot-perfect">{'\u25CF'}</span> perfect
          </span>
          <span className="fit-legend-item">
            <span className="fit-dot fit-dot-good">{'\u25CF'}</span> good
          </span>
          <span className="fit-legend-item">
            <span className="fit-dot fit-dot-marginal">{'\u25CF'}</span> marginal
          </span>
          <span className="fit-legend-item">
            <span className="fit-dot fit-dot-wont_run">{'\u25CF'}</span> won't run
          </span>
        </div>
      </div>
    </div>
  )
}
