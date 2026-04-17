import { useState, useCallback, useMemo, useEffect } from 'react'
import type {
  SystemSpecs,
  GpuSpec,
  GpuEntry,
  Interconnect,
  ParallelismMode,
} from '../engine/types'
import { detectHardware, buildSystemSpecs } from '../detection/detect'
import { lookupGpu } from '../detection/parse-renderer'
import { readUrlState } from '../url'

type Phase = 'detected' | 'manual'

// navigator.deviceMemory caps at 8 GB per spec and is rounded to powers of 2,
// so we don't trust it. RAM starts unset (0) — the header dropdown renders a
// placeholder option until the user picks a size. ram_gb=0 also means the
// fit engine only counts VRAM, so models that would only fit via cpu_offload
// show as "won't run" until the user confirms they have the RAM.

function makeEntry(name: string, spec: GpuSpec | null, count = 1): GpuEntry {
  return {
    name,
    vram_gb: spec?.vram_gb ?? 0,
    bandwidth_gbps: spec?.bandwidth_gbps ?? 0,
    count,
  }
}

export function useHardware() {
  const urlInit = useMemo(() => readUrlState().hw, [])
  const hasUrlParams =
    urlInit.gpus.length > 0 || urlInit.ram !== null || urlInit.unified === true

  const [phase, setPhase] = useState<Phase>('manual')
  const [ready, setReady] = useState(hasUrlParams)
  const [gpus, setGpus] = useState<GpuEntry[]>(urlInit.gpus)
  const [interconnect, setInterconnect] = useState<Interconnect>(urlInit.interconnect ?? 'none')
  const [parallelism, setParallelism] = useState<ParallelismMode>(urlInit.parallelism ?? 'auto')
  const [ramGb, setRamGbState] = useState(urlInit.ram ?? 0)
  // True once the user has explicitly chosen a RAM value (header dropdown,
  // manual-edit form, or URL param). Drives the placeholder option + hint
  // styling on the RAM dropdown until then.
  const [ramUserSet, setRamUserSet] = useState(urlInit.ram !== null)
  const [cpuCores, setCpuCores] = useState(urlInit.cores ?? 4)
  const [unified, setUnified] = useState(urlInit.unified ?? false)
  const [gpuDetected, setGpuDetected] = useState(false)

  const setRamGb = useCallback((gb: number) => {
    setRamGbState(gb)
    setRamUserSet(true)
  }, [])

  const addGpu = useCallback((name: string, spec: GpuSpec | null) => {
    setGpus((prev) => [...prev, makeEntry(name, spec, 1)])
  }, [])

  const removeGpu = useCallback((index: number) => {
    setGpus((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateGpuAt = useCallback((index: number, patch: Partial<GpuEntry>) => {
    setGpus((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }, [])

  const selectGpu = useCallback((index: number, name: string, spec: GpuSpec | null) => {
    setGpus((prev) =>
      prev.map((g, i) =>
        i === index
          ? {
              ...g,
              name,
              vram_gb: spec?.vram_gb ?? g.vram_gb,
              bandwidth_gbps: spec?.bandwidth_gbps ?? g.bandwidth_gbps,
            }
          : g,
      ),
    )
  }, [])

  const system = useMemo<SystemSpecs>(
    () => ({
      gpu_name: gpus[0]?.name ?? null,
      gpu_detected: gpuDetected,
      gpus: unified ? [] : gpus,
      interconnect,
      parallelism,
      ram_gb: ramGb,
      cpu_cores: cpuCores,
      unified_memory: unified,
    }),
    [gpus, gpuDetected, ramGb, cpuCores, unified, interconnect, parallelism],
  )

  const scan = useCallback(() => {
    const detection = detectHardware()
    const specs = buildSystemSpecs(detection)

    if (detection.gpu_parsed) {
      // Replace current list with the detected single GPU. User can add more.
      setGpus([makeEntry(detection.gpu_parsed, detection.gpu_spec, 1)])
    }
    // navigator.deviceMemory is capped at 8 GB and rounded, so we ignore it
    // for display. Keep the current ramGb (URL or default) and let the user
    // confirm/change via the header dropdown.
    setCpuCores(specs.cpu_cores)
    setUnified(specs.unified_memory)
    setGpuDetected(specs.gpu_detected)
    setPhase('detected')
    setReady(true)
  }, [])

  const [editing, setEditing] = useState(false)

  const enterManual = useCallback(() => {
    setEditing(true)
    setReady(true)
  }, [])

  const reset = useCallback(() => {
    setReady(false)
    setEditing(false)
    setGpus([])
    setInterconnect('none')
    setParallelism('auto')
    setRamGbState(0)
    setRamUserSet(false)
    setCpuCores(4)
    setUnified(false)
    setGpuDetected(false)
    setPhase('manual')
  }, [])

  // Restore GPU specs from URL on mount (lookup bandwidth by name)
  useEffect(() => {
    if (hasUrlParams && urlInit.gpus.length > 0) {
      setGpus(
        urlInit.gpus.map((g) => {
          const spec = lookupGpu(g.name)
          return {
            ...g,
            vram_gb: g.vram_gb || (spec?.vram_gb ?? 0),
            bandwidth_gbps: g.bandwidth_gbps || (spec?.bandwidth_gbps ?? 0),
          }
        }),
      )
      setGpuDetected(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    phase,
    ready,
    editing,
    setEditing,
    system,
    gpus,
    interconnect,
    parallelism,
    ramGb,
    ramUserSet,
    cpuCores,
    unified,
    gpuDetected,
    scan,
    enterManual,
    reset,
    addGpu,
    removeGpu,
    updateGpuAt,
    selectGpu,
    setInterconnect,
    setParallelism,
    setRamGb,
    setCpuCores,
    setUnified,
  }
}
