// Cloudflare Worker entry — runs in front of the static SPA so that share
// link previews for crawlers (Slack, Discord, Twitter, etc.) get dynamic
// Open Graph and Twitter meta tags derived from the query string. Real
// browsers see the untouched HTML and React hydrates as normal.

import { isCrawler, buildShareSummary, type ShareSummary } from './share-meta'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
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

function rewriteForCrawler(response: Response, url: URL, summary: ShareSummary): Response {
  const safeTitle = escapeHtml(summary.title)
  const safeDesc = escapeHtml(summary.description)
  const safeUrl = escapeHtml(url.toString())

  return new HTMLRewriter()
    .on('title', new TitleRewriter(summary.title))
    .on('meta[name="description"]', new MetaRewriter('description', summary.description, 'name'))
    .on('meta[property="og:title"]', new MetaRewriter('og:title', summary.title, 'property'))
    .on(
      'meta[property="og:description"]',
      new MetaRewriter('og:description', summary.description, 'property'),
    )
    .on('meta[property="og:url"]', new MetaRewriter('og:url', url.toString(), 'property'))
    .on('meta[name="twitter:title"]', new MetaRewriter('twitter:title', summary.title, 'name'))
    .on(
      'meta[name="twitter:description"]',
      new MetaRewriter('twitter:description', summary.description, 'name'),
    )
    .on('head', {
      element(element: Element) {
        element.append(
          `\n<meta name="llmsizer:share" content="${safeTitle} \u2014 ${safeDesc} \u2014 ${safeUrl}" />`,
          { html: true },
        )
      },
    })
    .transform(response)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return response

    const userAgent = request.headers.get('user-agent')
    if (!isCrawler(userAgent)) return response

    const url = new URL(request.url)
    const summary = buildShareSummary(url)
    return rewriteForCrawler(response, url, summary)
  },
}
