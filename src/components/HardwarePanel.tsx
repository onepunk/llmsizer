import { useState, useMemo, useRef, useEffect } from 'react'
import type { GpuSpec, GpuEntry, Interconnect, ParallelismMode, CpuFlags } from '../engine/types'
import { getAllGpuNames, lookupGpu } from '../detection/parse-renderer'

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

function summarizeGpus(gpus: GpuEntry[], unified: boolean): string {
  if (gpus.length === 0) return unified ? 'Integrated GPU · shared memory' : 'No GPU configured'
  const parts = gpus.map((g) => (g.count > 1 ? `${g.count}× ${g.name}` : g.name))
  const nameStr = parts.join(' + ')
  if (unified) return `${nameStr} · shared memory`
  const totalVram = gpus.reduce((s, g) => s + g.vram_gb * g.count, 0)
  if (totalVram === 0) return nameStr
  return `${nameStr} · ${totalVram} GB`
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
  onAddGpu: (name: string, spec: GpuSpec | null) => void
  onRemoveGpu: (index: number) => void
  onUpdateGpuAt: (index: number, patch: Partial<GpuEntry>) => void
  onSelectGpu: (index: number, name: string, spec: GpuSpec | null) => void
  onInterconnectChange: (ic: Interconnect) => void
  onParallelismChange: (p: ParallelismMode) => void
  onRamChange: (gb: number) => void
  onCpuCoresChange: (cores: number) => void
  onRescan: () => void
  ramBandwidthGbps: number | null
  cpuFlags: CpuFlags | null
  diskFreeGb: number | null
  onRamBandwidthChange: (gbps: number | null) => void
  onCpuFlagsChange: (flags: CpuFlags | null) => void
  onDiskFreeChange: (gb: number | null) => void
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

export default function HardwarePanel({
  gpus,
  interconnect,
  parallelism,
  ramGb,
  ramUserSet,
  cpuCores,
  unified,
  gpuDetected,
  onAddGpu,
  onRemoveGpu,
  onUpdateGpuAt,
  onSelectGpu,
  onInterconnectChange,
  onParallelismChange,
  onRamChange,
  onCpuCoresChange,
  onRescan,
  ramBandwidthGbps,
  cpuFlags,
  diskFreeGb,
  onRamBandwidthChange,
  onCpuFlagsChange,
  onDiskFreeChange,
}: HardwarePanelProps) {
  const allGpus = useMemo(() => getAllGpuNames(), [])
  const [manualEntry, setManualEntry] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(
    ramBandwidthGbps != null || cpuFlags != null || diskFreeGb != null
  )

  const toggleCpuFlag = (key: keyof CpuFlags, checked: boolean) =>
    onCpuFlagsChange({
      avx512: cpuFlags?.avx512 ?? false,
      amx: cpuFlags?.amx ?? false,
      neon: cpuFlags?.neon ?? false,
      [key]: checked,
    })

  // Reset interconnect to a valid choice when the GPU lineup loses NVLink
  // capability (e.g. user swaps an A6000 for an RTX 4090).
  useEffect(() => {
    if (interconnect === 'nvlink' && gpus.length > 0 && !gpus.every((g) => g.nvlink === true)) {
      onInterconnectChange('pcie4')
    }
  }, [gpus, interconnect, onInterconnectChange])

  function handleAddGpu() {
    const firstName = allGpus[0]
    if (firstName) {
      onAddGpu(firstName, lookupGpu(firstName))
    } else {
      onAddGpu('', null)
    }
  }

  return (
    <div className="hardware-panel">
      <div className="hw-columns">
        <div className="hw-column hw-column-gpus">
          {manualEntry ? (
            <>
              {gpus.map((gpu, i) => (
                <GpuRow
                  key={i}
                  gpu={gpu}
                  index={i}
                  allGpus={allGpus}
                  canRemove={gpus.length > 1}
                  onSelect={onSelectGpu}
                  onUpdate={onUpdateGpuAt}
                  onRemove={onRemoveGpu}
                />
              ))}

              <div className="hw-gpu-actions">
                <button className="hw-add-gpu" onClick={handleAddGpu} title="Add another GPU">
                  + add GPU
                </button>
                <div className="hw-row-spacer" />
                <button className="btn btn-ghost btn-sm" onClick={() => setManualEntry(false)}>done</button>
              </div>

              {gpus.reduce((s, g) => s + g.count, 0) >= 2 && (
                <div className="hw-row-2up">
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
            </>
          ) : (
            <div className="hw-gpu-view-row">
              <div className="hw-field hw-field-grow">
                <span className="hw-field-label">GPU</span>
                <span className="hw-gpu-summary">{summarizeGpus(gpus, unified)}</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setManualEntry(true)}>
                manual entry
              </button>
            </div>
          )}
        </div>

        <div className="hw-column hw-column-system">
          <div className="hw-system-row">
            <div className="hw-field">
              <span className="hw-field-label">RAM</span>
              <select
                className={`hw-input${ramUserSet ? '' : ' hw-input-hint'}`}
                value={ramUserSet && RAM_OPTIONS.includes(ramGb as typeof RAM_OPTIONS[number]) ? ramGb : ''}
                onChange={(e) => onRamChange(Number(e.target.value))}
                title={ramUserSet ? 'System RAM' : 'Set your system RAM — we can’t detect this reliably'}
              >
                {!ramUserSet && <option value="" disabled>set RAM…</option>}
                {RAM_OPTIONS.map((gb) => (
                  <option key={gb} value={gb}>{formatRam(gb)}</option>
                ))}
              </select>
            </div>

            <div className="hw-field">
              <span className="hw-field-label">CPU cores</span>
              <input
                className="hw-input hw-input-narrow"
                type="number"
                min={1}
                max={512}
                value={cpuCores}
                onChange={(e) => onCpuCoresChange(clamp(Number(e.target.value), 1, 512))}
              />
            </div>

            <div className="hw-row-spacer" />

            {gpuDetected && <span className="hw-badge">detected</span>}
            <button className="btn btn-ghost btn-sm" onClick={onRescan}>re-scan</button>
          </div>

          <div className="hw-advanced-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-sm hw-advanced-toggle"
              onClick={() => setAdvancedOpen((x) => !x)}
              aria-expanded={advancedOpen}
            >
              {advancedOpen ? '− hide advanced' : '+ advanced'}
            </button>

            {advancedOpen && (
              <div className="hw-advanced">
                <div className="hw-field">
                  <span className="hw-field-label">RAM bandwidth (GB/s)</span>
                  <input
                    className="hw-input hw-input-narrow"
                    type="number"
                    min={0}
                    max={2000}
                    value={ramBandwidthGbps ?? ''}
                    placeholder="auto"
                    onChange={(e) => {
                      const v = e.target.value
                      onRamBandwidthChange(v === '' ? null : clamp(Number(v), 0, 2000))
                    }}
                  />
                </div>

                <div className="hw-field">
                  <span className="hw-field-label">Free disk (GB)</span>
                  <input
                    className="hw-input hw-input-narrow"
                    type="number"
                    min={0}
                    max={100000}
                    value={diskFreeGb ?? ''}
                    placeholder="unset"
                    onChange={(e) => {
                      const v = e.target.value
                      onDiskFreeChange(v === '' ? null : clamp(Number(v), 0, 100000))
                    }}
                  />
                </div>

                <div className="hw-field hw-field-grow">
                  <span className="hw-field-label">CPU features</span>
                  <div className="hw-cpu-flags">
                    <label>
                      <input
                        type="checkbox"
                        checked={cpuFlags?.avx512 ?? false}
                        onChange={(e) => toggleCpuFlag('avx512', e.target.checked)}
                      />{' '}
                      AVX-512
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={cpuFlags?.amx ?? false}
                        onChange={(e) => toggleCpuFlag('amx', e.target.checked)}
                      />{' '}
                      AMX
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={cpuFlags?.neon ?? false}
                        onChange={(e) => toggleCpuFlag('neon', e.target.checked)}
                      />{' '}
                      NEON
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
