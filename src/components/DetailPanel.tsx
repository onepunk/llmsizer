import { useEffect } from 'react'
import type { ModelFit } from '../engine/types'

interface DetailPanelProps {
  fit: ModelFit
  onClose: () => void
}

function pct(value: number): string {
  return `${Math.min(100, Math.round(value))}%`
}

function modelDisplayName(name: string): string {
  const lastSlash = name.lastIndexOf('/')
  return lastSlash >= 0 ? name.slice(lastSlash + 1) : name
}

function hfUrl(name: string): string {
  return `https://huggingface.co/${name}`
}

function hfRepoUrl(repo: string): string {
  return `https://huggingface.co/${repo}`
}

export default function DetailPanel({ fit, onClose }: DetailPanelProps) {
  const m = fit.model
  const memPct = fit.memory_available_gb > 0
    ? (fit.memory_required_gb / fit.memory_available_gb) * 100
    : 0

  const capabilities = m.capabilities && m.capabilities.length > 0 ? m.capabilities : null
  const ggufSources = m.gguf_sources && m.gguf_sources.length > 0 ? m.gguf_sources : null

  // On mobile the panel renders as a bottom sheet with a backdrop. The
  // class on <body> drives the backdrop (::before) + body scroll lock in
  // CSS so we don't need a separate portal component.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => {
      document.body.classList.toggle('detail-open', mq.matches)
    }
    apply()
    mq.addEventListener('change', apply)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // Close when the user taps outside the panel (the backdrop). We
    // attach on the next tick so the click that opened the panel
    // doesn't bubble up and immediately close it.
    const onBackdropClick = (e: MouseEvent) => {
      if (!mq.matches) return
      const target = e.target as HTMLElement | null
      if (target && !target.closest('.detail-panel')) {
        onClose()
      }
    }
    const attachTimer = window.setTimeout(() => {
      document.addEventListener('click', onBackdropClick)
    }, 0)

    return () => {
      document.body.classList.remove('detail-open')
      mq.removeEventListener('change', apply)
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(attachTimer)
      document.removeEventListener('click', onBackdropClick)
    }
  }, [onClose])

  return (
    <div className="detail-panel" role="dialog" aria-modal="true">
      <div className="detail-header">
        <div>
          <h3 className="detail-title">{modelDisplayName(m.name)}</h3>
          <a
            className="detail-hf-link"
            href={hfUrl(m.name)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.name} &rarr;
          </a>
        </div>
        <button className="btn btn-icon btn-ghost" onClick={onClose}>
          &times;
        </button>
      </div>

      {/* Model info */}
      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">Params</span>
          <span className="detail-value">{m.parameter_count}</span>
        </div>
        {m.architecture && m.architecture !== 'unknown' && (
          <div className="detail-item">
            <span className="detail-label">Architecture</span>
            <span className="detail-value">{m.architecture}</span>
          </div>
        )}
        <div className="detail-item">
          <span className="detail-label">Use Case</span>
          <span className="detail-value">{m.use_case}</span>
        </div>
        {m.release_date && (
          <div className="detail-item">
            <span className="detail-label">Released</span>
            <span className="detail-value">{m.release_date}</span>
          </div>
        )}
        {m.license && (
          <div className="detail-item">
            <span className="detail-label">License</span>
            <span className="detail-value">{m.license}</span>
          </div>
        )}
        <div className="detail-item">
          <span className="detail-label">Context</span>
          <span className="detail-value">{m.context_length.toLocaleString()}</span>
        </div>
      </div>

      {/* Capabilities */}
      {capabilities && (
        <>
          <h4 className="detail-section-title">Capabilities</h4>
          <div className="detail-tags">
            {capabilities.map((cap) => (
              <span key={cap} className="detail-tag">{cap}</span>
            ))}
          </div>
        </>
      )}

      {/* Fit details */}
      <h4 className="detail-section-title">Fit Analysis</h4>
      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">Run Mode</span>
          <span className="detail-value">{fit.run_mode.replace('_', ' ')}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Best Quant</span>
          <span className="detail-value">{fit.best_quant}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Mem Required</span>
          <span className="detail-value">{fit.memory_required_gb.toFixed(1)} GB</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Mem Available</span>
          <span className="detail-value">{fit.memory_available_gb.toFixed(1)} GB</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Mem Usage</span>
          <span className="detail-value">{pct(memPct)}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Est. Speed</span>
          <span className="detail-value">{fit.estimated_tps.toFixed(1)} t/s</span>
        </div>
      </div>

      {/* Memory breakdown — how we got to the required-memory number */}
      <h4 className="detail-section-title">
        Memory Breakdown
        <span className="detail-section-hint">
          &middot; context {fit.context_used.toLocaleString()}
        </span>
      </h4>
      <MemoryBreakdown fit={fit} />

      {/* Score breakdown */}
      <h4 className="detail-section-title">Score Breakdown</h4>
      <div className="score-bars">
        <ScoreBar
          label="Quality"
          value={fit.scores.quality}
          tooltip="Based on parameter count, model family reputation, and quantization level. Larger models and lighter quantization score higher."
        />
        <ScoreBar
          label="Speed"
          value={fit.scores.speed}
          tooltip="Estimated tokens/sec vs target for the use case (40 t/s for general, 25 for reasoning). 100 = meets or exceeds target."
        />
        <ScoreBar
          label="Fit"
          value={fit.scores.fit}
          tooltip="How well the model fits your memory. Sweet spot is 50-80% utilization. Too tight (>90%) or too loose (<50%) scores lower."
        />
        <ScoreBar
          label="Context"
          value={fit.scores.context}
          tooltip="Whether the model's context window meets the use-case target (4K for chat, 8K for coding). Full marks if it meets or exceeds."
        />
      </div>

      {/* Quantization options */}
      <h4 className="detail-section-title">Quantization Options</h4>
      <table className="quant-table">
        <thead>
          <tr>
            <th>Quant</th>
            <th>Memory</th>
            <th>Speed</th>
            <th>Fits</th>
          </tr>
        </thead>
        <tbody>
          {fit.viable_quants.map((q) => (
            <tr
              key={q.quant}
              className={q.quant === fit.best_quant ? 'quant-best' : ''}
            >
              <td>{q.quant}</td>
              <td>{q.memory_required_gb.toFixed(1)} GB</td>
              <td>{q.estimated_tps.toFixed(1)} t/s</td>
              <td>
                <span className={q.fits ? 'fit-yes' : 'fit-no'}>
                  {q.fits ? 'Yes' : 'No'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* GGUF sources */}
      {ggufSources && (
        <>
          <h4 className="detail-section-title">GGUF Downloads</h4>
          <div className="detail-links">
            {ggufSources.map((src) => (
              <a
                key={src.repo}
                className="detail-link"
                href={hfRepoUrl(src.repo)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {src.repo} &rarr;
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MemoryBreakdown({ fit }: { fit: ModelFit }) {
  const mem = fit.memory_breakdown
  const total = mem.total_gb || 1
  const parts: { label: string; gb: number; className: string; tooltip: string }[] = [
    {
      label: 'Weights',
      gb: mem.model_weight_gb,
      className: 'mem-bar-weights',
      tooltip: `Model weights at ${fit.best_quant}: params \u00D7 bytes-per-param.`,
    },
    {
      label: 'KV cache',
      gb: mem.kv_cache_gb,
      className: 'mem-bar-kv',
      tooltip: `KV cache for a context of ${fit.context_used.toLocaleString()} tokens. Scales linearly with context.`,
    },
    {
      label: 'Overhead',
      gb: mem.overhead_gb,
      className: 'mem-bar-overhead',
      tooltip: 'Runtime overhead (activations, graph buffers, etc.) — approximated at 0.5 GB.',
    },
  ]

  return (
    <div className="mem-breakdown">
      <div className="mem-bar-stack" role="img" aria-label="Memory breakdown">
        {parts.map((p) => (
          <div
            key={p.label}
            className={`mem-bar-seg ${p.className}`}
            style={{ width: `${(p.gb / total) * 100}%` }}
            title={`${p.label}: ${p.gb.toFixed(2)} GB`}
          />
        ))}
      </div>
      <dl className="mem-bar-legend">
        {parts.map((p) => (
          <div key={p.label} className="mem-bar-legend-row">
            <dt>
              <span className={`mem-swatch ${p.className}`} />
              {p.label}
              <span className="score-bar-help-wrap">
                <span className="score-bar-help">?</span>
                <span className="score-bar-tooltip">{p.tooltip}</span>
              </span>
            </dt>
            <dd>{p.gb.toFixed(2)} GB</dd>
          </div>
        ))}
        <div className="mem-bar-legend-row mem-bar-legend-total">
          <dt>Total</dt>
          <dd>{mem.total_gb.toFixed(2)} GB</dd>
        </div>
      </dl>
    </div>
  )
}

function ScoreBar({ label, value, tooltip }: { label: string; value: number; tooltip: string }) {
  return (
    <div className="score-bar">
      <div className="score-bar-header">
        <span className="score-bar-label">
          {label}
          <span className="score-bar-help-wrap">
            <span className="score-bar-help">?</span>
            <span className="score-bar-tooltip">{tooltip}</span>
          </span>
        </span>
        <span className="score-bar-value">{Math.round(value)}</span>
      </div>
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: pct(value) }}
        />
      </div>
    </div>
  )
}
