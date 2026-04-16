import type { ModelFit } from '../engine/types'

interface ComparePanelProps {
  fits: ModelFit[]
  onRemove: (modelName: string) => void
  onClear: () => void
}

function displayName(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash >= 0 ? name.slice(slash + 1) : name
}

const FIT_LABELS: Record<string, string> = {
  perfect: 'Perfect',
  good: 'Good',
  marginal: 'Marginal',
  wont_run: "Won't run",
}

export default function ComparePanel({ fits, onRemove, onClear }: ComparePanelProps) {
  if (fits.length === 0) return null

  return (
    <section className="compare-panel" aria-label="Compare models">
      <div className="compare-header">
        <h3 className="compare-title">Compare ({fits.length})</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClear}>clear all</button>
      </div>
      <div className="compare-grid">
        {fits.map((fit) => {
          const m = fit.model
          const mem = fit.memory_breakdown
          return (
            <div key={m.name} className="compare-card">
              <div className="compare-card-header">
                <span className="compare-card-name" title={m.name}>{displayName(m.name)}</span>
                <button
                  className="btn btn-icon btn-ghost"
                  onClick={() => onRemove(m.name)}
                  aria-label={`Remove ${displayName(m.name)} from compare`}
                  title="Remove from compare"
                >&times;</button>
              </div>
              <div className="compare-card-provider">{m.provider}</div>
              <dl className="compare-card-stats">
                <dt>Fit</dt>
                <dd>
                  <span className={`fit-dot fit-dot-${fit.fit_level}`}>{'\u25CF'}</span>
                  {' '}
                  {FIT_LABELS[fit.fit_level] ?? fit.fit_level}
                </dd>

                <dt>Params</dt>
                <dd>{m.parameter_count}</dd>

                <dt>Quant</dt>
                <dd>{fit.best_quant}</dd>

                <dt>Memory</dt>
                <dd>{fit.memory_required_gb.toFixed(1)} GB</dd>

                <dt>Speed</dt>
                <dd>{fit.estimated_tps.toFixed(1)} t/s</dd>

                <dt>Score</dt>
                <dd>{fit.score.toFixed(1)}</dd>

                <dt>Context</dt>
                <dd>{fit.context_used.toLocaleString()} / {m.context_length.toLocaleString()}</dd>

                <dt>Weights</dt>
                <dd>{mem.model_weight_gb.toFixed(1)} GB</dd>

                <dt>KV cache</dt>
                <dd>{mem.kv_cache_gb.toFixed(2)} GB</dd>
              </dl>
            </div>
          )
        })}
      </div>
    </section>
  )
}
