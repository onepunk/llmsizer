import { useState, useMemo } from 'react'
import type { GpuSpec, GpuEntry, Interconnect, ParallelismMode } from '../engine/types'
import { getAllGpuNames, lookupGpu } from '../detection/parse-renderer'

function clamp(value: number, min: number, max: number): number {
  return isFinite(value) ? Math.max(min, Math.min(max, value)) : min
}

// Ladder of plausible total-RAM values: small consumer sizes up through
// server/workstation DIMM configurations. Stops at 4 TB.
const RAM_OPTIONS = [
  1, 2, 4, 8, 16, 32, 48, 64, 96, 128, 192, 256, 384, 512,
  768, 1024, 1536, 2048, 3072, 4096,
] as const

function formatRam(gb: number): string {
  if (gb < 1024) return `${gb}GB`
  const tb = gb / 1024
  return Number.isInteger(tb) ? `${tb}TB` : `${tb.toFixed(1)}TB`
}

interface HardwarePanelProps {
  gpus: GpuEntry[]
  interconnect: Interconnect
  parallelism: ParallelismMode
  ramGb: number
  ramUserSet: boolean
  cpuCores: number
  unified: boolean
  gpuDetected: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onAddGpu: (name: string, spec: GpuSpec | null) => void
  onRemoveGpu: (index: number) => void
  onUpdateGpuAt: (index: number, patch: Partial<GpuEntry>) => void
  onSelectGpu: (index: number, name: string, spec: GpuSpec | null) => void
  onInterconnectChange: (ic: Interconnect) => void
  onParallelismChange: (p: ParallelismMode) => void
  onRamChange: (gb: number) => void
  onCpuCoresChange: (cores: number) => void
  onRescan: () => void
}

function gpuSummary(gpus: GpuEntry[]): string {
  if (gpus.length === 0) return 'None'
  return gpus
    .map((g) => (g.count > 1 ? `${g.count}× ${g.name}` : g.name))
    .join(' + ')
}

function totalVram(gpus: GpuEntry[]): number {
  return gpus.reduce((s, g) => s + g.vram_gb * g.count, 0)
}

const INTERCONNECT_LABELS: Record<Interconnect, string> = {
  nvlink: 'NVLink',
  pcie5: 'PCIe 5.0',
  pcie4: 'PCIe 4.0',
  pcie3: 'PCIe 3.0',
  none: 'Single GPU',
}

const PARALLELISM_LABELS: Record<ParallelismMode, string> = {
  auto: 'Auto',
  layer_split: 'Layer split',
  tensor_parallel: 'Tensor parallel',
}

export default function HardwarePanel({
  gpus,
  interconnect,
  parallelism,
  ramGb,
  ramUserSet,
  cpuCores,
  unified,
  gpuDetected,
  editing,
  onEditingChange,
  onAddGpu,
  onRemoveGpu,
  onUpdateGpuAt,
  onSelectGpu,
  onInterconnectChange,
  onParallelismChange,
  onRamChange,
  onCpuCoresChange,
  onRescan,
}: HardwarePanelProps) {
  const allGpus = useMemo(() => getAllGpuNames(), [])
  const [searchState, setSearchState] = useState<Record<number, string>>({})
  const [openDropdown, setOpenDropdown] = useState<number | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [showAddDropdown, setShowAddDropdown] = useState(false)

  const filteredGpus = useMemo(() => {
    if (openDropdown === null) return allGpus
    const q = searchState[openDropdown] ?? ''
    if (!q.trim()) return allGpus
    const lower = q.toLowerCase()
    return allGpus.filter((n) => n.toLowerCase().includes(lower))
  }, [openDropdown, searchState, allGpus])

  const filteredAddGpus = useMemo(() => {
    if (!addSearch.trim()) return allGpus
    const lower = addSearch.toLowerCase()
    return allGpus.filter((n) => n.toLowerCase().includes(lower))
  }, [addSearch, allGpus])

  function pickGpu(index: number, name: string) {
    const spec = lookupGpu(name)
    onSelectGpu(index, name, spec)
    setOpenDropdown(null)
    setSearchState((s) => ({ ...s, [index]: '' }))
  }

  function pickAddGpu(name: string) {
    const spec = lookupGpu(name)
    onAddGpu(name, spec)
    setShowAddDropdown(false)
    setAddSearch('')
  }

  // Compact bar view
  if (!editing) {
    return (
      <div className="hardware-panel">
        <div className="hardware-bar">
          <div className="hw-spec">
            <span className="hw-spec-label">GPU</span>
            <span className="hw-spec-value">{gpuSummary(gpus)}</span>
            {!unified && totalVram(gpus) > 0 && (
              <span className="hw-spec-value">{totalVram(gpus)}GB total</span>
            )}
            {gpus.length > 1 && (
              <span className="hw-spec-value">{INTERCONNECT_LABELS[interconnect]}</span>
            )}
            {gpuDetected && <span className="hw-badge">detected</span>}
          </div>
          <span className="hw-sep">|</span>
          <div className="hw-spec">
            <span className="hw-spec-label">RAM</span>
            <select
              className={`hw-ram-select${ramUserSet ? '' : ' hw-ram-select-hint'}`}
              value={ramUserSet && RAM_OPTIONS.includes(ramGb as typeof RAM_OPTIONS[number]) ? ramGb : ''}
              onChange={(e) => onRamChange(Number(e.target.value))}
              title={ramUserSet ? 'System RAM' : 'Set your system RAM — we can\u2019t detect this reliably'}
            >
              {!ramUserSet && <option value="" disabled>set RAM…</option>}
              {RAM_OPTIONS.map((gb) => (
                <option key={gb} value={gb}>{formatRam(gb)}</option>
              ))}
            </select>
            {unified && <span className="hw-badge">unified</span>}
          </div>
          <span className="hw-sep">|</span>
          <div className="hw-spec">
            <span className="hw-spec-label">CPU</span>
            <span className="hw-spec-value">{cpuCores} logical processors</span>
          </div>
          <div className="hw-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => onEditingChange(true)}>change</button>
            <button className="btn btn-ghost btn-sm" onClick={onRescan}>re-scan</button>
          </div>
        </div>
      </div>
    )
  }

  // Edit form
  return (
    <div className="hardware-panel">
      <div className="hardware-bar">
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Edit hardware specs</span>
        <div className="hw-actions">
          <button className="btn btn-sm" onClick={() => onEditingChange(false)}>done</button>
          <button className="btn btn-ghost btn-sm" onClick={onRescan}>re-scan</button>
        </div>
      </div>

      <div className="hardware-edit">
        {!unified && gpus.map((gpu, index) => (
          <div className="hw-gpu-row" key={index}>
            <div className="hw-field hw-field-grow">
              <span className="hw-field-label">GPU #{index + 1}</span>
              <div className="gpu-search-wrap">
                <input
                  className="hw-input"
                  type="text"
                  placeholder="Search GPUs..."
                  value={openDropdown === index ? (searchState[index] ?? '') : gpu.name}
                  onChange={(e) => {
                    setSearchState((s) => ({ ...s, [index]: e.target.value }))
                    setOpenDropdown(index)
                  }}
                  onFocus={() => setOpenDropdown(index)}
                  onBlur={() => setTimeout(() => setOpenDropdown((cur) => cur === index ? null : cur), 200)}
                />
                {openDropdown === index && (
                  <ul className="gpu-dropdown">
                    {filteredGpus.slice(0, 50).map((name) => (
                      <li key={name} onMouseDown={() => pickGpu(index, name)}>{name}</li>
                    ))}
                    {filteredGpus.length === 0 && <li className="gpu-dropdown-empty">No matches</li>}
                  </ul>
                )}
              </div>
            </div>

            <div className="hw-field">
              <span className="hw-field-label">VRAM</span>
              <input
                className="hw-input hw-input-narrow"
                type="number"
                min={0}
                max={1024}
                value={gpu.vram_gb}
                onChange={(e) => onUpdateGpuAt(index, { vram_gb: clamp(Number(e.target.value), 0, 1024) })}
              />
            </div>

            <div className="hw-field">
              <span className="hw-field-label">Count</span>
              <input
                className="hw-input hw-input-narrow"
                type="number"
                min={1}
                max={8}
                value={gpu.count}
                onChange={(e) => onUpdateGpuAt(index, { count: clamp(Number(e.target.value), 1, 8) })}
              />
            </div>

            <button
              className="btn btn-ghost btn-sm hw-gpu-remove"
              onClick={() => onRemoveGpu(index)}
              title="Remove this GPU"
            >
              ×
            </button>
          </div>
        ))}

        {!unified && (
          <div className="hw-gpu-add">
            <div className="gpu-search-wrap">
              <input
                className="hw-input"
                type="text"
                placeholder="+ add another GPU"
                value={addSearch}
                onChange={(e) => {
                  setAddSearch(e.target.value)
                  setShowAddDropdown(true)
                }}
                onFocus={() => setShowAddDropdown(true)}
                onBlur={() => setTimeout(() => setShowAddDropdown(false), 200)}
              />
              {showAddDropdown && (
                <ul className="gpu-dropdown">
                  {filteredAddGpus.slice(0, 50).map((name) => (
                    <li key={name} onMouseDown={() => pickAddGpu(name)}>{name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {!unified && gpus.length >= 2 && (
          <>
            <div className="hw-field">
              <span className="hw-field-label">Interconnect</span>
              <select
                className="hw-input"
                value={interconnect}
                onChange={(e) => onInterconnectChange(e.target.value as Interconnect)}
              >
                {(['nvlink', 'pcie5', 'pcie4', 'pcie3', 'none'] as Interconnect[]).map((ic) => (
                  <option key={ic} value={ic}>{INTERCONNECT_LABELS[ic]}</option>
                ))}
              </select>
            </div>

            <div className="hw-field">
              <span className="hw-field-label">Parallelism</span>
              <select
                className="hw-input"
                value={parallelism}
                onChange={(e) => onParallelismChange(e.target.value as ParallelismMode)}
              >
                {(['auto', 'layer_split', 'tensor_parallel'] as ParallelismMode[]).map((p) => (
                  <option key={p} value={p}>{PARALLELISM_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="hw-field">
          <span className="hw-field-label">RAM (GB) {unified && <span className="hw-badge">unified</span>}</span>
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
