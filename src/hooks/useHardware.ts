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

export function useHardware() {
  const urlInit = useMemo(() => readUrlState().hw, [])
  const hasUrlParams = urlInit.gpu !== null || urlInit.vram !== null || urlInit.ram !== null

  const [phase, setPhase] = useState<Phase>('manual')
  const [ready, setReady] = useState(hasUrlParams)
  const [gpuName, setGpuName] = useState(urlInit.gpu ?? '')
  const [vramGb, setVramGb] = useState(urlInit.vram ?? 0)
  const [ramGb, setRamGbState] = useState(urlInit.ram ?? 0)
  // True once the user has explicitly chosen a RAM value (header dropdown,
  // manual-edit form, or URL param). Drives the placeholder option + hint
  // styling on the RAM dropdown until then.
  const [ramUserSet, setRamUserSet] = useState(urlInit.ram !== null)
  const setRamGb = useCallback((gb: number) => {
    setRamGbState(gb)
    setRamUserSet(true)
  }, [])
  const [cpuCores, setCpuCores] = useState(urlInit.cores ?? 4)
  const [unified, setUnified] = useState(urlInit.unified ?? false)
  const [gpuDetected, setGpuDetected] = useState(false)
  const [bandwidth, setBandwidth] = useState(0)
  const [interconnect, setInterconnect] = useState<Interconnect>('none')
  const [parallelism, setParallelism] = useState<ParallelismMode>('auto')

  const system = useMemo<SystemSpecs>(() => {
    const gpus: GpuEntry[] = !unified && vramGb > 0 && bandwidth > 0
      ? [{ name: gpuName || 'Unknown GPU', vram_gb: vramGb, bandwidth_gbps: bandwidth, count: 1 }]
      : []
    return {
      gpu_name: gpuName || null,
      gpu_detected: gpuDetected,
      gpus,
      interconnect,
      parallelism,
      ram_gb: ramGb,
      cpu_cores: cpuCores,
      unified_memory: unified,
    }
  }, [gpuName, gpuDetected, vramGb, ramGb, cpuCores, unified, bandwidth, interconnect, parallelism])

  const scan = useCallback(() => {
    const detection = detectHardware()
    const specs = buildSystemSpecs(detection)

    if (detection.gpu_parsed) setGpuName(detection.gpu_parsed)
    setVramGb(specs.vram_gb)
    // navigator.deviceMemory is capped at 8 GB and rounded, so we ignore it
    // for display. Keep the current ramGb (URL or default) and let the user
    // confirm/change via the header dropdown.
    setCpuCores(specs.cpu_cores)
    setUnified(specs.unified_memory)
    setGpuDetected(specs.gpu_detected)
    setBandwidth(specs.bandwidth_gbps)
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
    setGpuName('')
    setVramGb(0)
    setRamGbState(0)
    setRamUserSet(false)
    setCpuCores(4)
    setUnified(false)
    setGpuDetected(false)
    setBandwidth(0)
    setPhase('manual')
  }, [])

  const updateGpu = useCallback((name: string, spec: GpuSpec | null) => {
    setGpuName(name)
    if (spec) {
      if (spec.vram_gb != null) setVramGb(spec.vram_gb)
      setUnified(spec.unified ?? false)
      setBandwidth(spec.bandwidth_gbps)
      setGpuDetected(true)
    }
  }, [])

  // Restore GPU spec from URL on mount
  useEffect(() => {
    if (hasUrlParams && urlInit.gpu) {
      const spec = lookupGpu(urlInit.gpu)
      if (spec) {
        setBandwidth(spec.bandwidth_gbps)
        setGpuDetected(true)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    phase,
    ready,
    editing,
    setEditing,
    system,
    gpuName,
    vramGb,
    ramGb,
    ramUserSet,
    cpuCores,
    unified,
    gpuDetected,
    interconnect,
    parallelism,
    scan,
    enterManual,
    reset,
    updateGpu,
    setVramGb,
    setRamGb,
    setCpuCores,
    setUnified,
    setInterconnect,
    setParallelism,
  }
}
