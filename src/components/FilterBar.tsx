import type { FilterState } from '../engine/types'

interface FilterBarProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  resultCount: number
  totalCount: number
  onShare?: () => void
  shareLabel?: string
}

const CONTEXT_OPTIONS = [
  { value: 2048, label: '2K' },
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 16384, label: '16K' },
  { value: 32768, label: '32K' },
  { value: 65536, label: '64K' },
  { value: 131072, label: '128K' },
] as const

export default function FilterBar({
  filters,
  onChange,
  resultCount,
  totalCount,
  onShare,
  shareLabel,
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
        <option value="all">Any fit</option>
        <option value="perfect">Perfect</option>
        <option value="good">Good+</option>
        <option value="marginal">Marginal+</option>
      </select>

      <label className="filter-context" title="Context window — bigger contexts need more KV cache memory">
        <span className="filter-context-label">ctx</span>
        <select
          className="filter-input filter-context-select"
          value={filters.context}
          onChange={(e) =>
            onChange({ ...filters, context: Number(e.target.value) })
          }
        >
          {CONTEXT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      <div className="filter-right">
        <span className="filter-count">
          {resultCount}/{totalCount}
        </span>
        {onShare && (
          <button
            className="btn btn-ghost btn-sm filter-share"
            onClick={onShare}
            title="Copy a shareable link with your hardware + filters"
          >
            {shareLabel ?? 'share'}
          </button>
        )}
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
