import type { GpuEntry, Interconnect, ParallelismMode } from './types'

/**
 * Flattens {name, vram, bw, count} entries into one record per physical GPU.
 * Entries with count <= 0 are dropped.
 */
export function expandGpus(gpus: GpuEntry[]): GpuEntry[] {
  const out: GpuEntry[] = []
  for (const g of gpus) {
    for (let i = 0; i < g.count; i++) {
      out.push({ ...g, count: 1 })
    }
  }
  return out
}

// An entry with vram_gb <= 0 or bandwidth_gbps <= 0 can't contribute to
// inference (no weights to hold, or no reads to serve). Detection placeholders
// and unknown catalog names land here, so treat them as non-participants for
// aggregation, homogeneity, and harmonic-mean bandwidth.
function usableExpanded(gpus: GpuEntry[]): GpuEntry[] {
  return expandGpus(gpus).filter((g) => g.vram_gb > 0 && g.bandwidth_gbps > 0)
}

export function usableGpuCount(gpus: GpuEntry[]): number {
  return usableExpanded(gpus).length
}

// Does every usable GPU in the system carry NVLink? Consumer 30-series (except
// RTX 3090) and all 40/50-series GPUs dropped NVLink — we must not award the
// NVLink TP multiplier to a system that can't physically use it, even if the
// user (or a URL they pasted) claims `ic=nvlink`.
export function allSupportNvlink(gpus: GpuEntry[]): boolean {
  const usable = usableExpanded(gpus)
  if (usable.length === 0) return false
  return usable.every((g) => g.nvlink === true)
}

// Downgrade the user's requested interconnect to what the hardware actually
// supports. If they chose NVLink but any card doesn't have it, degrade to
// PCIe 4 (a realistic default for a non-NVLink multi-GPU rig).
export function resolveInterconnect(gpus: GpuEntry[], requested: Interconnect): Interconnect {
  if (requested === 'nvlink' && !allSupportNvlink(gpus)) return 'pcie4'
  return requested
}

export function isHomogeneous(gpus: GpuEntry[]): boolean {
  const usable = usableExpanded(gpus)
  if (usable.length <= 1) return true
  const first = usable[0]!
  return usable.every(
    (g) => g.vram_gb === first.vram_gb && g.bandwidth_gbps === first.bandwidth_gbps,
  )
}

export function rawTotalVramGb(gpus: GpuEntry[]): number {
  return usableExpanded(gpus).reduce((sum, g) => sum + g.vram_gb, 0)
}

/**
 * VRAM usable for model + KV cache + overhead. Multi-GPU loses a little to
 * split bookkeeping; heterogeneous loses more because tensor-split ratios
 * can't be perfectly proportional and some slack is wasted.
 */
export function effectiveVramGb(gpus: GpuEntry[]): number {
  const usable = usableExpanded(gpus)
  const raw = usable.reduce((sum, g) => sum + g.vram_gb, 0)
  if (usable.length <= 1) return raw
  const homo = isHomogeneous(gpus)
  const overhead = homo ? 0.05 : 0.10
  return raw * (1 - overhead)
}

/**
 * Effective bandwidth for layer-split inference. Per-token time is the sum of
 * each shard's read time (shards serialized through the pipeline). We assume
 * --tensor-split proportional to VRAM. For N=1 this returns the GPU's own
 * bandwidth; for homogeneous N>1 it returns bw * 0.98 (inter-GPU transfer
 * overhead); for heterogeneous it's a VRAM-weighted harmonic mean of bws.
 */
export function effectiveBandwidthGbps(gpus: GpuEntry[]): number {
  const usable = usableExpanded(gpus)
  if (usable.length === 0) return 0
  const total = usable.reduce((s, g) => s + g.vram_gb, 0)

  let timePerTokenUnit = 0
  for (const g of usable) {
    const share = g.vram_gb / total
    timePerTokenUnit += share / g.bandwidth_gbps
  }
  const raw = 1 / timePerTokenUnit
  return usable.length === 1 ? raw : raw * 0.98
}

const TP_TABLES: Record<Interconnect, readonly number[]> = {
  nvlink: [1.0, 1.6, 2.2, 2.8, 3.3],
  pcie5: [1.0, 1.25, 1.45, 1.6],
  pcie4: [1.0, 1.05, 1.08, 1.10],
  pcie3: [1.0, 0.95, 0.90, 0.85],
  none: [1.0],
}

export function tensorParallelMultiplier(
  gpuCount: number,
  interconnect: Interconnect,
  homogeneous: boolean,
): number {
  if (gpuCount <= 1) return 1.0
  if (!homogeneous) return 1.0
  const table = TP_TABLES[interconnect]
  const idx = Math.min(gpuCount - 1, table.length - 1)
  return table[idx] ?? 1.0
}

/**
 * Default parallelism choice: tensor-parallel only when it's actually a win
 * (homogeneous GPUs on NVLink or PCIe5). Everything else falls back to
 * layer-split, which has minimal overhead.
 */
export function autoParallelism(
  gpuCount: number,
  interconnect: Interconnect,
  homogeneous: boolean,
): ParallelismMode {
  if (gpuCount <= 1) return 'layer_split'
  if (homogeneous && (interconnect === 'nvlink' || interconnect === 'pcie5')) {
    return 'tensor_parallel'
  }
  return 'layer_split'
}
