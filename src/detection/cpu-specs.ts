import type { CpuFlags } from '../engine/types'

/** A curated CPU entry. Only fields the fit/speed engine consumes are stored:
 *  core count (threading bonus + speed), instruction-set flags (TPS
 *  multipliers), and the Apple-style unified-memory marker. */
export interface CpuSpec {
  name: string
  vendor: 'AMD' | 'Intel' | 'Apple' | 'Qualcomm' | 'AWS' | 'Ampere'
  cores: number
  flags: CpuFlags
  unified?: boolean
}

// Hand-curated. Updated a few times per year as new SKUs ship. Scope rule:
// only include a CPU if its flags are knowable from its family. We do NOT
// include clock speed, TDP, cache, socket, iGPU, or release date — the
// engine can't filter on any of those today.
//
// Family rules driving the flags:
//   - AMD Zen 4+ (Ryzen 7000/9000, TR 7000/9000, EPYC 9004/9005): AVX-512 yes
//   - AMD Zen 3 (Ryzen 5000, EPYC 7003): AVX-512 no
//   - Intel consumer 12th–14th gen + Core Ultra Series 1/2: AVX-512 no
//   - Intel Xeon SPR (4th gen) / EMR (5th) / GNR (6th): AVX-512 + AMX yes
//   - Apple M1/M2/M3/M4 (+ Pro/Max/Ultra): NEON + unified yes
//   - Qualcomm Snapdragon X / Graviton / Ampere: NEON yes
export const CPU_SPECS: CpuSpec[] = [
  // ── AMD Ryzen Zen 3 (5000 series) — AVX-512 no ──
  { name: 'AMD Ryzen 5 5600X', vendor: 'AMD', cores: 6, flags: { avx512: false, amx: false, neon: false } },
  { name: 'AMD Ryzen 7 5800X', vendor: 'AMD', cores: 8, flags: { avx512: false, amx: false, neon: false } },
  { name: 'AMD Ryzen 7 5800X3D', vendor: 'AMD', cores: 8, flags: { avx512: false, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 5900X', vendor: 'AMD', cores: 12, flags: { avx512: false, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 5950X', vendor: 'AMD', cores: 16, flags: { avx512: false, amx: false, neon: false } },

  // ── AMD Ryzen Zen 4 (7000 series) — AVX-512 yes ──
  { name: 'AMD Ryzen 5 7600', vendor: 'AMD', cores: 6, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 5 7600X', vendor: 'AMD', cores: 6, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 7 7700', vendor: 'AMD', cores: 8, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 7 7700X', vendor: 'AMD', cores: 8, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 7 7800X3D', vendor: 'AMD', cores: 8, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 7900', vendor: 'AMD', cores: 12, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 7900X', vendor: 'AMD', cores: 12, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 7950X', vendor: 'AMD', cores: 16, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 7950X3D', vendor: 'AMD', cores: 16, flags: { avx512: true, amx: false, neon: false } },

  // ── AMD Ryzen Zen 5 (9000 series) — AVX-512 yes ──
  { name: 'AMD Ryzen 5 9600X', vendor: 'AMD', cores: 6, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 7 9700X', vendor: 'AMD', cores: 8, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 7 9800X3D', vendor: 'AMD', cores: 8, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 9900X', vendor: 'AMD', cores: 12, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 9900X3D', vendor: 'AMD', cores: 12, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 9950X', vendor: 'AMD', cores: 16, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Ryzen 9 9950X3D', vendor: 'AMD', cores: 16, flags: { avx512: true, amx: false, neon: false } },

  // ── AMD Threadripper 7000 (Zen 4) — AVX-512 yes ──
  { name: 'AMD Threadripper 7960X', vendor: 'AMD', cores: 24, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Threadripper 7970X', vendor: 'AMD', cores: 32, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Threadripper 7980X', vendor: 'AMD', cores: 64, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Threadripper PRO 7975WX', vendor: 'AMD', cores: 32, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD Threadripper PRO 7995WX', vendor: 'AMD', cores: 96, flags: { avx512: true, amx: false, neon: false } },

  // ── AMD EPYC Zen 4 (Genoa 9004) — AVX-512 yes ──
  { name: 'AMD EPYC 9354', vendor: 'AMD', cores: 32, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD EPYC 9454', vendor: 'AMD', cores: 48, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD EPYC 9554', vendor: 'AMD', cores: 64, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD EPYC 9654', vendor: 'AMD', cores: 96, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD EPYC 9754 (Bergamo)', vendor: 'AMD', cores: 128, flags: { avx512: true, amx: false, neon: false } },

  // ── AMD EPYC Zen 5 (Turin 9005) — AVX-512 yes ──
  { name: 'AMD EPYC 9555', vendor: 'AMD', cores: 64, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD EPYC 9655', vendor: 'AMD', cores: 96, flags: { avx512: true, amx: false, neon: false } },
  { name: 'AMD EPYC 9755', vendor: 'AMD', cores: 128, flags: { avx512: true, amx: false, neon: false } },

  // ── Intel Core 12th/13th/14th gen — AVX-512 disabled ──
  { name: 'Intel Core i5-12600K', vendor: 'Intel', cores: 10, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i7-12700K', vendor: 'Intel', cores: 12, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i9-12900K', vendor: 'Intel', cores: 16, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i5-13600K', vendor: 'Intel', cores: 14, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i7-13700K', vendor: 'Intel', cores: 16, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i9-13900K', vendor: 'Intel', cores: 24, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i5-14600K', vendor: 'Intel', cores: 14, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i7-14700K', vendor: 'Intel', cores: 20, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core i9-14900K', vendor: 'Intel', cores: 24, flags: { avx512: false, amx: false, neon: false } },

  // ── Intel Core Ultra Series 2 (Arrow Lake) — AVX-512 no ──
  { name: 'Intel Core Ultra 5 245K', vendor: 'Intel', cores: 14, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core Ultra 7 265K', vendor: 'Intel', cores: 20, flags: { avx512: false, amx: false, neon: false } },
  { name: 'Intel Core Ultra 9 285K', vendor: 'Intel', cores: 24, flags: { avx512: false, amx: false, neon: false } },

  // ── Intel Xeon Sapphire Rapids (4th gen) — AVX-512 + AMX yes ──
  { name: 'Intel Xeon Gold 6430', vendor: 'Intel', cores: 32, flags: { avx512: true, amx: true, neon: false } },
  { name: 'Intel Xeon Platinum 8480+', vendor: 'Intel', cores: 56, flags: { avx512: true, amx: true, neon: false } },

  // ── Intel Xeon Emerald Rapids (5th gen) — AVX-512 + AMX yes ──
  { name: 'Intel Xeon Gold 6530', vendor: 'Intel', cores: 32, flags: { avx512: true, amx: true, neon: false } },
  { name: 'Intel Xeon Platinum 8592+', vendor: 'Intel', cores: 64, flags: { avx512: true, amx: true, neon: false } },

  // ── Intel Xeon Granite Rapids (6th gen) — AVX-512 + AMX yes ──
  { name: 'Intel Xeon 6980P', vendor: 'Intel', cores: 128, flags: { avx512: true, amx: true, neon: false } },

  // ── Apple M1 — NEON + unified ──
  { name: 'Apple M1', vendor: 'Apple', cores: 8, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M1 Pro', vendor: 'Apple', cores: 10, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M1 Max', vendor: 'Apple', cores: 10, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M1 Ultra', vendor: 'Apple', cores: 20, flags: { avx512: false, amx: false, neon: true }, unified: true },

  // ── Apple M2 ──
  { name: 'Apple M2', vendor: 'Apple', cores: 8, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M2 Pro', vendor: 'Apple', cores: 12, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M2 Max', vendor: 'Apple', cores: 12, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M2 Ultra', vendor: 'Apple', cores: 24, flags: { avx512: false, amx: false, neon: true }, unified: true },

  // ── Apple M3 ──
  { name: 'Apple M3', vendor: 'Apple', cores: 8, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M3 Pro', vendor: 'Apple', cores: 12, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M3 Max', vendor: 'Apple', cores: 16, flags: { avx512: false, amx: false, neon: true }, unified: true },

  // ── Apple M4 ──
  { name: 'Apple M4', vendor: 'Apple', cores: 10, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M4 Pro', vendor: 'Apple', cores: 14, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M4 Max', vendor: 'Apple', cores: 16, flags: { avx512: false, amx: false, neon: true }, unified: true },
  { name: 'Apple M4 Ultra', vendor: 'Apple', cores: 28, flags: { avx512: false, amx: false, neon: true }, unified: true },

  // ── Qualcomm Snapdragon X (Windows on ARM) ──
  { name: 'Qualcomm Snapdragon X Plus', vendor: 'Qualcomm', cores: 10, flags: { avx512: false, amx: false, neon: true } },
  { name: 'Qualcomm Snapdragon X Elite', vendor: 'Qualcomm', cores: 12, flags: { avx512: false, amx: false, neon: true } },

  // ── AWS Graviton (cloud ARM) ──
  { name: 'AWS Graviton 3', vendor: 'AWS', cores: 64, flags: { avx512: false, amx: false, neon: true } },
  { name: 'AWS Graviton 4', vendor: 'AWS', cores: 96, flags: { avx512: false, amx: false, neon: true } },

  // ── Ampere (cloud/homelab ARM) ──
  { name: 'Ampere Altra', vendor: 'Ampere', cores: 80, flags: { avx512: false, amx: false, neon: true } },
  { name: 'Ampere Altra Max', vendor: 'Ampere', cores: 128, flags: { avx512: false, amx: false, neon: true } },
]

const BY_NAME: Map<string, CpuSpec> = new Map(CPU_SPECS.map((c) => [c.name, c]))

export function lookupCpu(name: string): CpuSpec | null {
  return BY_NAME.get(name) ?? null
}

export function getAllCpuNames(): string[] {
  return CPU_SPECS.map((c) => c.name)
}
