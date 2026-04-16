import { useState, useCallback, useEffect, useMemo } from 'react'
import type { SystemSpecs, GpuSpec } from '../engine/types'
import { detectHardware, buildSystemSpecs } from '../detection/detect'
import { lookupGpu } from '../detection/parse-renderer'

type Phase = 'detected' | 'manual'

function safeNum(params: URLSearchParams, key: string, min: number, max: number): number | null {
  if (!params.has(key)) return null
  const n = Number(params.get(key))
  return isFinite(n) ? Math.max(min, Math.min(max, n)) : null
}

function readUrlParams(): {
  gpu: string | null
  vram: number | null
  ram: number | null
  cores: number | null
  unified: boolean | null
} {
  const params = new URLSearchParams(window.location.search)
  const gpu = params.get('gpu')
  const vram = safeNum(params, 'vram', 0, 1024)
  const ram = safeNum(params, 'ram', 1, 8192)
  const cores = safeNum(params, 'cores', 1, 512)
  const unifiedRaw = params.get('unified')
  const unified = unifiedRaw !== null ? unifiedRaw === '1' : null
  return { gpu, vram, ram, cores, unified }
}

function syncUrlParams(
  gpuName: string,
  vramGb: number,
  ramGb: number,
  cpuCores: number,
  unified: boolean,
) {
  const params = new URLSearchParams()
  if (gpuName) params.set('gpu', gpuName)
  if (vramGb > 0) params.set('vram', String(vramGb))
  if (ramGb > 0) params.set('ram', String(ramGb))
  if (cpuCores > 0) params.set('cores', String(cpuCores))
  if (unified) params.set('unified', '1')
  const qs = params.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export function useHardware() {
  const urlInit = useMemo(() => readUrlParams(), [])
  const hasUrlParams = urlInit.gpu !== null || urlInit.vram !== null || urlInit.ram !== null

  const [phase, setPhase] = useState<Phase>(hasUrlParams ? 'manual' : 'manual')
  const [ready, setReady] = useState(hasUrlParams)
  const [gpuName, setGpuName] = useState(urlInit.gpu ?? '')
  const [vramGb, setVramGb] = useState(urlInit.vram ?? 0)
  const [ramGb, setRamGb] = useState(urlInit.ram ?? 16)
  const [cpuCores, setCpuCores] = useState(urlInit.cores ?? 4)
  const [unified, setUnified] = useState(urlInit.unified ?? false)
  const [gpuDetected, setGpuDetected] = useState(false)
  const [bandwidth, setBandwidth] = useState(0)

  // URL sync on state changes (only after ready)
  useEffect(() => {
    if (!ready) return
    syncUrlParams(gpuName, vramGb, ramGb, cpuCores, unified)
  }, [ready, gpuName, vramGb, ramGb, cpuCores, unified])

  const system = useMemo<SystemSpecs>(() => ({
    gpu_name: gpuName || null,
    gpu_detected: gpuDetected,
    vram_gb: unified ? 0 : vramGb,
    ram_gb: ramGb,
    cpu_cores: cpuCores,
    bandwidth_gbps: bandwidth,
    unified_memory: unified,
  }), [gpuName, gpuDetected, vramGb, ramGb, cpuCores, unified, bandwidth])

  const scan = useCallback(() => {
    const detection = detectHardware()
    const specs = buildSystemSpecs(detection)

    if (detection.gpu_parsed) setGpuName(detection.gpu_parsed)
    setVramGb(specs.vram_gb)
    setRamGb(specs.ram_gb || 16)
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
    setRamGb(16)
    setCpuCores(4)
    setUnified(false)
    setGpuDetected(false)
    setBandwidth(0)
    setPhase('manual')
    window.history.replaceState(null, '', window.location.pathname)
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
    cpuCores,
    unified,
    gpuDetected,
    scan,
    enterManual,
    reset,
    updateGpu,
    setVramGb,
    setRamGb,
    setCpuCores,
    setUnified,
  }
}
