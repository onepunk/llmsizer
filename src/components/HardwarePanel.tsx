import { useState, useMemo } from 'react'
import type { GpuSpec } from '../engine/types'
import { getAllGpuNames, lookupGpu } from '../detection/parse-renderer'

function clamp(value: number, min: number, max: number): number {
  return isFinite(value) ? Math.max(min, Math.min(max, value)) : min
}

interface HardwarePanelProps {
  gpuName: string
  vramGb: number
  ramGb: number
  cpuCores: number
  unified: boolean
  gpuDetected: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onGpuChange: (name: string, spec: GpuSpec | null) => void
  onVramChange: (gb: number) => void
  onRamChange: (gb: number) => void
  onCpuCoresChange: (cores: number) => void
  onRescan: () => void
}

export default function HardwarePanel({
  gpuName,
  vramGb,
  ramGb,
  cpuCores,
  unified,
  gpuDetected,
  editing,
  onEditingChange,
  onGpuChange,
  onVramChange,
  onRamChange,
  onCpuCoresChange,
  onRescan,
}: HardwarePanelProps) {
  const [gpuSearch, setGpuSearch] = useState('')
  const [showGpuDropdown, setShowGpuDropdown] = useState(false)
  const allGpus = useMemo(() => getAllGpuNames(), [])

  const filteredGpus = useMemo(() => {
    if (!gpuSearch.trim()) return allGpus
    const lower = gpuSearch.toLowerCase()
    return allGpus.filter((n) => n.toLowerCase().includes(lower))
  }, [gpuSearch, allGpus])

  function handleGpuSelect(name: string) {
    const spec = lookupGpu(name)
    onGpuChange(name, spec)
    setShowGpuDropdown(false)
    setGpuSearch('')
  }

  // Compact bar view (not editing)
  if (!editing) {
    return (
      <div className="hardware-panel">
        <div className="hardware-bar">
          <div className="hw-spec">
            <span className="hw-spec-label">GPU</span>
            <span className="hw-spec-value">{gpuName || 'None'}</span>
            {!unified && vramGb > 0 && (
              <span className="hw-spec-value">{vramGb}GB</span>
            )}
            {gpuDetected && <span className="hw-badge">detected</span>}
          </div>
          <span className="hw-sep">|</span>
          <div className="hw-spec">
            <span className="hw-spec-label">RAM</span>
            <span className="hw-spec-value">{ramGb}GB</span>
            {unified && <span className="hw-badge">unified</span>}
          </div>
          <span className="hw-sep">|</span>
          <div className="hw-spec">
            <span className="hw-spec-label">CPU</span>
            <span className="hw-spec-value">{cpuCores} logical processors</span>
          </div>
          <div className="hw-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => onEditingChange(true)}>
              change
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onRescan}>
              re-scan
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Edit form
  return (
    <div className="hardware-panel">
      <div className="hardware-bar">
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Edit hardware specs
        </span>
        <div className="hw-actions">
          <button className="btn btn-sm" onClick={() => onEditingChange(false)}>
            done
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onRescan}>
            re-scan
          </button>
        </div>
      </div>
      <div className="hardware-edit">
        <div className="hw-field">
          <span className="hw-field-label">GPU</span>
          <div className="gpu-search-wrap">
            <input
              className="hw-input"
              type="text"
              placeholder="Search GPUs..."
              value={showGpuDropdown ? gpuSearch : gpuName}
              onChange={(e) => {
                setGpuSearch(e.target.value)
                setShowGpuDropdown(true)
              }}
              onFocus={() => setShowGpuDropdown(true)}
              onBlur={() => setTimeout(() => setShowGpuDropdown(false), 200)}
            />
            {showGpuDropdown && (
              <ul className="gpu-dropdown">
                {filteredGpus.map((name) => (
                  <li key={name} onMouseDown={() => handleGpuSelect(name)}>
                    {name}
                  </li>
                ))}
                {filteredGpus.length === 0 && (
                  <li className="gpu-dropdown-empty">No matches</li>
                )}
              </ul>
            )}
          </div>
        </div>

        {!unified && (
          <div className="hw-field">
            <span className="hw-field-label">VRAM (GB)</span>
            <input
              className="hw-input"
              type="number"
              min={0}
              max={1024}
              value={vramGb}
              onChange={(e) => onVramChange(clamp(Number(e.target.value), 0, 1024))}
            />
          </div>
        )}

        <div className="hw-field">
          <span className="hw-field-label">
            RAM (GB) {unified && <span className="hw-badge">unified</span>}
          </span>
          <input
            className="hw-input"
            type="number"
            min={1}
            max={8192}
            value={ramGb}
            onChange={(e) => onRamChange(clamp(Number(e.target.value), 1, 8192))}
          />
        </div>

        <div className="hw-field">
          <span className="hw-field-label">CPU Logical Processors</span>
          <input
            className="hw-input"
            type="number"
            min={1}
            max={512}
            value={cpuCores}
            onChange={(e) => onCpuCoresChange(clamp(Number(e.target.value), 1, 512))}
          />
        </div>
      </div>
    </div>
  )
}
