// Crawler detection + share-preview meta generation.
//
// Kept dependency-free so it can run both in the Cloudflare Worker
// (edge) and inside vitest for unit tests.

const BOT_PATTERNS = [
  'slackbot',
  'twitterbot',
  'facebookexternalhit',
  'discordbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'redditbot',
  'embedly',
  'skypeuripreview',
  'applebot',
  'googlebot',
  'bingbot',
  'duckduckbot',
  'pinterest',
  'mastodon',
  'bluesky',
]

export function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false
  const lower = userAgent.toLowerCase()
  return BOT_PATTERNS.some((p) => lower.includes(p))
}

export interface ShareSummary {
  title: string
  description: string
}

function formatRam(gb: number): string {
  if (gb >= 1024 && Number.isInteger(gb / 1024)) return `${gb / 1024}TB`
  return `${gb}GB`
}

export function buildShareSummary(url: URL): ShareSummary {
  const params = url.searchParams
  const gpu = params.get('gpu')
  const vram = Number(params.get('vram') ?? '')
  const ram = Number(params.get('ram') ?? '')
  const unified = params.get('unified') === '1'
  const ctx = Number(params.get('ctx') ?? '')
  const cmp = params.get('cmp')

  const parts: string[] = []
  if (gpu) parts.push(gpu)
  if (!unified && Number.isFinite(vram) && vram > 0) parts.push(`${vram}GB VRAM`)
  if (Number.isFinite(ram) && ram > 0) parts.push(`${formatRam(ram)} ${unified ? 'unified' : 'RAM'}`)

  const hwDesc = parts.length ? parts.join(' \u00B7 ') : null

  let title = 'llmsizer \u2014 What LLMs can your PC run?'
  let description =
    'Check which large language models fit on your hardware. Detects your GPU and estimates memory, quantization, and tokens/sec for 5000+ models.'

  if (hwDesc) {
    title = `llmsizer \u2014 ${hwDesc}`
    const ctxNote =
      Number.isFinite(ctx) && ctx > 0
        ? ` at ${ctx >= 1024 ? `${Math.round(ctx / 1024)}K` : ctx} context`
        : ''
    description = `Models that fit on ${hwDesc}${ctxNote}. Rankings by quality, speed, and memory fit across quantization levels.`
  }

  if (cmp) {
    const names = cmp
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const slash = n.lastIndexOf('/')
        return slash >= 0 ? n.slice(slash + 1) : n
      })
    if (names.length > 0) {
      title = `${names.join(' vs ')} \u00B7 llmsizer`
      description = hwDesc
        ? `Side-by-side comparison of ${names.join(', ')} on ${hwDesc}.`
        : `Side-by-side comparison of ${names.join(', ')}.`
    }
  }

  return { title, description }
}
