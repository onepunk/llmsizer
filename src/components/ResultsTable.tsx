import type { ModelFit } from '../engine/types'

interface ResultsTableProps {
  results: ModelFit[]
  selectedIndex: number | null
  onSelect: (i: number) => void
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

export default function ResultsTable({
  results,
  selectedIndex,
  onSelect,
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
            <th>Model</th>
            <th>Fit</th>
            <th>Quant</th>
            <th className="col-hide-mobile">T/S</th>
            <th className="col-hide-mobile">Score</th>
          </tr>
        </thead>
        <tbody>
          {results.map((fit, i) => (
            <tr
              key={`${fit.model.name}-${i}`}
              className={i === selectedIndex ? 'row-selected' : ''}
              onClick={() => onSelect(i)}
            >
              <td>
                <span className="cell-model">
                  <span className="model-name">
                    {modelDisplayName(fit.model.name)}
                  </span>
                  <span className="model-provider">{fit.model.provider}</span>
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
                {fit.score.toFixed(0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
