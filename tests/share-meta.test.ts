import { describe, it, expect } from 'vitest'
import { isCrawler, buildShareSummary } from '../src/share-meta'

describe('isCrawler', () => {
  it('returns false for null user agent', () => {
    expect(isCrawler(null)).toBe(false)
  })

  it('returns false for an empty user agent', () => {
    expect(isCrawler('')).toBe(false)
  })

  it('returns false for a typical browser UA', () => {
    expect(
      isCrawler(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      ),
    ).toBe(false)
  })

  it.each([
    ['Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    ['Twitterbot/1.0'],
    ['facebookexternalhit/1.1'],
    ['Discordbot/2.0'],
    ['LinkedInBot/1.0'],
    ['WhatsApp/2.19.81'],
    ['TelegramBot (like TwitterBot)'],
    ['RedditBot/1.0'],
    ['Embedly/0.2'],
    ['SkypeUriPreview Preview/0.5'],
    ['Applebot/0.1'],
    ['Googlebot/2.1 (+http://www.google.com/bot.html)'],
    ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)'],
    ['Pinterest/0.2 (+https://www.pinterest.com/bot.html)'],
    ['Mastodon/4.2 (http://mastodon.social)'],
    ['Bluesky Link Preview Bot'],
  ])('returns true for crawler UA %s', (ua) => {
    expect(isCrawler(ua)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isCrawler('SLACKBOT-LINKEXPANDING 1.0')).toBe(true)
    expect(isCrawler('twitterBOT/1.0')).toBe(true)
  })
})

describe('buildShareSummary', () => {
  const parse = (search: string) => new URL(`https://llmsizer.com/${search}`)

  it('returns the default title and description for an empty query string', () => {
    const { title, description } = buildShareSummary(parse(''))
    expect(title).toBe('llmsizer \u2014 What LLMs can your PC run?')
    expect(description).toContain('5000+ models')
  })

  it('includes GPU, VRAM, and RAM when all are present', () => {
    const { title, description } = buildShareSummary(
      parse('?gpu=RTX%203090&vram=24&ram=64'),
    )
    expect(title).toBe('llmsizer \u2014 RTX 3090 \u00B7 24GB VRAM \u00B7 64GB RAM')
    expect(description).toContain('RTX 3090 \u00B7 24GB VRAM \u00B7 64GB RAM')
    expect(description).toContain('quantization levels')
  })

  it('omits VRAM and labels RAM as unified when unified=1', () => {
    const { title } = buildShareSummary(
      parse('?gpu=M2%20Max&vram=48&ram=96&unified=1'),
    )
    expect(title).toBe('llmsizer \u2014 M2 Max \u00B7 96GB unified')
    expect(title).not.toContain('VRAM')
  })

  it('formats multi-TB RAM as TB when exact', () => {
    const { title } = buildShareSummary(parse('?ram=2048&unified=1'))
    expect(title).toContain('2TB unified')
  })

  it('keeps fractional TB expressed as GB', () => {
    const { title } = buildShareSummary(parse('?ram=1536&unified=1'))
    expect(title).toContain('1536GB unified')
  })

  it('appends context in K when ctx is set with hardware', () => {
    const { description } = buildShareSummary(
      parse('?gpu=RTX%204090&vram=24&ctx=32768'),
    )
    expect(description).toContain('at 32K context')
  })

  it('uses literal context for sub-1K ctx values', () => {
    const { description } = buildShareSummary(
      parse('?gpu=RTX%204090&vram=24&ctx=512'),
    )
    expect(description).toContain('at 512 context')
  })

  it('ignores non-positive vram, ram, ctx values', () => {
    const { title, description } = buildShareSummary(
      parse('?gpu=RTX%204090&vram=0&ram=-1&ctx=0'),
    )
    expect(title).toBe('llmsizer \u2014 RTX 4090')
    expect(description).not.toContain('context')
  })

  it('produces a comparison title when cmp is present', () => {
    const { title, description } = buildShareSummary(
      parse('?cmp=meta-llama/Llama-3-70B,Qwen/Qwen2.5-72B'),
    )
    expect(title).toBe('Llama-3-70B vs Qwen2.5-72B \u00B7 llmsizer')
    expect(description).toContain('Side-by-side comparison of Llama-3-70B, Qwen2.5-72B')
  })

  it('weaves hardware context into a comparison when both are present', () => {
    const { description } = buildShareSummary(
      parse('?cmp=meta-llama/Llama-3-70B&gpu=RTX%204090&vram=24'),
    )
    expect(description).toContain('on RTX 4090 \u00B7 24GB VRAM')
  })

  it('drops empty entries from a cmp list', () => {
    const { title } = buildShareSummary(parse('?cmp=meta/a,,meta/b,'))
    expect(title).toBe('a vs b \u00B7 llmsizer')
  })
})
