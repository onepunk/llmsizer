import type { UseCase } from './types'

// ---------------------------------------------------------------------------
// qualityScore
// ---------------------------------------------------------------------------

function qualityBase(paramsB: number): number {
  if (paramsB < 1) return 30
  if (paramsB < 3) return 45
  if (paramsB <= 7) return 60
  if (paramsB < 10) return 75
  if (paramsB < 20) return 82
  if (paramsB < 40) return 89
  return 95
}

const FAMILY_BUMPS: Array<{ pattern: RegExp; bump: number }> = [
  { pattern: /deepseek/i, bump: 3 },
  { pattern: /qwen/i, bump: 2 },
  { pattern: /llama/i, bump: 2 },
  { pattern: /mistral|mixtral/i, bump: 1 },
  { pattern: /gemma/i, bump: 1 },
  { pattern: /starcoder/i, bump: 1 },
]

const QUANT_PENALTIES: Record<string, number> = {
  F16: 0,
  BF16: 0,
  Q8_0: 0,
  Q6_K: -1,
  Q5_K_M: -2,
  Q4_K_M: -5,
  Q3_K_M: -8,
  Q2_K: -12,
}

export function qualityScore(
  paramsB: number,
  name: string,
  quant: string,
  useCase: UseCase,
): number {
  let score = qualityBase(paramsB)

  for (const { pattern, bump } of FAMILY_BUMPS) {
    if (pattern.test(name)) {
      score += bump
      break
    }
  }

  score += QUANT_PENALTIES[quant] ?? 0

  // Task alignment bonuses
  if (useCase === 'coding' && /code|starcoder|wizard/i.test(name)) {
    score += 6
  } else if (useCase === 'reasoning' && paramsB >= 13) {
    score += 5
  } else if (useCase === 'multimodal' && /vision/i.test(name)) {
    score += 6
  }

  return Math.max(0, Math.min(100, score))
}

// ---------------------------------------------------------------------------
// speedScore
// ---------------------------------------------------------------------------

const SPEED_TARGETS: Record<UseCase, number> = {
  general: 40,
  coding: 40,
  multimodal: 40,
  chat: 40,
  reasoning: 25,
  embedding: 200,
}

export function speedScore(estimatedTps: number, useCase: UseCase): number {
  const target = SPEED_TARGETS[useCase]
  return Math.max(0, Math.min(100, Math.round((estimatedTps / target) * 100)))
}

// ---------------------------------------------------------------------------
// fitScore
// ---------------------------------------------------------------------------

export function fitScore(requiredGb: number, availableGb: number): number {
  if (requiredGb > availableGb) return 0
  const ratio = requiredGb / availableGb
  if (ratio <= 0.5) return 60 + (ratio / 0.5) * 40
  if (ratio <= 0.8) return 100
  if (ratio <= 0.9) return 70
  return 50
}

// ---------------------------------------------------------------------------
// contextScore
// ---------------------------------------------------------------------------

const CONTEXT_TARGETS: Record<UseCase, number> = {
  general: 4096,
  chat: 4096,
  multimodal: 4096,
  coding: 8192,
  reasoning: 8192,
  embedding: 512,
}

export function contextScore(contextLength: number, useCase: UseCase): number {
  const target = CONTEXT_TARGETS[useCase]
  if (contextLength >= target) return 100
  if (contextLength >= target / 2) return 70
  return 30
}

// ---------------------------------------------------------------------------
// compositeScore
// ---------------------------------------------------------------------------

interface ScoreWeights {
  quality: number
  speed: number
  fit: number
  context: number
}

const WEIGHTS: Record<UseCase, ScoreWeights> = {
  general: { quality: 0.45, speed: 0.30, fit: 0.15, context: 0.10 },
  coding: { quality: 0.50, speed: 0.20, fit: 0.15, context: 0.15 },
  reasoning: { quality: 0.55, speed: 0.15, fit: 0.15, context: 0.15 },
  chat: { quality: 0.40, speed: 0.35, fit: 0.15, context: 0.10 },
  multimodal: { quality: 0.50, speed: 0.20, fit: 0.15, context: 0.15 },
  embedding: { quality: 0.30, speed: 0.40, fit: 0.20, context: 0.10 },
}

export interface CompositeScores {
  quality: number
  speed: number
  fit: number
  context: number
}

export function compositeScore(scores: CompositeScores, useCase: UseCase): number {
  const w = WEIGHTS[useCase]
  const raw =
    scores.quality * w.quality +
    scores.speed * w.speed +
    scores.fit * w.fit +
    scores.context * w.context
  return Math.round(raw * 10) / 10
}
