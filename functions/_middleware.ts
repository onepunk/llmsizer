// Cloudflare Pages middleware — injects dynamic Open Graph / Twitter meta
// tags when a crawler fetches a share link like
// /?gpu=NVIDIA%20GeForce%20RTX%204090&vram=24&ram=64.
//
// For real users the HTML is returned untouched; React hydrates and takes
// over. Only crawlers see the rewritten head, so links pasted into
// Slack/Discord/Twitter/LinkedIn show a tailored preview without affecting
// the client-side experience.

type Env = Record<string, unknown>

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

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false
  const lower = userAgent.toLowerCase()
  return BOT_PATTERNS.some((p) => lower.includes(p))
}

interface ShareSummary {
  title: string
  description: string
}

function formatRam(gb: number): string {
  if (gb >= 1024 && Number.isInteger(gb / 1024)) return `${gb / 1024}TB`
  return `${gb}GB`
}

function buildSummary(url: URL): ShareSummary {
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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

class MetaRewriter {
  constructor(
    private readonly property: string,
    private readonly value: string,
    private readonly attr: 'property' | 'name',
  ) {}

  element(element: Element): void {
    element.setAttribute('content', this.value)
    element.setAttribute(this.attr, this.property)
  }
}

class TitleRewriter {
  constructor(private readonly value: string) {}
  element(element: Element): void {
    element.setInnerContent(this.value)
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next()

  // Only rewrite HTML navigations for crawlers. Everything else (JS, JSON,
  // images, humans fetching HTML) passes through untouched.
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) return response

  const userAgent = context.request.headers.get('user-agent')
  if (!isCrawler(userAgent)) return response

  const url = new URL(context.request.url)
  const summary = buildSummary(url)
  const safeTitle = escapeHtml(summary.title)
  const safeDesc = escapeHtml(summary.description)
  const safeUrl = escapeHtml(url.toString())

  return new HTMLRewriter()
    .on('title', new TitleRewriter(summary.title))
    .on('meta[name="description"]', new MetaRewriter('description', summary.description, 'name'))
    .on('meta[property="og:title"]', new MetaRewriter('og:title', summary.title, 'property'))
    .on('meta[property="og:description"]', new MetaRewriter('og:description', summary.description, 'property'))
    .on('meta[property="og:url"]', new MetaRewriter('og:url', url.toString(), 'property'))
    .on('meta[name="twitter:title"]', new MetaRewriter('twitter:title', summary.title, 'name'))
    .on('meta[name="twitter:description"]', new MetaRewriter('twitter:description', summary.description, 'name'))
    .on('head', {
      // Belt and braces: if base index.html lacks one of the tags (e.g. a
      // crawler revisits after we change the template), inject a fallback
      // block so the preview still renders something useful.
      element(element: Element) {
        element.append(
          `\n<meta name="llmsizer:share" content="${safeTitle} \u2014 ${safeDesc} \u2014 ${safeUrl}" />`,
          { html: true },
        )
      },
    })
    .transform(response)
}
