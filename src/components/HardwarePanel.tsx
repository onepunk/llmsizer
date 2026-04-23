import { useState, useMemo, useRef, useEffect } from 'react'
import type { GpuSpec, GpuEntry, Interconnect, ParallelismMode } from '../engine/types'
import { getAllGpuNames, lookupGpu } from '../detection/parse-renderer'
import { getAllCpuNames } from '../detection/cpu-specs'

function clamp(value: number, min: number, max: number): number {
  return isFinite(value) ? Math.max(min, Math.min(max, value)) : min
}

const RAM_OPTIONS = [
  1, 2, 4, 8, 16, 32, 48, 64, 96, 128, 192, 256, 384, 512,
  768, 1024, 1536, 2048, 3072, 4096,
] as const

function formatRam(gb: number): string {
  if (gb < 1024) return `${gb}GB`
  const tb = gb / 1024
  return Number.isInteger(tb) ? `${tb}TB` : `${tb.toFixed(1)}TB`
}

// DDR presets → approximate dual-channel desktop system bandwidth (GB/s).
// Picking a preset is a convenience that drives system.ram_bandwidth_gbps
// in the speed engine.
const RAM_SPEED_PRESETS: { label: string; gbps: number }[] = [
  { label: 'DDR3-1600 · ~26 GB/s', gbps: 26 },
  { label: 'DDR4-2400 · ~38 GB/s', gbps: 38 },
  { label: 'DDR4-3200 · ~51 GB/s', gbps: 51 },
  { label: 'DDR4-3600 · ~58 GB/s', gbps: 58 },
  { label: 'DDR5-4800 · ~77 GB/s', gbps: 77 },
  { label: 'DDR5-5600 · ~90 GB/s', gbps: 90 },
  { label: 'DDR5-6000 · ~96 GB/s', gbps: 96 },
  { label: 'DDR5-6400 · ~102 GB/s', gbps: 102 },
  { label: 'DDR5-7200 · ~115 GB/s', gbps: 115 },
  { label: 'DDR5-8000 · ~128 GB/s', gbps: 128 },
]

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

interface HardwarePanelProps {
  gpus: GpuEntry[]
  interconnect: Interconnect
  parallelism: ParallelismMode
  ramGb: number
  ramUserSet: boolean
  unified: boolean
  gpuDetected: boolean
  onAddGpu: (name: string, spec: GpuSpec | null) => void
  onRemoveGpu: (index: number) => void
  onUpdateGpuAt: (index: number, patch: Partial<GpuEntry>) => void
  onSelectGpu: (index: number, name: string, spec: GpuSpec | null) => void
  onInterconnectChange: (ic: Interconnect) => void
  onParallelismChange: (p: ParallelismMode) => void
  onRamChange: (gb: number) => void
  onRescan: () => void
  ramBandwidthGbps: number | null
  diskFreeGb: number | null
  cpuName: string | null
  onRamBandwidthChange: (gbps: number | null) => void
  onDiskFreeChange: (gb: number | null) => void
  onCpuChange: (name: string | null) => void
}

interface GpuRowProps {
  gpu: GpuEntry
  index: number
  allGpus: string[]
  canRemove: boolean
  onSelect: (index: number, name: string, spec: GpuSpec | null) => void
  onUpdate: (index: number, patch: Partial<GpuEntry>) => void
  onRemove: (index: number) => void
}

function GpuRow({ gpu, index, allGpus, canRemove, onSelect, onUpdate, onRemove }: GpuRowProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allGpus
    return allGpus.filter((n) => n.toLowerCase().includes(q))
  }, [query, allGpus])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // If the row is freshly added (empty name), open the picker and focus the
  // input so the user can search immediately rather than being saddled with
  // a preselected SKU they have to overwrite.
  useEffect(() => {
    if (gpu.name === '') {
      setOpen(true)
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handlePick(name: string) {
    const spec = lookupGpu(name)
    onSelect(index, name, spec)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="hw-gpu-row">
      <div className="hw-field hw-field-grow">
        <span className="hw-field-label">GPU #{index + 1}</span>
        <div className="gpu-search-wrap" ref={wrapRef}>
          <input
            ref={inputRef}
            className="hw-input hw-input-combo"
            type="text"
            placeholder="search GPUs…"
            value={open ? query : gpu.name}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => {
              setQuery('')
              setOpen(true)
            }}
          />
          <span className="hw-combo-caret" aria-hidden="true">▾</span>
          {open && (
            <ul className="gpu-dropdown">
              {filtered.slice(0, 50).map((name) => (
                <li key={name} onMouseDown={() => handlePick(name)}>{name}</li>
              ))}
              {filtered.length === 0 && <li className="gpu-dropdown-empty">no matches</li>}
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
          onChange={(e) => onUpdate(index, { vram_gb: clamp(Number(e.target.value), 0, 1024) })}
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
          onChange={(e) => onUpdate(index, { count: clamp(Number(e.target.value), 1, 8) })}
        />
      </div>

      <button
        className="btn btn-ghost btn-sm hw-gpu-remove"
        onClick={() => onRemove(index)}
        title="Remove this GPU"
        aria-label={`Remove GPU #${index + 1}`}
        disabled={!canRemove}
      >
        ×
      </button>
    </div>
  )
}

interface RamPickerProps {
  ramGb: number
  ramUserSet: boolean
  onChange: (gb: number) => void
}

function RamPicker({ ramGb, ramUserSet, onChange }: RamPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return RAM_OPTIONS as readonly number[]
    return (RAM_OPTIONS as readonly number[]).filter((gb) =>
      formatRam(gb).toLowerCase().includes(q) || String(gb).includes(q),
    )
  }, [query])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function pick(gb: number) {
    onChange(gb)
    setOpen(false)
    setQuery('')
  }

  const display = ramUserSet && ramGb > 0 ? formatRam(ramGb) : ''

  return (
    <div className="hw-field">
      <span className="hw-field-label">RAM</span>
      <div className="gpu-search-wrap hw-ram-combo-wrap" ref={wrapRef}>
        <input
          className="hw-input hw-input-combo"
          type="text"
          placeholder="—"
          value={open ? query : display}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
        />
        <span className="hw-combo-caret" aria-hidden="true">▾</span>
        {open && (
          <ul className="gpu-dropdown">
            {filtered.map((gb) => (
              <li key={gb} onMouseDown={() => pick(gb)}>{formatRam(gb)}</li>
            ))}
            {filtered.length === 0 && <li className="gpu-dropdown-empty">no matches</li>}
          </ul>
        )}
      </div>
    </div>
  )
}

interface CpuPickerProps {
  value: string | null
  allCpus: string[]
  onChange: (name: string | null) => void
}

function CpuPicker({ value, allCpus, onChange }: CpuPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCpus
    return allCpus.filter((n) => n.toLowerCase().includes(q))
  }, [query, allCpus])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function pick(name: string | null) {
    onChange(name)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="hw-field hw-field-grow">
      <span className="hw-field-label">CPU</span>
      <div className="gpu-search-wrap" ref={wrapRef}>
        <input
          className="hw-input hw-input-combo"
          type="text"
          placeholder="search CPUs…"
          value={open ? query : value ?? ''}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
        />
        <span className="hw-combo-caret" aria-hidden="true">▾</span>
        {open && (
          <ul className="gpu-dropdown">
            <li onMouseDown={() => pick(null)}>Custom / unknown CPU</li>
            {filtered.slice(0, 50).map((name) => (
              <li key={name} onMouseDown={() => pick(name)}>{name}</li>
            ))}
            {filtered.length === 0 && <li className="gpu-dropdown-empty">no matches</li>}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function HardwarePanel({
  gpus,
  interconnect,
  parallelism,
  ramGb,
  ramUserSet,
  unified,
  gpuDetected,
  onAddGpu,
  onRemoveGpu,
  onUpdateGpuAt,
  onSelectGpu,
  onInterconnectChange,
  onParallelismChange,
  onRamChange,
  onRescan,
  ramBandwidthGbps,
  diskFreeGb,
  cpuName,
  onRamBandwidthChange,
  onDiskFreeChange,
  onCpuChange,
}: HardwarePanelProps) {
  const allGpus = useMemo(() => getAllGpuNames(), [])
  const allCpus = useMemo(() => getAllCpuNames(), [])
  const [advancedOpen, setAdvancedOpen] = useState(
    ramBandwidthGbps != null || diskFreeGb != null || cpuName != null
  )

  // Reset interconnect to a valid choice when the GPU lineup loses NVLink
  // capability (e.g. user swaps an A6000 for an RTX 4090).
  useEffect(() => {
    if (interconnect === 'nvlink' && gpus.length > 0 && !gpus.every((g) => g.nvlink === true)) {
      onInterconnectChange('pcie4')
    }
  }, [gpus, interconnect, onInterconnectChange])

  // Intentionally adds an EMPTY row so the user's first action is searching
  // for their GPU. Auto-picking the alphabetical first entry would start
  // showing (misleading) model fits before the user has picked anything.
  function handleAddGpu() {
    onAddGpu('', null)
  }

  const totalGpuCount = gpus.reduce((s, g) => s + g.count, 0)

  return (
    <div className="hardware-panel">
      <div className="hw-panel-header">
        <span className="hw-panel-title">Your hardware</span>
        <div className="hw-row-spacer" />
        {gpuDetected && <span className="hw-badge">detected</span>}
        <button
          type="button"
          className="btn btn-ghost btn-sm hw-rescan"
          onClick={onRescan}
          title="Auto-detect GPU + CPU cores from this browser"
        >
          ⟳ auto-detect
        </button>
      </div>

      <section className="hw-section">
        <h4 className="hw-section-title">GPU</h4>
        {gpus.length === 0 && unified && (
          <p className="hw-section-hint">Integrated GPU · shared memory (Apple Silicon or iGPU)</p>
        )}
        {gpus.map((gpu, i) => (
          <GpuRow
            key={i}
            gpu={gpu}
            index={i}
            allGpus={allGpus}
            canRemove={true}
            onSelect={onSelectGpu}
            onUpdate={onUpdateGpuAt}
            onRemove={onRemoveGpu}
          />
        ))}
        <div className="hw-gpu-actions">
          <button className="hw-add-gpu" onClick={handleAddGpu} title="Add a GPU">
            + add GPU
          </button>
        </div>

        {totalGpuCount >= 2 && (
          <div className="hw-field-row">
            <div className="hw-field">
              <span className="hw-field-label">Interconnect</span>
              <select
                className="hw-input"
                value={interconnect}
                onChange={(e) => onInterconnectChange(e.target.value as Interconnect)}
              >
                {(['nvlink', 'pcie5', 'pcie4', 'pcie3', 'none'] as Interconnect[])
                  // Hide NVLink unless every selected GPU physically supports it
                  .filter((ic) => ic !== 'nvlink' || gpus.every((g) => g.nvlink === true))
                  .map((ic) => (
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
          </div>
        )}
      </section>

      <section className="hw-section hw-section-advanced">
        <button
          type="button"
          className="hw-section-title hw-advanced-toggle"
          onClick={() => setAdvancedOpen((x) => !x)}
          aria-expanded={advancedOpen}
        >
          Advanced <span className="hw-advanced-caret">{advancedOpen ? '▾' : '▸'}</span>
        </button>

        {advancedOpen && (
          <div className="hw-field-row">
            <RamPicker ramGb={ramGb} ramUserSet={ramUserSet} onChange={onRamChange} />

            <div className="hw-field">
              <span className="hw-field-label">RAM speed</span>
              <select
                className={`hw-input${ramBandwidthGbps == null ? ' hw-input-hint' : ''}`}
                value={ramBandwidthGbps ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  onRamBandwidthChange(v === '' ? null : Number(v))
                }}
              >
                <option value="">—</option>
                {RAM_SPEED_PRESETS.map((p) => (
                  <option key={p.gbps} value={p.gbps}>{p.label}</option>
                ))}
              </select>
            </div>

            <CpuPicker value={cpuName} allCpus={allCpus} onChange={onCpuChange} />

            <div className="hw-field">
              <span className="hw-field-label">Free disk (GB)</span>
              <input
                className="hw-input hw-input-narrow"
                type="number"
                min={0}
                max={100000}
                value={diskFreeGb ?? ''}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value
                  onDiskFreeChange(v === '' ? null : clamp(Number(v), 0, 100000))
                }}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
